# Prisma 7 / mandatory channel binding（2026-11-01）

## 目的と設計境界

base e255ef9013562aa9acac14c091f94b0f9ef0263f。データ正本は既存Neon PostgreSQL、APIの実行場所はRender、consumerは既存Todo UI。Todoモデル・migration SQL・HTTPルーター・startは不変。新DB・writer・サービスを追加しない。Prisma/Client/adapterは正式7.10.1、deepmerge-ts8.0.2を親の正式依存で解決しoverrideなし。

prisma-client generatorはignored src/generated/prismaへESM TSを生成しNodeNextでcompile。buildはgenerate→tsc→公開CA bundle生成→native配備前check。Node22.23.4を.node-versionで固定。URLなしのgenerate/build/unit testを維持する。

## channel_binding=requireの解消方法

初期候補はpg8.23.1純JSドライバーがrequireを強制できずHOLDだった。正式pg-native3.9.1/libpqのnativeConnectionString APIを用いる経路を追加した。URLにrequireがある場合だけnativeを選び、requireを削除・prefer化・無視しない。nativeが不足する環境では接続前に失敗しJSへfallbackしない。認証内部のpatch、未公開fork、独自SCRAM実装はない。CLIはPrisma7.10.1固定Rust connectorのrequire対応を使用する。

nativeのquery単位の型変換が純JS版と異なり、初期POCではAsia/Tokyoで日時9時間差を再現した。公開query APIのwrapperでnativeの生textを受け、Prismaが実際に指定するtypes.getTypeParserをquery後段で適用する。promise/callback・transaction・JSON/配列等を保持し、変換例外はquery rejectにする。認証のhookは変更しない。

runtime remote TLSはverify-full、CLIはrequire+sslaccept=strict。CAの明示指定はsslrootcertの絶対パス、runtimeの未指定時はbuild生成のNode bundled public rootsをlibpqへ渡す。独自CAは明示指定する。CAファイル内の空白を含むURIはlibpq用に%20化する。native側にはconnect_timeoutも渡し無応答workerを有界にする。URIの不正percent/NUL/control、重複key、queryによるhost等の別名指定は秘密を含まないエラーで拒否する。

pg-poolがidle errorに付けるclient参照はadapterのdebug前に除去し、native DSNも非列挙とする。DEBUG_SHOW_HIDDENでも資格情報マーカーが出ないことをテストする。native wrapperが捨てるJS接続文字列の前処理には固定loopbackのdummy設定を使い、PGHOST等が明示URIを妨げないようにする。実際の接続先・認証・TLSはlibpqのURIが正本。

## 実行環境と配備境界

Render既存buildはnpm install --include=dev && npm run build、startはnpm start、mainへのmergeでAuto-Deploy。本番設定変更、DB接続、merge/deployは今回未実施。既存mainの稼働を維持する。

公式Render native環境はDebian12とC++/Python/PostgreSQL client toolchainを提供する。実Render hostのheader・native binary・libpqは未検証。build時にnative addonのロードとPATH上pg_config>=13を確認し、不足時は切替前にbuildを失敗させる。pg_configの版は実ロードライブラリ版の直接検査ではないため、両者が同じOSパッケージ組である前提と、本番受入時のruntime検査を残す。

pg-nativeはoptional dependency。Windowsの標準JS開発とunitは維持。Windows native実接続は未確認で、必須bindingの検証はNode22.23.4＋Debian12＋libpq development headers/Python/C++/makeの隔離Linuxで行う。必須bindingを使う開発では同じLinux環境またはnative前提を満たした環境を使用する。Windowsにツールを自動導入しない。

## 検証と再実行

通常はnpm ci、npm test。DB URLなしで生成/build/unitが成功する。Linux native検証環境は公式Node22.23.4-bookworm-slimを基にlibpq-dev python3 g++ make opensslを導入した。固定lockのnpm ciでnative addonをbuild。

DB試験はlocalhostのみの一時Postgres17.6、volumeなし、codex_prisma7_*の合成DBで行う。自己署名CA/keyは専用scratchのみで生成しcommitしない。TCPのpg_hbaはscram-sha-256にし、trustでrequireが拒否されることも初期POCで確認。CAのSANはlocalhost/127.0.0.1。

AGENTSに従いPRISMA_TEST_DATABASE_URL、PRISMA_TEST_SCRATCHを設定する。URLはsslmode=verify-full&channel_binding=require&sslrootcert=<absolute synthetic CA path>を含める。test:tlsにはPRISMA_TEST_CA_PATH、test:bindingには同CAとPRISMA_TEST_TLS_KEY_PATHを設定する。

- npm test: 既存Express、設定境界、deepmerge通常/循環、native query変換、encoding、idle debug非表示を含むunit。
- npm run test:db: 実router CRUD/日時/404/204/transactionと合成dotenvでのproduction entry起動。事前に既存migration2件とsynthetic-prisma6-sentinel（日時2026-01-02T03:04:05.123Z）を隔離DBへ用意。
- npm run test:tls: 未信頼CA拒否/信頼CAでssl=true、同じnative poolでtimeout→release→query成功。hostname不一致は別の合成証明書へ切替しPRISMA_TEST_EXPECT_HOSTNAME_FAILURE=1で試験。
- npm run test:binding: scripted localhost TLS peerがcleartext/MD5/non-PLUS/認証省略を要求。runtime/CLI両方のchallenge到達を確認し、password/proofおよびSQLフレーム0のまま正常な失敗終了を確認。timeout killはPASSにしない。実nativeの無応答worker終了、scalar/JSON/配列/unsupported type、空白URI、PGHOSTに対する明示URI優先も確認。

旧6.19.3のmigration/既存synthetic行→7→旧6で読書き・日時保持を確認し、schema diff0。新migration SQLは不要。正確な最終件数・base/head・review所見はPR本文に記録。実装gpt-6.1-sol、独立レビューgpt-6-astra/high（DB/auth/TLS/秘密ログ/rollback）。

## 配備と復旧

マージと本番反映はユーザーの直前承認を待つ。承認後も既存startへmigrationを追加しない。Renderで対象commit・native build check・runtime起動を確認し、秘密を表示せずhealthとTodo一覧GETだけで本番DB読取を確認する。新規Todoの作成/変更/削除は本番検証に含めない。

障害時は既存Render rollbackで旧main e255ef9013562aa9acac14c091f94b0f9ef0263fの配備へ戻す。DBモデル/列を変えないため逆migrationは不要。ロールバックでは旧deepmerge脆弱性が復活する。資格情報はローテーション済みの設定を保持し、旧値へ戻さない。

公式根拠（2026-11-01）:
- https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- https://node-postgres.com/features/native
- https://github.com/brianc/node-postgres/pull/2941
- https://www.postgresql.org/docs/16/libpq-connect.html
- https://github.com/prisma/prisma-engines/blob/d1b3f377ca835d73fd50954a5e22128b9ebdd6b8/quaint/src/connector/postgres/native/mod.rs
- https://render.com/docs/native-runtimes
