/**
 * 自動セーブ - ターン毎にセッション状態をファイルに永続化
 * サーバー再起動後もセッションを復元できるようにする
 */

import fs from 'fs/promises';
import path from 'path';
import { getSession, restoreSession } from './session_store.js';
import { config } from '../config.js';

const AUTOSAVE_FILE = 'autosave.json';

/**
 * セッションを自動セーブ（data/saves/{id}/autosave.json）
 * @param {string} sessionId
 */
export async function autoSave(sessionId) {
  const session = getSession(sessionId);
  if (!session) return;
  try {
    const dir = path.join(config.paths.saves, sessionId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, AUTOSAVE_FILE),
      JSON.stringify({ ...session, autoSavedAt: new Date().toISOString() }),
      'utf-8',
    );
  } catch (err) {
    console.error('自動セーブエラー:', err.message);
  }
}

/**
 * 指定セッションの自動セーブデータを読み込む
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
export async function loadAutoSave(sessionId) {
  try {
    const file = path.join(config.paths.saves, sessionId, AUTOSAVE_FILE);
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** UUID v4 形式の検証（セッションIDとして安全なディレクトリ名のみ復元対象とする） */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * サーバー起動時: data/saves/ 配下の全自動セーブをメモリに復元
 */
export async function loadAllAutoSaves() {
  try {
    await fs.mkdir(config.paths.saves, { recursive: true });
    const entries = await fs.readdir(config.paths.saves, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // UUID形式以外のディレクトリは無視（手動作成ディレクトリ等の誤復元防止）
      if (!UUID_REGEX.test(entry.name)) continue;
      const data = await loadAutoSave(entry.name);
      if (data?.setupComplete && data?.active !== false) {
        restoreSession(entry.name, data);
        count++;
      }
    }
    if (count > 0) console.log(`✓ ${count}件のセッションを自動復元しました`);
  } catch (err) {
    console.error('自動復元エラー:', err.message);
  }
}
