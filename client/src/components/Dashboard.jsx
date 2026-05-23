import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Plus, Share2, Trash2, FileText, LogOut } from 'lucide-react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export default function Dashboard() {
  const { token, user, logout } = useContext(AuthContext);
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [docs,       setDocs]       = useState([]);
  const [newTitle,   setNewTitle]   = useState('');
  const [shareDoc,   setShareDoc]   = useState(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole,  setShareRole]  = useState('viewer');
  const [error,      setError]      = useState('');

  async function apiFetch(url, opts = {}) {
    const res  = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  useEffect(() => {
    apiFetch('/api/documents').then(setDocs).catch(() => {});
  }, [token]);

  async function createDoc() {
    if (!newTitle.trim()) return;
    try {
      const doc = await apiFetch('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle }),
      });
      setDocs((d) => [doc, ...d]);
      setNewTitle('');
    } catch (err) { setError(err.message); }
  }

  async function deleteDocument(docId) {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    try {
      await apiFetch(`/api/documents/${docId}`, { method: 'DELETE' });
      setDocs((d) => d.filter((doc) => doc.id !== docId));
    } catch (err) { setError(err.message); }
  }

  async function shareDocument() {
    if (!shareDoc || !shareEmail) return;
    try {
      await apiFetch(`/api/documents/${shareDoc}/share`, {
        method: 'POST',
        body: JSON.stringify({ email: shareEmail, role: shareRole }),
      });
      setShareDoc(null); setShareEmail(''); setShareRole('viewer');
    } catch (err) { setError(err.message); }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24,
            background: 'var(--accent)',
            borderRadius: 'var(--radius)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'var(--accent-fg)', fontSize: 12, fontWeight: 700 }}>C</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            CollabDoc
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 4 }}>{user?.email}</span>
          <button onClick={toggle} className="ui-btn ui-btn-ghost ui-btn-sm" title="Toggle theme">
            {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
          </button>
          <button onClick={logout} className="ui-btn ui-btn-ghost ui-btn-sm">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            My Documents
          </h1>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
        </div>

        {/* ── Create row ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New document title…"
            onKeyDown={(e) => e.key === 'Enter' && createDoc()}
            className="ui-input"
            style={{ flex: 1 }}
          />
          <button onClick={createDoc} className="ui-btn ui-btn-primary">
            <Plus size={14} /> Create
          </button>
        </div>

        {error && (
          <div style={{
            padding: '8px 12px',
            background: 'var(--danger-muted)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger)',
            fontSize: 13,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* ── Document list ─────────────────────────────────────────────────── */}
        {docs.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 0',
            color: 'var(--text-3)',
          }}>
            <FileText size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p style={{ fontSize: 14 }}>No documents yet — create one above.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {docs.map((doc) => (
              <div
                key={doc.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'border-color 0.1s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-light)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <FileText size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    onClick={() => navigate(`/doc/${doc.id}`)}
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
                      color: 'var(--text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text)'}
                  >
                    {doc.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, display: 'flex', gap: 8 }}>
                    <span style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 2,
                      padding: '1px 5px',
                      fontFamily: 'monospace',
                      fontSize: 10,
                      letterSpacing: '0.02em',
                    }}>
                      v{doc.version}
                    </span>
                    <span style={{
                      background: 'var(--accent-muted)',
                      color: 'var(--accent)',
                      border: '1px solid transparent',
                      borderRadius: 2,
                      padding: '1px 5px',
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      {doc.role}
                    </span>
                    <span>{new Date(doc.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {doc.role === 'editor' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => setShareDoc(doc.id)}
                      className="ui-btn ui-btn-ghost ui-btn-sm"
                      title="Share"
                    >
                      <Share2 size={12} /> Share
                    </button>
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="ui-btn ui-btn-danger-outline ui-btn-sm"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Share modal ───────────────────────────────────────────────────────── */}
      {shareDoc && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100,
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '28px 28px 24px',
            width: 360,
            boxShadow: 'var(--shadow-md)',
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Share Document
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
              Invite a collaborator by their email address.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="email"
                placeholder="Collaborator's email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                className="ui-input"
              />
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value)}
                className="ui-input"
                style={{ cursor: 'pointer' }}
              >
                <option value="viewer">Viewer — can read</option>
                <option value="editor">Editor — can edit</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={() => { setShareDoc(null); setShareEmail(''); setShareRole('viewer'); }}
                className="ui-btn ui-btn-ghost"
              >
                Cancel
              </button>
              <button onClick={shareDocument} className="ui-btn ui-btn-primary">
                <Share2 size={13} /> Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
