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
- **セーブ/ロード** — セッションをファイルに保存して後から再開
- **ロールバック** — 直前のターンをやり直し
- **美麗ダークテーマ** — 長時間プレイに最適化された縦書き風UI

---

## 必要環境

- Node.js 18以上
- Anthropic APIキー

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
│   ├── config.js          # LLM・サーバー設定
│   ├── routes/
│   │   └── api.js         # APIエンドポイント
│   └── core/
│       ├── session_store.js   # セッション状態管理
│       ├── llm_client.js      # Anthropic APIクライアント
│       ├── gm_system.js       # AIGMオーケストレーター
│       ├── prompt_builder.js  # プロンプト生成
│       └── save_manager.js    # セーブ/ロード
├── public/
│   ├── index.html         # SPA HTML
│   ├── js/
│   │   ├── app.js         # UIロジック
│   │   └── api.js         # APIクライアント
│   └── css/
│       └── style.css      # ダークテーマ
├── data/
│   └── saves/             # セーブファイル（.gitignore対象）
├── .env.example           # 環境変数テンプレート
└── package.json
```

---

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic APIキー |
| `PORT` | — | サーバーポート（デフォルト: 3000） |
| `SESSION_SECRET` | — | 将来の拡張用（現在未使用） |

---

## 関連プロジェクト

- [ai-trpg-py](../ai-trpg-py) — Discord Botとして動作するマルチプレイヤー版
