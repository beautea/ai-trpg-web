/**
 * セッション一覧ダッシュボード: 過去の冒険を一覧・再開・削除する
 */
import * as api from './api.js';
import { $, escapeHtml, showToast, showConfirm } from './utils.js';
import { showScreen } from './screens.js';
import { tryResumeSession } from './session.js';
import type { SessionSummary } from '../../src/types.js';

/**
 * セッション一覧を取得してDOMに描画する
 */
async function renderSessionsList(): Promise<void> {
  const list = $('sessions-list');
  list.innerHTML = '<div class="sessions-loading">読み込み中…</div>';

  let sessions: SessionSummary[];
  try {
    sessions = await api.listSessions();
  } catch {
    list.innerHTML = '<div class="sessions-empty">読み込みに失敗しました</div>';
    return;
  }

  if (sessions.length === 0) {
    list.innerHTML = '<div class="sessions-empty">保存された冒険はありません</div>';
    return;
  }

  list.innerHTML = '';
  sessions.forEach((s) => {
    const card = buildSessionCard(s);
    list.appendChild(card);
  });
}

function buildSessionCard(s: SessionSummary): HTMLElement {
  const date = new Date(s.lastPlayedAt).toLocaleString('ja-JP', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const card = document.createElement('div');
  card.className = 'session-card';

  // body
  const body = document.createElement('div');
  body.className = 'session-card-body';

  const name = document.createElement('div');
  name.className = 'session-card-name';
  name.textContent = s.playerName;
  body.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'session-card-meta';

  const genre = document.createElement('span');
  genre.className = 'session-card-genre';
  genre.textContent = escapeHtml(s.genre);
  meta.appendChild(genre);

  const turn = document.createElement('span');
  turn.textContent = `ターン ${s.turn}`;
  meta.appendChild(turn);

  const dateEl = document.createElement('span');
  dateEl.textContent = date;
  meta.appendChild(dateEl);

  body.appendChild(meta);

  if (s.scene) {
    const scene = document.createElement('div');
    scene.className = 'session-card-scene';
    scene.textContent = s.scene;
    body.appendChild(scene);
  }

  // actions
  const actions = document.createElement('div');
  actions.className = 'session-card-actions';

  const resumeBtn = document.createElement('button');
  resumeBtn.className = 'btn-session-resume';
  resumeBtn.textContent = '続きから';
  resumeBtn.addEventListener('click', async () => {
    showScreen('loading');
    document.getElementById('loading-text')!.textContent = 'セッションを復元中…';
    localStorage.setItem('currentSessionId', s.id);
    const resumed = await tryResumeSession(s.id);
    if (!resumed) {
      localStorage.removeItem('currentSessionId');
      showToast('セッションの復元に失敗しました');
      showScreen('sessions');
      await renderSessionsList();
    }
  });
  actions.appendChild(resumeBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-session-delete';
  deleteBtn.textContent = '削除';
  deleteBtn.addEventListener('click', async () => {
    if (!await showConfirm(
      `「${s.playerName}」の冒険をすべて削除しますか？\nセーブデータも含めて完全に削除されます。`,
      { ok: '削除する', danger: true },
    )) return;
    try {
      await api.deleteSessionFull(s.id);
      card.remove();
      // 削除後にリストが空になった場合の表示更新
      if ($('sessions-list').children.length === 0) {
        $('sessions-list').innerHTML = '<div class="sessions-empty">保存された冒険はありません</div>';
      }
      showToast('削除しました');
    } catch {
      showToast('削除に失敗しました');
    }
  });
  actions.appendChild(deleteBtn);

  card.appendChild(body);
  card.appendChild(actions);
  return card;
}

/**
 * セッション一覧画面を開く（一覧を再取得して表示）
 */
export async function openSessionsScreen(): Promise<void> {
  showScreen('sessions');
  await renderSessionsList();
}
