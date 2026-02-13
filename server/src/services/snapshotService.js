import { query } from '../db/index.js';
import { applyOp } from '../ot/otEngine.js';

const SNAPSHOT_THRESHOLD = 100; // ops since last snapshot before compacting

/**
 * Check if a new snapshot is needed and create one if so.
 * Called asynchronously after every Nth submit_op — never blocks the client.
 * @param {string} documentId
 */
export async function triggerSnapshotCheck(documentId) {
  const { rows: [doc] } = await query(
    'SELECT version, content_snapshot FROM documents WHERE id = $1',
    [documentId],
  );
  if (!doc) return;

  const { rows: [agg] } = await query(
    'SELECT MAX(version) AS max_ver FROM operations WHERE document_id = $1',
    [documentId],
  );
  const maxVer = agg?.max_ver ?? 0;

  if (maxVer - doc.version < SNAPSHOT_THRESHOLD) return;

  // Fetch all ops since the current snapshot baseline
  const { rows: ops } = await query(
    `SELECT operation_data, version FROM operations
     WHERE document_id = $1 AND version > $2
     ORDER BY version ASC`,
    [documentId, doc.version],
  );

  // Replay ops on top of the stored snapshot
  let text = doc.content_snapshot;
  for (const row of ops) {
    text = applyOp(text, row.operation_data);
  }

  const newVersion = ops[ops.length - 1]?.version ?? doc.version;

  await query(
    `UPDATE documents SET content_snapshot = $1, version = $2, updated_at = NOW()
     WHERE id = $3`,
    [text, newVersion, documentId],
  );

  console.log(`[snapshot] compacted doc ${documentId} to v${newVersion}`);
}

/**
 * Reconstruct document text at a specific version.
 * Finds the closest preceding snapshot, then replays operations.
 * @param {string} documentId
 * @param {number} targetVersion
 * @returns {string}
 */
export async function reconstructAtVersion(documentId, targetVersion) {
  // Get the stored snapshot (baseline)
  const { rows: [doc] } = await query(
    'SELECT version, content_snapshot FROM documents WHERE id = $1',
    [documentId],
  );
  if (!doc) throw new Error('Document not found');

  // If the snapshot is already past targetVersion, we cannot replay backwards.
  // In production we'd keep a history of snapshots; here we start from v0 (empty).
  const baseVersion = doc.version <= targetVersion ? doc.version : 0;
  let text = doc.version <= targetVersion ? doc.content_snapshot : '';

  const { rows: ops } = await query(
    `SELECT operation_data FROM operations
     WHERE document_id = $1 AND version > $2 AND version <= $3
     ORDER BY version ASC`,
    [documentId, baseVersion, targetVersion],
  );

  for (const row of ops) {
    text = applyOp(text, row.operation_data);
  }

  return text;
}
