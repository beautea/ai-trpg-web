# AI-TRPG Web — 開発ガイド

## プロジェクト概要

縦書き小説風表示の Web ベース AI TRPG。Claude API（Anthropic SDK）を GM エンジンとして使用し、ChromaDB による RAG 記憶システムと自動セーブ機能を備える。

---

## ファイル構成

```
.
├── server.js                # エントリポイント（Express + ChromaDB起動）
├── src/
│   ├── config.js            # 設定値（LLM・ChromaDB・パス）
│   ├── routes/
│   │   └── api.js           # REST API ルーター
│   └── core/
│       ├── gm_system.js     # GM ロジック（ストリーミング・RAG統合）
│       ├── llm_client.js    # Anthropic SDK ラッパー
│       ├── session_store.js # インメモリ・セッション管理
│       ├── prompt_builder.js# システムプロンプト・導入文生成
│       ├── save_manager.js  # ファイルベース・セーブ/ロード
│       ├── auto_save.js     # 自動セーブ（ターン終了後に非同期実行）
│       ├── memory_store.js  # ChromaDB 接続・メモリ保存/削除
│       └── rag_system.js    # RAG 検索・プロンプト注入
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js           # フロントエンド・メインアプリ
│       └── api.js           # フロントエンド API クライアント
└── data/
    ├── saves/               # 手動セーブデータ（JSON + Markdown）
    └── chroma/              # ChromaDB 永続化データ
```

---

## 責務分離

| ファイル | 責務 |
|---|---|
| `server.js` | Express 起動、ChromaDB プロセス管理、起動シーケンス |
| `src/config.js` | 全設定値の一元管理 |
| `src/routes/api.js` | HTTP ルーティング、リクエスト検証 |
| `src/core/gm_system.js` | GM 応答生成（ストリーミング）、ロールバック、RAG 呼び出し |
| `src/core/llm_client.js` | Anthropic API 呼び出し（`chat` / `chatStream`） |
| `src/core/session_store.js` | セッション CRUD、履歴管理、ロールバック |
| `src/core/prompt_builder.js` | システムプロンプト・導入文・世界設定プロンプト生成 |
| `src/core/save_manager.js` | 手動セーブ/ロード/一覧/削除 |
| `src/core/auto_save.js` | 毎ターン後の自動セーブと起動時の全セッション復元 |
| `src/core/memory_store.js` | ChromaDB 接続初期化、メモリ書き込み・削除 |
| `src/core/rag_system.js` | メモリ抽出（非同期）、類似検索、プロンプト用フォーマット |
| `public/js/app.js` | UI 制御、SSE 受信、ストーリー描画、セッション自動再開 |
| `public/js/api.js` | `fetch` ラッパー、SSE ストリーム消費 |

---

## 設定値（`src/config.js`）

| キー | デフォルト値 | 説明 |
|---|---|---|
| `llm.model` | `'claude-sonnet-4-6'` | 使用モデル（固定値） |
| `llm.maxTokens` | `1024` | 最大トークン数 |
| `llm.temperature` | `0.85` | 生成温度 |
| `llm.maxHistoryTurns` | `30` | 保持する会話ターン数 |
| `chroma.url` | `CHROMA_URL \|\| 'http://localhost:8001'` | ChromaDB 接続 URL |
| `chroma.port` | `8001` | ChromaDB 起動ポート |
| `chroma.dataDir` | `data/chroma` | ChromaDB 永続化ディレクトリ |
| `port` | `PORT \|\| 3000` | サーバーポート |
| `paths.saves` | `data/saves` | 手動セーブ保存先 |

---

## 環境変数

| 変数名 | 必須 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API キー |
| `PORT` | — | サーバーポート（デフォルト: 3000） |
| `CHROMA_URL` | — | ChromaDB URL（デフォルト: `http://localhost:8001`） |
| `DEBUG` | — | ChromaDB の stderr ログを有効化 |

---

## セッション状態スキーマ

```js
{
  id: string,
  createdAt: number,
  active: boolean,
  setupComplete: boolean,

  rules: {
    genre: string,
    customSetting: string,
    diceSystem: 'none' | 'd20' | 'coc' | 'dnd5e',
    statsMode: 'none' | 'hp' | 'hpmp',
    narrativeStyle: 'novel' | 'trpg' | 'balanced',
    actionSuggestions: boolean,
    responseLength: 'short' | 'standard' | 'long',
  },

  world: {
    adventureTheme: string,
    coreConceptGenerated: string,
  },

  player: {
    name: string,
    characterDescription: string,
    hp: number | null,
    hpMax: number | null,
    mp: number | null,       // statsMode === 'hpmp' のときのみ使用
    mpMax: number | null,
  },

  scene: string,   // 直近 GM 応答の先頭 100 文字
  turn: number,
  history: [{ role: 'user' | 'assistant', content: string }],
}
```

---

## API エンドポイント

