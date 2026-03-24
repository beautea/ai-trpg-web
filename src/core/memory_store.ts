/**
 * 記憶ストア - ChromaDBを使ったベクターデータベース管理
 * ChromaDBが利用できない場合はインメモリ検索にフォールバック
 */
import type { MemoryEntry } from '../types.js';

// ── 文字n-gramハッシュ埋め込み（日本語対応・384次元） ─────────────────────────

/**
 * FNV-32aハッシュ（高速・均一分散）
 */
function fnv32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * 文字n-gramベクトル生成（Unicode対応・L2正規化済み）
 */
function charNgramVector(text: string, dim = 384): number[] {
  const vec = new Float32Array(dim);
  const chars = [...text]; // Unicode文字単位（絵文字・漢字対応）

  for (let i = 0; i < chars.length; i++) {
    // 1-gram（重み1.0）
    vec[fnv32(chars[i]) % dim] += 1.0;
    // 2-gram（重み0.8）
    if (i + 1 < chars.length) {
      vec[fnv32(chars[i] + chars[i + 1]) % dim] += 0.8;
    }
    // 3-gram（重み0.6）
    if (i + 2 < chars.length) {
      vec[fnv32(chars[i] + chars[i + 1] + chars[i + 2]) % dim] += 0.6;
    }
  }

  // L2正規化
  let mag = 0;
  for (let i = 0; i < dim; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag);
  if (mag > 0) for (let i = 0; i < dim; i++) vec[i] /= mag;

  return Array.from(vec);
}

/** コサイン類似度（L2正規化済みベクトル前提） */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// ── インメモリフォールバックストア ────────────────────────────────────────────

interface MemoryItem {
  id: string;
  text: string;
  metadata: Record<string, string | number | boolean>;
  vec: number[];
}

class InMemoryVectorStore {
  private _data = new Map<string, MemoryItem[]>();

  _coll(sessionId: string): MemoryItem[] {
    if (!this._data.has(sessionId)) this._data.set(sessionId, []);
    return this._data.get(sessionId)!;
  }

  add(sessionId: string, id: string, text: string, metadata: Record<string, string | number | boolean>): void {
    const coll = this._coll(sessionId);
    const idx = coll.findIndex((e) => e.id === id);
    const entry: MemoryItem = { id, text, metadata, vec: charNgramVector(text) };
    if (idx >= 0) coll[idx] = entry;
    else coll.push(entry);
  }

