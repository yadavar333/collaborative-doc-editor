import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import { Sun, Moon, Download, Clock, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WSClient } from '../utils/wsClient.js';
import PresenceBar from './PresenceBar.jsx';
import HistorySidebar from './HistorySidebar.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
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

  const [showHistory,   setShowHistory]   = useState(false);
  const [presenceUsers, setPresenceUsers] = useState({});
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

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

  const handleExport = () => {
    const text = quillRef.current?.getText() ?? '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'document.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0 16px',
        height: 48,
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-card)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            className="ui-btn ui-btn-ghost ui-btn-sm"
            title="Back to documents"
          >
            <ArrowLeft size={13} />
          </button>
          <PresenceBar users={presenceUsers} currentUser={userId} />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleExport} className="ui-btn ui-btn-ghost ui-btn-sm">
            <Download size={13} /> Export
          </button>
          <button
            onClick={() => setShowHistory((s) => !s)}
            className={`ui-btn ui-btn-sm ${showHistory ? 'ui-btn-primary' : 'ui-btn-ghost'}`}
          >
            <Clock size={13} /> History
          </button>
          <button onClick={toggle} className="ui-btn ui-btn-ghost ui-btn-sm" title="Toggle theme">
            {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
          </button>
        </div>
      </div>

      {/* ── Editor + sidebar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-card)' }}>
          <div ref={editorRef} style={{ height: '100%' }} />
        </div>
        {showHistory && (
          <HistorySidebar documentId={documentId} authToken={authToken} />
        )}
      </div>
    </div>
  );
}
