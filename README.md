# AI-TRPG Web

ブラウザで動作するAI-GMによるシングルプレイヤーTRPGシステム。
Claude APIがゲームマスターを担当し、縦書き風の没入感のあるUIでストーリーテリングを実現する。

---

## 特徴

- **AIゲームマスター** — Claude APIがリアルタイムでストーリーを紡ぐ
- **ストリーミング表示** — GM応答をリアルタイムに逐次表示（SSE）
- **5ステップセットアップ** — ジャンル・スタイル・ルール・キャラクター・テーマを設定
- **ダイスシステム対応** — d20 / CoC（d100）/ D&D 5e（3d6）/ カスタム
- **HP/MP自動追跡** — GMの応答テキストからステータスを自動パース
- **所持品システム** — GMの応答から「アイテム取得」「アイテム消失」を自動パースしてステータスパネルに表示
- **冒険の記録ダッシュボード** — 過去のセッションを一覧表示し、続きから再開・完全削除が可能
- **ブラウザフィンガープリント** — クライアントIDでセッション所有者を識別し、他ユーザーのセッションが混在しない
- **RAGシステム** — ChromaDBによる記憶検索でGMが文脈を長期保持
- **行動選択肢** — GM応答末尾に選択肢ボタンを自動表示
- **セーブ/ロード** — セッションをファイルに保存して後から再開
- **自動セーブ・自動再開** — ページリロード時に前回のセッションを自動復元
- **ロールバック** — 直前のターンをやり直し
- **リーダー設定** — 文字サイズ・縦横書き・フォント種別・軽量モードを調整可能
- **軽量モード** — スマホ・低スペック端末向けにアニメーション・エフェクトを一括軽減
- **モバイル対応** — iOSセーフエリア・タッチターゲット最適化済み
- **美麗ダークテーマ** — 長時間プレイに最適化された縦書き風UI

---

## 必要環境

- Node.js 18以上
- Anthropic APIキー
- ChromaDB（オプション。未検出時はインメモリフォールバックで動作）

---

## セットアップ

```bash
# 依存パッケージのインストール
npm install

# 環境変数の設定
cp .env.example .env
# .env を編集して ANTHROPIC_API_KEY を設定

# 本番ビルド → 起動
npm run build
node dist/server.js

# または起動スクリプト経由（ビルド込み）
./start.sh

# 開発サーバー（ホットリロード）
npm run dev
# フロントエンドのウォッチビルドは別ターミナルで
npm run watch:frontend
```

ブラウザで `http://localhost:3000` を開く。

> **注意**: `ANTHROPIC_API_KEY` が未設定の場合、サーバーは起動時に即座に終了します。

---

## 起動スクリプト（PM2管理）

```bash
./start.sh          # ビルド → 起動
./start.sh stop     # 停止
./start.sh restart  # ビルド → 再起動
./start.sh status   # 状態確認
./start.sh logs     # ログ表示
./start.sh delete   # PM2からプロセスを削除
```

---

## ディレクトリ構成

```
ai-trpg-web/
├── server.ts              # Expressアプリ エントリーポイント
├── tsconfig.json          # バックエンド TypeScript 設定
├── tsconfig.frontend.json # フロントエンド TypeScript 設定
├── src/
│   ├── types.ts           # 共通型定義（バックエンド・フロントエンド共用）
│   ├── config.ts          # LLM・サーバー・ChromaDB設定
│   ├── system_rules.ts    # 永続システムルール定義データ
│   ├── routes/
│   │   └── api.ts         # APIエンドポイント
│   └── core/
│       ├── session_store.ts   # セッション状態管理（SSoT）
│       ├── llm_client.ts      # Anthropic APIクライアント
│       ├── gm_system.ts       # AIGMオーケストレーター
│       ├── prompt_builder.ts  # プロンプト生成
│       ├── save_manager.ts    # セーブ/ロード・セッション一覧
│       ├── auto_save.ts       # 自動セーブ・起動時セッション復元
│       ├── memory_store.ts    # ChromaDBクライアント
│       └── rag_system.ts      # RAG（検索拡張生成）
├── public/
│   ├── index.html         # SPA HTML
│   ├── js/
│   │   ├── app.ts             # エントリーポイント・初期化処理
│   │   ├── api.ts             # APIクライアント・ブラウザフィンガープリント
│   │   ├── state.ts           # 共有状態
│   │   ├── screens.ts         # 画面遷移管理
│   │   ├── particles.ts       # パーティクルアニメーション
│   │   ├── reader.ts          # リーダー設定・スクロールヘルパー
│   │   ├── story.ts           # ストーリー表示・ストリーミング
│   │   ├── session.ts         # セッションライフサイクル
│   │   ├── sessions-screen.ts # 冒険の記録ダッシュボード
│   │   ├── setup.ts           # セットアップウィザードUI
│   │   ├── game.ts            # ゲーム画面UI
│   │   ├── utils.ts           # DOMヘルパー・Toast・確認ダイアログ
│   │   └── dist/              # esbuildバンドル出力（.gitignore対象）
│   └── css/
│       └── style.css      # ダークテーマ
├── dist/                  # バックエンドビルド出力（.gitignore対象）
├── data/
│   ├── chroma/            # ChromaDB永続化データ（.gitignore対象）
│   └── saves/             # セーブファイル（.gitignore対象）
├── .env.example           # 環境変数テンプレート
└── package.json
```

---

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic APIキー（未設定時は起動時に終了） |
| `PORT` | — | サーバーポート（デフォルト: 3000） |
| `CHROMA_URL` | — | ChromaDB URL（デフォルト: `http://localhost:8001`） |
| `SESSION_SECRET` | — | 設定するとパスワード認証が有効になる（未設定時は認証なし） |

---

## 関連プロジェクト

- [ai-trpg-py](../ai-trpg-py) — Discord Botとして動作するマルチプレイヤー版
