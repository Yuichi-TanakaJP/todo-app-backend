# Prisma設定依存の部分更新（2026-11-01）

Express専用PRとは分離し、prisma/@prisma/clientを同major6.14.0から6.19.3へ揃える。@prisma/config6.19.3が依存するeffect3.21.0と、c12系の既存制約内defu6.1.7へ更新。overrideなし。Express側はこのPRでは旧版のまま、別PR#4が担当。

秘密なしworktreeでnpm ci --ignore-scripts、prisma generate、npm run build成功。prisma validateは初回DATABASE_URL未設定で失敗し、合成URL（localhostの未使用port1）設定後成功。DB接続、migration、実環境.env利用は行わない。実routerとMap合成DBの回帰も成功するが、実PrismaClient/query engine/DB互換の検証にはならない。配備前の実DB確認は未実施として残る。

独立security/domain/rollbackレビューgpt-6-astra/highは阻害なし。CLI/Client版一致、公式6.19.3のeffect修正、設定loaderと保留条件を確認。実行結果は実装側証拠。

## 未解消deepmerge-ts

@prisma/config6.19.3もdeepmerge-ts7.1.5をexact固定している。GHSA-ggr8-5vv4-36mxは8未満が対象で、双方の同じproperty pathが自己参照するobject graphによる再帰DoS。通常JSONだけではこの条件を作れない。現アプリの直接importは未発見、確認したPrisma loaderはdotenv/rcFile/giget/extend/packageJsonを無効化するが、全経路が安全という認定ではない。

同majorの通常更新では解消できないため、Prisma7への移行やdeepmerge8強制overrideはこのPRへ混ぜない。2026-11-04までに親の対応と到達条件を再判定。未解消として記録し警告を隠さない。更新後audit7件はExpress4件とPrisma/@prisma/config/deepmerge3件。PR#4を適用しただけでPrisma側も解消したとは扱わない。

マージ/配備は承認待ち。schema/migration変更なし。復旧はPrisma manifest/lockを対で復元しClient再生成/build、承認後再起動。Express更新を巻き戻さない差分で扱い、旧依存再導入を安全復旧と認定しない。

公式: https://github.com/prisma/orm/releases/tag/6.19.3 、https://github.com/advisories/GHSA-ggr8-5vv4-36mx 。実施日2026-11-01 JST。audit証拠はC:/Users/yutaz/dev/_scratch/codex/2026-11-01/certifi-fix-01/todo-prisma-audit.json。