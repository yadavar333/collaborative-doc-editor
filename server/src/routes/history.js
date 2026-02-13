import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { query } from '../db/index.js';
import { reconstructAtVersion } from '../services/snapshotService.js';

const router = Router();

// GET /api/history/:id/history — summarized operation list
router.get('/:id/history', requireAuth, async (req, res) => {
  const { id: documentId } = req.params;
  try {
    const { rows } = await query(
      `SELECT o.version, o.created_at, u.email AS user_email
       FROM operations o
       JOIN users u ON u.id = o.user_id
       WHERE o.document_id = $1
       ORDER BY o.version ASC`,
      [documentId],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/history/:id/reconstruct/:version — replay to target version
router.get('/:id/reconstruct/:version', requireAuth, async (req, res) => {
  const { id: documentId, version } = req.params;
  try {
    const text = await reconstructAtVersion(documentId, parseInt(version));
    res.json({ text, version: parseInt(version) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history/:id/export — export latest document as plain text
router.get('/:id/export', requireAuth, async (req, res) => {
  const { id: documentId } = req.params;
  try {
    const { rows: [doc] } = await query(
      'SELECT content_snapshot, version FROM documents WHERE id = $1',
      [documentId],
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Replay any ops not yet compacted into snapshot
    const text = await reconstructAtVersion(documentId, doc.version + 999999);
    res.set('Content-Disposition', 'attachment; filename="export.txt"');
    res.set('Content-Type', 'text/plain');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
