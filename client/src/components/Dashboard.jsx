import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { token, user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [docs,    setDocs]    = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [shareDoc, setShareDoc] = useState(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole,  setShareRole]  = useState('viewer');
  const [error, setError] = useState('');

  async function apiFetch(url, opts = {}) {
    const res = await fetch(url, {
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
    <div style={{ minHeight: '100vh', background: '#f8f8fc' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={header}>
        <span style={{ fontWeight: 700, fontSize: 18 }}>✏️ CollabDoc</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{user?.email}</span>
          <button onClick={logout} style={outlineBtn}>Logout</button>
        </div>
      </header>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>My Documents</h2>

        {/* ── Create ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <input
            value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New document title…"
            onKeyDown={(e) => e.key === 'Enter' && createDoc()}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={createDoc} style={primaryBtn}>+ Create</button>
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {/* ── Document list ────────────────────────────────────────────────── */}
        {docs.length === 0 ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40 }}>
            No documents yet — create one above.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docs.map((doc) => (
              <div key={doc.id} style={docCard}>
                <div style={{ flex: 1 }}>
                  <div
                    onClick={() => navigate(`/doc/${doc.id}`)}
                    style={{ fontWeight: 600, cursor: 'pointer', color: '#6366f1' }}
                  >
                    {doc.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    v{doc.version} · {doc.role} · {new Date(doc.updated_at).toLocaleString()}
                  </div>
                </div>
                {doc.role === 'editor' && (
                  <button onClick={() => setShareDoc(doc.id)} style={outlineBtn}>Share</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Share modal ─────────────────────────────────────────────────────── */}
      {shareDoc && (
        <div style={backdrop}>
          <div style={modal}>
            <h3 style={{ marginBottom: 16 }}>Share Document</h3>
            <input
              type="email" placeholder="User's email" value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: 10 }}
            />
            <select value={shareRole} onChange={(e) => setShareRole(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 16 }}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShareDoc(null)} style={outlineBtn}>Cancel</button>
              <button onClick={shareDocument} style={primaryBtn}>Share</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const header     = { background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const inputStyle = { padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' };
const primaryBtn = { padding: '10px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const outlineBtn = { padding: '8px 14px', background: '#fff', color: '#6366f1', border: '1px solid #6366f1', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const docCard    = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 };
const backdrop   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
const modal      = { background: '#fff', borderRadius: 14, padding: 28, width: 360, boxShadow: '0 10px 40px rgba(0,0,0,.15)' };
