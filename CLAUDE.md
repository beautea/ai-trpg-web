# CLAUDE.md — AI-TRPG Web

このファイルはClaudeがコードを読み書きする際のガイドです。

---

## プロジェクト概要

ブラウザで動作するAI-GMによるシングルプレイヤーTRPGシステム。Claude APIがゲームマスターを担当し、縦書き風の没入感のあるUIでストーリーテリングを実現する。日本語専用。

**エントリーポイント**: `server.js`
**起動**: `node server.js` または `./start.sh`

---

## アーキテクチャ原則

### 構成

```
server.js（Expressアプリ）
  ├── src/routes/api.js         # APIエンドポイント定義
  ├── src/system_rules.js       # システムルール定義データ
  └── src/core/
        ├── session_store.js   # セッション状態のSSoT（Map）
        ├── llm_client.js      # Anthropic API通信
        ├── gm_system.js       # AIGMオーケストレーター
        ├── prompt_builder.js  # システムプロンプト構築
        ├── save_manager.js    # セーブ・ロード（ファイルI/O）
        ├── auto_save.js       # 自動セーブ・起動時セッション復元
        ├── memory_store.js    # ChromaDBメモリストア管理
        └── rag_system.js      # RAG（検索拡張生成）・システムルール管理
```

フロントエンドは `public/` 配下のVanilla JS（SPA）。

### 責務分離（各モジュールが「知らないこと」が重要）

| ファイル | 責務 | 知らないこと |
|---------|------|------------|
| `server.js` | Expressセットアップ・静的ファイル配信・ChromaDB起動 | ゲームロジック |
| `src/routes/api.js` | HTTPエンドポイント定義・SSEストリーム | ゲームロジック |
| `src/system_rules.js` | システムルール定義データ | HTTP・LLM |
| `src/core/gm_system.js` | AIGMオーケストレーター | HTTP・フロントエンド |
| `src/core/prompt_builder.js` | システムプロンプト構築 | HTTP・LLM通信 |
| `src/core/llm_client.js` | LLM API通信 | ゲームロジック |
| `src/core/session_store.js` | セッション状態のSSoT | HTTP・LLM |
| `src/core/save_manager.js` | セーブ・ロード・ファイルI/O | HTTP |
| `src/core/auto_save.js` | 自動セーブ・起動時全セッション復元 | HTTP・LLM |
| `src/core/memory_store.js` | ChromaDBクライアント初期化・メモリCRUD | ゲームロジック |
| `src/core/rag_system.js` | メモリ抽出・検索・プロンプト整形・システムルール管理 | HTTP |
| `public/js/app.js` | UIステート管理・イベントハンドラ | サーバーロジック |
| `public/js/api.js` | fetchラッパー・SSEパーサー | UIロジック |

### Session Store はSSoT
セッション状態（`Map`）を直接触るコードは必ず `session_store.js` に集約する。ルーター・GMSystem が直接Mapを書き換えてはならない。

---

## 設定値（`src/config.js`）

| 定数 | 値 | 変更時の注意 |
|------|-----|------------|
| `llm.model` | `claude-sonnet-4-6` | モデル変更時は出力品質を必ず確認 |
| `llm.maxTokens` | `1024` | 増やすと応答が冗長になる可能性あり |
| `llm.temperature` | `0.85` | 創作用途のため高め。下げると単調になる |
| `llm.maxHistoryTurns` | `30` | 履歴は最大60エントリ（30往復）。増やすとトークンコスト増大 |
| `chroma.url` | `process.env.CHROMA_URL \|\| 'http://localhost:8001'` | |
| `chroma.port` | `8001` | |
| `chroma.dataDir` | `data/chroma` | ChromaDB永続化ディレクトリ |
| `port` | `process.env.PORT \|\| 3000` | |

データパス定数：
`config.paths.saves`（`data/saves/`）, `config.paths.public`（`public/`）

---

## セッション状態の構造

