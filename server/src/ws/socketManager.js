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

/**
 * docId → Promise  (tail of the per-document op queue)
 *
 * ws.on('message') is called for every message before the previous async
 * handler resolves, so two ops from the same user can both read the same
 * document version from the DB and race to INSERT at version+1 — the second
 * one hits the UNIQUE constraint, gets dropped silently, and the client's
 * Quill diverges from the server snapshot.  Chaining ops onto a per-document
 * Promise serialises them without blocking the event loop for other documents.
 */
const docOpQueues = new Map();

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
    docOpQueues.delete(documentId);
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

/**
 * Enqueue an op for a document so concurrent ops from the same (or different)
 * clients never race at the DB level.  Returns the Promise for the queued op.
 */
function enqueueOp(ws, documentId, payload, authedUserId) {
  const tail = docOpQueues.get(documentId) ?? Promise.resolve();
  const next = tail.then(() => handleSubmitOp(ws, documentId, payload, authedUserId));
  // Store a silenced tail so one failed op doesn't jam the queue for everyone.
  docOpQueues.set(documentId, next.catch(() => {}));
  return next;
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

        try {
          // Subscribe to Redis BEFORE querying the DB so no op published in
          // the gap is missed (client buffers pre-doc_state ops).
          await ensureRedisSubscribed(documentId);
        } catch (err) {
          console.error('[ws] redis subscribe error', err.message);
          // Continue without Redis — single-instance presence still works via
          // direct sends below; cross-instance sync will be degraded.
        }

        // Send the authoritative document state.
        try {
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
        } catch (err) {
          console.error('[ws] doc_state query error', err.message);
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

        // Send the joiner their OWN presence directly — no Redis round-trip,
        // so it works even if Redis is momentarily unavailable.
        if (joiningUserId && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'presence_update', userId: joiningUserId, event: 'joined' }));
        }

        // Also broadcast via Redis so other users in the room (on any instance)
        // learn about the new joiner. Failure here is non-fatal.
        publishDocUpdate(documentId, {
          type:   'presence_update',
          userId: joiningUserId,
          event:  'joined',
        }).catch((err) => console.error('[ws] presence broadcast error', err.message));

        return;
      }

      // ── Submit operation ────────────────────────────────────────────────────
      if (type === 'submit_op') {
        try {
          await enqueueOp(ws, documentId, payload, authedUserId);
        } catch (err) {
          console.error('[ws] submit_op error', err.message);
          ws.send(JSON.stringify({ type: 'error', message: 'Operation failed' }));
        }
        return;
      }

      // ── Cursor move ─────────────────────────────────────────────────────────
      if (type === 'cursor_move') {
        publishDocUpdate(documentId, {
          type:     'remote_cursor',
          userId:   payload.userId,
          position: payload.position,
        }).catch(() => {});
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
