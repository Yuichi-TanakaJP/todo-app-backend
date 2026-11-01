# Expressセキュリティ更新（2026-11-01）

Expressを5.3.0へ固定し、既存npm解決でbody-parser2.4.0、proxy-addr2.0.8、path-to-regexp8.4.2、qs6.17.1へ更新。overrideなし。Prisma6.14.0系は変更しない。

Node22.23.4、秘密のない専用worktreeでnpm ci --ignore-scripts、prisma generate（接続/migrationなし）、npm run build、npm test成功。testは既存routerと同じcors/express.json middlewareをlocalhost限定serverで使い、既存singleton seamへ合成DBを渡す。CRUD、空title、invalid id、異常JSON400、100KB超413、CORS許可/非許可origin、未知route404、DELETE204空bodyを確認。index.ts起動自体や実DB/公開APIを確認した試験ではない。

現状npm testは未実装だったため、この更新で実テストへ置換。実DBを使うUATは別途承認後に行う。DB credentialsや.env、実データ、migration、production設定を変更しない。Windows cloneのみを使用しWSL cloneは未操作。

更新後npm auditは5 high（prisma、@prisma/config、deepmerge-ts、effect、defu）。Expressの更新でPrisma側も解消したとは扱わず別の変更へ割当。実際のHTTP未信頼入力からPrisma設定mergeへの到達は未確認。trust proxy設定は追加しない。

実装Sol low、独立security/domain/rollbackレビューとhosted checkの実状態はPRへ記録。マージ/配備は承認前に実行しない。復旧は以前の配備artifactを優先し、依存旧版を戻す場合は脆弱性再導入として再評価。schema変更/migrationは不要。

実施日2026-11-01 JST。候補の公式情報: https://registry.npmjs.org/express/5.3.0 。監査証拠: C:/Users/yutaz/dev/_scratch/codex/2026-11-01/certifi-fix-01/todo-audit.json 。