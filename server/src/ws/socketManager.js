import { query } from '../db/index.js';
import { transform, applyOp } from '../ot/otEngine.js';
import { publishDocUpdate, subscribeToDoc, unsubscribeFromDoc } from '../redis/pubsub.js';
import { triggerSnapshotCheck } from '../services/snapshotService.js';
import jwt from 'jsonwebtoken';

/** docId → Set<ws>  (all sockets in that document room) */
const documentRooms = new Map();

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

function joinRoom(documentId, ws) {
  if (!documentRooms.has(documentId)) documentRooms.set(documentId, new Set());
  documentRooms.get(documentId).add(ws);
}

function leaveRoom(documentId, ws) {
  const room = documentRooms.get(documentId);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) {
    documentRooms.delete(documentId);
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

async function handleSubmitOp(ws, documentId, payload) {
  const { op, version, userId } = payload;

  // Fetch all operations stored at versions >= submitted version
  const { rows: pendingOps } = await query(
    `SELECT operation_data FROM operations
     WHERE document_id = $1 AND version >= $2
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
    [documentId, userId, newVersion, JSON.stringify(transformedOp)],
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

        currentDocId = documentId;
        joinRoom(documentId, ws);
        await ensureRedisSubscribed(documentId);

        // Broadcast presence
        await publishDocUpdate(documentId, {
          type: 'presence_update',
          userId: authedUserId || payload?.userId,
          event: 'joined',
        });
        return;
      }

      // ── Submit operation ────────────────────────────────────────────────────
      if (type === 'submit_op') {
        try {
          await handleSubmitOp(ws, documentId, payload);
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
