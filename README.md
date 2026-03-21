```markdown
# AI-TRPG Web

縦書き小説風表示の Web ベース AI TRPG。Claude API を GM エンジンとして使用し、プレイヤーの行動に対してリッチな物語を生成します。

---

## 特徴

- **縦書き小説風 UI** — 和風フォント・縦書きレイアウトで没入感のある読書体験（横書きモードにも切り替え可）
- **Claude API による GM** — Anthropic SDK でストリーミング生成、リアルタイムに物語が流れる
- **RAG メモリシステム** — ChromaDB でセッション記憶を蓄積し、関連する過去の出来事をシステムプロンプトに自動注入
- **自動セーブ & 自動再開** — ターン終了後に自動保存、ページリロード後もセッションを透過的に復元
- **リーダー設定パネル** — フォントサイズ・書字方向（縦／横）・書体（明朝／ゴシック）をゲーム中に変更可能
- **行動選択肢 UI** — GM 応答末尾の `【行動の選択肢】` をパースしてボタン表示、クリックで入力欄へ反映
- **セットアップウィザード** — ジャンル・スタイル・ルール・キャラクターを 5 ステップで設定
- **ダイスロール** — d20 / d100（CoC）/ 3d6（D&D 5e）/ カスタム対応
- **HP/MP 自動パース** — GM 応答から `【HP】現在: X / 最大: Y` を抽出してリアルタイム更新
- **手動セーブ/ロード** — 任意のタイミングで保存・ロード・削除
- **ロールバック** — 直前ターンを巻き戻してやり直し

---

## 必要環境

- Node.js 18+
- npm
- Anthropic API キー
- `chroma` CLI（任意 — 未インストールでもインメモリモードで動作）

---

## ディレクトリ構成

```
.
├── server.js                # エントリポイント（Express + ChromaDB 起動）
├── src/
│   ├── config.js            # 設定値の一元管理（LLM・ChromaDB・パス）
│   ├── routes/
│   │   └── api.js           # REST API ルーター
│   └── core/
│       ├── gm_system.js     # GM ロジック（ストリーミング・RAG 統合）
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

## セットアップ

```bash
# 依存関係をインストール
npm install

# 環境変数を設定
cp .env.example .env
# .env を編集して ANTHROPIC_API_KEY を設定
```

### `.env` の例

```env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

---

## 起動

```bash
# 本番起動
npm start

# 開発（ファイル変更で自動再起動）
npm run dev
```

起動後、ブラウザで `http://localhost:3000` を開く。

---

## 環境変数

| 変数名 | 必須 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API キー |
| `PORT` | — | サーバーポート（デフォルト: `3000`） |
| `CHROMA_URL` | — | ChromaDB URL（デフォルト: `http://localhost:8001`） |
| `DEBUG` | — | ChromaDB の stderr ログを有効化 |

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

## ChromaDB（RAG メモリ）

`chroma` CLI がインストールされている場合、起動時に自動でサブプロセスを起動します。インストールされていない場合はインメモリモードで動作します（セッションをまたいだ記憶は保持されません）。

```bash
# ChromaDB CLI のインストール（任意）
pip install chromadb
```

---

## ライセンス

MIT
```
