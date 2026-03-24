# CLAUDE.md — AI-TRPG Web

このファイルはClaudeがコードを読み書きする際のガイドです。

---

## プロジェクト概要

ブラウザで動作するAI-GMによるシングルプレイヤーTRPGシステム。Claude APIがゲームマスターを担当し、縦書き風の没入感のあるUIでストーリーテリングを実現する。日本語専用。

**エントリーポイント**: `server.ts`（dev）/ `dist/server.js`（prod）
**起動**: `npm run dev` または `./start.sh`

---

## アーキテクチャ原則

### 構成

```
server.ts（Expressアプリ）
  ├── src/types.ts              # 共通型定義（バックエンド・フロントエンド共用）
  ├── src/config.ts             # 設定値
  ├── src/routes/api.ts         # APIエンドポイント定義
  ├── src/system_rules.ts       # システムルール定義データ
  └── src/core/
        ├── session_store.ts   # セッション状態のSSoT（Map）
        ├── llm_client.ts      # Anthropic API通信
        ├── gm_system.ts       # AIGMオーケストレーター
        ├── prompt_builder.ts  # システムプロンプト構築
        ├── save_manager.ts    # セーブ・ロード（ファイルI/O）
        ├── auto_save.ts       # 自動セーブ・起動時セッション復元
        ├── memory_store.ts    # ChromaDBメモリストア管理
        └── rag_system.ts      # RAG（検索拡張生成）・システムルール管理

public/js/（フロントエンド TypeScript・esbuildでバンドル → public/js/dist/app.js）
  ├── app.ts        # エントリーポイント・初期化処理
  ├── api.ts        # fetchラッパー・SSEパーサー
  ├── state.ts      # 共有状態（AppState・SetupData・particlesCtrl）
  ├── screens.ts    # 画面遷移管理
  ├── particles.ts  # パーティクルアニメーション
  ├── reader.ts     # リーダー設定・スクロールヘルパー
  ├── story.ts      # ストーリー表示・ストリーミング・行動選択肢
  ├── session.ts    # セッションライフサイクル（再開・新規開始）
  ├── setup.ts      # セットアップウィザードUIハンドラ
  ├── game.ts       # ゲーム画面UI（入力・ダイス・ロールバック・モーダル）
  └── utils.ts      # DOMヘルパー・Toast・確認ダイアログ
```

### ビルド構成

| 対象 | ソース | 出力 | コマンド |
|------|--------|------|---------|
| バックエンド | `server.ts`, `src/**/*.ts` | `dist/` | `npm run build:backend`（tsc） |
| フロントエンド | `public/js/app.ts` | `public/js/dist/app.js` | `npm run build:frontend`（esbuild） |

- **開発**: `npm run dev`（tsx で直接実行） + `npm run watch:frontend`（esbuildウォッチ）
- **型チェック**: `npm run typecheck`（バックエンド: tsconfig.json、フロントエンド: tsconfig.frontend.json）
- **本番**: `npm run build` → `node dist/server.js`

### 責務分離（各モジュールが「知らないこと」が重要）

