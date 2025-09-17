#!/bin/bash
# GPT-4o ChatBot Test Script
# このスクリプトはチャットボットの動作をテストします

echo "🤖 GPT-4o ChatBot テストスクリプト"
echo "================================="
echo ""

# APIエンドポイント
API_URL="http://localhost:3000/api/chat"

# テスト1: 基本的な挨拶
echo "📝 テスト1: 基本的な挨拶"
echo "リクエスト: 'こんにちは！'"
curl -s -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d '{"message": "こんにちは！", "model": "gpt-4o"}' | \
  python3 -c "import sys, json; data = json.load(sys.stdin); print(f'レスポンス: {data[\"message\"][:100]}...')"
echo ""

# テスト2: Web検索機能付き
echo "📝 テスト2: Web検索機能"
echo "リクエスト: '今日の東京の天気は？' (Web検索有効)"
curl -s -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d '{"message": "今日の東京の天気は？", "model": "gpt-4o", "useSearch": true}' | \
  python3 -c "import sys, json; data = json.load(sys.stdin); print(f'レスポンス: {data[\"message\"][:100]}...'); print(f'Web検索使用: {data[\"searchUsed\"]}')"
echo ""

# テスト3: モデルフォールバック
echo "📝 テスト3: モデル情報の確認"
curl -s -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d '{"message": "テスト", "model": "gpt-4o"}' | \
  python3 -c "import sys, json; data = json.load(sys.stdin); print(f'使用モデル: {data[\"diagnostic\"][\"modelUsed\"]}'); print(f'要求モデル: {data[\"diagnostic\"][\"modelRequested\"]}'); print(f'試行モデル: {data[\"diagnostic\"][\"modelsTried\"]}')"
echo ""

echo "✅ テスト完了！"