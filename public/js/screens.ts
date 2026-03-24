/**
 * 画面遷移管理
 * particlesCtrl はライブバインディングで state.ts から参照する
 */
import { particlesCtrl } from './state.js';

export const screens: Record<string, HTMLElement> = {
  landing: document.getElementById('landing-screen')!,
  setup:   document.getElementById('setup-screen')!,
  loading: document.getElementById('loading-screen')!,
  game:    document.getElementById('game-screen')!,
};

export function showScreen(name: string): void {
  // ランディング画面への遷移はパーティクルを再開、それ以外は停止
  if (name === 'landing') {
    particlesCtrl?.restart();
  } else {
    particlesCtrl?.stop();
  }
  Object.entries(screens).forEach(([k, el]) => {
    if (k === name) {
      el.style.display = 'flex';
      requestAnimationFrame(() => el.classList.add('active'));
    } else {
      el.classList.remove('active');
      setTimeout(() => { if (!el.classList.contains('active')) el.style.display = 'none'; }, 300);
    }
  });
}
