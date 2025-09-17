# GPT-5 ChatBot with Responses API 🚀

## 📌 重要なお知らせ
**GPT-5は実際に利用可能です！** このプロジェクトはGPT-5（gpt-5-2025-08-07）を使用した実動作するチャットボットです。

## 🎯 プロジェクト概要

OpenAI Responses APIを使用した最新のGPT-5対応チャットボットアプリケーション。

### 主な特徴
- ✅ **GPT-5専用** - 最新のGPT-5モデル（gpt-5-2025-08-07）のみ使用
- 🚫 **フォールバックなし** - GPT-5以外のモデルは使用しません
- 🔍 **Web検索機能** - リアルタイム情報取得
- 📁 **ファイル処理** - PDF、Office文書、画像対応
- 💬 **スレッド管理** - 会話履歴の保存と管理
- 🎨 **リッチUI** - Markdown対応、コードハイライト

## 🚀 クイックスタート

### 必要要件
- Node.js 18以上
- OpenAI APIキー（GPT-5アクセス権限付き）

### インストール
```bash
# リポジトリをクローン
git clone https://github.com/metabobeam/gpt5-chatbot-responses-api.git
cd gpt5-chatbot-responses-api

# 依存関係をインストール
npm install

# 環境変数を設定
echo "OPENAI_API_KEY=your_api_key_here" > .dev.vars
```

### 開発サーバー起動
```bash
# ビルド
npm run build

# PM2で起動（推奨）
npm install -g pm2
pm2 start ecosystem.config.cjs

# または直接起動
npm run dev
```

アプリケーションは http://localhost:3000 で起動します。

## 📊 利用可能なモデル

| モデル | 説明 | トークン上限 |
|--------|------|-------------|
| **gpt-5** | 最新の推論モデル（専用） | 12,000 |

**注意：** このアプリケーションはGPT-5専用に設定されており、他のモデル（GPT-4o、GPT-4o-mini等）は使用できません。

## 🔧 API エンドポイント

### `POST /api/chat`
チャット機能のメインエンドポイント

```json
{
  "message": "ユーザーメッセージ",
  "model": "gpt-5",
  "useSearch": false,
  "fileContent": null,
  "fileIds": []
}
```

**レスポンス例：**
```json
{
  "message": "AI応答テキスト",
  "searchUsed": false,
  "diagnostic": {
    "modelRequested": "gpt-5",
    "modelUsed": "gpt-5",
    "modelsTried": ["gpt-5"],
    "fallbackUsed": false
  }
}
```

### `POST /api/upload`
ファイルアップロード（OpenAI Files API使用）

### `GET /api/files`
アップロード済みファイル一覧

## 🛠️ 技術スタック

- **バックエンド**: Hono + Cloudflare Workers
- **フロントエンド**: Vanilla JS + Tailwind CSS
- **API**: OpenAI Responses API
- **デプロイ**: Cloudflare Pages
- **プロセス管理**: PM2

## 📈 パフォーマンス

- 応答時間: 1-3秒（通常の質問）
- GPT-5専用: フォールバック機能を削除し、GPT-5のみに特化
- 同時接続: Cloudflare Workers制限内

## 🔐 セキュリティ

- APIキー: 環境変数で管理
- CORS: 適切に設定
- XSS対策: DOMPurifyによるサニタイゼーション
- 入力検証: 全エンドポイントで実装

## 📝 テスト

```bash
# チャット機能テスト
./test_chat.sh

# APIテスト（curl）
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello GPT-5!", "model": "gpt-5"}'
```

## 🚀 Cloudflare Pagesへのデプロイ

```bash
# ビルド
npm run build

# デプロイ
npx wrangler pages deploy dist --project-name your-project-name

# 環境変数設定
npx wrangler pages secret put OPENAI_API_KEY --project-name your-project-name
```

## 📊 動作確認済み

- ✅ GPT-5モデルの正常動作
- ✅ 日本語対応
- ✅ Web検索機能
- ✅ ファイルアップロード
- ✅ マークダウン表示
- ✅ スレッド管理

## 🤝 コントリビューション

プルリクエストを歓迎します！

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. プッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス

MIT License

## 🙏 謝辞

- OpenAI - GPT-5モデルの提供
- Cloudflare - ホスティングインフラ
- Hono - 軽量Webフレームワーク

## 📞 お問い合わせ

Issues: https://github.com/metabobeam/gpt5-chatbot-responses-api/issues

---

**⚡ Powered by GPT-5 (gpt-5-2025-08-07) - The Future is Now! ⚡**