| ファイル | 責務 | 知らないこと |
|---------|------|------------|
| `server.ts` | Expressセットアップ・静的ファイル配信・ChromaDB起動・認証ミドルウェア | ゲームロジック |
| `src/routes/api.ts` | HTTPエンドポイント定義・SSEストリーム | ゲームロジック |
| `src/system_rules.ts` | システムルール定義データ | HTTP・LLM |
| `src/core/gm_system.ts` | AIGMオーケストレーター | HTTP・フロントエンド |
| `src/core/prompt_builder.ts` | システムプロンプト構築 | HTTP・LLM通信 |
| `src/core/llm_client.ts` | LLM API通信 | ゲームロジック |
| `src/core/session_store.ts` | セッション状態のSSoT | HTTP・LLM |
| `src/core/save_manager.ts` | セーブ・ロード・ファイルI/O | HTTP |
| `src/core/auto_save.ts` | 自動セーブ・起動時全セッション復元 | HTTP・LLM |
| `src/core/memory_store.ts` | ChromaDBクライアント初期化・メモリCRUD | ゲームロジック |
| `src/core/rag_system.ts` | メモリ抽出・検索・プロンプト整形・システムルール管理 | HTTP |
| `public/js/app.ts` | エントリーポイント・初期化処理 | サーバーロジック |
| `public/js/api.ts` | fetchラッパー・SSEパーサー | UIロジック |
| `public/js/state.ts` | 共有状態（AppState・SetupData・particlesCtrl） | サーバーロジック |
| `public/js/screens.ts` | 画面遷移管理 | サーバーロジック |
| `public/js/particles.ts` | パーティクルアニメーション | ゲームロジック |
| `public/js/reader.ts` | リーダー設定・スクロールヘルパー | サーバーロジック |
| `public/js/story.ts` | ストーリー表示・ストリーミング・行動選択肢 | サーバーロジック |
| `public/js/session.ts` | セッションライフサイクル（再開・新規開始） | サーバーロジック |
| `public/js/setup.ts` | セットアップウィザードUIハンドラ | サーバーロジック |
| `public/js/game.ts` | ゲーム画面UI（入力・ダイス・ロールバック・モーダル・セーブ） | サーバーロジック |
| `public/js/utils.ts` | DOMヘルパー・Toast・確認ダイアログ | サーバーロジック |

### Session Store はSSoT
セッション状態（`Map`）を直接触るコードは必ず `session_store.ts` に集約する。ルーター・GMSystem が直接Mapを書き換えてはならない。

---

## 設定値（`src/config.ts`）

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

パス解決には `process.cwd()`（プロジェクトルート）を使用する。dev（`tsx server.ts`）・prod（`node dist/server.js`）の両方で正しく解決できる。

---

## セッション状態の構造

型は `src/types.ts` の `Session` インターフェースで定義される。

```typescript
// src/types.ts の主要インターフェース（抜粋）
interface Session {
  id: string;              // UUID
  createdAt: number;       // Date.now()
  active: boolean;
  setupComplete: boolean;
  rules: SessionRules;
  world: SessionWorld;     // { adventureTheme, coreConceptGenerated }
  player: PlayerStats;     // { name, characterDescription, hp, hpMax, mp, mpMax }
  scene: string;           // 最後のGM応答
  turn: number;
  history: HistoryEntry[]; // 最大60エントリ（addHistoryで自動トリム）
}
type DiceSystem = 'none' | 'd20' | 'coc' | 'dnd5e';
type StatsMode = 'none' | 'hp' | 'hpmp';
type NarrativeStyle = 'novel' | 'trpg' | 'balanced';
type ResponseLength = 'short' | 'standard' | 'long';
```

---

## APIエンドポイント一覧

| メソッド | パス | 処理 |
|---------|------|------|
| GET | `/login` | ログイン画面（`login.html`） |
| POST | `/api/auth/login` | パスワード検証・`auth_token` cookie 発行 |
| POST | `/api/auth/logout` | `auth_token` cookie 削除 |
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

`llm_client.ts` のモジュールロード時に `ANTHROPIC_API_KEY` の存在を確認し、未設定の場合は即座に `process.exit(1)` する（最初のリクエストまでエラーが遅延するのを防ぐ）。

### ストリーミングはSSEで実装
`res.setHeader('Content-Type', 'text/event-stream')` でSSE接続を確立し、`res.write()` でチャンクを送信する。`chatStream(system, messages, onChunk)` の `onChunk` コールバックでチャンクを受け取る。

### HP/MP の自動パース
GMの応答テキストから `【HP】現在: X / 最大: Y` 形式を正規表現で抽出して `player.hp/hpMax` を更新する（`gm_system.parseAndUpdateStats()` 参照）。`statsMode === "hpmp"` の場合は `【MP】現在: X / 最大: Y` も更新。`statsMode === "none"` の場合は何もしない。

### RAGシステム
`processActionStream()` はプレイヤー行動をもとに `rag_system.retrieveRelevantMemories()` で関連メモリを検索し、システムプロンプトに注入する。GM応答後は `extractAndStoreMemoryAsync()` で非同期にメモリを抽出・格納する（レスポンスをブロックしない）。

