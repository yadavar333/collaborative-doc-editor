import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { query } from '../db/index.js';

const router = Router();

// GET /api/documents — list documents the user has access to
router.get('/', requireAuth, async (req, res) => {
  const { userId } = req.user;
  try {
    const { rows } = await query(
      `SELECT d.id, d.title, d.version, d.created_at, d.updated_at, du.role
       FROM documents d
       JOIN document_users du ON du.document_id = d.id
       WHERE du.user_id = $1
       ORDER BY d.updated_at DESC`,
      [userId],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/documents — create a new document
router.post('/', requireAuth, async (req, res) => {
  const { userId } = req.user;
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  try {
    const { rows: [doc] } = await query(
      `INSERT INTO documents (title) VALUES ($1) RETURNING *`,
      [title.trim()],
    );
    await query(
      `INSERT INTO document_users (document_id, user_id, role) VALUES ($1, $2, 'editor')`,
      [doc.id, userId],
    );
    res.status(201).json(doc);
  } catch {
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// POST /api/documents/:id/share — add a user by email
router.post('/:id/share', requireAuth, async (req, res) => {
  const { id: documentId } = req.params;
  const { email, role = 'viewer' } = req.body;

  if (!email) return res.status(400).json({ error: 'email is required' });
  if (!['editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be editor or viewer' });
  }

  try {
    const { rows: [target] } = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    if (!target) return res.status(404).json({ error: 'User not found' });

    await query(
      `INSERT INTO document_users (document_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = $3`,
      [documentId, target.id, role],
    );
    res.json({ message: `Shared with ${email} as ${role}` });
  } catch {
    res.status(500).json({ error: 'Failed to share document' });
  }
});

export default router;