### セッション管理

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/api/session/new` | 新規セッション作成 |
| `GET` | `/api/session/:id` | セッション取得（なければ自動セーブから復元） |
| `PATCH` | `/api/session/:id` | セッション更新（セットアップ時） |
| `DELETE` | `/api/session/:id` | セッション終了・メモリ削除 |

### ゲーム進行

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/api/game/:id/setup-complete` | セットアップ完了・イントロ生成（SSE） |
| `POST` | `/api/game/:id/action` | プレイヤー行動送信（SSE） |
| `POST` | `/api/game/:id/rollback` | 直前ターンの巻き戻し |
| `POST` | `/api/game/:id/dice` | ダイスロール |

### セーブ管理

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/saves/:id` | セーブ一覧 |
| `POST` | `/api/saves/:id` | 現在のセッションを保存 |
| `POST` | `/api/saves/:id/load` | セーブをロード |
| `DELETE` | `/api/saves/:id/:name` | セーブを削除 |

---

## SSE イベント形式

### `POST /api/game/:id/setup-complete`

```jsonc
{ "type": "status", "text": "世界を構築中…" }   // 世界観生成中（任意）
{ "type": "intro_start" }                        // イントロ生成開始
{ "type": "text", "chunk": "..." }               // テキストチャンク
{ "type": "done" }                               // 完了
{ "type": "error", "message": "..." }            // エラー
```

### `POST /api/game/:id/action`

```jsonc
{ "type": "text", "chunk": "..." }                          // テキストチャンク
{ "type": "done", "turn": 3, "player": { ...playerState } } // 完了（ステータス更新付き）
{ "type": "error", "message": "..." }                       // エラー
```

---

## 実装ルール

### RAG（関連メモリ検索）

- `processActionStream` はプレイヤー行動をクエリとして `retrieveRelevantMemories` を呼び出し、結果を `buildSystemPrompt` に渡す
- `extractAndStoreMemoryAsync` はレスポンスをブロックしないよう非同期で実行する
- ChromaDB が利用不可の場合はインメモリフォールバックで動作する（`initMemoryStore` がハンドリング）

### 自動セーブ

- `autoSave(sessionId)` は各ターン終了後に `gm_system.js` から非同期呼び出しされる
- `loadAllAutoSaves()` はサーバー起動時に実行され、`data/saves` からセッションを復元する
- フロント側では `localStorage.currentSessionId` を保持し、ページリロード時に `GET /api/session/:id` で復元を試みる

### ChromaDB

- `server.js` が起動時に `chroma` CLI でサブプロセスを起動する
- `chroma` CLI が存在しない場合は警告のみでサーバー起動を続行する
- データは `data/chroma/` ディレクトリに永続化される

### HP/MP パース

- GM 応答テキストから `【HP】現在: X / 最大: Y` 形式を正規表現で抽出して自動更新する
- `【MP】現在: X / 最大: Y` の抽出・更新は `statsMode === 'hpmp'` のときのみ実行する

### ストリーミング

- `chatStream` は Anthropic SDK の `stream: true` オプションを使用する
- `content_block_delta` イベントの `text_delta` のみを処理する
- フロント側では `consumeStream`（`api.js`）が `fetch` レスポンスボディを読み取り、SSE をパースする

### 行動選択肢

- `【行動の選択肢】` マーカーをフロント側でパースし、マーカー以降はストーリー本文に表示しない
- ストリーミング中もマーカー検出後はDOMに追記しない（`fullText` には蓄積する）
- 生成完了後に `parseChoices` でボタンとして表示する

---

## セッションフロー

```
[新規]
ランディング画面
  → セットアップウィザード（5ステップ）
  → POST /api/session/new
  → PATCH /api/session/:id（ルール・キャラクター設定）
  → POST /api/game/:id/setup-complete（SSEイントロ生成）
  → sessionId を localStorage に保存
  → ゲーム画面

[ページリロード時の自動再開]
init()
  → localStorage.currentSessionId を確認
  → GET /api/session/:id（サーバーメモリになければ自動セーブから復元）
  → setupComplete && active であればゲーム画面を復元
  → history から story エントリを再構築（rehydrateStoryFromHistory）

[ターン進行]
プレイヤー入力
  → POST /api/game/:id/action（SSEストリーミング）
  → RAG: retrieveRelevantMemories でシステムプロンプトに注入
  → GM 応答をストーリーに追記
  → HP/MP 自動パース
  → extractAndStoreMemoryAsync（非同期）
  → autoSave（非同期）
  → done イベントでステータス更新

[セッション終了]
  → DELETE /api/session/:id（メモリ削除）
  → localStorage.currentSessionId を削除
```

---

## 依存パッケージ

| パッケージ | 用途 |
|---|---|
| `@anthropic-ai/sdk` | Claude API クライアント |
| `chromadb` | ベクトルDB クライアント（RAG） |
| `express` | Web サーバー |
| `dotenv` | 環境変数読み込み |
| `uuid` | セッション ID 生成 |
