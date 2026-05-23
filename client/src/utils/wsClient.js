/**
 * WebSocket client for real-time document collaboration.
 * Handles connection, op submission, cursor broadcasting, and reconnection.
 *
 * Initialisation ordering guarantee
 * ──────────────────────────────────
 * The server sends a `doc_state` message immediately after the join is
 * processed. Any `remote_op` that arrives before `doc_state` is buffered
 * in `_preInitBuffer`. Once `doc_state` arrives the buffer is replayed:
 * ops whose version is already covered by the snapshot are discarded; newer
 * ops are dispatched normally (own echoes suppressed, foreign ops forwarded).
 * This eliminates the race condition that arose when a parallel REST fetch
 * could overwrite Quill content that the WS stream had already applied.
 */
export class WSClient {
  /**
   * @param {string}   url            - WebSocket URL
   * @param {string}   documentId
   * @param {string}   userId
   * @param {Function} onRemoteOp     - called with (op, version, userId)
   * @param {Function} onRemoteCursor - called with (userId, position)
   * @param {Function} onPresence     - called with (userId, event)
   * @param {Function} onOwnOpAck     - called with (serverVersion) when own
   *                                    echo is suppressed
   * @param {Function} onDocState     - called with (content, version) once
   *                                    the authoritative snapshot arrives
   */
  constructor(url, documentId, userId, onRemoteOp, onRemoteCursor, onPresence, onOwnOpAck, onDocState) {
    this.url            = url;
    this.documentId     = documentId;
    this.userId         = userId;
    this.onRemoteOp     = onRemoteOp;
    this.onRemoteCursor = onRemoteCursor;
    this.onPresence     = onPresence;
    this.onOwnOpAck     = onOwnOpAck;
    this.onDocState     = onDocState;

    this._ws              = null;
    this._inFlight        = [];    // ops sent but not yet echoed back
    this._reconnectMs     = 1000;
    this._closed          = false;

    // Pre-initialisation buffer: remote_ops received before doc_state.
    this._docStateReceived = false;
    this._preInitBuffer    = [];
  }

  connect(authToken) {
    this._authToken = authToken;
    this._open();
  }

  _open() {
    if (this._closed) return;

    // Reset pre-init state on every (re)connect — a fresh doc_state will arrive.
    this._docStateReceived = false;
    this._preInitBuffer    = [];

    this._ws = new WebSocket(this.url);

    this._ws.onopen = () => {
      this._reconnectMs = 1000;
      this._send({
        type:       'join_document',
        documentId: this.documentId,
        payload:    { userId: this.userId, auth_token: this._authToken },
      });
    };

    this._ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }

      // ── Document state snapshot (sent once on join) ──────────────────────────
      if (msg.type === 'doc_state') {
        this._docStateReceived = true;
        this.onDocState?.(msg.content, msg.version);

        // Replay buffered ops that are newer than the snapshot. Ops at or below
        // the snapshot version are already baked into doc_state.content.
        for (const buffered of this._preInitBuffer) {
          if (buffered.version <= msg.version) continue;
          this._dispatchRemoteOp(buffered);
        }
        this._preInitBuffer = [];
        return;
      }

      // ── Incoming operation from the server ───────────────────────────────────
      if (msg.type === 'remote_op') {
        if (!this._docStateReceived) {
          // Buffer until doc_state arrives so we know the base version.
          this._preInitBuffer.push(msg);
          return;
        }
        this._dispatchRemoteOp(msg);
        return;
      }

      if (msg.type === 'remote_cursor') {
        this.onRemoteCursor?.(msg.userId, msg.position);
        return;
      }

      if (msg.type === 'presence_update') {
        this.onPresence?.(msg.userId, msg.event);
        return;
      }
    };

    this._ws.onclose = () => {
      if (this._closed) return;
      console.log(`[ws] disconnected — reconnecting in ${this._reconnectMs}ms`);
      setTimeout(() => this._open(), this._reconnectMs);
      this._reconnectMs = Math.min(this._reconnectMs * 2, 16000);
    };

    this._ws.onerror = (e) => console.error('[ws] error', e);
  }

  /**
   * Dispatch a single remote_op message: suppress own echoes, forward the
   * rest to onRemoteOp.  Also used when replaying the pre-init buffer.
   * @param {{ op, version, userId }} msg
   */
  _dispatchRemoteOp(msg) {
    // Match by userId only — we cannot predict the server-assigned version
    // because concurrent ops from other users may advance it past version+1.
    const idx = this._inFlight.findIndex((f) => f.userId === msg.userId);
    if (idx !== -1) {
      this._inFlight.splice(idx, 1);
      // Notify the editor of the server-assigned version so versionRef advances.
      this.onOwnOpAck?.(msg.version);
      return; // suppress echo — do not re-apply our own op to the editor
    }
    this.onRemoteOp?.(msg.op, msg.version, msg.userId);
  }

  /**
   * Send a document operation to the server.
   * @param {Array}  op      - OT operation array
   * @param {number} version - client's current document version
   */
  sendOp(op, version) {
    // Track that we have an op in-flight identified by userId; the
    // server-assigned version is unknown until the echo comes back.
    this._inFlight.push({ userId: this.userId });
    this._send({
      type:       'submit_op',
      documentId: this.documentId,
      payload:    { op, version, userId: this.userId },
    });
  }

  sendCursor(position) {
    this._send({
      type:       'cursor_move',
      documentId: this.documentId,
      payload:    { position, userId: this.userId },
    });
  }

  _send(obj) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    }
  }

  disconnect() {
    this._closed = true;
    this._ws?.close();
  }
}
