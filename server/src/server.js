import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { initWebSocketManager } from './ws/socketManager.js';
import authRoutes     from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import historyRoutes  from './routes/history.js';

export const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth',      authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/history',   historyRoutes);
app.get('/health', (_, res) => res.json({ status: 'ok' }));

export const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/socket' });
initWebSocketManager(wss);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