```javascript
{
  id: string,              // UUID
  createdAt: Date,
  active: boolean,
  setupComplete: boolean,

  rules: {
    genre: string,
    customSetting: string,
    diceSystem: string,    // "none" | "d20" | "coc" | "dnd5e"
    statsMode: string,     // "none" | "hp" | "hpmp"
    narrativeStyle: string, // "novel" | "trpg" | "balanced"
    actionSuggestions: boolean,
    responseLength: string, // "short" | "standard" | "long"
  },

  world: {
    adventureTheme: string,
    coreConceptGenerated: string,  // LLMで自動生成された世界観
  },

  player: {
    name: string,
    characterDescription: string,
    hp: number,
    hpMax: number,
    mp: number,
    mpMax: number,
  },

  scene: string,    // 最後のGM応答
  turn: number,
  history: [{ role: "user" | "assistant", content: string }, ...],
              // 最大60エントリ（addHistoryで自動トリム）
}
```

---

## APIエンドポイント一覧

| メソッド | パス | 処理 |
|---------|------|------|
| POST | `/api/session/new` | セッション新規作成（UUID発行） |
| GET | `/api/session/:id` | セッション状態取得（なければ自動セーブから復元） |
| PATCH | `/api/session/:id` | セッション更新（セットアップ設定） |
| DELETE | `/api/session/:id` | セッション終了・メモリ削除 |
| POST | `/api/game/:id/setup-complete` | イントロシーン生成（SSEストリーム） |
| POST | `/api/game/:id/action` | プレイヤー行動 → GM応答（SSEストリーム） |
| POST | `/api/game/:id/rollback` | 直前ターンを取り消し |
| POST | `/api/game/:id/dice` | ダイスロール |
| GET | `/api/saves/:id` | セーブ一覧取得 |
| POST | `/api/saves/:id` | セーブ |
| POST | `/api/saves/:id/load` | ロード |
| DELETE | `/api/saves/:id/:name` | セーブ削除 |

### SSEイベント形式
`setup-complete` と `action` エンドポイントはServer-Sent Eventsでストリーミング。

```javascript
{ type: 'text',        chunk: string }              // テキストチャンク
{ type: 'done',        turn?: number, player?: {...} } // 完了（actionのみturn/playerを含む）
{ type: 'error',       message: string }             // エラー
{ type: 'status',      text: string }                // ステータスメッセージ
{ type: 'intro_start' }                              // イントロ開始通知（setup-completeのみ）
```

---

## 重要な実装ルール

### LLMClient はエラーを投げない
`llm_client.chat()` / `chatStream()` はすべての例外を捕捉し、`⚠️` 始まりの文字列として返す。呼び出し側でエラー判定が必要な場合は返り値の先頭文字で判断する。

### ストリーミングはSSEで実装
`res.setHeader('Content-Type', 'text/event-stream')` でSSE接続を確立し、`res.write()` でチャンクを送信する。`chatStream(system, messages, onChunk)` の `onChunk` コールバックでチャンクを受け取る。

### HP/MP の自動パース
GMの応答テキストから `【HP】現在: X / 最大: Y` 形式を正規表現で抽出して `player.hp/hpMax` を更新する（`gm_system.parseAndUpdateStats()` 参照）。`statsMode === "hpmp"` の場合は `【MP】現在: X / 最大: Y` も更新。`statsMode === "none"` の場合は何もしない。

### RAGシステム
`processActionStream()` はプレイヤー行動をもとに `rag_system.retrieveRelevantMemories()` で関連メモリを検索し、システムプロンプトに注入する。GM応答後は `extractAndStoreMemoryAsync()` で非同期にメモリを抽出・格納する（レスポンスをブロックしない）。

加えて、`rag_system.retrieveSystemRules()` で `src/system_rules.js` に定義された永続ルールを取得し、`formatSystemRulesForPrompt()` でプロンプト文字列に整形して各アクション・イントロ生成時に注入する。`server.js` 起動時に `initFormattingRules()` を呼び出して初期化する。

### 自動セーブ
`processActionStream()` と `generateIntroStream()` の完了後、`auto_save.autoSave()` を非同期で呼び出す。起動時は `loadAllAutoSaves()` で `data/saves/` 配下の自動セーブを全セッション分メモリに復元する。

### ChromaDB
`server.js` 起動時に `chroma` CLIが検出できればローカルプロセスとしてChromaDBサーバーを起動する。未検出の場合はインメモリフォールバックで動作する。`memory_store.initMemoryStore(url)` で接続初期化する。その後 `rag_system.initFormattingRules()` でシステムルールを読み込む。

### セーブ形式
`data/saves/{sessionId}/{saveName}.json` + `{saveName}_summary.md` の2ファイル形式。JSONにはセッション全状態を保存し、MDは人間向けサマリー。

