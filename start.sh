#!/bin/bash
# start.sh - AI-TRPG Web サーバー起動スクリプト
#
# 使い方:
#   chmod +x start.sh   ← 初回のみ（実行権限を付与）
#   ./start.sh          ← 起動
#   ./start.sh stop     ← 停止
#   ./start.sh restart  ← 再起動
#   ./start.sh status   ← 状態確認
#   ./start.sh logs     ← ログ表示
#   ./start.sh delete   ← PM2からプロセスを削除

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="ai-trpg-web"

# ── 引数に応じて処理を分岐 ───────────────────────────
case "${1:-start}" in

  start)
    echo "🚀 AI-TRPG Web サーバーを起動します..."

    # .env の存在確認
    if [ ! -f "$SCRIPT_DIR/.env" ]; then
      echo "❌ エラー: .env ファイルが見つかりません"
      echo "   cp .env.example .env して設定してください"
      exit 1
    fi

    # ANTHROPIC_API_KEY の確認
    if ! grep -q "ANTHROPIC_API_KEY=." "$SCRIPT_DIR/.env"; then
      echo "❌ エラー: .env に ANTHROPIC_API_KEY が設定されていません"
      exit 1
    fi

    # TypeScript ビルド（バックエンド + フロントエンド）
    npm --prefix "$SCRIPT_DIR" run build

    # 既存プロセスがあれば再起動、なければ新規起動
    if pm2 describe "$APP_NAME" &>/dev/null; then
      pm2 restart "$APP_NAME"
    else
      pm2 start "$SCRIPT_DIR/dist/server.js" --name "$APP_NAME"
    fi
    pm2 save

    # ポート取得（設定されていれば）
    PORT=$(grep "^PORT=" "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "3000")
    PORT="${PORT:-3000}"

    echo ""
    echo "✅ 起動完了！"
    echo ""
    echo "🌐 ブラウザで開く: http://localhost:${PORT}"
    echo ""
    echo "📋 確認コマンド:"
    echo "   ./start.sh status   → 状態確認"
    echo "   ./start.sh logs     → ログ表示"
    echo ""
    ;;

  stop)
    echo "🛑 サーバーを停止します..."
    pm2 stop "$APP_NAME"
    echo "✅ 停止完了"
    ;;

  restart)
    echo "🔄 サーバーを再起動します（ビルド込み）..."
    npm --prefix "$SCRIPT_DIR" run build
    pm2 restart "$APP_NAME"
    echo "✅ 再起動完了"
    pm2 status
    ;;

  status)
    pm2 status
    ;;

  logs)
    pm2 logs "$APP_NAME"
    ;;

  delete)
    echo "🗑️  PM2からプロセスを削除します..."
    pm2 delete "$APP_NAME"
    pm2 save
    echo "✅ 削除完了"
    ;;

  *)
    echo "使い方: ./start.sh [start|stop|restart|status|logs|delete]"
    exit 1
    ;;

esac
