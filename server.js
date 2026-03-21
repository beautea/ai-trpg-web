import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { config } from './src/config.js';
import apiRouter from './src/routes/api.js';
import { initMemoryStore } from './src/core/memory_store.js';
import { initFormattingRules } from './src/core/rag_system.js';
import { loadAllAutoSaves } from './src/core/auto_save.js';

// 起動時タイムスタンプ（キャッシュバスティング用）
const BUILD_TS = Date.now();

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

// 静的ファイル配信（index.htmlはSPAフォールバックで注入するためindex:false）
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,   // index.html を自動配信しない（バージョン注入のためSPAルートに任せる）
    etag: true,
    lastModified: true,
    setHeaders(res, _filePath) {
      res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

app.use('/api', apiRouter);

// SPA fallback（HTMLにバージョンクエリを注入して返す）
// ?v=BUILD_TS を付けることで Cloudflare 等の CDN キャッシュをバイパスする
const INDEX_PATH = path.join(__dirname, 'public', 'index.html');
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  const html = fs.readFileSync(INDEX_PATH, 'utf8')
    .replace(/(href|src)="(\/(?:css|js)\/[^"]+)"/g, `$1="$2?v=${BUILD_TS}"`);
  res.send(html);
});

// ── 起動シーケンス ─────────────────────────────────────────────────────────────

async function start() {
  // ChromaDB起動 → メモリストア初期化（失敗時はインメモリフォールバック）
  await startChromaServer();
  await initMemoryStore(config.chroma.url);
  await initFormattingRules();

  // 前回セッションをファイルから復元
  await loadAllAutoSaves();

  app.listen(config.port, () => {
    console.log(`\n  ✨ AI TRPG Web  →  http://localhost:${config.port}\n`);
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
