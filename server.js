import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { config } from './src/config.js';
import apiRouter from './src/routes/api.js';
import { initMemoryStore } from './src/core/memory_store.js';
import { initFormattingRules } from './src/core/rag_system.js';
import { loadAllAutoSaves } from './src/core/auto_save.js';

// ── 認証設定 ───────────────────────────────────────────────────────────────────

// SESSION_SECRET が設定されている場合のみ認証を有効化
const SESSION_SECRET = process.env.SESSION_SECRET;
const AUTH_REQUIRED = !!SESSION_SECRET;

// 起動ごとにランダムなトークンを生成（cookie に格納する値）
const AUTH_TOKEN = crypto.randomBytes(32).toString('hex');

/** リクエストから指定名の cookie を取得 */
function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k === name) return v;
  }
  return null;
}

/** 認証ミドルウェア */
function requireAuth(req, res, next) {
  if (!AUTH_REQUIRED) return next();
  // ログイン画面・認証API は認証不要
  if (req.path === '/login' || req.path.startsWith('/api/auth/')) return next();
  // CSS・JS 等の静的アセットは通過させる（SPA が動かないと認証 UI も壊れる）
  if (req.path.startsWith('/css/') || req.path.startsWith('/js/')) return next();

  const token = getCookie(req, 'auth_token');
  if (token === AUTH_TOKEN) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  res.redirect('/login');
}

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

// ── 認証ルート（静的ミドルウェアより前に配置） ──────────────────────────────────

// ログイン画面
app.get('/login', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// POST /api/auth/login — パスワード検証・cookie 発行
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!AUTH_REQUIRED) return res.json({ ok: true });
  if (password === SESSION_SECRET) {
    // HttpOnly + SameSite=Strict で XSS・CSRF から保護
    res.setHeader('Set-Cookie', `auth_token=${AUTH_TOKEN}; HttpOnly; SameSite=Strict; Path=/`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'パスワードが違います' });
});

// POST /api/auth/logout — cookie 削除
app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'auth_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// 認証ミドルウェア（全ルートに適用）
app.use(requireAuth);

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

// 起動時に一度だけ index.html を読み込んでキャッシュ（リクエストごとの同期 I/O を排除）
// AUTH_REQUIRED・BUILD_TS はサーバー起動中に変化しないため、完全に事前計算できる
const INDEX_HTML_CACHED = fs.readFileSync(INDEX_PATH, 'utf8')
  .replace(/(href|src)="(\/(?:css|js)\/[^"]+)"/g, `$1="$2?v=${BUILD_TS}"`)
  // 認証フラグをフロントエンドに注入（ログアウトボタン表示制御用）
  .replace('</head>', `<script>window.AUTH_REQUIRED=${AUTH_REQUIRED};</script>\n</head>`);

app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.send(INDEX_HTML_CACHED);
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