加えて、`rag_system.retrieveSystemRules()` で `src/system_rules.ts` に定義された永続ルールを取得し、`formatSystemRulesForPrompt()` でプロンプト文字列に整形して各アクション・イントロ生成時に注入する。`server.ts` 起動時に `initFormattingRules()` を呼び出して初期化する。

### 自動セーブ
`processActionStream()` と `generateIntroStream()` の完了後、`auto_save.autoSave()` を非同期で呼び出す。起動時は `loadAllAutoSaves()` で `data/saves/` 配下の自動セーブを全セッション分メモリに復元する。復元対象はUUID v4形式のディレクトリ名のみとし、手動作成ディレクトリ等の誤復元を防ぐ。

### ChromaDB
`server.ts` 起動時に `chroma` CLIが検出できればローカルプロセスとしてChromaDBサーバーを起動する。未検出の場合はインメモリフォールバックで動作する。`memory_store.initMemoryStore(url)` で接続初期化する。その後 `rag_system.initFormattingRules()` でシステムルールを読み込む。

### セーブ形式
`data/saves/{sessionId}/{saveName}.json` + `{saveName}_summary.md` の2ファイル形式。JSONにはセッション全状態を保存し、MDは人間向けサマリー。`autosave.json` はユーザー向けセーブ一覧（`listSaves()`）から除外される。

### プロンプトの文字数制限
GMの応答は `responseLength` 設定に応じて動的に変わる（`prompt_builder.buildSystemPrompt()` 内で注入）。

| 設定値 | 文字数制限 |
|--------|----------|
| `short` | 100〜200文字 |
| `standard`（デフォルト） | 200〜400文字 |
| `long` | 400〜700文字 |

### セキュリティ

#### XSS防止（フロントエンド）
`utils.ts` の `escapeHtml()` 関数でユーザー入力由来の文字列をサニタイズしてからHTMLに挿入する。特に `game.ts` の `renderStatus()`・`refreshSavesList()` 内のキャラクター名・ジャンル・セーブ名はすべてエスケープ必須。`innerHTML` への動的文字列埋め込みは禁止し、代わりに `textContent` への代入またはDOM構築を使う（`showDicePopup()` 参照）。

#### APIエラーハンドリング（フロントエンド）
`api.ts` の `checkResponse()` がHTTPエラー（`res.ok === false`）を検出し `Error` をスローする。すべての `fetch` ラッパーはこれを経由するため、呼び出し元は `try/catch` でエラーを処理する。サーバーが返す `{ error: '...' }` のメッセージが `err.message` として伝播する。

#### 入力バリデーション（サーバー）
`src/routes/api.ts` の全エンドポイントで以下を検証する：
- **セッションID**: UUID v4形式（`isValidSessionId()`）のみ受け付け、不正値は 400 を返す。
- **セーブ名**: `sanitizeSaveName()` で英数字・アンダースコア・ハイフン・日本語文字のみ許可（最大40文字）。
- **PATCHの列挙値**: `diceSystem`・`statsMode`・`narrativeStyle`・`responseLength` は `ALLOWED` セットに含まれる値のみ受け付け、`id`・`active`・`setupComplete` 等のコアフィールドの上書きを防ぐ。
- **アクション長**: 1000文字超は 400 を返す（コスト爆発・メモリ圧迫防止）。

#### パストラバーサル防止（サーバー）
`save_manager.ts` の全ファイルI/O関数で `path.basename(sessionId)` および `path.basename(saveName)` を使いディレクトリ成分を除去する（多重防御）。

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

### パスワード認証（オプション）
`SESSION_SECRET` 環境変数が設定されている場合のみ認証を有効化（`AUTH_REQUIRED = true`）。未設定時は認証なしで全リクエストを通過させる。

**認証フロー**
1. 未認証リクエストは `/login` にリダイレクト（APIパスは 401 を返す）
2. `POST /api/auth/login` でパスワードを検証し、一致すれば `auth_token` cookie（HttpOnly・SameSite=Strict）を発行
3. 以後のリクエストは `requireAuth` ミドルウェアが cookie を検証して通過させる
4. `POST /api/auth/logout` で cookie を削除（Max-Age=0）