  query(sessionId: string, queryText: string, nResults = 5): MemoryEntry[] {
    const coll = this._data.get(sessionId);
    if (!coll || coll.length === 0) return [];
    const qv = charNgramVector(queryText);
    return coll
      .map((e) => ({ ...e, score: cosineSim(qv, e.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, nResults)
      .map((e) => ({ document: e.text, metadata: e.metadata, distance: 1 - e.score }));
  }

  delete(sessionId: string): void {
    this._data.delete(sessionId);
  }

  count(sessionId: string): number {
    return this._data.get(sessionId)?.length ?? 0;
  }
}

// ── ChromaDB型定義 ────────────────────────────────────────────────────────────

interface IEmbeddingFunction {
  generate(texts: string[]): Promise<number[][]>;
}

interface ChromaCollection {
  upsert(params: { ids: string[]; documents: string[]; metadatas: Record<string, string | number | boolean>[] }): Promise<void>;
  query(params: { queryEmbeddings: number[][]; nResults: number }): Promise<{
    documents: (string | null)[][];
    metadatas: (Record<string, string | number | boolean> | null)[][];
    distances: number[][];
  }>;
  get(params: Record<string, unknown>): Promise<{
    documents: (string | null)[];
    metadatas: (Record<string, string | number | boolean> | null)[];
  }>;
  count(): Promise<number>;
}

interface ChromaClientType {
  heartbeat(): Promise<unknown>;
  getOrCreateCollection(params: { name: string; embeddingFunction: IEmbeddingFunction }): Promise<ChromaCollection>;
  deleteCollection(params: { name: string }): Promise<void>;
}

// ── ChromaDB用カスタム埋め込み関数 ────────────────────────────────────────────

const customEmbeddingFn: IEmbeddingFunction = {
  generate: async (texts: string[]) => texts.map((t) => charNgramVector(t)),
};

// ── ストア初期化 ──────────────────────────────────────────────────────────────

let _backend: 'chroma' | 'memory' | null = null;
let _chromaClient: ChromaClientType | null = null;
let _memStore: InMemoryVectorStore | null = null;

/**
 * メモリストア初期化
 * ChromaDBへの接続を試み、失敗時はインメモリストアを使用
 */
export async function initMemoryStore(chromaUrl: string): Promise<void> {
  try {
    const { ChromaClient } = await import('chromadb');
    // URLをパースしてhost/portを取得（非推奨のpathパラメータを回避）
    const url = new URL(chromaUrl);
    _chromaClient = new ChromaClient({
      host: url.hostname,
      port: parseInt(url.port) || 8001,
      ssl: url.protocol === 'https:',
    }) as unknown as ChromaClientType;
    await _chromaClient.heartbeat();
    _backend = 'chroma';
    console.log('✓ ChromaDB接続成功');
  } catch (err) {
    const e = err as Error;
    console.log(`ChromaDB接続失敗 (${e.message}) → インメモリストアを使用します`);
    _memStore = new InMemoryVectorStore();
    _backend = 'memory';
  }
}

/** セッション用ChromaDBコレクション名（UUID形式のハイフンを除去） */
function collName(sessionId: string): string {
  return `s_${sessionId.replace(/-/g, '')}`;
}

async function getOrCreateChromaCollection(sessionId: string): Promise<ChromaCollection> {
  return _chromaClient!.getOrCreateCollection({
    name: collName(sessionId),
    embeddingFunction: customEmbeddingFn,
  });
}

// ── 公開API ───────────────────────────────────────────────────────────────────

/**
 * メモリを追加（upsert: 同IDは上書き）
 */
export async function addMemory(
  sessionId: string,
  memId: string,
  text: string,
  metadata: Record<string, string | number | boolean> = {},
): Promise<void> {
  if (!_backend) return;
  try {
    if (_backend === 'chroma') {
      const coll = await getOrCreateChromaCollection(sessionId);
      await coll.upsert({ ids: [memId], documents: [text], metadatas: [metadata] });
    } else {
      _memStore!.add(sessionId, memId, text, metadata);
    }
  } catch (err) {
    const e = err as Error;
    console.error('addMemory error:', e.message);
  }
}

/**
 * 類似メモリを検索
 */
export async function queryMemories(
  sessionId: string,
  queryText: string,
  nResults = 5,
): Promise<MemoryEntry[]> {
  if (!_backend) return [];
  try {
    if (_backend === 'chroma') {
      const coll = await getOrCreateChromaCollection(sessionId);
      const count = await coll.count();
      if (count === 0) return [];
      const n = Math.min(nResults, count);
      const qv = charNgramVector(queryText);
      const res = await coll.query({ queryEmbeddings: [qv], nResults: n });
      return (res.documents[0] || []).map((doc, i) => ({
        document: doc ?? '',
        metadata: res.metadatas[0][i] ?? {},
        distance: res.distances[0][i],
      }));
    } else {
      return _memStore!.query(sessionId, queryText, nResults);
    }
  } catch (err) {
    const e = err as Error;
    console.error('queryMemories error:', e.message);
    return [];
  }
}

/**
 * コレクション内の全ドキュメントを取得（セマンティック検索なし）
 */
export async function listAllMemories(sessionId: string): Promise<MemoryEntry[]> {
  if (!_backend) return [];
  try {
    if (_backend === 'chroma') {
      const coll = await getOrCreateChromaCollection(sessionId);
      const res = await coll.get({});
      return (res.documents || []).map((doc, i) => ({
        document: doc ?? '',
        metadata: res.metadatas?.[i] ?? {},
      }));
    } else {
      const coll = _memStore!._coll(sessionId);
      return coll.map((e) => ({ document: e.text, metadata: e.metadata }));
    }
  } catch (err) {
    const e = err as Error;
    console.error('listAllMemories error:', e.message);
    return [];
  }
}

// ── システムルール（全セッション共通・永続） ────────────────────────────────────

const SYSTEM_SESSION_ID = 'systemrules'; // ChromaDBコレクション名（ハイフン不使用）

/**
 * システムルールを追加（upsert: 同IDは上書き）
 */
export async function addSystemRule(
  ruleId: string,
  text: string,
  metadata: Record<string, string | number | boolean> = {},
): Promise<void> {
  return addMemory(SYSTEM_SESSION_ID, ruleId, text, { ...metadata, type: 'system_rule' });
}

/**
 * 全システムルールを取得
 */
export async function getAllSystemRules(): Promise<MemoryEntry[]> {
  return listAllMemories(SYSTEM_SESSION_ID);
}

/**
 * セッションのメモリを全削除
 */
export async function deleteSessionMemories(sessionId: string): Promise<void> {
  if (!_backend) return;
  try {
    if (_backend === 'chroma') {
      try {
        await _chromaClient!.deleteCollection({ name: collName(sessionId) });
      } catch { /* コレクションが存在しない場合は無視 */ }
    } else {
      _memStore!.delete(sessionId);
    }
  } catch { /* エラーは無視 */ }
}
