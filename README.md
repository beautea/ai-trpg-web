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

# 起動
node server.js
# または
./start.sh
```

ブラウザで `http://localhost:3000` を開く。

> **注意**: `ANTHROPIC_API_KEY` が未設定の場合、サーバーは起動時に即座に終了します。

---

## 起動スクリプト（PM2管理）

```bash
./start.sh          # 起動
./start.sh stop     # 停止
./start.sh restart  # 再起動
./start.sh status   # 状態確認
./start.sh logs     # ログ表示
./start.sh delete   # PM2からプロセスを削除
```

---

## ディレクトリ構成

```
ai-trpg-web/
├── server.js              # Expressアプリ エントリーポイント
├── src/
│   ├── config.js          # LLM・サーバー・ChromaDB設定
│   ├── system_rules.js    # 永続システムルール定義データ
│   ├── routes/
│   │   └── api.js         # APIエンドポイント
│   └── core/
│       ├── session_store.js   # セッション状態管理（SSoT）
│       ├── llm_client.js      # Anthropic APIクライアント
│       ├── gm_system.js       # AIGMオーケストレーター
│       ├── prompt_builder.js  # プロンプト生成
│       ├── save_manager.js    # セーブ/ロード
│       ├── auto_save.js       # 自動セーブ・起動時セッション復元
│       ├── memory_store.js    # ChromaDBクライアント
│       └── rag_system.js      # RAG（検索拡張生成）
├── public/
│   ├── index.html         # SPA HTML
│   ├── js/
│   │   ├── app.js         # UIロジック
│   │   └── api.js         # APIクライアント
│   └── css/
│       └── style.css      # ダークテーマ
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
| `SESSION_SECRET` | — | 将来の拡張用（現在未使用） |

---

## 関連プロジェクト

- [ai-trpg-py](../ai-trpg-py) — Discord Botとして動作するマルチプレイヤー版
