# Reliability validation

## Commands

| Command | Purpose |
|---|---|
| `npm test` | PostgreSQL business tests, complete command/role matrix, account lifecycle, privacy, billing/reporting and request-deadline tests. Creates and drops its own test database. |
| `npm run test:reliability` | Fresh loopback-only PostgreSQL cluster; real outages, deferred precommit failures, dropped postcommit responses, account screens, stale polling and issuance recovery. Stops its own server and database afterward. |
| `npm run test:rehearsal` | Three production-browser workflows and app restarts on a restored copy. |
| `npm run thesis:check` | Read-only readiness diagnostic. |

Browser commands require Chrome and Playwright. If Playwright is installed outside normal Node resolution, set `PLAYWRIGHT_MODULE` to that module's path. Reliability tests also need the PostgreSQL binaries configured in `PG_BIN` and an existing production build. They use dedicated test PINs and do not use or alter the live accounts.

The outage harness initializes a distinct PostgreSQL data directory under `.runtime/reliability-*` with its own random password, random loopback port and `naga_rehearsal_*` database. It stops only that cluster. Files remain gitignored for failure diagnosis; no recursive cleanup of existing directories occurs. `docs/reliability-results.json` records the successful checks.

## Permission contract

- Kiosk commands (`claimSlot`, `releaseClaim`, `issueTicket`) are available to all three roles.
- Administrative commands are restricted to administrators. Exit commands are restricted to the attendant identity and remain subject to terminal/account state.
- Sign-in and logout endpoints are accessible across roles; credentials are still verified. `touchAdmin` requires administrator authentication.
- Tests enumerate every declared command and fail if an argument case is missing. Each denied request must return 403 and preserve the business state. A permitted request can still return a domain rejection when its target does not exist or another business rule prevents it.
- Tests verify logout, PIN reset, account disabling and forced sign-out revoke old attendant sessions. Administrator PIN changes revoke other administrator sessions. Locked or expired sessions cannot operate the terminal.
- Client responses blank credential hashes and salts. Kiosks cannot read another device's sessions, payment history or audit records.

## Recovery contract

The client applies a 10-second deadline to response headers and JSON decoding. Mutations are serialized per browser; polling started before a mutation cannot overwrite its confirmed state. Network failures retain the request ID for retry. Validation/permission errors remain distinct from connection loss.

The harness checks ticket issuance, payment and refund under four conditions: no network before submission, deferred failure before commit, actual database unavailability, and a committed operation whose response is dropped. Successful retry must preserve one intended record and consistent space/payment state.

A demonstrated defect was fixed: the kiosk now retains the ticket ID being issued and recovers that exact saved session after an uncertain response. It no longer returns to vehicle selection when the server already issued the ticket.

No API wire-format or database-schema migration was needed. No public deployment or GitHub publishing is included. Full laptop reboot and human presentation rehearsal remain separate acceptance steps in `LAUNCH-RECOVERY-CHECKLIST.md`.
