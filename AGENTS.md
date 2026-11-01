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
- CLI datasource lives in `prisma.config.ts`. Runtime uses the official pg adapter; mandatory channel binding uses pg-native/libpq through its public nativeConnectionString API. Keep Todo model and existing migration SQL unchanged for this dependency-only migration. `npm start` does not execute migrations; do not add automatic production migration.
- `npm run db:check-config` validates the current environment without connecting or printing the URL. Only run it on the intended environment. Never print credentials or send real `.env` values to a reviewer.
- Isolated DB tests: set PRISMA_TEST_DATABASE_URL to a loopback database named `codex_prisma7_*`; set PRISMA_TEST_SCRATCH to a dedicated absolute scratch directory; `npm run test:db`. `npm run test:tls` additionally requires PRISMA_TEST_CA_PATH (an absolute synthetic CA path). These tests write synthetic rows; never supply a real database.
- Keep `channel_binding=require` intact. Use native/libpq for that setting; never fall back to JS authentication if native prerequisites are absent. Node is pinned in .node-version. Render build checks native addon loading and pg_config >=13 before deployment; actual Render host/runtime and production UAT still require approval/verification.
- Native validation requires libpq development headers, Python and a C++ toolchain (Debian: libpq-dev python3 g++ make). Windows default JS development remains usable; Windows native binding has not been verified. Run the mandatory-binding suite in the documented Linux environment.
- `npm run test:binding` also requires synthetic PRISMA_TEST_TLS_KEY_PATH and PRISMA_TEST_CA_PATH, plus isolated PRISMA_TEST_DATABASE_URL and PRISMA_TEST_SCRATCH. Tests include a scripted localhost TLS peer; never point test fixtures at production credentials.
