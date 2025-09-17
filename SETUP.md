# セットアップガイド

## 環境変数の設定

### 開発環境

1. `.dev.vars.example`を`.dev.vars`にコピー：
```bash
cp .dev.vars.example .dev.vars
```

2. `.dev.vars`ファイルを編集して、OpenAI APIキーを設定：
```
OPENAI_API_KEY=your_actual_api_key_here
```

### 本番環境（Cloudflare Pages）

```bash
npx wrangler pages secret put OPENAI_API_KEY --project-name your-project-name
```

## APIキーの取得

1. [OpenAI Platform](https://platform.openai.com/)にアクセス
2. API Keysセクションで新しいキーを作成
3. GPT-5へのアクセス権限があることを確認

## 注意事項

- **絶対にAPIキーをコミットしないでください**
- `.dev.vars`は`.gitignore`に含まれています
- 本番環境では環境変数として安全に管理してください