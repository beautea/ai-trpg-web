/**
 * 共通ユーティリティ: DOM操作ヘルパー・Toast・確認ダイアログ
 */

// window.AUTH_REQUIRED はサーバーが index.html に注入するグローバル変数
declare global {
  interface Window { AUTH_REQUIRED: boolean; }
}

/** HTML特殊文字をエスケープ（XSS防止） */
export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** IDでDOM要素を取得するショートハンド */
export const $ = (id: string): HTMLElement => document.getElementById(id)!;

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string): void {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

export interface ConfirmOptions {
  ok?: string;
  cancel?: string;
  danger?: boolean;
}

/**
 * ネイティブ confirm() の代替。スタイル付きモーダルでユーザーに確認を求める。
 */
export function showConfirm(
  message: string,
  { ok = '実行する', cancel = 'キャンセル', danger = false }: ConfirmOptions = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay   = document.getElementById('modal-confirm')!;
    const msgEl     = document.getElementById('confirm-message')!;
    const okBtn     = document.getElementById('btn-confirm-ok')!;
    const cancelBtn = document.getElementById('btn-confirm-cancel')!;

    msgEl.textContent     = message;
    okBtn.textContent     = ok;
    cancelBtn.textContent = cancel;
    okBtn.classList.toggle('btn-confirm-danger', danger);
    overlay.classList.add('open');

    function close(result: boolean): void {
      overlay.classList.remove('open');
      resolve(result);
    }

    okBtn.addEventListener('click',     () => close(true),  { once: true });
    cancelBtn.addEventListener('click', () => close(false), { once: true });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    }, { once: true });
  });
}
