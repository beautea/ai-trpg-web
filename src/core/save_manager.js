import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { getSession, restoreSession } from './session_store.js';
import { generateSummary } from './gm_system.js';

const SAVES_DIR = config.paths.saves;

async function ensureSavesDir() {
  await fs.mkdir(SAVES_DIR, { recursive: true });
}

/**
 * Save current session to disk
 * Returns save name
 */
export async function saveSession(sessionId, saveName) {
  await ensureSavesDir();

  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  // path.basename でディレクトリ成分を除去（パストラバーサル防止の多重防御）
  const name = saveName ? path.basename(saveName) : `save_${timestamp}`;

  const saveDir = path.join(SAVES_DIR, path.basename(sessionId));
  await fs.mkdir(saveDir, { recursive: true });

  // Generate summary
  const summary = await generateSummary(sessionId);

  // Write state JSON
  const stateFile = path.join(saveDir, `${name}.json`);
  await fs.writeFile(
    stateFile,
    JSON.stringify({ ...session, savedAt: Date.now() }, null, 2),
    'utf8',
  );

  // Write human-readable summary
  const summaryFile = path.join(saveDir, `${name}_summary.md`);
  await fs.writeFile(
    summaryFile,
    `# セーブデータ: ${name}\n保存日時: ${new Date().toLocaleString('ja-JP')}\n\n${summary}`,
    'utf8',
  );

  return { name, summary };
}

/**
 * List available saves for a session
 */
export async function listSaves(sessionId) {
  const saveDir = path.join(SAVES_DIR, path.basename(sessionId));
  try {
    const files = await fs.readdir(saveDir);
    // autosave.json はユーザー向けセーブ一覧から除外
    const stateFiles = files.filter((f) => f.endsWith('.json') && f !== 'autosave.json');

    // 個別ファイルのJSON破損が他のセーブ取得を妨げないよう、エラーをスキップ
    const saves = (await Promise.all(
      stateFiles.map(async (f) => {
        try {
          const filePath = path.join(saveDir, f);
          const stat = await fs.stat(filePath);
          const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
          return {
            name: f.replace('.json', ''),
            savedAt: data.savedAt || stat.mtimeMs,
            turn: data.turn || 0,
            scene: data.scene || '',
          };
        } catch {
          return null; // 破損ファイルはスキップ
        }
      }),
    )).filter(Boolean);

    return saves.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/**
 * Load a save by name
 */
export async function loadSave(sessionId, saveName) {
  // path.basename でディレクトリ成分を除去（パストラバーサル防止の多重防御）
  const safeId   = path.basename(sessionId);
  const safeName = path.basename(saveName);
  const saveFile = path.join(SAVES_DIR, safeId, `${safeName}.json`);
  const raw = await fs.readFile(saveFile, 'utf8');
  const data = JSON.parse(raw);
  restoreSession(sessionId, data);
  return data;
}

/**
 * Delete a save
 */
export async function deleteSave(sessionId, saveName) {
  // path.basename でディレクトリ成分を除去（パストラバーサル防止の多重防御）
  const safeId   = path.basename(sessionId);
  const safeName = path.basename(saveName);
  const saveDir  = path.join(SAVES_DIR, safeId);
  await fs.unlink(path.join(saveDir, `${safeName}.json`)).catch(() => {});
  await fs.unlink(path.join(saveDir, `${safeName}_summary.md`)).catch(() => {});
}
