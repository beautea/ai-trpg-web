/**
 * セットアップウィザード: ジャンル・スタイル・ルール・キャラクター・テーマの入力ハンドラ
 */
import { $, showToast } from './utils.js';
import { state, setupData } from './state.js';
import type { DiceSystem, StatsMode, NarrativeStyle, ResponseLength } from '../../src/types.js';
import { beginSession } from './session.js';

// ── Progress ──────────────────────────────────────────────────────────────────

function updateProgress(): void {
  const pct = (state.setupStep / (state.totalSteps - 1)) * 100;
  $('progress-fill').style.width = `${pct}%`;

  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === state.setupStep);
    dot.classList.toggle('completed', i < state.setupStep);
  });
}

export function goToStep(n: number): void {
  const steps = document.querySelectorAll('.setup-step');
  steps.forEach((s) => s.classList.remove('active'));
  (steps[n] as HTMLElement).classList.add('active');
  state.setupStep = n;
  updateProgress();
}

// ── Genre ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.genre-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.genre-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    setupData.genre = (card as HTMLElement).dataset.value ?? '';
    $('custom-setting-wrap').classList.toggle('hidden', setupData.genre !== 'カスタム');
  });
});

// ── Narrative style ───────────────────────────────────────────────────────────

document.querySelectorAll('.style-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.style-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    const radio = card.querySelector('input[type="radio"]') as HTMLInputElement | null;
    if (radio) {
      radio.checked = true;
      setupData.narrativeStyle = radio.value as NarrativeStyle;
    }
  });
});

// ── Rule chips ────────────────────────────────────────────────────────────────

document.querySelectorAll('.rule-chip input[type="radio"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const r = radio as HTMLInputElement;
    const group = r.name;
    document.querySelectorAll(`input[name="${group}"]`).forEach((ri) => {
      ri.closest('.rule-chip')?.classList.toggle('selected', ri === radio);
    });
    if (group === 'diceSystem')     setupData.diceSystem     = r.value as DiceSystem;
    if (group === 'statsMode')      setupData.statsMode      = r.value as StatsMode;
    if (group === 'responseLength') setupData.responseLength = r.value as ResponseLength;
  });
});

($('actionSuggestions') as HTMLInputElement).addEventListener('change', (e) => {
  setupData.actionSuggestions = (e.target as HTMLInputElement).checked;
});

// ── Adventure theme ───────────────────────────────────────────────────────────

document.querySelectorAll('.theme-preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const theme = (btn as HTMLElement).dataset.theme ?? '';
    ($('adventure-theme') as HTMLInputElement).value = theme;
    setupData.adventureTheme = theme;
  });
});

($('adventure-theme') as HTMLInputElement).addEventListener('input', (e) => {
  setupData.adventureTheme = (e.target as HTMLInputElement).value;
});

// ── Navigation buttons ────────────────────────────────────────────────────────

$('genre-next').addEventListener('click', () => {
  if (!setupData.genre) { showToast('ジャンルを選択してください'); return; }
  if (setupData.genre === 'カスタム') {
    setupData.customSetting = ($('custom-setting') as HTMLInputElement).value.trim();
  }
  goToStep(1);
});

document.querySelectorAll('.btn-next:not(#genre-next):not(#btn-begin)').forEach((btn) => {
  btn.addEventListener('click', () => goToStep(state.setupStep + 1));
});

document.querySelectorAll('.btn-prev').forEach((btn) => {
  btn.addEventListener('click', () => goToStep(state.setupStep - 1));
});

$('btn-begin').addEventListener('click', async () => {
  setupData.charName    = ($('char-name') as HTMLInputElement).value.trim();
  setupData.charDesc    = ($('char-desc') as HTMLTextAreaElement).value.trim();
  setupData.adventureTheme = ($('adventure-theme') as HTMLInputElement).value.trim();

  if (!setupData.charName) { showToast('キャラクター名を入力してください'); goToStep(3); return; }

  await beginSession();
});
