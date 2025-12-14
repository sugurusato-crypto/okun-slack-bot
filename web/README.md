# オーくん Web ダッシュボード

Slack Platform上のオーくんのタスクデータを表示するWebダッシュボード。

## 機能

- 📊 タスク統計ダッシュボード
- 📋 タスク一覧表示（優先度・ステータス別）
- 🔍 リアルタイムデータ取得
- 📱 レスポンシブデザイン

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **バックエンド**: Express Server (Render)
- **デプロイ**: Vercel (Frontend) + Render (Backend)

## セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 環境変数の設定

`.env.local`ファイルを作成し、以下を設定：

```bash
cp .env.example .env.local
```

`.env.local`を編集：

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**注意**: ローカル開発時は、別のターミナルでExpressサーバー（`server.js`）を起動しておく必要があります。

```bash
# ルートディレクトリで
node server.js
```

### 3. 開発サーバーの起動

```bash
pnpm dev
```

http://localhost:3000 でアクセス可能

## Vercelデプロイ

詳細なデプロイ手順は **[DEPLOY.md](./DEPLOY.md)** を参照してください。

### クイックスタート

1. GitHubにプッシュ
2. [Vercel](https://vercel.com)でプロジェクトをインポート
3. Root Directory: `web`を指定
4. 環境変数を設定：
   - `NEXT_PUBLIC_API_URL`: RenderのURL（例: `https://okun-bot.onrender.com`）
5. デプロイ

**詳細ガイド**: [DEPLOY.md](./DEPLOY.md) 📘

## ディレクトリ構造

```
web/
├── app/
│   ├── api/
│   │   └── tasks/
│   │       └── route.ts      # Slack API経由でタスク取得
│   ├── page.tsx              # メインダッシュボード
│   └── layout.tsx
├── components/
│   └── ui/                   # shadcn/uiコンポーネント
├── lib/
│   └── utils.ts
└── .env.example
```

## API エンドポイント

### GET /api/tasks

Expressサーバー（`http://localhost:3000/api/tasks`）からタスク一覧を取得

**レスポンス:**
```json
{
  "tasks": [
    {
      "id": "1",
      "task": "タスク名",
      "assignee": "担当者",
      "project": "プロジェクト名",
      "deadline": "期限",
      "priority": "urgent" | "thisWeek",
      "status": "未着手" | "進行中" | "レビュー中" | "完了",
      "created_at": "2025-12-14T10:00:00Z",
      "completed_at": "",
      "created_by": "system"
    }
  ]
}
```

## トラブルシューティング

### タスクが表示されない

1. Expressサーバー（`server.js`）が起動しているか確認
   ```bash
   # ルートディレクトリで確認
   curl http://localhost:3000/health
   ```
2. `.env.local`の`NEXT_PUBLIC_API_URL`が正しく設定されているか確認
3. ブラウザのコンソールでエラーログを確認
4. Expressサーバーのログを確認

### 接続エラー (ECONNREFUSED)

Expressサーバーが起動していない可能性があります。別のターミナルで以下を実行：

```bash
cd /path/to/slack-task-bot
node server.js
```

### ビルドエラー

```bash
pnpm install --force
pnpm build
```

## ライセンス

MIT
