import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

// 起動時に API キーの存在を確認（未設定のまま起動して最初のリクエストで失敗するのを防ぐ）
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('エラー: ANTHROPIC_API_KEY が設定されていません。.env ファイルを確認してください。');
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Single-turn chat (returns full string)
 */
export async function chat(system, messages) {
  try {
    const response = await anthropic.messages.create({
      model: config.llm.model,
      max_tokens: config.llm.maxTokens,
      temperature: config.llm.temperature,
      system,
      messages,
    });
    return response.content[0].text;
  } catch (err) {
    console.error('LLM error:', err.message);
    return `⚠️ エラーが発生しました: ${err.message}`;
  }
}

/**
 * Streaming chat — calls onChunk(text) for each delta, returns full text
 */
export async function chatStream(system, messages, onChunk) {
  let fullText = '';
  try {
    const stream = await anthropic.messages.create({
      model: config.llm.model,
      max_tokens: config.llm.maxTokens,
      temperature: config.llm.temperature,
      system,
      messages,
      stream: true,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta'
      ) {
        const chunk = event.delta.text;
        fullText += chunk;
        onChunk(chunk);
      }
    }
  } catch (err) {
    console.error('LLM stream error:', err.message);
    const errMsg = `⚠️ エラーが発生しました: ${err.message}`;
    onChunk(errMsg);
    fullText += errMsg;
  }
  return fullText;
}
