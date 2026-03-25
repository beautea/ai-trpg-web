/**
 * AI TRPG Web — エントリーポイント
 * 各モジュールをインポートして初期化処理を実行する
 */
import { $ } from './utils.js';
import { initParticles } from './particles.js';
import { setParticlesCtrl } from './state.js';
import { applyReaderSettings, initReaderPanel, toggleReaderPanel } from './reader.js';
import { showScreen } from './screens.js';
import { tryResumeSession } from './session.js';
import { openSessionsScreen } from './sessions-screen.js';

// セットアップ・ゲームモジュールはサイドエフェクト（イベントリスナー登録）のためインポートのみ
import './setup.js';
import './game.js';

async function init(): Promise<void> {
  // パーティクル初期化（ライブバインディング経由で全モジュールから参照される）
  setParticlesCtrl(initParticles());

  // リーダー設定を適用し、設定パネルのイベントを登録
  applyReaderSettings();
  initReaderPanel();

  $('btn-start-journey').addEventListener('click', () => showScreen('setup'));
  $('btn-sessions').addEventListener('click', openSessionsScreen);
  $('btn-sessions-back').addEventListener('click', () => showScreen('landing'));
  $('btn-sessions-new').addEventListener('click', () => showScreen('setup'));

  // デフォルトスタイルカードを選択状態にする
  document.querySelector('.style-card[data-value="novel"]')?.classList.add('selected');

  // Escキーでモーダル・リーダーパネルを閉じる
  document.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach((m) => m.classList.remove('open'));
      toggleReaderPanel(true);
    }
  });

  // ページリロード時の自動再開
  const savedSessionId = localStorage.getItem('currentSessionId');
  if (savedSessionId) {
    showScreen('loading');
    document.getElementById('loading-text')!.textContent = 'セッションを復元中…';
    const resumed = await tryResumeSession(savedSessionId);
    if (!resumed) showScreen('landing');
  } else {
    showScreen('landing');
  }
}

init();
