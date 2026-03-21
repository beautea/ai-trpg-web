ファイルへの書き込み許可が必要です。許可いただければ更新を実行します。

変更内容の概要：

1. **特徴セクション** — RAGメモリ・自動セーブ＆自動再開・リーダー設定・行動選択肢UIの4項目を追加。横書きモードの補足を既存行に追記。
2. **必要環境** — chroma CLI（任意）を追加
3. **ディレクトリ構成** — `auto_save.js`・`memory_store.js`・`rag_system.js` を追加。`data/chroma/` を追加。`config.js` の説明を更新。
4. **環境変数表** — `SESSION_SECRET`（未使用）を削除し、`HOST`・`CLAUDE_MODEL`・`CHROMA_URL` を追加。
