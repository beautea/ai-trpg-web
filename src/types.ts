// 共通型定義 — バックエンド・フロントエンド双方で使用する型

// ── セッションルール列挙型 ──────────────────────────────────────────────────

export type DiceSystem = 'none' | 'd20' | 'coc' | 'dnd5e';
export type StatsMode = 'none' | 'hp' | 'hpmp';
export type NarrativeStyle = 'novel' | 'trpg' | 'balanced';
export type ResponseLength = 'short' | 'standard' | 'long';

// ── セッション状態の型定義 ────────────────────────────────────────────────────

export interface SessionRules {
  genre: string;
  customSetting: string;
  diceSystem: DiceSystem;
  statsMode: StatsMode;
  narrativeStyle: NarrativeStyle;
  actionSuggestions: boolean;
  responseLength: ResponseLength;
}

export interface PlayerStats {
  name: string;
  characterDescription: string;
  hp: number | null;
  hpMax: number | null;
  mp: number | null;
  mpMax: number | null;
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionWorld {
  adventureTheme: string;
  coreConceptGenerated: string;
}

export interface Session {
  id: string;
  createdAt: number;
  active: boolean;
  setupComplete: boolean;
  rules: SessionRules;
  world: SessionWorld;
  player: PlayerStats;
  scene: string;
  turn: number;
  history: HistoryEntry[];
}

// ── SSEイベント型 ────────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: 'text'; chunk: string }
  | { type: 'done'; turn?: number; player?: PlayerStats }
  | { type: 'error'; message: string }
  | { type: 'status'; text: string }
  | { type: 'intro_start' };

// ── メモリストア型 ─────────────────────────────────────────────────────────────

export interface MemoryEntry {
  document: string;
  metadata: Record<string, string | number | boolean>;
  distance?: number;
}

// ── セーブ型 ────────────────────────────────────────────────────────────────

export interface SaveMeta {
  name: string;
  savedAt: number;
  turn: number;
  scene: string;
}
