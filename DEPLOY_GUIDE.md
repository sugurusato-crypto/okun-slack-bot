# okun-slack-bot デプロイガイド (Render)

## 概要
Slack タスク管理Bot「okun-slack-bot」をRenderにデプロイする手順書。

---

## 前提条件
- GitHubアカウント
- Renderアカウント
- Slack App設定済み
- 以下の環境変数を準備:
  - `GEMINI_API_KEY`
  - `SLACK_BOT_TOKEN`

---

## デプロイ手順

### Step 1: Renderにサインイン
1. [Render](https://render.com/) にアクセス
2. **GitHubでサインイン** を選択

### Step 2: Web Serviceを作成
1. ダッシュボードで **「New」** をクリック
2. **「Web Service」** を選択
3. **「Build and deploy from a Git repository」** を選択
4. リポジトリ **`sugurusato-crypto/okun-slack-bot`** を選択

### Step 3: サービス設定

| 項目 | 設定値 |
|------|--------|
| Name | `okun-slack-bot-uravation` |
| Region | `Singapore` |
| Branch | `main` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `node server.js` |

### Step 4: 環境変数を設定
「Environment」セクションで以下を追加:

```
GEMINI_API_KEY=your_gemini_api_key_here
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
```

### Step 5: インスタンスタイプ
- **Instance Type**: `Free` を選択

### Step 6: デプロイ
1. **「Create Web Service」** をクリック
2. デプロイが完了するまで待機（約2-3分）
3. 生成されたURL: `https://okun-slack-bot-uravation.onrender.com`

---

## Slack App設定

### Event Subscriptions設定
1. [Slack API](https://api.slack.com/apps) にアクセス
2. 対象のAppを選択
3. **「Event Subscriptions」** をクリック
4. **「Request URL」** に以下を入力:
   ```
   https://okun-slack-bot-uravation.onrender.com/slack/events
   ```
5. URL Verificationが成功することを確認
6. **「Save Changes」** をクリック

---

## トラブルシューティング

### ブラウザタイムアウト (Timeout 5000ms)
- Renderの無料プランでは、15分間アクセスがないとスリープ状態になる
- 初回アクセス時にタイムアウトが発生することがある
- **対策**:
  - UptimeRobot等で定期的にpingを送信
  - 有料プランへのアップグレード

### デプロイが失敗する場合
1. Build Logsを確認
2. `package.json` の `dependencies` を確認
3. Node.jsバージョンの互換性を確認

### Slackからイベントが届かない場合
1. Event Subscriptionsの Request URL が正しいか確認
2. Bot Token Scopesに `app_mentions:read`, `message.channels`, `message.im` 等が含まれているか確認
3. Appがチャンネルに招待されているか確認

---

## 関連リンク
- GitHub: https://github.com/sugurusato-crypto/okun-slack-bot
- Render Dashboard: https://dashboard.render.com
- Render Service: https://dashboard.render.com/web/srv-d4rh8ekhg0os73an7dm0
- Slack API: https://api.slack.com/apps

---

## デプロイ済み情報
| 項目 | 値 |
|------|-----|
| Service ID | srv-d4rh8ekhg0os73an7dm0 |
| URL | https://okun-slack-bot-uravation.onrender.com |
| Repository | sugurusato-crypto/okun-slack-bot |
| Branch | main |
| Runtime | Node |
| Region | Singapore |
| Tier | Free |

---

## 更新履歴
- 2025-12-09: デプロイ完了、実際の情報で更新
- 2024-12-08: 初版作成
