/**
 * RAGシステム - メモリ抽出・検索・プロンプト注入
 * GMの応答から重要事実を自動抽出してChromaDBに蓄積し、
 * 次のターンで関連メモリを検索してシステムプロンプトに注入する
 */

import { addMemory, queryMemories, addSystemRule, getAllSystemRules } from './memory_store.js';
import { chat } from './llm_client.js';
import { SYSTEM_RULES } from '../system_rules.js';

/**
 * サーバー起動時にsystem_rules.jsの内容をChromaDBへ永続化（idempotent）
 */
export async function initFormattingRules() {
  for (const rule of SYSTEM_RULES) {
    await addSystemRule(rule.id, rule.text, { category: rule.category });
  }
  console.log(`✓ システムルール ${SYSTEM_RULES.length}件をChromaDBに永続化しました`);
}

/**
 * 全システムルールをChromaDBから取得
 * @returns {Promise<Array<{document:string, metadata:object}>>}
 */
export async function retrieveSystemRules() {
  return getAllSystemRules();
}

/**
 * システムルールをシステムプロンプト用テキストにフォーマット
 * @param {Array<{document:string}>} rules
 * @returns {string}
 */
export function formatSystemRulesForPrompt(rules) {
  if (!rules || rules.length === 0) return '';
  const lines = rules
    .filter((r) => r.document?.trim())
    .map((r) => `・${r.document}`)
    .join('\n');
  if (!lines) return '';
  return `\n\n【永続ルール】（必ず守ること）\n${lines}`;
}

/**
 * ターン終了後にLLMで重要事実を抽出してメモリに格納（非同期・fire-and-forget）
 * GMの応答をブロックしないよう非同期実行する
 */
export function extractAndStoreMemoryAsync(sessionId, turn, playerInput, gmResponse) {
  _extractAndStore(sessionId, turn, playerInput, gmResponse).catch((err) => {
    console.error('メモリ抽出エラー:', err.message);
  });
}

async function _extractAndStore(sessionId, turn, playerInput, gmResponse) {
  const prompt = `以下のTRPGシーンから、将来のGMが覚えておくべき重要な事実を1〜3個抽出してください。
キャラクター名・場所・重要な出来事・アイテム取得・関係性の変化・重大な決断などが対象です。
各事実は「・」で始まる1行で、具体的かつ簡潔に書いてください。
重要な事実がない場合は何も出力しないでください。

プレイヤー行動: ${playerInput}
GM応答: ${gmResponse}`;

  const res = await chat('あなたはTRPGの記録係です。', [{ role: 'user', content: prompt }]);
  if (res.startsWith('⚠️')) return;

  const facts = res
    .split('\n')
    .filter((l) => l.trim().startsWith('・'))
    .map((l) => l.trim().slice(1).trim())
    .filter((f) => f.length > 3);

  for (let i = 0; i < facts.length; i++) {
    await addMemory(sessionId, `t${turn}_f${i}`, facts[i], {
      turn,
      type: 'event',
      timestamp: Date.now(),
    });
  }
}

/**
 * 現在のコンテキストに関連するメモリを検索
 * @param {string} sessionId
 * @param {string} currentContext - 現在のプレイヤー行動テキスト
 * @returns {Promise<Array<{document:string, metadata:object, distance:number}>>}
 */
export async function retrieveRelevantMemories(sessionId, currentContext) {
  return queryMemories(sessionId, currentContext, 6);
}

/**
 * 検索済みメモリをシステムプロンプト用テキストにフォーマット
 * @param {Array<{document:string}>} memories
 * @returns {string} システムプロンプトに追加するテキスト
 */
export function formatMemoriesForPrompt(memories) {
  if (!memories || memories.length === 0) return '';

  const lines = memories
    .filter((m) => m.document?.trim())
    .map((m) => `・${m.document}`)
    .join('\n');

  if (!lines) return '';

  return `\n\n【記憶・重要事実】（過去ターンから検索された関連情報）\n${lines}\n※上記の事実と矛盾しないよう注意してください。`;
}
