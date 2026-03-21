import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/config.js';
import apiRouter from './src/routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`\n  ✨ AI TRPG Web  →  http://localhost:${PORT}\n`);
});
