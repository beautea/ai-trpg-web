import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { config } from './src/config.js';
import apiRouter from './src/routes/api.js';
import { initMemoryStore } from './src/core/memory_store.js';
import { loadAllAutoSaves } from './src/core/auto_save.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── ChromaDB サーバー起動 ──────────────────────────────────────────────────────

let chromaProcess = null;

async function startChromaServer() {
  try {
    execSync('chroma --version', { stdio: 'pipe' });

    import('fs').then(({ default: fs }) => {
      fs.mkdirSync(config.chroma.dataDir, { recursive: true });
    });

    chromaProcess = spawn(
      'chroma',
      ['run', '--path', config.chroma.dataDir, '--port', String(config.chroma.port)],
      { stdio: 'pipe' },
    );

    chromaProcess.stderr?.on('data', (d) => {
      if (process.env.DEBUG) process.stderr.write(`[ChromaDB] ${d}`);
    });
    chromaProcess.on('error', (err) => console.log('ChromaDB起動エラー:', err.message));

    // 起動待ち（最大5秒）
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('✓ ChromaDBサーバー起動完了');
    return true;
  } catch {
    console.log('chromo CLI未検出 → ChromaDBなしで起動します');
    return false;
  }
}

// ── Express アプリ ────────────────────────────────────────────────────────────

const app = express();

app.use(express.json());

// 静的ファイル配信（CSS/JSは1日キャッシュ、HTMLはno-cache）
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

app.use('/api', apiRouter);

// SPA fallback（常に最新のHTMLを返す）
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── 起動シーケンス ─────────────────────────────────────────────────────────────

async function start() {
  // ChromaDB起動 → メモリストア初期化（失敗時はインメモリフォールバック）
  await startChromaServer();
  await initMemoryStore(config.chroma.url);

  // 前回セッションをファイルから復元
  await loadAllAutoSaves();

  app.listen(config.port, () => {
    const localUrl = `http://localhost:${config.port}`;
    const hostUrl = config.host ? `http://${config.host}:${config.port}` : null;
    console.log(`\n  ✨ AI TRPG Web  →  ${localUrl}`);
    if (hostUrl) console.log(`                    ${hostUrl}`);
    console.log();
  });
}

start();

// ── プロセス終了時クリーンアップ ──────────────────────────────────────────────

function cleanup() {
  if (chromaProcess) {
    chromaProcess.kill();
    chromaProcess = null;
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
