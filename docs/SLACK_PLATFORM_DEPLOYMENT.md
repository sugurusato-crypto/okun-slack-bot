# Slack Platform デプロイ記録

## デプロイ日時
2025-12-14

## デプロイ情報

### 本番環境
- **App ID**: A0A3LKWB7HS
- **App名**: okun-bot
- **環境**: Slack Platform (Hosted by Slack)
- **ワークスペース**: Uravation (T06MUHCN4FP)
- **ダッシュボード**: https://slack.com/apps/A0A3LKWB7HS
- **ブランチ**: feature/slack-platform

### 環境変数
- `GEMINI_API_KEY`: 設定済み

---

## デプロイ手順

### 1. Slack CLIインストール
```bash
curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash
```

### 2. ログイン
```bash
slack login --no-prompt
# Slackで /slackauthticket コマンドを実行してチャレンジコードを取得
slack login --challenge [code] --ticket [ticket]
```

### 3. アプリインストール
```bash
slack install --environment local --team T06MUHCN4FP
```

### 4. 依存関係インストール
```bash
# deno.jsonc に "nodeModulesDir": "auto" を追加
deno install
```

### 5. デプロイ
```bash
slack deploy --team T06MUHCN4FP --hide-triggers
```

### 6. 環境変数設定
```bash
slack env add GEMINI_API_KEY [API_KEY] --app A0A3LKWB7HS
```

---

## アーキテクチャ比較

### Slack Platform版 (現在)
- **ランタイム**: Deno 2.5.3
- **フレームワーク**: Slack SDK
- **ストレージ**: Slack Datastore
- **コスト**: $0
- **スリープ**: なし
- **メンテナンス**: 不要

### Render版 (既存・停止中)
- **ランタイム**: Node.js
- **フレームワーク**: Express
- **ストレージ**: JSON ファイル
- **コスト**: ~$7/月
- **スリープ**: 15分で停止
- **メンテナンス**: 必要

---

## 判断基準

### Slack Platformで継続（現在の選択）
✅ 適用条件:
- Slack専用ボットのまま
- コスト削減優先
- メンテナンス工数削減優先
- 当面マルチプラットフォーム展開の予定なし

### Renderへ移行を検討すべき条件
❌ 以下の要件が出た場合:
- LINE、Discord、Teamsなど他プラットフォームへの展開
- 複数の外部サービスとの複雑な連携
- 長時間バッチ処理の必要性
- 独自のデータベース構造が必要

---

## 移行パス

### もしRenderへ戻す場合
1. 既存のRender版（mainブランチ）をベースにする
2. feature/slack-platformの新機能を手動移植
3. 移植工数: 1-2日（完全移植は3-5日）

### もしLINE対応する場合
1. Render版を復活
2. LINE Messaging APIエンドポイント追加
3. Gemini AIとタスク管理ロジックを共通化
4. 開発工数: 既存コードベースから30%程度

---

## ログ確認

### アクティビティログ
```bash
slack activity --tail
```

### アプリ一覧
```bash
slack app list
```

### 環境変数確認
```bash
slack env list --app A0A3LKWB7HS
```

---

## トラブルシューティング

### デプロイエラー: esbuild not found
```bash
# deno.jsonc に追加
"nodeModulesDir": "auto"

# 依存関係を再インストール
deno install
```

### 環境変数が反映されない
```bash
# アプリIDを指定して追加
slack env add GEMINI_API_KEY [KEY] --app A0A3LKWB7HS
```

---

## 次のステップ

### 短期（1ヶ月以内）
- [ ] 本番環境でのテスト
- [ ] ユーザーフィードバック収集
- [ ] バグ修正・改善

### 中期（3-6ヶ月）
- [ ] 使用状況のモニタリング
- [ ] 追加機能の検討
- [ ] マルチプラットフォーム展開の要否判断

### 長期（6ヶ月以降）
- [ ] LINE対応の要否確認
- [ ] 必要に応じてRenderへの移行検討

---

*最終更新: 2025-12-14*
