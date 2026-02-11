/**
 * WebSocket client for real-time document collaboration.
 * Handles connection, op submission, cursor broadcasting, and reconnection.
 */
export class WSClient {
  /**
   * @param {string}   url           - WebSocket URL (e.g. ws://localhost:4000/socket)
   * @param {string}   documentId
   * @param {string}   userId
   * @param {Function} onRemoteOp    - called with (op, version, userId)
   * @param {Function} onRemoteCursor - called with (userId, position)
   * @param {Function} onPresence    - called with (userId, event)
   */
  constructor(url, documentId, userId, onRemoteOp, onRemoteCursor, onPresence) {
    this.url            = url;
    this.documentId     = documentId;
    this.userId         = userId;
    this.onRemoteOp     = onRemoteOp;
    this.onRemoteCursor = onRemoteCursor;
    this.onPresence     = onPresence;

    this._ws           = null;
    this._inFlight     = [];    // ops sent but not yet echoed back
    this._reconnectMs  = 1000;
    this._closed       = false;
  }

  connect(authToken) {
    this._authToken = authToken;
    this._open();
  }

  _open() {
    if (this._closed) return;
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

      if (msg.type === 'remote_op') {
        // Check if this is the echo of our own op — remove from in-flight
        const idx = this._inFlight.findIndex(
          (f) => f.version === msg.version && f.userId === msg.userId,
        );
        if (idx !== -1) {
          this._inFlight.splice(idx, 1);
          return; // suppress echo
        }
        this.onRemoteOp?.(msg.op, msg.version, msg.userId);
      }

      if (msg.type === 'remote_cursor') {
        this.onRemoteCursor?.(msg.userId, msg.position);
      }

      if (msg.type === 'presence_update') {
        this.onPresence?.(msg.userId, msg.event);
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
   * Send a document operation to the server.
   * @param {Array}  op      - OT operation array
   * @param {number} version - client's current document version
   */
  sendOp(op, version) {
    this._inFlight.push({ version: version + 1, userId: this.userId });
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
