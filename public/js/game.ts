/**
 * ゲーム画面UI: 入力・ダイス・ロールバック・ステータス・セーブ・モーダル・ログアウト・終了
 */
import * as api from './api.js';
import { $, escapeHtml, showToast, showConfirm } from './utils.js';
import { state, setupData } from './state.js';
import { showScreen } from './screens.js';
import { readerSettings } from './reader.js';
import {
  streamToStory, addPlayerEntry, hideActionChoices, rehydrateStoryFromHistory,
} from './story.js';

// ── Input helpers ─────────────────────────────────────────────────────────────

export function enableInput(): void {
  const input = $('action-input') as HTMLInputElement;
  const sendBtn = $('btn-send') as HTMLButtonElement;
  state.streaming = false;
  input.disabled = false;
  input.focus();
  sendBtn.disabled = input.value.trim().length === 0;
}

export function disableInput(): void {
  const input = $('action-input') as HTMLInputElement;
  const sendBtn = $('btn-send') as HTMLButtonElement;
  state.streaming = true;
  input.disabled = true;
  sendBtn.disabled = true;
}

// ── Input event listeners ─────────────────────────────────────────────────────

($('action-input') as HTMLInputElement).addEventListener('input', () => {
  const input = $('action-input') as HTMLInputElement;
  ($('btn-send') as HTMLButtonElement).disabled = input.value.trim().length === 0 || state.streaming;
  // テキストエリアの高さを自動調整
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
});

($('action-input') as HTMLInputElement).addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
    e.preventDefault();
    ($('btn-send') as HTMLButtonElement).click();
  }
});

($('btn-send') as HTMLButtonElement).addEventListener('click', async () => {
  const input = $('action-input') as HTMLInputElement;
  const action = input.value.trim();
  if (!action || state.streaming) return;

  input.value = '';
  input.style.height = 'auto';
  ($('btn-send') as HTMLButtonElement).disabled = true;
  disableInput();
  hideActionChoices();

  addPlayerEntry(action);

  try {
    const response = await api.sendAction(state.sessionId!, action);
    await streamToStory(response, 'gm');
  } catch (err) {
    showToast(`エラー: ${(err as Error).message}`);
  }

  enableInput();
});

// ── Dice ──────────────────────────────────────────────────────────────────────

$('btn-dice').addEventListener('click', async () => {
  try {
    const result = await api.rollDice(state.sessionId!, setupData.diceSystem);
    showDicePopup(result);

    const input = $('action-input') as HTMLInputElement;
    const diceNote = `【ダイス: ${result.description}】`;
    input.value = input.value.trim() ? `${input.value} ${diceNote}` : diceNote;
    ($('btn-send') as HTMLButtonElement).disabled = false;
    input.focus();
  } catch {
    showToast('ダイスエラー');
  }
});

function showDicePopup(result: { result: number; description: string }): void {
  document.querySelector('.dice-popup')?.remove();

  // innerHTML を使わず DOM 構築（XSS防止）
  const popup = document.createElement('div');
  popup.className = 'dice-popup';

  const resultEl = document.createElement('div');
  resultEl.className = 'dice-popup-result';
  resultEl.textContent = String(result.result);

  const descEl = document.createElement('div');
  descEl.className = 'dice-popup-desc';
  descEl.textContent = result.description;

  popup.appendChild(resultEl);
  popup.appendChild(descEl);
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 3000);
}

// ── Rollback ──────────────────────────────────────────────────────────────────

$('btn-rollback').addEventListener('click', async () => {
  if (state.streaming) { showToast('ストリーミング中は使用できません'); return; }
  if (!await showConfirm('最後のターンを巻き戻しますか？', { ok: '巻き戻す' })) return;
  hideActionChoices();

  try {
    await api.rollback(state.sessionId!);
    // 最新の2エントリ（プレイヤー+GM）とセパレータを削除
    const inner = $('story-inner');
    const isHorizontal = readerSettings.writingMode === 'horizontal';
    // 縦書き: 最新エントリはfirstChild、横書き: 最新エントリはlastChild
    const getNewest = (): ChildNode | null => isHorizontal ? inner.lastChild : inner.firstChild;
    let removed = 0;
    while (removed < 2 && getNewest()) {
      const child = getNewest()!;
      inner.removeChild(child);
      if (child instanceof HTMLElement && child.classList.contains('story-entry')) removed++;
    }
    // 末端に残った孤立セパレータを削除
    const edge = getNewest();
    if (edge instanceof HTMLElement && edge.classList.contains('story-divider')) {
      inner.removeChild(edge);
    }
    showToast('ターンを巻き戻しました');
  } catch (err) {
    // サーバーから返るエラーメッセージ（「巻き戻せる履歴がありません」等）を表示
    showToast((err as Error).message || '巻き戻しに失敗しました');
  }
});

// ── Modal helpers ─────────────────────────────────────────────────────────────

export function openModal(id: string): void {
  if (id === 'modal-status') renderStatus();
  document.getElementById(id)?.classList.add('open');
}

export function closeModal(id: string): void {
  document.getElementById(id)?.classList.remove('open');
}

document.querySelectorAll('.modal-close').forEach((btn) => {
  btn.addEventListener('click', () => closeModal((btn as HTMLElement).dataset.close ?? ''));
});

document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal((overlay as HTMLElement).id);
  });
});

// ── Status modal ──────────────────────────────────────────────────────────────

$('btn-status').addEventListener('click', () => openModal('modal-status'));

