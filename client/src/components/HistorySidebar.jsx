import { useState, useEffect } from 'react';
import { X, Clock } from 'lucide-react';

export default function HistorySidebar({ documentId, authToken }) {
  const [history,    setHistory]    = useState([]);
  const [preview,    setPreview]    = useState(null);
  const [previewVer, setPreviewVer] = useState(null);
  const [loading,    setLoading]    = useState(false);

  const headers = { Authorization: `Bearer ${authToken}` };

  useEffect(() => {
    fetch(`/api/history/${documentId}/history`, { headers })
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => {});
  }, [documentId]);

  async function loadPreview(version) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/history/${documentId}/reconstruct/${version}`, { headers });
      const data = await res.json();
      setPreview(data.text);
      setPreviewVer(version);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  return (
    <div style={{
      width: 252,
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-card)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} style={{ color: 'var(--text-3)' }} />
          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            History
          </span>
        </div>
        <span style={{
          fontSize: 11,
          color: 'var(--text-3)',
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: 2,
          padding: '1px 6px',
          fontFamily: 'monospace',
        }}>
          {history.length} edits
        </span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {history.length === 0 && (
          <p style={{ padding: '20px 14px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
            No edits yet.
          </p>
        )}
        {history.map((entry) => (
          <div
            key={entry.version}
            onClick={() => loadPreview(entry.version)}
            style={{
              padding: '9px 14px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--border-light)',
              background: previewVer === entry.version ? 'var(--accent-muted)' : 'transparent',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (previewVer !== entry.version)
                e.currentTarget.style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                previewVer === entry.version ? 'var(--accent-muted)' : 'transparent';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: previewVer === entry.version ? 'var(--accent)' : 'var(--text-2)',
                letterSpacing: '0.02em',
              }}>
                v{entry.version}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {entry.user_email}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
              {new Date(entry.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {/* Preview panel */}
      {(loading || preview !== null) && (
        <div style={{
          padding: 14,
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              {loading ? 'Loading…' : `Preview — v${previewVer}`}
            </span>
            {!loading && (
              <button
                onClick={() => { setPreview(null); setPreviewVer(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}
                title="Close preview"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {!loading && (
            <textarea
              readOnly
              value={preview}
              style={{
                width: '100%',
                height: 160,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '8px 10px',
                fontSize: 11,
                fontFamily: 'monospace',
                lineHeight: 1.5,
                resize: 'vertical',
                background: 'var(--bg-card)',
                color: 'var(--text-2)',
                outline: 'none',
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
