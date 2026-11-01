# Prisma 7移行と検証（2026-11-01）

## 設計と対象

base e255ef9013562aa9acac14c091f94b0f9ef0263f。データ正本は既存Neon PostgreSQL、APIの実行場所はRender、consumerは既存Todo UI。ドメイン所有者・配置・Todoモデル・migration SQL・HTTPルーターは不変。Rust query engineから正式pg adapterへ移行し、CLI URL設定をprisma.config.tsへ移す。横断DB・新writer・新サービスは追加しない。

Prisma/Client/adapterを正式7.10.1へ揃え、deepmerge-ts8.0.2を親の正式依存で解決。overrideなし。prisma-client generatorはsrc/generated/prismaへESM TSを生成し、既存NodeNextでdistへcompile。生成物は既存gitignoreの対象。buildはgenerateを明示しDB URLなしで成功する。Runtimeはdotenv読込後にclient/poolを作成、開発singletonを保持。

## 本番適合はHOLD

2026-11-01、Renderの設定を読み取り、buildはnpm install --include=dev && npm run build、startはnpm start、main自動配備であることを確認。設定変更やDB接続はしない。本番URLのオプションはsslmode=requireとchannel_binding=require。URL・host・user・passwordはこの記録やレビュー資料に含めない。

pg8.23.1の公開API enableChannelBinding:true はサーバーが対応する場合のpreferであり、require強制を保証しない。上流のrequire対応PR3746は確認時点でopen。候補はchannel_bindingを明示拒否するので、現本番URLで起動できない。このためmerge/deployはHOLD。認証要求を無視・削除したりpreferへ弱めること、未公開patchや独自auth hookの導入は行わない。

次の再判定条件は、requireを正式サポートするdriverでのPrisma adapter互換性（または明示的に承認・レビューされた接続契約の変更）と、SCRAM-PLUS成功・非対応/弱い認証拒否の隔離試験。pg-native/libpqは候補だがnativeビルド、Render/Windows環境、adapter型・pool APIを未検証。Node実配備版も最終反映前に確認する。

## URLと接続契約

Runtimeのremote TLSはverify-full固定、CLI Rust connectorにはrequire+sslaccept=strictを設定する。未信頼CA・ホスト名不一致は拒否。NODE_TLS_REJECT_UNAUTHORIZED=0ならTLS接続設定を拒否する。plaintextはloopback限定。

CAはsslrootcertの絶対パスだけを統一入力とし、CLI用にはsslcertへ変換。相対CA、重複query key、host/user等のquery alias、未知のoption、制御文字を拒否する。v6のsslcert/sslidentity/socket_timeoutやchannel_bindingを黙って流さない。schemaはadapterへ渡し、connection_limit/timeout/lifetimeはpg pool設定へ移す。pgの既定pool上限10（v6のCPU依存とは異なる）、connect5s/acquire10sの短い方を共有timerに採用し、idle300s/lifetime無制限を既定とする。0で無期限のconnect/acquireを要求するURLは拒否。

## 実施した検証

- Windows Node22.23.4: clean npm ci --ignore-scripts、URLなしgenerate/build、unit9件PASS。既存Express回帰、設定/TLS/alias/CA/制御文字境界、deepmergeの通常・循環mergeを含む。npm audit0。
- Linux公式Node22.23.4-bookworm-slim: clean install/generate/build、unitと隔離DB試験のログをscratchに保存。最終件数はPRに記録。
- 既存ローカルPostgres17.6 imageをvolumeなし・127.0.0.1:56533だけで起動。全てcodex_prisma7_*の合成DB。Prisma6.19.3で既存migration2件と日時付きsentinelを作成し、7でpending migrationなし・実routerCRUD/日時/404/204・transaction rollback/commitを確認。旧6でも更新後データの読書き・日時保持を確認。
- freshDBへ既存migrationを適用しschema diff0。新migration/SQL/本番データ操作なし。
- 合成TLS証明書: runtime実queryで未信頼CA拒否、明示CAでssl=true接続成功、信頼済みでも不一致hostname拒否。CLIもCA付きmigrate成功/未信頼CA拒否/不一致hostname拒否、URL欠落時はmigrate失敗。
- URL由来のpool上限1・timeout1sで枯渇時の拒否と解放後query成功。$connectだけではpg接続が遅延するためTLS証拠には実queryを使う。
- 実production entryを合成.envと隔離DBで起動し、healthとTodo GET成功。fixtureは改行・引用符等を拒否し検査済URLのみ書く。

実装gpt-6.1-sol。独立レビューgpt-6-astra/highでDB/TLS/設定・復旧を精査。URL alias、秘密なしbuild、CA相対/重複、test dotenv注入の指摘を修正。最終所見と対象base/headはPRへ記録する。実本番のDB・認証・CRUD・migration・配備はNOT_RUN。

## 再実行と復旧

npm testはDB不要。test:dbとtest:tlsはAGENTSの必須環境変数と隔離DB guardを用いる。新規DBは既存npm run prisma:migrateでmigration2件を適用し、upgrade試験はまず旧6でsynthetic-prisma6-sentinelを日時2026-01-02T03:04:05.123Z付きで作成する。DB URLや秘密値をログ/PRへ貼らない。

本番配備承認後もschemaを変えず、既存startにmigrationを追加しない。障害時は旧Render配備のcommit e255ef9013562aa9acac14c091f94b0f9ef0263fへ既存の承認済rollback手順で戻す。DB列/データを戻すSQLは不要だが旧deepmerge脆弱性は復活する。全ての本番操作は別途直前承認。

公式根拠（2026-11-01確認）:
- https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- https://docs.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool
- https://node-postgres.com/features/ssl
- https://github.com/brianc/node-postgres/pull/3746
- https://github.com/advisories/GHSA-ggr8-5vv4-36mx
