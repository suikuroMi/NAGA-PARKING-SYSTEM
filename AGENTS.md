# Naga Smart Parking

This repository now contains the Next.js/PostgreSQL parking system. The prior Vite/Figma Make implementation remains in Git history.

## Active application

- `App.tsx` loads `ParkingApp.tsx`; Next.js routes are under `app/`.
- `kiosk/`, `exit/` and `admin/` contain the three station interfaces.
- `app/api/system/route.ts` is the active API. Legacy API routes return 410.
- `server/engine.ts`, `server/access.ts` and `server/validation.ts` implement authorized commands.
- `server/repository.ts` persists state; `server/schema.sql` is the active schema.
- `store/reporting.ts` shares reporting calculations across screens and exports.
- Global production styles are in `app/globals.css`; use the existing Tailwind v4 theme and system fonts.

## Development and checks

Use Node.js 24, npm and PostgreSQL. Configure private values using `.env.local` and the placeholders in `.env.example`. Never commit credentials, TLS private keys, database dumps or `.runtime/` files.

Run `npx tsc --noEmit --incremental false`, `npm test` and `npm run build` for code validation. Tests require PostgreSQL and create isolated test databases. Run browser suites sequentially because they share port 3102: `test:quality`, `test:reports`, `test:reliability` and `test:rehearsal`. They require Chrome and Playwright; `PLAYWRIGHT_MODULE` can point to an available Playwright package. The rehearsal also requires a verified backup.

`npm run thesis:check` checks readiness without changing records. `npm run thesis:start` starts the configured database and production app. Do not assume a server is already running or that yesterday's phone IP still applies.

Preserve the working demonstration database and credentials. Use isolated data for destructive tests; stop only the test cluster created by the test. Do not initialize or reset the demonstration cluster to fix a connection problem.

## Scope and evidence

The supported demonstration uses one laptop, Android and one shared exit terminal. Digital payments are manually confirmed records, not payment-gateway transfers. Reporting uses Asia/Manila payment dates; later corrections revise the original period. See `docs/REPORTING.md` for definitions.

Current validation and remaining human checks are in `docs/BALANCED-UPGRADE.md`. Browser emulation and automated app restarts do not substitute for physical phone scanning, a user-operated laptop reboot or timed spoken rehearsals.
