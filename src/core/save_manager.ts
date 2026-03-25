import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { getSession, restoreSession } from './session_store.js';
import { generateSummary } from './gm_system.js';
import type { Session, SaveMeta, SessionSummary } from '../types.js';

/** UUID v4 形式の検証 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SAVES_DIR = config.paths.saves;

async function ensureSavesDir(): Promise<void> {
  await fs.mkdir(SAVES_DIR, { recursive: true });
}

/**
 * Save current session to disk
 * Returns save name and summary
 */
export async function saveSession(
  sessionId: string,
  saveName?: string,
): Promise<{ name: string; summary: string }> {
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
export async function listSaves(sessionId: string): Promise<SaveMeta[]> {
  const saveDir = path.join(SAVES_DIR, path.basename(sessionId));
  try {
    const files = await fs.readdir(saveDir);
    // autosave.json はユーザー向けセーブ一覧から除外
    const stateFiles = files.filter((f) => f.endsWith('.json') && f !== 'autosave.json');

    // 個別ファイルのJSON破損が他のセーブ取得を妨げないよう、エラーをスキップ
    const saves = (await Promise.all(
      stateFiles.map(async (f): Promise<SaveMeta | null> => {
        try {
          const filePath = path.join(saveDir, f);
          const stat = await fs.stat(filePath);
          const data = JSON.parse(await fs.readFile(filePath, 'utf8')) as Partial<Session & { savedAt: number }>;
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
    )).filter((s): s is SaveMeta => s !== null);

    return saves.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/**
 * Load a save by name
 */
export async function loadSave(sessionId: string, saveName: string): Promise<Session> {
  // path.basename でディレクトリ成分を除去（パストラバーサル防止の多重防御）
  const safeId   = path.basename(sessionId);
  const safeName = path.basename(saveName);
  const saveFile = path.join(SAVES_DIR, safeId, `${safeName}.json`);
  const raw = await fs.readFile(saveFile, 'utf8');
  const data = JSON.parse(raw) as Session;
  restoreSession(sessionId, data);
  return data;
}

/**
 * 全セッションの一覧を取得（autosave.json から）
 * clientId が指定された場合は一致するセッションのみ返す（ブラウザフィンガープリントによる所有者フィルタ）
 */
export async function listAllSessions(clientId?: string): Promise<SessionSummary[]> {
  try {
    await fs.mkdir(config.paths.saves, { recursive: true });
    const entries = await fs.readdir(config.paths.saves, { withFileTypes: true });
    const results = await Promise.all(
      entries
        .filter((e) => e.isDirectory() && UUID_REGEX.test(e.name))
        .map(async (e): Promise<SessionSummary | null> => {
          try {
            const file = path.join(config.paths.saves, e.name, 'autosave.json');
            const raw = await fs.readFile(file, 'utf8');
            const data = JSON.parse(raw) as Session & { autoSavedAt?: string };
            if (!data.setupComplete) return null;
            // clientId が指定されている場合、セッションの clientId と照合する
            if (clientId && data.clientId && data.clientId !== clientId) return null;
            return {
              id: e.name,
              playerName: data.player?.name || '不明',
              genre: data.rules?.genre || '不明',
              turn: data.turn || 0,
              lastPlayedAt: data.autoSavedAt || new Date(data.createdAt).toISOString(),
              scene: data.scene || '',
            };
          } catch {
            return null;
          }
        }),
    );
    const sessions = results.filter((s): s is SessionSummary => s !== null);
    return sessions.sort((a, b) => new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime());
  } catch {
    return [];
  }
}

/**
 * セッションディレクトリをすべて削除（ダッシュボードからの完全削除用）
 */
export async function deleteSessionDirectory(sessionId: string): Promise<void> {
  const safeId = path.basename(sessionId);
  if (!UUID_REGEX.test(safeId)) throw new Error('Invalid session ID');
  const dir = path.join(config.paths.saves, safeId);
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * Delete a save
 */
export async function deleteSave(sessionId: string, saveName: string): Promise<void> {
  // path.basename でディレクトリ成分を除去（パストラバーサル防止の多重防御）
  const safeId   = path.basename(sessionId);
  const safeName = path.basename(saveName);
  const saveDir  = path.join(SAVES_DIR, safeId);
  await fs.unlink(path.join(saveDir, `${safeName}.json`)).catch(() => {});
  await fs.unlink(path.join(saveDir, `${safeName}_summary.md`)).catch(() => {});
}
