import { useState, useEffect } from 'react';
import Quill from 'quill';

export default function HistorySidebar({ documentId, authToken }) {
  const [history,     setHistory]     = useState([]);
  const [preview,     setPreview]     = useState(null);
  const [previewVer,  setPreviewVer]  = useState(null);
  const [loading,     setLoading]     = useState(false);

  const authHeaders = { Authorization: `Bearer ${authToken}` };

  useEffect(() => {
    fetch(`/api/history/${documentId}/history`, { headers: authHeaders })
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => {});
  }, [documentId]);

  async function loadPreview(version) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/history/${documentId}/reconstruct/${version}`, {
        headers: authHeaders,
      });
      const data = await res.json();
      setPreview(data.text);
      setPreviewVer(version);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  return (
    <div style={sidebarStyle}>
      <div style={sidebarHeader}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Version History</span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{history.length} edits</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {history.map((entry) => (
          <div
            key={entry.version}
            onClick={() => loadPreview(entry.version)}
            style={{
              ...historyItem,
              background: previewVer === entry.version ? '#eef2ff' : 'transparent',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6366f1' }}>
              v{entry.version}
            </div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 1 }}>
              {entry.user_email}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              {new Date(entry.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* ── Preview panel ──────────────────────────────────────────────────── */}
      {(loading || preview !== null) && (
        <div style={previewPanel}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#6366f1' }}>
            {loading ? 'Loading…' : `Preview — v${previewVer}`}
          </div>
          {!loading && (
            <textarea
              readOnly
              value={preview}
              style={{
                width:       '100%',
                height:      200,
                border:      '1px solid #e5e7eb',
                borderRadius: 6,
                padding:      8,
                fontSize:     12,
                fontFamily:   'monospace',
                resize:       'vertical',
                background:   '#f9fafb',
              }}
            />
          )}
          <button onClick={() => { setPreview(null); setPreviewVer(null); }} style={closeBtn}>
            Close preview
          </button>
        </div>
      )}
    </div>
  );
}

const sidebarStyle  = { width: 260, borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' };
const sidebarHeader = { padding: '12px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const historyItem   = { padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' };
const previewPanel  = { padding: 14, borderTop: '1px solid #e5e7eb', background: '#f9fafb' };
const closeBtn      = { marginTop: 8, fontSize: 12, background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: 0 };
