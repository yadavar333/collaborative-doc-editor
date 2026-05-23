import { query } from '../db/index.js';
import { transform, applyOp } from '../ot/otEngine.js';
import { publishDocUpdate, subscribeToDoc, unsubscribeFromDoc } from '../redis/pubsub.js';
import { triggerSnapshotCheck } from '../services/snapshotService.js';
import jwt from 'jsonwebtoken';

/** docId → Set<ws>  (all sockets in that document room) */
const documentRooms = new Map();

/** docId → Map<ws, userId>  (tracks which user each socket belongs to) */
const documentMembers = new Map();

/** docId → bool  (whether we already subscribed to Redis for this doc) */
const redisSubscribed = new Map();

/** Counter per doc to trigger snapshot every 10 ops */
const opCounter = new Map();

function broadcast(documentId, payload, exceptWs = null) {
  const room = documentRooms.get(documentId);
  if (!room) return;
  const data = JSON.stringify(payload);
  for (const ws of room) {
    if (ws !== exceptWs && ws.readyState === 1 /* OPEN */) {
      ws.send(data);
    }
  }
}

function joinRoom(documentId, ws, userId) {
  if (!documentRooms.has(documentId)) documentRooms.set(documentId, new Set());
  documentRooms.get(documentId).add(ws);
  if (!documentMembers.has(documentId)) documentMembers.set(documentId, new Map());
  documentMembers.get(documentId).set(ws, userId);
}

function leaveRoom(documentId, ws) {
  const room = documentRooms.get(documentId);
  if (!room) return;
  room.delete(ws);
  documentMembers.get(documentId)?.delete(ws);
  if (room.size === 0) {
    documentRooms.delete(documentId);
    documentMembers.delete(documentId);
    unsubscribeFromDoc(documentId).catch(() => {});
    redisSubscribed.delete(documentId);
  }
}

async function ensureRedisSubscribed(documentId) {
  if (redisSubscribed.get(documentId)) return;
  redisSubscribed.set(documentId, true);
  await subscribeToDoc(documentId, (payload) => {
    broadcast(documentId, payload, payload._originWs);
  });
}

async function handleSubmitOp(ws, documentId, payload, authedUserId) {
  const { op, version, userId } = payload;
  // Always write the JWT-verified identity to the DB. Using the client-supplied
  // userId would (a) be a security risk and (b) fail with a FK violation when
  // the client falls back to an anonymous UUID that isn't in the users table.
  const dbUserId = authedUserId || userId;

  // Fetch only operations that arrived AFTER the version the client was at.
  // version > $2 (not >=) because the client has already incorporated the op
  // at exactly $2 — transforming against it again would corrupt positions.
  const { rows: pendingOps } = await query(
    `SELECT operation_data FROM operations
     WHERE document_id = $1 AND version > $2
     ORDER BY version ASC`,
    [documentId, version],
  );

  // Transform op against each pending concurrent operation
  let transformedOp = op;
  for (const row of pendingOps) {
    const [opPrime] = transform(transformedOp, row.operation_data);
    transformedOp = opPrime;
  }

  // Get current document version for next slot
  const { rows: [doc] } = await query(
    'SELECT version, content_snapshot FROM documents WHERE id = $1',
    [documentId],
  );
  if (!doc) return;

  const newVersion = doc.version + 1;

  // Persist the transformed operation
  await query(
    `INSERT INTO operations (document_id, user_id, version, operation_data)
     VALUES ($1, $2, $3, $4)`,
    [documentId, dbUserId, newVersion, JSON.stringify(transformedOp)],
  );

  // Apply op to snapshot and bump version
  const newSnapshot = applyOp(doc.content_snapshot, transformedOp);
  await query(
    `UPDATE documents SET version = $1, content_snapshot = $2, updated_at = NOW()
     WHERE id = $3`,
    [newVersion, newSnapshot, documentId],
  );

  // Publish to all server instances
  await publishDocUpdate(documentId, {
    type: 'remote_op',
    op: transformedOp,
    version: newVersion,
    userId,
  });

  // Trigger snapshot check every 10 ops
  const count = (opCounter.get(documentId) || 0) + 1;
  opCounter.set(documentId, count);
  if (count % 10 === 0) {
    triggerSnapshotCheck(documentId).catch(() => {});
  }
}

export function initWebSocketManager(wss) {
  wss.on('connection', (ws, req) => {
    let currentDocId = null;
    let authedUserId = null;

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      const { type, documentId, payload } = msg;

      // ── Auth on join ────────────────────────────────────────────────────────
      if (type === 'join_document') {
        // Verify JWT if provided
        const token = payload?.auth_token;
        if (token) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
            authedUserId = decoded.userId;
          } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid auth token' }));
            return;
          }
        }

        const joiningUserId = authedUserId || payload?.userId;
        currentDocId = documentId;
        joinRoom(documentId, ws, joiningUserId);

        // Subscribe to Redis BEFORE querying the DB. Any op published between
        // the subscribe and the query arrives as a remote_op that the client
        // buffers; doc_state then tells the client which ops are already baked
        // into the snapshot so the buffer can be replayed correctly.
        await ensureRedisSubscribed(documentId);

        // Send the authoritative document state so the client can initialise
        // without a separate REST call (which races against the WS stream).
        const { rows: [docSnap] } = await query(
          'SELECT content_snapshot, version FROM documents WHERE id = $1',
          [documentId],
        );
        if (docSnap && ws.readyState === 1) {
          ws.send(JSON.stringify({
            type:    'doc_state',
            content: docSnap.content_snapshot,
            version: docSnap.version,
          }));
        }

        // Tell the joining client about every user already in the room.
        const members = documentMembers.get(documentId);
        if (members) {
          for (const [memberWs, memberId] of members) {
            if (memberWs !== ws && memberId && ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'presence_update', userId: memberId, event: 'joined' }));
            }
          }
        }

        // Broadcast the new joiner's presence to everyone (including themselves).
        await publishDocUpdate(documentId, {
          type: 'presence_update',
          userId: joiningUserId,
          event: 'joined',
        });
        return;
      }

      // ── Submit operation ────────────────────────────────────────────────────
      if (type === 'submit_op') {
        try {
          await handleSubmitOp(ws, documentId, payload, authedUserId);
        } catch (err) {
          console.error('[ws] submit_op error', err.message);
          ws.send(JSON.stringify({ type: 'error', message: 'Operation failed' }));
        }
        return;
      }

      // ── Cursor move ─────────────────────────────────────────────────────────
      if (type === 'cursor_move') {
        await publishDocUpdate(documentId, {
          type: 'remote_cursor',
          userId: payload.userId,
          position: payload.position,
        });
        return;
      }
    });

    ws.on('close', () => {
      if (currentDocId) {
        leaveRoom(currentDocId, ws);
        publishDocUpdate(currentDocId, {
          type: 'presence_update',
          userId: authedUserId,
          event: 'left',
        }).catch(() => {});
      }
    });

    ws.on('error', (err) => console.error('[ws] error', err.message));
  });
}
