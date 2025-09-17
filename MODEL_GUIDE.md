# GPT Model Configuration Guide

## 利用可能なモデル (Available Models)

このチャットボットアプリケーションは、以下のOpenAIモデルをサポートしています：

### 主要モデル (Primary Models)
- **gpt-4o** (デフォルト) - 最新の高性能モデル
- **gpt-4o-mini** - 軽量版GPT-4o、高速レスポンス
- **gpt-4-turbo** - GPT-4の高速版
- **gpt-3.5-turbo** - 基本的なチャット用モデル

## モデルフォールバック機能

アプリケーションには自動フォールバック機能が組み込まれており、選択したモデルが利用できない場合、自動的に代替モデルに切り替わります。

### フォールバックチェーン
1. **gpt-4o** → gpt-4o-mini → gpt-4-turbo → gpt-3.5-turbo
2. **gpt-4o-mini** → gpt-4-turbo → gpt-3.5-turbo
3. **gpt-4-turbo** → gpt-4o-mini → gpt-3.5-turbo
4. **gpt-3.5-turbo** → gpt-4o-mini

## トークン制限 (Token Limits)

各モデルには最適化されたトークン制限が設定されています：

- **gpt-4o**: 12,000トークン
- **gpt-4o-mini**: 6,000トークン
- **gpt-4-turbo**: 4,000トークン
- **gpt-3.5-turbo**: 3,000トークン

## GPT-5対応について

現在GPT-5はまだリリースされていませんが、このアプリケーションはGPT-5がリリースされた際にすぐに対応できるよう準備されています。GPT-5が要求された場合、自動的にgpt-4oにフォールバックします。

## API使用方法

### 基本的な使用例
```json
{
  "message": "あなたの質問",
  "model": "gpt-4o",
  "allowModelFallback": true
}
```

### モデル指定の例
```json
{
  "message": "軽量モデルでの応答をお願いします",
  "model": "gpt-4o-mini",
  "allowModelFallback": false
}
```

## トラブルシューティング

### モデルエラーが発生した場合
1. APIキーが正しく設定されているか確認
2. 選択したモデルへのアクセス権限があるか確認
3. フォールバック機能を有効にして再試行

### レスポンスが遅い場合
- より軽量なモデル（gpt-4o-mini、gpt-3.5-turbo）を試す
- トークン制限を調整する

## 更新履歴

- **2024-09-17**: 実在のOpenAIモデル（GPT-4o系）に更新
- **2024-09-12**: GPT-5対応版として初期リリース（フォールバック機能付き）