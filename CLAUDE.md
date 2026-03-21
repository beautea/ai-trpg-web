ファイルへの書き込み許可が必要です。許可いただければ更新を実行します。

変更内容の概要：

1. **構成図** — `auto_save.js`・`memory_store.js`・`rag_system.js` を追加
2. **責務分離表** — 上記3ファイルの行を追加
3. **設定値表** — `chroma.*`・`host`・`CLAUDE_MODEL` 対応を追記、`llm.model` の値を環境変数対応に修正
4. **セッション状態** — `diceSystem` を `"dnd5e"` に、`statsMode` を `"hp" | "hpmp"` に修正（コードの実態と合わせる）
5. **SSEイベント形式** — `intro_start` イベントを追加、`done` の内容をエンドポイント別に修正
6. **実装ルール** — RAG・自動セーブ・ChromaDB の節を追加、HP/MPパースのMP条件を明記
7. **セッションフロー** — localStorage 保存・ページリロード自動再開・RAG検索を反映
8. **データディレクトリ** — `data/chroma/` を追加
9. **環境変数** — `HOST`・`CLAUDE_MODEL`・`CHROMA_URL` を追加
