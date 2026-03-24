/**
 * リーダー設定（文字サイズ・書字方向・フォント・軽量モード）とスクロールヘルパー
 */
import { $ } from './utils.js';
import { particlesCtrl } from './state.js';
import { screens } from './screens.js';

// ── Reader settings ───────────────────────────────────────────────────────────

export interface ReaderSettings {
  fontSizeIdx: number;
  writingMode: 'vertical' | 'horizontal';
  fontFamily: 'serif' | 'sans';
  liteMode: boolean;
}

export const FONT_SCALES = [0.78, 0.88, 1.0, 1.14, 1.3];
export const FONT_LABELS = ['極小', '小', '中', '大', '極大'];

// localStorageから復元。不正値はデフォルトにフォールバック
export const readerSettings: ReaderSettings = (() => {
  const rawIdx = parseInt(localStorage.getItem('reader_fontSizeIdx') ?? '', 10);
  const idx = Number.isFinite(rawIdx) && rawIdx >= 0 && rawIdx < FONT_SCALES.length ? rawIdx : 2;
  const mode = localStorage.getItem('reader_writingMode') === 'horizontal' ? 'horizontal' : 'vertical';
  const family = localStorage.getItem('reader_fontFamily') === 'sans' ? 'sans' : 'serif';
  const liteMode = localStorage.getItem('reader_liteMode') === 'true';
  return { fontSizeIdx: idx, writingMode: mode, fontFamily: family, liteMode };
})();

export function saveReaderSettings(): void {
  localStorage.setItem('reader_fontSizeIdx', String(readerSettings.fontSizeIdx));
  localStorage.setItem('reader_writingMode',  readerSettings.writingMode);
  localStorage.setItem('reader_fontFamily',   readerSettings.fontFamily);
  localStorage.setItem('reader_liteMode',     String(readerSettings.liteMode));
}

export function applyReaderSettings(): void {
  // CSSカスタムプロパティで文字スケールを反映
  document.documentElement.style.setProperty('--story-font-scale', String(FONT_SCALES[readerSettings.fontSizeIdx]));
  // game-screenにクラスで書字方向・フォントを反映
  const gameScreen = $('game-screen');
  gameScreen.classList.toggle('horizontal-mode', readerSettings.writingMode === 'horizontal');
  gameScreen.classList.toggle('font-sans',       readerSettings.fontFamily  === 'sans');
  // 軽量モードをhtmlタグに反映（全体のエフェクト制御）
  document.documentElement.classList.toggle('lite-mode', readerSettings.liteMode);
  // 軽量モードではランディング画面のパーティクルも停止、通常モードでは再開
  if (readerSettings.liteMode) {
    particlesCtrl?.stop();
  } else if (screens.landing?.classList.contains('active')) {
    particlesCtrl?.restart();
  }
  syncReaderUI();
}

export function syncReaderUI(): void {
  $('font-size-label').textContent = FONT_LABELS[readerSettings.fontSizeIdx];
  ($('btn-font-smaller') as HTMLButtonElement).disabled   = readerSettings.fontSizeIdx === 0;
  ($('btn-font-larger') as HTMLButtonElement).disabled    = readerSettings.fontSizeIdx === FONT_SCALES.length - 1;
  $('btn-writing-vertical').classList.toggle('active',   readerSettings.writingMode === 'vertical');
  $('btn-writing-horizontal').classList.toggle('active', readerSettings.writingMode === 'horizontal');
  $('btn-font-serif').classList.toggle('active', readerSettings.fontFamily === 'serif');
  $('btn-font-sans').classList.toggle('active',  readerSettings.fontFamily === 'sans');
  $('btn-effect-full').classList.toggle('active', !readerSettings.liteMode);
  $('btn-effect-lite').classList.toggle('active',  readerSettings.liteMode);
}

// パネルの開閉（btn-readerにも開閉状態を反映）
export function toggleReaderPanel(forceClose = false): void {
  const panel   = document.getElementById('reader-panel')!;
  const btn     = document.getElementById('btn-reader')!;
  const isOpen  = panel.classList.contains('open');
  const willOpen = !forceClose && !isOpen;
  panel.classList.toggle('open', willOpen);
  btn.classList.toggle('panel-open', willOpen);
}

// ── Scroll helper ─────────────────────────────────────────────────────────────

let _scrollPending = false;

/**
 * 最新ストーリーエントリへスクロール（書字方向に応じて水平/垂直を切り替え）
 * requestAnimationFrame 内で実行し、_scrollPending フラグで連続呼び出しを抑制する
 */
export function scrollToNewest(): void {
  if (_scrollPending) return;
  _scrollPending = true;
  requestAnimationFrame(() => {
    const scroll = $('story-scroll');
    if (readerSettings.writingMode === 'horizontal') {
      // 横書き: 最新エントリは下端（append → DOM末尾 = 下）
      scroll.scrollTop = scroll.scrollHeight;
    } else {
      // 縦書き: 最新エントリは左端（prepend → DOM先頭 → 縦書きは右→左方向）
      scroll.scrollLeft = 0;
    }
    _scrollPending = false;
  });
}

// ── Reader panel event listeners ──────────────────────────────────────────────

export function initReaderPanel(): void {
  // 表示設定パネルの開閉
  $('btn-reader').addEventListener('click', () => toggleReaderPanel());

  // 文字サイズ
  $('btn-font-smaller').addEventListener('click', () => {
    if (readerSettings.fontSizeIdx > 0) {
      readerSettings.fontSizeIdx--;
      applyReaderSettings();
      saveReaderSettings();
    }
  });
  $('btn-font-larger').addEventListener('click', () => {
    if (readerSettings.fontSizeIdx < FONT_SCALES.length - 1) {
      readerSettings.fontSizeIdx++;
      applyReaderSettings();
      saveReaderSettings();
    }
  });

  // 書字方向（変更時はスクロール位置も更新）
  $('btn-writing-vertical').addEventListener('click', () => {
    if (readerSettings.writingMode !== 'vertical') {
      readerSettings.writingMode = 'vertical';
      applyReaderSettings();
      saveReaderSettings();
      scrollToNewest();
    }
  });
  $('btn-writing-horizontal').addEventListener('click', () => {
    if (readerSettings.writingMode !== 'horizontal') {
      readerSettings.writingMode = 'horizontal';
      applyReaderSettings();
      saveReaderSettings();
      scrollToNewest();
    }
  });

  // フォント
  $('btn-font-serif').addEventListener('click', () => {
    if (readerSettings.fontFamily !== 'serif') {
      readerSettings.fontFamily = 'serif';
      applyReaderSettings();
      saveReaderSettings();
    }
  });
  $('btn-font-sans').addEventListener('click', () => {
    if (readerSettings.fontFamily !== 'sans') {
      readerSettings.fontFamily = 'sans';
      applyReaderSettings();
      saveReaderSettings();
    }
  });

  // エフェクト（軽量モード）
  $('btn-effect-full').addEventListener('click', () => {
    if (readerSettings.liteMode) {
      readerSettings.liteMode = false;
      applyReaderSettings();
      saveReaderSettings();
    }
  });
  $('btn-effect-lite').addEventListener('click', () => {
    if (!readerSettings.liteMode) {
      readerSettings.liteMode = true;
      applyReaderSettings();
      saveReaderSettings();
    }
  });

  // パネル外クリックで閉じる
  document.addEventListener('click', (e) => {
    if (!$('reader-panel').classList.contains('open')) return;
    if ($('btn-reader').contains(e.target as Node)) return;
    if ($('reader-panel').contains(e.target as Node)) return;
    toggleReaderPanel(true);
  });
}
