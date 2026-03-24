/**
 * アプリ共有状態（AppState・SetupData・particlesCtrl）
 */
import type { Session, DiceSystem, StatsMode, NarrativeStyle, ResponseLength } from '../../src/types.js';
import type { ParticlesController } from './particles.js';

// ── App state ─────────────────────────────────────────────────────────────────

export interface AppState {
  sessionId: string | null;
  session: Session | null;
  streaming: boolean;
  setupStep: number;
  totalSteps: number;
}

export const state: AppState = {
  sessionId: null,
  session: null,
  streaming: false,
  setupStep: 0,
  totalSteps: 5,
};

// ── Setup data ────────────────────────────────────────────────────────────────

export interface SetupData {
  genre: string;
  customSetting: string;
  narrativeStyle: NarrativeStyle;
  diceSystem: DiceSystem;
  statsMode: StatsMode;
  responseLength: ResponseLength;
  actionSuggestions: boolean;
  charName: string;
  charDesc: string;
  adventureTheme: string;
}

export const setupData: SetupData = {
  genre: '',
  customSetting: '',
  narrativeStyle: 'novel',
  diceSystem: 'none',
  statsMode: 'none',
  responseLength: 'standard',
  actionSuggestions: false,
  charName: '',
  charDesc: '',
  adventureTheme: '',
};

// ── Particles controller ──────────────────────────────────────────────────────

// initParticles() の戻り値を格納。init() で setParticlesCtrl() を通じて設定される
export let particlesCtrl: ParticlesController | null = null;

export function setParticlesCtrl(ctrl: ParticlesController | null): void {
  particlesCtrl = ctrl;
}