### プロンプトの文字数制限
GMの応答は `responseLength` 設定に応じて動的に変わる（`prompt_builder.buildSystemPrompt()` 内で注入）。

| 設定値 | 文字数制限 |
|--------|----------|
| `short` | 100〜200文字 |
| `standard`（デフォルト） | 200〜400文字 |
| `long` | 400〜700文字 |

### フロントエンドの画面遷移
5つの画面（div）をCSSのopacityとdisplayで切り替える。`showScreen(name)` 経由で遷移し、直接CSSを操作しない。`showScreen()` はランディング画面への遷移時に `particlesCtrl?.restart()`、それ以外の画面への遷移時に `particlesCtrl?.stop()` を呼び出してパーティクルを制御する。

### セットアップウィザードのステップ
ステップ0〜4でルール・キャラクターを設定し、ステップ5でゲーム画面へ遷移する。各ステップの状態は `state.setupStep` で管理する。

### 自動再開（フロントエンド）
ページリロード時、`localStorage` の `currentSessionId` をもとに `tryResumeSession()` でセッションを復元する。セッション終了時は `localStorage.removeItem('currentSessionId')` でクリアする。

### 行動選択肢
GM応答に `【行動の選択肢】` マーカーがある場合、`parseChoices()` で本文と選択肢を分離し、選択肢をボタンとして表示する。ストリーミング中は選択肢セクションをDOMに出力せず、生成完了後に反映する。`parseChoices()` は丸数字形式（①②③）を優先し、次点で数字形式（1. 2. 3.）に対応する。

### 確認ダイアログ（`showConfirm()`）
ネイティブの `window.confirm()` は使用しない。代わりに `showConfirm(message, options)` を使う。`Promise<boolean>` を返すスタイル付きモーダルで、`ok`（ボタンラベル）・`cancel`（キャンセルラベル）・`danger`（`true` で赤ボタン）オプションを受け取る。ロールバック・セーブ削除・ロード・セッション終了の各操作で使用する。HTML 側の対応要素は `#modal-confirm`・`#confirm-message`・`#btn-confirm-ok`・`#btn-confirm-cancel`。

### 静的ファイルのキャッシュバスティング
`server.js` 起動時に `BUILD_TS = Date.now()` を生成する。SPA フォールバックで `index.html` を動的に読み込み、`/css/` および `/js/` の URL に `?v=BUILD_TS` を注入して返す。`express.static` は `index: false` で `index.html` の自動配信を無効化し、必ず SPA フォールバック経由で提供する。Cloudflare 等 CDN のエッジキャッシュバイパスのため、全静的ファイルに `Cache-Control: no-cache` を設定する。

### リーダー設定パネル（フロントエンド）
`readerSettings` は IIFE で `localStorage` から読み込み、不正値はデフォルトにフォールバックする。保持するキーは `fontSizeIdx`・`writingMode`・`fontFamily`・`liteMode`（軽量モード）の4種。`initReaderPanel()` が全ボタンのイベントリスナーを登録し `init()` から呼ぶ。状態変更は `syncReaderUI()` で全トグルボタンの `.active` クラスと CSS 変数を一括同期する（エフェクトボタン `#btn-effect-full`・`#btn-effect-lite` も含む）。`toggleReaderPanel(forceClose)` でパネルの開閉を制御する。

軽量モード（`liteMode`）切り替え時はパーティクルアニメーションも連動して停止・再開する。`applyReaderSettings()` が CSS カスタムプロパティ・クラス・パーティクル制御をまとめて行う。軽量モードは `html` 要素への `.lite-mode` クラス付与で全体のエフェクトを制御し、ページ読み込み直後に `<script>` タグ（`app.js` より前）で即時適用してチカつきを防ぐ。

### パーティクルコントローラー
`initParticles()` は `{ stop, restart }` を持つコントローラーオブジェクトを返す。`init()` でこれを `particlesCtrl` に格納し、`showScreen()` および `applyReaderSettings()` から呼び出す。背景グラジェントは CSS の `radial-gradient` に移管済みのため、canvas は描画クリアのみ行う。パーティクルの色は初期化時に文字列で事前計算し毎フレームのテンプレートリテラル生成を回避する。リサイズイベントは150msのデバウンスを挟む。

