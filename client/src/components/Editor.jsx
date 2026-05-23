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
// Attributes (bold, italic, list, code-block, etc.) are preserved so that
// formatting ops are synced exactly like text ops.
function deltaToOtOp(delta) {
  return delta.ops.map((op) => {
    if (op.retain !== undefined) {
      const c = { retain: op.retain };
      if (op.attributes) c.attributes = op.attributes;
      return c;
    }
    if (op.insert !== undefined) {
      const c = { insert: typeof op.insert === 'string' ? op.insert : '￼' };
      if (op.attributes) c.attributes = op.attributes;
      return c;
    }
    if (op.delete !== undefined) return { delete: op.delete };
    return null;
  }).filter(Boolean);
}

// ── Convert OT op → Quill Delta ──────────────────────────────────────────────
function otOpToDelta(op) {
  return { ops: op.map((c) => {
    if (c.retain !== undefined) {
      const d = { retain: c.retain };
      if (c.attributes) d.attributes = c.attributes;
      return d;
    }
    if (c.insert !== undefined) {
      const d = { insert: c.insert };
      if (c.attributes) d.attributes = c.attributes;
      return d;
    }
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
    // Document content and version are loaded via the doc_state WS message that
    // the server sends immediately after join — no separate REST fetch needed.
    // This eliminates the race where a parallel REST call could overwrite Quill
    // content already applied from the WS stream, causing A→B sync loss.
    const ws = new WSClient(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/socket`,
      documentId,
      userId,
      // onRemoteOp — genuine op from another user; skip if already covered
      // by the doc_state snapshot (version guard prevents double-application).
      (op, version) => {
        if (version <= versionRef.current) return;
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
      // onOwnOpAck — own echo suppressed; advance versionRef to server version.
      (serverVersion) => {
        versionRef.current = serverVersion;
      },
      // onDocState — authoritative snapshot sent by server on join; initialise
      // Quill content and versionRef from this single source of truth.
      (content, version) => {
        quill.setText(content || '', 'silent');
        versionRef.current = version;
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
