# Repository Working Agreements

## Common development principles

Read the existing canonical rules at `C:/Users/yutaz/dev/repo-templates/AGENTS.md.global` before changes. The canonical file contains the verified shared safety, validation, review, and Git workflow principles. If the checkout is elsewhere and this path is unavailable, locate the existing repo-templates checkout or report the missing source; do not invent its contents.

The former machine-local shared memo has not been recovered. Its additional content is pending inspection on the old PC; this reference repair does not claim to reconstruct that memo.

## Windows and WSL clones

- Do not modify the Windows clone and the WSL clone at the same time.
- Confirm which clone is the current working copy before changes.
- Keep dependencies and generated files separate for each clone.

## Prisma 7 / PostgreSQL（2026-11-01）

- npm lock is canonical. Node >=22.12 <23; `npm ci`, `npm test` (generate + TypeScript build + offline unit tests). No DATABASE_URL is needed for generation/build/tests.
- Prisma Client is generated to ignored `src/generated/prisma`; `npm run build` regenerates before tsc. Do not commit generated clients or load real environment files for tests.
- CLI datasource lives in `prisma.config.ts`. Runtime uses the official pg adapter. Keep Todo model and existing migration SQL unchanged for this dependency-only migration. `npm start` does not execute migrations; do not add automatic production migration.
- `npm run db:check-config` validates the current environment without connecting or printing the URL. Only run it on the intended environment. Never print credentials or send real `.env` values to a reviewer.
- Isolated DB tests: set PRISMA_TEST_DATABASE_URL to a loopback database named `codex_prisma7_*`; set PRISMA_TEST_SCRATCH to a dedicated absolute scratch directory; `npm run test:db`. `npm run test:tls` additionally requires PRISMA_TEST_CA_PATH (an absolute synthetic CA path). These tests write synthetic rows; never supply a real database.
- Current production compatibility HOLD: Render's URL has `channel_binding=require`. pg8.23.1 cannot enforce that requirement through its supported public API. Keep fail-closed rejection; do not remove/ignore the option, weaken it to prefer, patch auth internals, merge, or deploy this candidate until a reviewed compatible driver/configuration is established.
