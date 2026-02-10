import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { initWebSocketManager } from './ws/socketManager.js';

export const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ── HTTP + WebSocket server ────────────────────────────────────────────────────
export const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/socket' });
initWebSocketManager(wss);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
