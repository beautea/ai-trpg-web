/**
 * 記憶ストア - ChromaDBを使ったベクターデータベース管理
 * ChromaDBが利用できない場合はインメモリ検索にフォールバック
 */

// ── 文字n-gramハッシュ埋め込み（日本語対応・384次元） ─────────────────────────

/**
 * FNV-32aハッシュ（高速・均一分散）
 */
function fnv32(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * 文字n-gramベクトル生成（Unicode対応・L2正規化済み）
 * @param {string} text
 * @param {number} dim - ベクトル次元数
 * @returns {number[]}
 */
function charNgramVector(text, dim = 384) {
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
function cosineSim(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// ── インメモリフォールバックストア ────────────────────────────────────────────

class InMemoryVectorStore {
  constructor() {
    /** @type {Map<string, Array<{id:string, text:string, metadata:object, vec:number[]}>>} */
    this._data = new Map();
  }

  _coll(sessionId) {
    if (!this._data.has(sessionId)) this._data.set(sessionId, []);
    return this._data.get(sessionId);
  }

  add(sessionId, id, text, metadata) {
    const coll = this._coll(sessionId);
    const idx = coll.findIndex((e) => e.id === id);
    const entry = { id, text, metadata, vec: charNgramVector(text) };
    if (idx >= 0) coll[idx] = entry;
    else coll.push(entry);
  }

  query(sessionId, queryText, nResults = 5) {
    const coll = this._data.get(sessionId);
    if (!coll || coll.length === 0) return [];
    const qv = charNgramVector(queryText);
    return coll
      .map((e) => ({ ...e, score: cosineSim(qv, e.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, nResults)
      .map((e) => ({ document: e.text, metadata: e.metadata, distance: 1 - e.score }));
  }

  delete(sessionId) {
    this._data.delete(sessionId);
  }

  count(sessionId) {
    return this._data.get(sessionId)?.length ?? 0;
  }
}

// ── ChromaDB用カスタム埋め込み関数 ────────────────────────────────────────────

const customEmbeddingFn = {
  generate: async (texts) => texts.map((t) => charNgramVector(t)),
};

// ── ストア初期化 ──────────────────────────────────────────────────────────────

let _backend = null; // 'chroma' | 'memory'
let _chromaClient = null;
let _memStore = null;

/**
 * メモリストア初期化
 * ChromaDBへの接続を試み、失敗時はインメモリストアを使用
 */
export async function initMemoryStore(chromaUrl) {
  try {
    const { ChromaClient } = await import('chromadb');
    // URLをパースしてhost/portを取得（非推奨のpathパラメータを回避）
    const url = new URL(chromaUrl);
    _chromaClient = new ChromaClient({
      host: url.hostname,
      port: parseInt(url.port) || 8001,
      ssl: url.protocol === 'https:',
    });
    await _chromaClient.heartbeat();
    _backend = 'chroma';
    console.log('✓ ChromaDB接続成功');
  } catch (err) {
    console.log(`ChromaDB接続失敗 (${err.message}) → インメモリストアを使用します`);
    _memStore = new InMemoryVectorStore();
    _backend = 'memory';
  }
}

/** セッション用ChromaDBコレクション名（UUID形式のハイフンを除去） */
function collName(sessionId) {
  return `s_${sessionId.replace(/-/g, '')}`;
}

async function getOrCreateChromaCollection(sessionId) {
  return _chromaClient.getOrCreateCollection({
    name: collName(sessionId),
    embeddingFunction: customEmbeddingFn,
  });
}

// ── 公開API ───────────────────────────────────────────────────────────────────

/**
 * メモリを追加（upsert: 同IDは上書き）
 */
export async function addMemory(sessionId, memId, text, metadata = {}) {
  if (!_backend) return;
  try {
    if (_backend === 'chroma') {
      const coll = await getOrCreateChromaCollection(sessionId);
      await coll.upsert({ ids: [memId], documents: [text], metadatas: [metadata] });
    } else {
      _memStore.add(sessionId, memId, text, metadata);
    }
  } catch (err) {
    console.error('addMemory error:', err.message);
  }
}

/**
 * 類似メモリを検索
 * @returns {Array<{document:string, metadata:object, distance:number}>}
 */
export async function queryMemories(sessionId, queryText, nResults = 5) {
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
        document: doc,
        metadata: res.metadatas[0][i],
        distance: res.distances[0][i],
      }));
    } else {
      return _memStore.query(sessionId, queryText, nResults);
    }
  } catch (err) {
    console.error('queryMemories error:', err.message);
    return [];
  }
}

/**
 * セッションのメモリを全削除
 */
export async function deleteSessionMemories(sessionId) {
  if (!_backend) return;
  try {
    if (_backend === 'chroma') {
      try {
        await _chromaClient.deleteCollection({ name: collName(sessionId) });
      } catch { /* コレクションが存在しない場合は無視 */ }
    } else {
      _memStore.delete(sessionId);
    }
  } catch { /* エラーは無視 */ }
}
