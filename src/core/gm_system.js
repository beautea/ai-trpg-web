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

/**
 * Generate opening scene and store as first assistant message
 */
export async function generateIntro(sessionId) {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const prompt = buildIntroPrompt(session);
  const response = await chat('あなたは優れた小説家兼ゲームマスターです。', [
    { role: 'user', content: prompt },
  ]);

  // Store the intro as first assistant message
  addHistory(sessionId, 'assistant', response);
  updateSession(sessionId, { scene: response.slice(0, 100) + '…', turn: 0 });
  return response;
}

/**
 * Generate opening scene with streaming
 */
export async function generateIntroStream(sessionId, onChunk) {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const prompt = buildIntroPrompt(session);
  const fullText = await chatStream(
    'あなたは優れた小説家兼ゲームマスターです。',
    [{ role: 'user', content: prompt }],
    onChunk,
  );

  addHistory(sessionId, 'assistant', fullText);
  updateSession(sessionId, { scene: fullText.slice(0, 100) + '…', turn: 0 });
  return fullText;
}

/**
 * Process player action (streaming)
 */
export async function processActionStream(sessionId, playerInput, onChunk) {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  // Add player input to history
  addHistory(sessionId, 'user', playerInput);

  const systemPrompt = buildSystemPrompt(session);
  const messages = session.history.map((h) => ({
    role: h.role,
    content: h.content,
  }));

  const fullText = await chatStream(systemPrompt, messages, onChunk);

  // Store GM response
  addHistory(sessionId, 'assistant', fullText);
  updateSession(sessionId, {
    turn: session.turn + 1,
    scene: fullText.slice(0, 100) + '…',
  });

  // Parse HP/MP from response if stats are tracked
  parseAndUpdateStats(sessionId, fullText);

  return fullText;
}

/**
 * Process player action (non-streaming, for save summaries etc.)
 */
export async function processAction(sessionId, playerInput) {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  addHistory(sessionId, 'user', playerInput);

  const systemPrompt = buildSystemPrompt(session);
  const messages = session.history.map((h) => ({
    role: h.role,
    content: h.content,
  }));

  const response = await chat(systemPrompt, messages);
  addHistory(sessionId, 'assistant', response);
  updateSession(sessionId, { turn: session.turn + 1 });
  parseAndUpdateStats(sessionId, response);
  return response;
}

/**
 * Rollback last turn
 */
export function rollback(sessionId) {
  return rollbackHistory(sessionId);
}

/**
 * Generate session summary for saving
 */
export async function generateSummary(sessionId) {
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
 * Generate world core concept
 */
export async function generateWorldConcept(sessionId) {
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

function parseAndUpdateStats(sessionId, text) {
  const session = getSession(sessionId);
  if (!session || session.rules.statsMode === 'none') return;

  // Parse 【HP】現在: X / 最大: Y
  const hpMatch = text.match(/【HP】現在[:：]\s*(\d+)\s*[\/／]\s*最大[:：]\s*(\d+)/);
  if (hpMatch) {
    const player = { ...session.player, hp: parseInt(hpMatch[1]), hpMax: parseInt(hpMatch[2]) };
    updateSession(sessionId, { player });
  }

  // Parse 【MP】現在: X / 最大: Y
  const mpMatch = text.match(/【MP】現在[:：]\s*(\d+)\s*[\/／]\s*最大[:：]\s*(\d+)/);
  if (mpMatch && session.rules.statsMode === 'hpmp') {
    const player = { ...session.player, mp: parseInt(mpMatch[1]), mpMax: parseInt(mpMatch[2]) };
    updateSession(sessionId, { player });
  }
}