function renderStatus(): void {
  const session = state.session;
  if (!session) return;

  const { player, rules, turn } = session;
  // ユーザー入力値は escapeHtml でサニタイズ（XSS防止）
  let html = `<div class="status-grid">
    <div class="status-item">
      <span class="status-item-label">キャラクター</span>
      <span class="status-item-value">${escapeHtml(player?.name || '—')}</span>
    </div>
    <div class="status-item">
      <span class="status-item-label">ターン</span>
      <span class="status-item-value">${turn || 0}</span>
    </div>`;

  if (rules?.statsMode === 'hp' || rules?.statsMode === 'hpmp') {
    const hp = player?.hp ?? 20;
    const hpMax = player?.hpMax ?? 20;
    const hpPct = Math.max(0, Math.min(100, ((hp ?? 0) / (hpMax ?? 20)) * 100));
    html += `<div class="status-item" style="grid-column: span 2;">
      <span class="status-item-label">HP</span>
      <span class="status-item-value">${hp} / ${hpMax}</span>
      <div class="hp-bar"><div class="hp-fill" style="width:${hpPct}%"></div></div>
    </div>`;
  }

  if (rules?.statsMode === 'hpmp') {
    const mp = player?.mp ?? 10;
    const mpMax = player?.mpMax ?? 10;
    const mpPct = Math.max(0, Math.min(100, ((mp ?? 0) / (mpMax ?? 10)) * 100));
    html += `<div class="status-item" style="grid-column: span 2;">
      <span class="status-item-label">MP</span>
      <span class="status-item-value">${mp} / ${mpMax}</span>
      <div class="mp-bar"><div class="mp-fill" style="width:${mpPct}%"></div></div>
    </div>`;
  }

  html += `<div class="status-item">
    <span class="status-item-label">ジャンル</span>
    <span class="status-item-value" style="font-size:0.9rem">${escapeHtml(rules?.genre || '—')}</span>
  </div>
  <div class="status-item">
    <span class="status-item-label">スタイル</span>
    <span class="status-item-value" style="font-size:0.9rem">${
      rules?.narrativeStyle === 'novel' ? '小説' :
      rules?.narrativeStyle === 'trpg'  ? 'TRPG' : 'バランス'
    }</span>
  </div>`;

  // 所持品
  const items = player?.items ?? [];
  html += `<div class="status-item" style="grid-column: span 2;">
    <span class="status-item-label">所持品</span>
    <div class="inventory-list">`;
  if (items.length > 0) {
    for (const item of items) {
      html += `<span class="inventory-item">${escapeHtml(item)}</span>`;
    }
  } else {
    html += `<span style="color:var(--text-muted);font-size:0.82rem">なし</span>`;
  }
  html += `</div></div></div>`;

  $('status-content').innerHTML = html;
}

// ── Save modal ────────────────────────────────────────────────────────────────

$('btn-save').addEventListener('click', async () => {
  await refreshSavesList();
  openModal('modal-save');
});

$('btn-do-save').addEventListener('click', async () => {
  const name = ($('save-name-input') as HTMLInputElement).value.trim();
  try {
    showToast('保存中…');
    await api.saveGame(state.sessionId!, name || undefined);
    showToast('セーブしました');
    await refreshSavesList();
    ($('save-name-input') as HTMLInputElement).value = '';
  } catch {
    showToast('セーブに失敗しました');
  }
});

async function refreshSavesList(): Promise<void> {
  const saves = await api.listSaves(state.sessionId!);
  const list = $('saves-list');

  if (!saves.length) {
    list.innerHTML = '<p class="saves-empty">セーブデータがありません</p>';
    return;
  }

  // s.name はユーザー入力由来のため escapeHtml でサニタイズ（XSS・属性インジェクション防止）
  // data-name 属性のエスケープはブラウザが自動でデコードするため API 呼び出し時は元の値が復元される
  list.innerHTML = saves.map((s) => {
    const date = new Date(s.savedAt).toLocaleString('ja-JP', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const safeName = escapeHtml(s.name);
    return `<div class="save-item">
      <div class="save-item-info">
        <span class="save-item-name">${safeName}</span>
        <span class="save-item-meta">${date} · ターン ${s.turn}</span>
      </div>
      <div class="save-item-actions">
        <button class="btn-load" data-name="${safeName}">ロード</button>
        <button class="btn-delete" data-name="${safeName}">削除</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.btn-load').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = (btn as HTMLElement).dataset.name ?? '';
      if (!await showConfirm(`「${name}」をロードしますか？`, { ok: 'ロードする' })) return;
      try {
        await api.loadSave(state.sessionId!, name);
        state.session = await api.getSession(state.sessionId!);
        showToast('ロードしました');
        closeModal('modal-save');
        rehydrateStoryFromHistory();
      } catch {
        showToast('ロードに失敗しました');
      }
    });
  });

  list.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = (btn as HTMLElement).dataset.name ?? '';
      if (!await showConfirm(`「${name}」を削除しますか？`, { ok: '削除する', danger: true })) return;
      try {
        await api.deleteSave(state.sessionId!, name);
        await refreshSavesList();
      } catch {
        showToast('削除に失敗しました');
      }
    });
  });
}

// ── Logout ────────────────────────────────────────────────────────────────────

const btnLogout = $('btn-logout');
if (window.AUTH_REQUIRED) {
  btnLogout.style.display = '';
  btnLogout.addEventListener('click', async () => {
    if (!await showConfirm('ログアウトしますか？', { ok: 'ログアウト', danger: true })) return;
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

// ── End session ───────────────────────────────────────────────────────────────

$('btn-end').addEventListener('click', async () => {
  if (!await showConfirm('セッションを終了しますか？', { ok: '終了する', danger: true })) return;
  try {
    await api.deleteSession(state.sessionId!);
  } catch {
    // サーバー側削除が失敗してもローカルをクリアして画面遷移（ユーザー操作を妨げない）
  }
  localStorage.removeItem('currentSessionId');
  state.sessionId = null;
  state.session = null;
  showScreen('landing');
});
