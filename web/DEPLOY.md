# オーくんWebダッシュボード - デプロイガイド

## 📋 前提条件

### 1. バックエンド（Express Server）のデプロイ

Webダッシュボードは、Expressサーバー（`server.js`）からデータを取得します。
まず、Expressサーバーを[Render](https://render.com)にデプロイしておく必要があります。

**Renderデプロイ済みURL例**: `https://okun-bot.onrender.com`

### 2. 必要なアカウント

- [GitHub](https://github.com)アカウント
- [Vercel](https://vercel.com)アカウント（GitHubアカウントでログイン可能）

---

## 🚀 Vercelへのデプロイ手順

### ステップ1: GitHubへプッシュ

```bash
cd /path/to/slack-task-bot
git add .
git commit -m "Add web dashboard for Vercel deployment"
git push origin main
```

### ステップ2: Vercelでプロジェクトをインポート

1. [Vercel Dashboard](https://vercel.com/dashboard)にアクセス
2. **「New Project」**をクリック
3. **「Import Git Repository」**から該当リポジトリを選択
4. **「Import」**をクリック

### ステップ3: プロジェクト設定

#### **Root Directory**
- **Framework Preset**: `Next.js`を選択
- **Root Directory**: `web`を指定
  - 「Edit」をクリック → `web`と入力 → 「Continue」

#### **Build and Output Settings**
自動検出されるので、特に変更不要：
- **Build Command**: `pnpm build`
- **Output Directory**: `.next`
- **Install Command**: `pnpm install`

### ステップ4: 環境変数の設定

**Environment Variables**セクションで以下を追加：

| Key | Value | Environment |
|-----|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://okun-bot.onrender.com` | Production |

**注意**:
- `https://okun-bot.onrender.com`を実際のRender URLに置き換えてください
- URLの末尾に `/` は不要です

### ステップ5: デプロイ実行

1. **「Deploy」**ボタンをクリック
2. ビルドが開始されます（約1-2分）
3. デプロイ完了後、Vercel URLが発行されます

例: `https://okun-web-dashboard.vercel.app`

---

## 🔄 継続的デプロイ（CD）

GitHubの`main`ブランチにプッシュするたびに、自動的にVercelが再デプロイします。

```bash
# コードを変更後
git add .
git commit -m "Update dashboard UI"
git push origin main
# → Vercelが自動デプロイ
```

---

## ✅ デプロイ確認

### 1. ダッシュボードにアクセス

Vercel URLにアクセスして、以下を確認：

- ✅ ページが表示される
- ✅ 統計カード（全タスク、未完了、緊急、完了）が表示される
- ✅ タスク一覧テーブルが表示される
- ✅ データが正しく取得されている

### 2. APIエンドポイントのテスト

ブラウザのコンソール（F12 → Console）を開いて確認：

```javascript
fetch('/api/tasks')
  .then(res => res.json())
  .then(data => console.log(data));
```

正常な場合、タスクの配列が表示されます。

### 3. トラブルシューティング

#### **タスクが表示されない**

1. **ブラウザのコンソールでエラー確認**
   - F12 → Console タブを確認
   - CORSエラーや404エラーがないかチェック

2. **環境変数の確認**
   - Vercel Dashboard → プロジェクト → Settings → Environment Variables
   - `NEXT_PUBLIC_API_URL`が正しく設定されているか確認

3. **RenderのExpressサーバーが起動しているか確認**
   ```bash
   curl https://okun-bot.onrender.com/health
   ```
   正常な場合、以下のようなレスポンス：
   ```json
   {
     "status": "ok",
     "agent": true,
     "timestamp": "2025-12-14T15:00:00.000Z",
     "taskCount": 10,
     "reminderEnabled": true
   }
   ```

4. **Expressサーバーのログ確認**
   - Render Dashboard → サービス → Logs
   - エラーログがないかチェック

#### **CORSエラーが発生する場合**

Expressサーバー（`server.js`）にCORS設定を追加：

```javascript
const cors = require('cors');

// CORS設定を追加
app.use(cors({
  origin: 'https://okun-web-dashboard.vercel.app',
  credentials: true
}));
```

```bash
# corsパッケージのインストール
npm install cors
```

---

## 🔧 カスタムドメインの設定（オプション）

1. Vercel Dashboard → プロジェクト → Settings → Domains
2. **「Add Domain」**をクリック
3. カスタムドメイン（例: `okun.example.com`）を入力
4. DNSレコードを設定（Vercel が指示を表示）

---

## 📊 Analytics（オプション）

Vercelは無料でアナリティクスを提供しています：

1. Vercel Dashboard → プロジェクト → Analytics
2. **「Enable Analytics」**をクリック
3. ページビュー、パフォーマンス、エラーを確認可能

---

## 🔐 セキュリティ設定（推奨）

### 1. Basic認証の追加（オプション）

ダッシュボードを社内限定にする場合、Basic認証を追加できます：

```javascript
// middleware.ts を作成
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const basicAuth = request.headers.get('authorization');

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');

    if (user === 'admin' && pwd === 'your-password') {
      return NextResponse.next();
    }
  }

  return new NextResponse('Auth required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
    },
  });
}

export const config = {
  matcher: '/',
};
```

### 2. IPホワイトリスト（Vercel Pro以上）

Vercel Proプランでは、特定IPのみアクセス許可できます。

---

## 📝 まとめ

✅ **デプロイ完了チェックリスト**

- [ ] Expressサーバーが Render にデプロイ済み
- [ ] GitHubにコードをプッシュ済み
- [ ] Vercelでプロジェクトをインポート済み
- [ ] Root Directory を `web` に設定済み
- [ ] 環境変数 `NEXT_PUBLIC_API_URL` を設定済み
- [ ] デプロイが成功してVercel URLが発行された
- [ ] ダッシュボードにアクセスしてタスクが表示される

---

## 🆘 サポート

問題が発生した場合：

1. [Vercel Documentation](https://vercel.com/docs)
2. [Next.js Documentation](https://nextjs.org/docs)
3. [Render Documentation](https://render.com/docs)

または、プロジェクトのGitHub Issuesで報告してください。
