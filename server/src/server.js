import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initWebSocketManager } from './ws/socketManager.js';
import authRoutes     from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import historyRoutes  from './routes/history.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth',      authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/history',   historyRoutes);
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Serve the React production build when it exists (set by SERVE_CLIENT=true).
// In local Docker dev the frontend runs in its own container; on Render/free
// hosts a single dyno serves both API and static files from the same origin.
if (process.env.SERVE_CLIENT === 'true') {
  const clientDist = join(__dirname, '../../client-dist');
  app.use(express.static(clientDist));
  app.get('*', (_, res) => res.sendFile(join(clientDist, 'index.html')));
}

export const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/socket' });
initWebSocketManager(wss);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
