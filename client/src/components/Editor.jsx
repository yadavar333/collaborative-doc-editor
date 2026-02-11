import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import { WSClient } from '../utils/wsClient.js';
import PresenceBar from './PresenceBar.jsx';
import HistorySidebar from './HistorySidebar.jsx';
import 'quill/dist/quill.snow.css';

Quill.register('modules/cursors', QuillCursors);

// ── Colour palette for remote cursors ─────────────────────────────────────────
const CURSOR_COLORS = ['#f87171','#fb923c','#a3e635','#34d399','#60a5fa','#c084fc'];
function colorForUser(uid) {
  let hash = 0;
  for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

// ── Convert Quill Delta → OT op ───────────────────────────────────────────────
function deltaToOtOp(delta) {
  return delta.ops.map((op) => {
    if (op.retain  !== undefined) return { retain:  op.retain };
    if (op.insert  !== undefined) return { insert:  typeof op.insert === 'string' ? op.insert : '￼' };
    if (op.delete  !== undefined) return { delete:  op.delete };
    return null;
  }).filter(Boolean);
}

// ── Convert OT op → Quill Delta ──────────────────────────────────────────────
function otOpToDelta(op) {
  return { ops: op.map((c) => {
    if (c.retain !== undefined) return { retain: c.retain };
    if (c.insert !== undefined) return { insert: c.insert };
    if (c.delete !== undefined) return { delete: c.delete };
    return null;
  }).filter(Boolean) };
}

export default function Editor({ documentId, userId, authToken }) {
  const editorRef   = useRef(null);
  const quillRef    = useRef(null);
  const wsRef       = useRef(null);
  const versionRef  = useRef(0);

  const [showHistory,  setShowHistory]  = useState(false);
  const [presenceUsers, setPresenceUsers] = useState({});

  useEffect(() => {
    if (!editorRef.current || quillRef.current) return;

    // ── Init Quill ─────────────────────────────────────────────────────────────
    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: {
        cursors: true,
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          [{ header: [1, 2, 3, false] }],
          ['blockquote', 'code-block'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean'],
        ],
      },
    });
    quillRef.current = quill;
    const cursors = quill.getModule('cursors');

    // ── Init WS Client ─────────────────────────────────────────────────────────
    const ws = new WSClient(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/socket`,
      documentId,
      userId,
      // onRemoteOp
      (op, version) => {
        versionRef.current = version;
        quill.updateContents(otOpToDelta(op), 'silent');
      },
      // onRemoteCursor
      (uid, position) => {
        cursors.createCursor(uid, uid.slice(0, 6), colorForUser(uid));
        cursors.moveCursor(uid, { index: position, length: 0 });
      },
      // onPresence
      (uid, event) => {
        setPresenceUsers((prev) => {
          const next = { ...prev };
          if (event === 'joined') next[uid] = true;
          else delete next[uid];
          return next;
        });
      },
    );
    wsRef.current = ws;
    ws.connect(authToken);

    // ── Quill text-change ──────────────────────────────────────────────────────
    quill.on('text-change', (delta, _, source) => {
      if (source !== 'user') return;
      const op = deltaToOtOp(delta);
      ws.sendOp(op, versionRef.current);
    });

    // ── Quill selection-change ────────────────────────────────────────────────
    quill.on('selection-change', (range) => {
      if (range) ws.sendCursor(range.index);
    });

    return () => { ws.disconnect(); };
  }, [documentId, userId, authToken]);

  const handleExport = async () => {
    const res = await fetch(`/api/history/${documentId}/export`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'document.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* ── Toolbar row ─────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fff',
      }}>
        <PresenceBar users={presenceUsers} currentUser={userId} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExport} style={btnStyle}>Export TXT</button>
          <button onClick={() => setShowHistory((s) => !s)} style={btnStyle}>
            {showHistory ? 'Close History' : 'History'}
          </button>
        </div>
      </div>

      {/* ── Editor + sidebar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div ref={editorRef} style={{ height: '100%' }} />
        </div>
        {showHistory && (
          <HistorySidebar documentId={documentId} authToken={authToken} />
        )}
      </div>
    </div>
  );
}

const btnStyle = {
  padding:       '6px 14px',
  borderRadius:  6,
  border:        '1px solid #6366f1',
  color:         '#6366f1',
  background:    '#fff',
  cursor:        'pointer',
  fontSize:      13,
  fontWeight:    600,
};
