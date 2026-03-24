/**
 * ランディング画面のパーティクルアニメーション
 */
import { $ } from './utils.js';

export interface ParticlesController {
  stop(): void;
  restart(): void;
  destroy(): void;
}

export function initParticles(): ParticlesController {
  const canvas = $('particle-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  let W: number, H: number;
  interface Particle { x: number; y: number; r: number; vx: number; vy: number; alpha: number; color: string }
  let particles: Particle[];
  let rafId: number | null = null;

  function resize(): void {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticles(n = 80): void {
    particles = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.6 + 0.1,
      // 色はあらかじめ文字列で計算して保持（毎フレームのテンプレートリテラル生成を回避）
      color: Math.random() < 0.5
        ? `hsla(270, 70%, 65%, ${(Math.random() * 0.6 + 0.1).toFixed(2)})`
        : `hsla(45, 70%, 65%, ${(Math.random() * 0.6 + 0.1).toFixed(2)})`,
    }));
  }

  function draw(): void {
    // 背景はCSSで描画するのでcanvasはクリアのみ（毎フレームのグラジェント生成を回避）
    ctx.clearRect(0, 0, W, H);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });
    rafId = requestAnimationFrame(draw);
  }

  // リサイズイベントをdebounce（連続リサイズ中の過剰処理を防止）
  // 名前付き関数で参照を保持し、destroy 時に確実に解除できるようにする
  let resizeTimer: number | null = null;
  const onResize = (): void => {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); createParticles(); }, 150);
  };
  window.addEventListener('resize', onResize);

  resize();
  createParticles();
  rafId = requestAnimationFrame(draw);

  return {
    stop:    () => { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } },
    restart: () => { if (rafId === null) rafId = requestAnimationFrame(draw); },
    destroy: () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener('resize', onResize);
    },
  };
}