**ポイント**
- `AUTH_TOKEN` は起動ごとに `crypto.randomBytes(32)` でランダム生成（再起動でセッション無効化）
- ログイン画面（`public/login.html`）・CSS・JS は認証不要で配信（SPA が動かないと認証 UI も壊れるため）
- `AUTH_REQUIRED` フラグを `window.AUTH_REQUIRED` として `index.html` に埋め込み、フロントエンドでログアウトボタン表示を制御する

### 静的ファイルのキャッシュバスティング
`server.ts` 起動時に `BUILD_TS = Date.now()` を生成する。`index.html` は起動時に一度だけ読み込んでキャッシュし（`INDEX_HTML_CACHED`）、`/css/` および `/js/` の URL への `?v=BUILD_TS` 注入と `AUTH_REQUIRED` フラグの埋め込みを事前計算する。SPAフォールバック（`app.get('*')`）はこのキャッシュ済み文字列を返す（リクエストごとの同期I/Oを排除）。`express.static` は `index: false` で `index.html` の自動配信を無効化し、必ず SPA フォールバック経由で提供する。Cloudflare 等 CDN のエッジキャッシュバイパスのため、全静的ファイルに `Cache-Control: no-cache` を設定する。

パス解決は `process.cwd()`（プロジェクトルート）を使用する（`__dirname` / `fileURLToPath` は不使用）。

### リーダー設定パネル（フロントエンド）
`readerSettings` は IIFE で `localStorage` から読み込み、不正値はデフォルトにフォールバックする。保持するキーは `fontSizeIdx`・`writingMode`・`fontFamily`・`liteMode`（軽量モード）の4種。`initReaderPanel()` が全ボタンのイベントリスナーを登録し `init()` から呼ぶ。状態変更は `syncReaderUI()` で全トグルボタンの `.active` クラスと CSS 変数を一括同期する（エフェクトボタン `#btn-effect-full`・`#btn-effect-lite` も含む）。`toggleReaderPanel(forceClose)` でパネルの開閉を制御する。

軽量モード（`liteMode`）切り替え時はパーティクルアニメーションも連動して停止・再開する。`applyReaderSettings()` が CSS カスタムプロパティ・クラス・パーティクル制御をまとめて行う。軽量モードは `html` 要素への `.lite-mode` クラス付与で全体のエフェクトを制御し、ページ読み込み直後に `<script>` タグ（`app.js` より前）で即時適用してチカつきを防ぐ。

### パーティクルコントローラー
`initParticles()` は `{ stop, restart, destroy }` を持つコントローラーオブジェクトを返す。`init()` でこれを `setParticlesCtrl()` 経由で `state.ts` の `particlesCtrl` に格納し、`showScreen()` および `applyReaderSettings()` から参照する。`destroy()` はアニメーションを停止しリサイズリスナーも解除する（メモリリーク防止）。背景グラジェントは CSS の `radial-gradient` に移管済みのため、canvas は描画クリアのみ行う。パーティクルの色は初期化時に文字列で事前計算し毎フレームのテンプレートリテラル生成を回避する。リサイズイベントは150msのデバウンスを挟む。

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
- TypeScript + ESモジュール（`import/export`）を使用（`"type": "module"` in package.json）
- importパスは `.js` 拡張子を明記する（Node ESMの要件。`.ts`ファイルでも`.js`を使う）
- 非同期処理は `async/await` を徹底する
- フロントエンドのAPIコールは `public/js/api.ts` 経由で行う
- 共通型は `src/types.ts` に定義し、バックエンド・フロントエンド双方で `import type` する

---

## 環境変数（`.env`）

```env
ANTHROPIC_API_KEY=sk-ant-...   # 必須
PORT=3000                       # サーバーポート（デフォルト: 3000）
CHROMA_URL=http://localhost:8001 # ChromaDB URL（省略時はデフォルト値）
SESSION_SECRET=your-secret      # 設定するとパスワード認証が有効になる（未設定時は認証なし）
```

---

## よく使うコマンド

```bash
# 本番ビルド → 起動
npm run build
node dist/server.js

# 開発（ホットリロード）
npm run dev

# PM2で管理する場合
./start.sh          # ビルド → 起動
./start.sh stop     # 停止
./start.sh status   # 状態確認
./start.sh logs     # ログ表示
./start.sh restart  # ビルド → 再起動

# 依存インストール
npm install
```
