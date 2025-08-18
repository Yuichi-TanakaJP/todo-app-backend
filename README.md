# Todo API Backend (Express + Prisma + Postgres on Render)
フロント（Vite + React）から呼ばれる Todo API です。

## Tech Stack
- Node.js + Express
- Prisma ORM
- PostgreSQL (Neon)
- Hosting: Render (Free)

## Folder Structure
├─ src/ # Express アプリ本体
├─ prisma/ # schema.prisma / migrations
├─ dist/ # ビルド成果物
├─ .env # ローカル用（非公開）
├─ .env.example # 環境変数サンプル（公開）
├─ package.json
└─ tsconfig.json

## Prisma Schema (抜粋)
```prisma
model Todo {
  id        Int      @id @default(autoincrement())
  title     String
  completed Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Endpoints
Method | Path | Body | Response |
|---:|---|---|---|
GET	| /api/health |	– |	{"status":"ok"} |
GET	| /api/todos |	–	Todo[] |
POST | /api/todos |	{ "title": string }	| Todo |
PUT | 	/api/todos/:id	| { "title"?: string, "completed"?: boolean } | Todo |
DELETE | /api/todos/:id	| –	| 204 No Content |


## Notes
- DELETE は本文なし(204)。クライアントは JSON を期待しないこと。
- 404 は { "error": "todo not found" } を返す実装。

## Environment Variables
`.env.example`（ローカルの雛形）
DATABASE_URL=postgresql://USER:PASS@HOST:PORT/DBNAME?sslmode=require
PORT=8080
CORS_ORIGIN=http://localhost:5173,https://todo-app-ten-rose-62.vercel.app


## Scripts
```json
{
  "dev": "tsx watch src/index.ts",
  "build": "tsc -p tsconfig.json",
  "prisma:migrate": "prisma migrate deploy",
  "start": "npm run prisma:migrate && node dist/index.js"
}
```

## Local Development
```bash
npm install
npx prisma migrate dev          # 初回/スキーマ変更時
npm run dev                     # http://localhost:8080
```

## Deploy (Render)
- Build Command: npm install --include=dev && npm run build
- Start Command: npm start
- Free tier はスリープあり（初回アクセスは遅い）


## 環境変数 (Render 用)

| 変数名           | 説明                                    | 例                                      |
|------------------|-----------------------------------------|-----------------------------------------|
| DATABASE_URL     | Postgres の接続 URL (Prisma で使用)     | postgres://user:password@host:5432/db   |
| CORS_ORIGIN      | フロントエンドの URL（CORS 許可用）     | https://todo-app-frontend.vercel.app    |
| PORT             | サーバーのポート番号 (Render 自動設定)  | 10000                                   |
| NODE_ENV         | 環境設定 (development/production)       | production                              |
| JWT_SECRET       | 認証トークン用の秘密鍵（認証導入予定）  | 任意のランダム文字列                     |


## Troubleshooting (Memo)
- CORS: CORS_ORIGIN は末尾スラ無しで完全一致、複数はカンマ区切り
- Neon: 手動SQLで CamelCase を使うなら "updatedAt" のようにダブルクォート
- 204 応答: クライアントで res.json() せずに終了すること

## すぐファイルを作るコマンド（PowerShell）
```powershell
cd C:\Users\yutaz\dev\todo-app-backend
New-Item -Name "README.md" -ItemType File
# その後、README.mdに上の雛形を貼り付けて保存
git add README.md
git commit -m "docs: add backend README"
git push
```
