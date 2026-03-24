import { chat, chatStream } from './llm_client.js';
import {
  getSession,
  addHistory,
  rollbackHistory,
  updateSession,
} from './session_store.js';
import {
  buildSystemPrompt,
  buildIntroPrompt,
  buildWorldGenPrompt,
} from './prompt_builder.js';
import {
  extractAndStoreMemoryAsync,
  retrieveRelevantMemories,
  formatMemoriesForPrompt,
  retrieveSystemRules,
  formatSystemRulesForPrompt,
} from './rag_system.js';
import { autoSave } from './auto_save.js';
import type { Session } from '../types.js';

/**
 * イントロシーン生成（ストリーミング）
 */
export async function generateIntroStream(
  sessionId: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const [systemRules, prompt] = await Promise.all([
    retrieveSystemRules(),
    Promise.resolve(buildIntroPrompt(session)),
  ]);
  const introSystem = `あなたは優れた小説家兼ゲームマスターです。${formatSystemRulesForPrompt(systemRules)}`;
  const fullText = await chatStream(
    introSystem,
    [{ role: 'user', content: prompt }],
    onChunk,
  );

  addHistory(sessionId, 'assistant', fullText);
  updateSession(sessionId, { scene: fullText.slice(0, 100) + '…', turn: 0 });

  // イントロ内容もメモリに格納（世界観・初期状況）
  extractAndStoreMemoryAsync(sessionId, 0, 'セッション開始', fullText);
  autoSave(sessionId);

  return fullText;
}

/**
 * イントロシーン生成（非ストリーミング）
 */
export async function generateIntro(sessionId: string): Promise<string> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const prompt = buildIntroPrompt(session);
  const response = await chat('あなたは優れた小説家兼ゲームマスターです。', [
    { role: 'user', content: prompt },
  ]);

  addHistory(sessionId, 'assistant', response);
  updateSession(sessionId, { scene: response.slice(0, 100) + '…', turn: 0 });
  return response;
}

/**
 * プレイヤー行動を処理してGM応答をストリーミング
 * 関連メモリをRAGで検索してシステムプロンプトに注入する
 */
export async function processActionStream(
  sessionId: string,
  playerInput: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  // プレイヤー行動を履歴に追加
  addHistory(sessionId, 'user', playerInput);

  // RAG: 永続システムルール + 行動関連メモリを検索
  const [systemRules, memories] = await Promise.all([
    retrieveSystemRules(),
    retrieveRelevantMemories(sessionId, playerInput),
  ]);
  const memoriesText = formatSystemRulesForPrompt(systemRules) + formatMemoriesForPrompt(memories);

  const systemPrompt = buildSystemPrompt(session, memoriesText);
  const messages = session.history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }));

  const fullText = await chatStream(systemPrompt, messages, onChunk);

  // GM応答を履歴に追加
  addHistory(sessionId, 'assistant', fullText);
  const newTurn = session.turn + 1;
  updateSession(sessionId, {
    turn: newTurn,
    scene: fullText.slice(0, 100) + '…',
  });

  // HP/MP自動パース
  parseAndUpdateStats(sessionId, fullText);

  // 非同期（レスポンスをブロックしない）: メモリ抽出 + 自動セーブ
  extractAndStoreMemoryAsync(sessionId, newTurn, playerInput, fullText);
  autoSave(sessionId);

  return fullText;
}

/**
 * プレイヤー行動を処理（非ストリーミング）
 */
export async function processAction(sessionId: string, playerInput: string): Promise<string> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  addHistory(sessionId, 'user', playerInput);

  const [systemRules, memories] = await Promise.all([
    retrieveSystemRules(),
    retrieveRelevantMemories(sessionId, playerInput),
  ]);
  const memoriesText = formatSystemRulesForPrompt(systemRules) + formatMemoriesForPrompt(memories);
  const systemPrompt = buildSystemPrompt(session, memoriesText);
  const messages = session.history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }));

  const response = await chat(systemPrompt, messages);
  addHistory(sessionId, 'assistant', response);
  updateSession(sessionId, { turn: session.turn + 1 });
  parseAndUpdateStats(sessionId, response);
  return response;
}

/**
 * 直前ターンをロールバック
 */
export function rollback(sessionId: string): boolean {
  return rollbackHistory(sessionId);
}

/**
 * セーブ用セッションサマリーを生成
 */
export async function generateSummary(sessionId: string): Promise<string> {
  const session = getSession(sessionId);
  if (!session || session.history.length === 0) return '（まだ物語は始まっていない）';

  const historyText = session.history
    .map((h) => `${h.role === 'user' ? 'プレイヤー' : 'GM'}: ${h.content}`)
    .join('\n\n');

  const prompt = `以下のTRPGセッションのログを要約してください。

${historyText}

以下の5つのセクションで簡潔にまとめてください：
1. 主要な出来事（時系列）
2. 登場NPC・状況
3. 入手した情報・アイテム
4. 未解決の謎・課題
5. 現在の状況

日本語のみで出力し、Markdown記法を使わないでください。`;

  const summary = await chat(
    'あなたはTRPGセッションのアーカイバーです。',
    [{ role: 'user', content: prompt }],
  );
  return summary;
}

/**
 * カスタムテーマ用ワールドコアコンセプトを生成
 */
export async function generateWorldConcept(sessionId: string): Promise<string> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const prompt = buildWorldGenPrompt(session);
  const concept = await chat('あなたはTRPGのワールドビルダーです。', [
    { role: 'user', content: prompt },
  ]);

  updateSession(sessionId, {
    world: { ...session.world, coreConceptGenerated: concept },
  });
  return concept;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseAndUpdateStats(sessionId: string, text: string): void {
  const session = getSession(sessionId);
  if (!session || session.rules.statsMode === 'none') return;

  // 【HP】現在: X / 最大: Y
  const hpMatch = text.match(/【HP】現在[:：]\s*(\d+)\s*[\/／]\s*最大[:：]\s*(\d+)/);
  if (hpMatch) {
    const player = { ...session.player, hp: parseInt(hpMatch[1]), hpMax: parseInt(hpMatch[2]) };
    updateSession(sessionId, { player });
  }

  // 【MP】現在: X / 最大: Y
  const mpMatch = text.match(/【MP】現在[:：]\s*(\d+)\s*[\/／]\s*最大[:：]\s*(\d+)/);
  if (mpMatch && session.rules.statsMode === 'hpmp') {
    const player = { ...session.player, mp: parseInt(mpMatch[1]), mpMax: parseInt(mpMatch[2]) };
    updateSession(sessionId, { player });
  }
}
