import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import gamesRouter from './routes/games';
import adminRouter from './routes/admin';
import { registerSocketHandlers } from './socket/handlers';
import { getDb, archiveOldGames } from './db';

const PORT = parseInt(process.env.PORT || '3001', 10);
const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';
const isDev = process.env.NODE_ENV !== 'production';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: isDev ? { origin: 'http://localhost:5173', methods: ['GET', 'POST'] } : {},
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors(isDev ? { origin: 'http://localhost:5173' } : {}));
app.use(express.json());

// API routes
app.use('/api', gamesRouter);
app.use(`/api${ADMIN_PATH}`, adminRouter);

// Serve built client in production
if (!isDev) {
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Socket.io
registerSocketHandlers(io);

// Initialize DB
getDb();

// Archive completed games older than 7 days (run on startup + every hour)
function runMaintenance(): void {
  archiveOldGames(7 * 24 * 60 * 60 * 1000);
}
runMaintenance();
setInterval(runMaintenance, 60 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`Hand & Foot server running on port ${PORT}`);
  if (isDev) {
    console.log(`Admin panel: http://localhost:${PORT}/api${ADMIN_PATH}`);
  }
});
