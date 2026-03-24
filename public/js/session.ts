/**
 * セッションライフサイクル: 自動再開・新規セッション開始・ゲーム画面初期化
 */
import * as api from './api.js';
import { $, showToast } from './utils.js';
import { state, setupData } from './state.js';
import { showScreen } from './screens.js';
import { streamToStory, rehydrateStoryFromHistory } from './story.js';
import { enableInput } from './game.js';

// ── Auto-resume ───────────────────────────────────────────────────────────────

/**
 * localStorageに保存されたセッションIDから前回の続きを復元する
 */
export async function tryResumeSession(sessionId: string): Promise<boolean> {
  try {
    const session = await api.getSession(sessionId);
    // エラーレスポンスまたは未完了セッションは無視
    if (!session || !session.setupComplete || !session.active) {
      localStorage.removeItem('currentSessionId');
      return false;
    }

    state.sessionId = sessionId;
    state.session = session;

    // setupDataをセッション状態から復元（ステータスモーダル等で使用）
    Object.assign(setupData, {
      genre: session.rules.genre,
      customSetting: session.rules.customSetting,
      narrativeStyle: session.rules.narrativeStyle,
      diceSystem: session.rules.diceSystem,
      statsMode: session.rules.statsMode,
      responseLength: session.rules.responseLength,
      actionSuggestions: session.rules.actionSuggestions,
      charName: session.player.name,
      charDesc: session.player.characterDescription,
      adventureTheme: session.world.adventureTheme,
    });

    $('story-inner').innerHTML = '';
    $('session-info').textContent = `— ${session.player.name}の物語`;

    if (session.rules.diceSystem !== 'none') {
      $('dice-btn-wrap').style.display = 'block';
      $('dice-label').textContent = session.rules.diceSystem === 'coc' ? 'd100' : session.rules.diceSystem;
    }

    showScreen('game');
    rehydrateStoryFromHistory(false); // トーストなしで復元
    enableInput();
    showToast('前回のセッションを再開しました');
    return true;
  } catch {
    localStorage.removeItem('currentSessionId');
    return false;
  }
}

// ── New session ───────────────────────────────────────────────────────────────

export async function beginSession(): Promise<void> {
  showScreen('loading');
  $('loading-text').textContent = 'セッションを初期化中…';

  try {
    const { sessionId } = await api.newSession();
    state.sessionId = sessionId;
    // セッションIDをlocalStorageに保存（ページリロード対応）
    localStorage.setItem('currentSessionId', sessionId);

    await api.patchSession(sessionId, {
      rules: {
        genre: setupData.genre,
        customSetting: setupData.customSetting,
        narrativeStyle: setupData.narrativeStyle,
        diceSystem: setupData.diceSystem,
        statsMode: setupData.statsMode,
        responseLength: setupData.responseLength,
        actionSuggestions: setupData.actionSuggestions,
      },
      world: { adventureTheme: setupData.adventureTheme },
      player: {
        name: setupData.charName,
        characterDescription: setupData.charDesc,
        hp:    setupData.statsMode !== 'none'   ? 20 : null,
        hpMax: setupData.statsMode !== 'none'   ? 20 : null,
        mp:    setupData.statsMode === 'hpmp'   ? 10 : null,
        mpMax: setupData.statsMode === 'hpmp'   ? 10 : null,
      },
    });

    showScreen('game');
    initGameScreen();

    $('loading-text').textContent = '世界を構築中…';
    state.session = await api.getSession(sessionId);

    if (setupData.diceSystem !== 'none') {
      $('dice-btn-wrap').style.display = 'block';
      $('dice-label').textContent = setupData.diceSystem === 'coc' ? 'd100' : setupData.diceSystem;
    }

    const response = await api.setupCompleteStream(sessionId);
    await streamToStory(response, 'gm');

    enableInput();
  } catch (err) {
    showToast(`エラー: ${(err as Error).message}`);
    showScreen('setup');
  }
}

export function initGameScreen(): void {
  $('story-inner').innerHTML = '';
  $('session-info').textContent = `— ${setupData.charName}の物語`;
}
