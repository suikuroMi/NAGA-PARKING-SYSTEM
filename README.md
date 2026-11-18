# Naga Smart Parking

Next.js and PostgreSQL parking system using the edited Desktop interface. The laptop hosts the app and database; a phone operates the exit terminal over the same network.

## Setup and launch

Use Node.js 24 and PostgreSQL. Configure `.env.local` from `.env.example` with DATABASE_URL, INITIAL_ADMIN_PIN and INITIAL_PIN_ATT_001 through INITIAL_PIN_ATT_004 (choose four-digit PINs).

```powershell
npm ci
npm run db:setup
npm test
npm run build
npm run thesis:start
```

`db:setup` creates an empty facility. For sample records in a new, separate presentation database use `npm run db:demo` instead. Both commands preserve an initialized facility. The database must already exist. Tests require permission to create disposable databases.

On this prepared laptop, environment settings already exist. Private initial sign-in details are in the gitignored `LOCAL-ACCESS.txt`. Do not share that file or expose it in presentation screenshots.

Open `http://localhost:3100/kiosk`, `/exit`, or `/admin`. The launcher starts the configured local PostgreSQL installation and production app. For independently managed PostgreSQL, use `node scripts/serve.cjs` instead. Development: `npm run dev -- --hostname 0.0.0.0 --port 3100`.

The phone uses the laptop's Wi-Fi address. Camera scanning requires trusted HTTPS. Run `npm run https:setup` and restart the production server to enable port 3443. See [presentation guide](docs/PRESENTATION.md).

## Current behavior

- PostgreSQL stores slots, claims, sessions, rate snapshots, payments, refunds, voids, closures, staff, settings and audit records.
- PIN hashes and expiring cookie sessions are server-side. Roles and login limits are enforced by the API.
- Database transactions serialize allocation and checkout. Request IDs protect retries. Database outages do not switch to browser-only demo records.
- Digital payments record an externally verified GCash/Maya reference; there is no payment gateway integration.
- Reports select payments by Asia/Manila payment date and apply their current corrections. They are not a cash-movement ledger by refund date.
- Printing uses the browser dialog or Save as PDF. Physical printer operation must be verified on the actual device.

## Architecture and checks

See [the balanced-upgrade verification report](docs/BALANCED-UPGRADE.md) for November 18 results, demonstrated fixes, screenshots, backup evidence and the remaining physical presentation checks. `npm run test:quality` checks the production interface, keyboard behavior, phone layouts and synthetic-camera decoding against isolated data. `npm run test:reports` reconciles screen/CSV/PDF outputs. Run all browser suites sequentially because they share test-server port 3102; set `PLAYWRIGHT_MODULE` to an available Playwright package when needed.

The active API is `app/api/system/route.ts`; the active schema is `server/schema.sql`. Legacy API routes return 410. The old root schema and legacy checkout test are not the current setup or acceptance tests.

`server/engine.ts` implements commands; `server/repository.ts` persists changed records. A configuration-row lock serializes facility mutations. This version supports one shared exit terminal: a new attendant sign-in replaces the prior attendant session.

Run `npm test` for isolated real-PostgreSQL tests, `npx tsc --noEmit` for type checking and `npm run build` for the production build. Real phone/printer verification is separate from browser emulation.

For three automated production-browser rehearsals, run `npm run test:rehearsal` after creating a verified backup. This needs Chrome and Playwright; set `PLAYWRIGHT_MODULE` to an installed Playwright module path if it is not available through normal Node resolution. The script restores a new database, uses loopback port 3102, and restarts only its own test app process. It retains the rehearsal database and writes `docs/rehearsal-results.json`. It uses manual ticket entry in a phone-sized browser, not a physical camera. Initial PINs in `.env.local` must still match the backed-up accounts.

Use [the defense script](docs/DEFENSE-SCRIPT.md) to practice the actual spoken presentation. Automated timings are not human presentation timings or a laptop reboot test.

Run `npm run thesis:check` for a read-only readiness check. See [launch and recovery checklist](docs/LAUNCH-RECOVERY-CHECKLIST.md) for startup failures and the remaining user-operated reboot test. See [reliability validation](docs/RELIABILITY.md) for permission, account and real database-outage testing with `npm run test:reliability`.

## Backup and recovery

```powershell
npm run db:backup
npm run db:restore-test -- "backups/parking-TIMESTAMP.dump"
npm run db:verify-recovery
```

Restore-test creates a new database without overwriting the active one. To use it, stop the app, change only the database name in `.env.local`, then restart and verify the records. Preserve the original database until verification. Backups, credentials and TLS private keys are gitignored.

`db:verify-recovery` creates its own consistent backup, restores a separate copy, and checks all nine application tables and payment totals against the original snapshot. It leaves a verification report beside the dump. See [exception rehearsal](docs/EXCEPTION-REHEARSAL.md) for lost-ticket, refund and full-capacity demonstrations.