### ストーリー表示の書字方向とスクロール
`writing-mode: vertical-rl` は `.story-entry` 要素に設定し、フレックスコンテナ `.story-inner` には設定しない（コンテナに設定するとフレックスの主軸が縦方向に変わり上方向スクロールになるため）。
- **縦書き**: `overflow-x: auto`、`.story-inner` は `flex-direction: row`（最新エントリが左端・古いエントリが右端）、エントリは `prepend`、`scrollToNewest()` は `scrollLeft = 0`（左端の最新エントリを表示）
- **横書き**: `overflow-y: auto`、エントリは `append`（最新エントリが下端）、`scrollToNewest()` は `scrollTop = scrollHeight`（下端の最新エントリを表示）

`scrollToNewest()` は `requestAnimationFrame` 内で実行し、`_scrollPending` フラグで連続呼び出しを抑制する。

書字方向によってDOM操作の方向が変わる箇所：
- `addStoryEntry()`: 縦書きは `prepend`、横書きは `append`
- `rehydrateStoryFromHistory()`: 縦書きは逆順でappend（最新が先頭）、横書きは時系列順でappend（最新が末尾）。行動選択肢の表示判定インデックスも書字方向に応じて変わる（縦書き: `i === 0`、横書き: `i === arr.length - 1`）
- ロールバック: 縦書きは `firstChild`（先頭=最新）を削除、横書きは `lastChild`（末尾=最新）を削除

### ストリーミングカーソルのクリーンアップ
`streamToStory()` は `doneReceived` フラグと `try/finally` を使い、サーバーから `done`/`error` イベントが来ない異常終了時もカーソル要素を確実に除去する。

---

## セッションフロー

```
ランディング画面
    ↓ [冒険を始める]
セットアップ画面（5ステップ）
    ステップ0: ジャンル選択（6種 + カスタム）
    ステップ1: 語りスタイル（novel / trpg / balanced）
    ステップ2: ルール（ダイス・能力値・文章量・行動提案）
    ステップ3: キャラクター作成（名前 + 説明）
    ステップ4: 冒険テーマ（プリセット6種 + カスタム）
    ↓ [物語を始める]
ローディング画面
    → POST /api/session/new            → UUID発行
    → PATCH /api/session/:id           → ルール・ワールド・プレイヤー設定
    → POST /api/game/:id/setup-complete → イントロシーン生成（SSEストリーム）
        ├─ カスタムテーマの場合: generateWorldConcept()
        └─ イントロシーンをストリーミング表示
ゲーム画面（ターンループ）
    プレイヤーテキスト入力
    → POST /api/game/:id/action → GM応答（SSEストリーム）
    → HP/MPパース → RAGメモリ抽出 → 自動セーブ → セッション更新

サイドアクション:
    • ダイス: POST /api/game/:id/dice
    • ロールバック: POST /api/game/:id/rollback
    • セーブ: POST /api/saves/:id
    • ロード: POST /api/saves/:id/load
    • 終了: DELETE /api/session/:id
```

---

## データディレクトリ構成

```
data/
├── chroma/                      # ChromaDB永続化データ
└── saves/{sessionId}/
    ├── {saveName}.json          # セッション全状態（機械読み取り）
    └── {saveName}_summary.md    # 人間向けサマリー
```

---

## コーディング規約

- コメント・docstringは**日本語**
- 各モジュールの先頭に責務を明記するコメントを書く
- ESモジュール（`import/export`）を使用（`"type": "module"` in package.json）
- 非同期処理は `async/await` を徹底する
- フロントエンドのAPIコールは `public/js/api.js` 経由で行う

---

## 環境変数（`.env`）

```env
ANTHROPIC_API_KEY=sk-ant-...   # 必須
PORT=3000                       # サーバーポート（デフォルト: 3000）
CHROMA_URL=http://localhost:8001 # ChromaDB URL（省略時はデフォルト値）
SESSION_SECRET=your-secret      # 将来の拡張用（現在未使用）
```

---

## よく使うコマンド

```bash
# 起動
node server.js

# 開発（ホットリロード）
npm run dev

# PM2で管理する場合
./start.sh          # 起動
./start.sh stop     # 停止
./start.sh status   # 状態確認
./start.sh logs     # ログ表示

# 依存インストール
npm install
```
