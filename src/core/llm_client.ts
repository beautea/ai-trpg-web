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
export async function chat(
  system: string,
  messages: Anthropic.MessageParam[],
): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: config.llm.model,
      max_tokens: config.llm.maxTokens,
      temperature: config.llm.temperature,
      system,
      messages,
    });
    const block = response.content[0];
    if (block.type === 'text') return block.text;
    return '';
  } catch (err) {
    const e = err as Error;
    console.error('LLM error:', e.message);
    return `⚠️ エラーが発生しました: ${e.message}`;
  }
}

/**
 * Streaming chat — calls onChunk(text) for each delta, returns full text
 */
export async function chatStream(
  system: string,
  messages: Anthropic.MessageParam[],
  onChunk: (chunk: string) => void,
): Promise<string> {
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
        event.delta.type === 'text_delta'
      ) {
        const chunk = event.delta.text;
        fullText += chunk;
        onChunk(chunk);
      }
    }
  } catch (err) {
    const e = err as Error;
    console.error('LLM stream error:', e.message);
    const errMsg = `⚠️ エラーが発生しました: ${e.message}`;
    onChunk(errMsg);
    fullText += errMsg;
  }
  return fullText;
}
