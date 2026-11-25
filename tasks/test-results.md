# Verification record

## Automated and laptop checks

- November 9: production build and TypeScript check passed.
- November 9: all eight tests passed: fee/grace boundaries; Manila date boundaries; gross/void/refund/net reconciliation; persistent issue/payment/refund; concurrent final-space assignment; frozen rates/lost-ticket/void-reopen/closure; PIN lockout/invalid input/cross-origin rejection; concurrent payment/retry/session expiry.
- Tests use an isolated PostgreSQL database which is dropped afterward. They do not reset the presentation database.
- Production dependency audit reported zero known vulnerabilities after the PostCSS override update.
- Browser walkthrough passed kiosk issuance, attendant login, manual lookup, cash payment, receipt and administrator login. No page errors or horizontal overflow at 390px.
- Backup creation and restoration into a separate database succeeded. Exact restored count/total reconciliation remains to be recorded.
- November 10: restarted PostgreSQL and production application. PostgreSQL completed automatic recovery and the API returned 200.
- November 10: HTTPS certificate chain validated using the generated local CA; `/exit` returned 200. Chrome with a 390px viewport loaded HTTPS sign-in with secure context and camera API available, without page errors. That browser check bypassed browser certificate errors; it does not prove Android certificate installation.

## User-confirmed device results

- Android HTTP sign-in loaded over Wi-Fi at `192.168.1.37:3100` after the approved server restart.
- November 11: the screenshot identified Brave's ERR_EMPTY_RESPONSE. Server diagnostics recorded ERR_SSL_HTTP_REQUEST from the phone: plain HTTP was sent to port 3443. Using the full `https://192.168.1.37:3443/exit` address resolved connectivity, confirmed by the user.
- November 11: the user confirmed actual phone camera scanning worked, then confirmed the requested cash-payment walkthrough worked (receipt, laptop space update and refresh checks). This is user-reported device evidence, separate from automated browser checks. The precise certificate-installation steps were not confirmed.

## November 11 exception and recovery checks

- All ten automated tests passed. Added exact lost-ticket fee/retry checks, duplicate-refund protection, partial/full refunds, rejection of over-refunds and voids after refunds, and full-capacity rejection without ticket creation.
- TypeScript and whitespace checks passed. No application runtime source changed in this phase; the browser checks used the existing production build.
- `npm run db:verify-recovery` created a consistent snapshot backup, restored it into `naga_recovery_2c4bf56cc69e`, and matched counts and SHA-256 row-content digests for all nine application tables. Snapshot totals: 60 spaces, 136 sessions, 92 payments; gross PHP 9,070, voids PHP 0, refunds PHP 0, net PHP 9,070.
- Backup: `backups/verified-2026-11-10T16-10-54-324Z.dump`; matching `.verification.json` is beside it. Filenames use the execution host's UTC clock; this entry uses the user's November 11 session date.
- Production browser tests ran on a separate loopback-only server at port 3101 using the restored copy. Full-capacity Car screen, new Other ticket, lost-ticket payment, receipt PDF, partial refund and refund persistence after reload all passed, with no page errors.
- The browser refund assertion initially targeted a hidden filter option, then an incomplete status label. Database/UI inspection confirmed saved refunds; the corrected assertion matched `Partially refunded · Cash` and the full flow passed.
- Receipt output: `docs/sample-lost-ticket-receipt.pdf`. This verifies browser PDF output, not physical printing.
- Rehearsal mutations affected only the restored copy. The live database and phone session were not used for these exception tests. The restored copy now contains additional rehearsal payments and refunds; its original backup remains unchanged.

## November 11 automated rehearsal

- `npm run test:rehearsal` restored a separate database and completed three browser rounds against the production build on loopback port 3102. It stopped its own test server on completion; the main app was not restarted.
- Each round verified ticket issuance, manual ticket lookup in a phone-sized browser, cash payment, receipt screen, matching admin transaction, exactly one payment, space release, and no horizontal overflow.
- Each round stopped the test app, observed the connection-loss banner, restarted the app, observed reconnection, reloaded the administrator page, and confirmed the completed session and single payment persisted. No JavaScript page errors occurred.
- Workflow times: 8.960s, 6.214s and 6.188s. App restart times: 1.951s, 1.957s and 2.111s. Machine-readable results are in `docs/rehearsal-results.json`.
- The first attempt stopped because the ticket appeared in both transaction and activity tables; scoping the assertion to the transaction table resolved the test ambiguity. No app fix was needed.
- These are automated app-process restart tests with PostgreSQL left running. They are not a physical camera scan, database restart, laptop reboot, or human speaking rehearsal.
- `docs/DEFENSE-SCRIPT.md` provides an eight-minute speaking outline, supported answers to panel questions, and blank rows for three actual human rehearsals.

## November 12 reliability implementation

- All 15 existing/expanded automated tests passed, including every declared API command as each of three roles, unchanged state after denied operations, account lifecycle/revocation, kiosk privacy, request deadlines and the prior business scenarios. Two additional preflight configuration/redaction tests passed separately (17 tests total).
- TypeScript checking and production build passed. The production build includes serialized client mutations, 10-second deadlines covering response-body decoding, and rejection of stale polling results.
- The real outage harness passed on its own PostgreSQL cluster, random loopback port and generated test credentials. Ticket issuance, payment and refund were each checked for offline submission, deferred precommit failure, stopped database, dropped postcommit response and safe same-ID retry. Exact state comparisons verified rollback and no duplicate records.
- Account browser checks passed: create staff, required first PIN change, deactivate with active-session removal, reactivate, reset PIN, reload and sign in using the replacement credentials.
- A stalled issuance response exposed an application defect: the kiosk had returned to selection despite an existing saved ticket. The kiosk now retains the pending ticket ID and recovers that exact session after reconnecting. The regression confirms a deadline message, released busy state, restored ticket and one database record.
- The first browser attempt needed a narrower Close-button selector; that was a test ambiguity. The lost-ticket-display failure described above was an application defect and was fixed.
- `npm run thesis:check` passed against the configured database, schema, production build and local TLS certificates. Both running app ports were recognized. Launch-mode checking rejected a duplicate launch without stopping the existing server. Invalid configuration tests confirmed values/password markers were not echoed.
- Startup now checks actual database connectivity before trying to start PostgreSQL and distinguishes unreachable service from a running server with a wrong database/login. No credentials, trust settings or business records were changed by preflight.
- Three post-fix automated rehearsals passed: workflow times 9.367s, 9.488s, 8.985s; app restart times 2.597s, 2.508s, 2.489s. These remain automation timings.
- The main application is running on ports 3100/3443. On this run the active reported LAN address was `192.168.1.3`; the launcher prints current addresses. Test servers and isolated outage clusters were stopped; their gitignored files were retained for diagnosis.
- See `docs/RELIABILITY.md`, `docs/reliability-results.json`, `docs/rehearsal-results.json` and `docs/LAUNCH-RECOVERY-CHECKLIST.md` for reproducible commands and handoff.

## Remaining user-operated acceptance

November 10 print update: production kiosk print preview opened with its QR image loaded and a ticket PDF was saved to `docs/sample-ticket.pdf`; no page errors occurred. Actual QR decoding and receipt/physical printing still need verification. The Car sample section was full, so this check used Other.

- Capture a timed repeat of the successful Android scan/payment workflow for defense evidence.
- Optional, outside the current milestone: actual iPhone Safari if later included in compatibility claims.
- Scan the QR from PDF output; actual printer if confirmed. Ticket and receipt PDF generation have passed.
- Cold-start rehearsal and three timed full demonstrations (backup reconciliation has passed).

The application is not yet certified “100% ready.” Keep hardware and rehearsal claims separate from automated checks.

## November 18, 2026 — balanced upgrade

See [the consolidated verification report](../docs/BALANCED-UPGRADE.md) for failures, fixes, screenshots and current acceptance status. TypeScript and production build passed; 30 business/PostgreSQL tests passed with none skipped; the dependency audit reported zero known vulnerabilities. Quality, report and reliability browser suites passed on isolated data, followed by three successful test-app restart rehearsals. The rendered kiosk QR was decoded through a synthetic camera stream and its track stopped after scanning. Nine administrator pages passed at 1280/390/320px; additional kiosk/attendant phone workflows, keyboard focus, cash/digital recording, corrections and network recovery passed.

Fresh backup restoration matched all nine application tables and preserved the live database. The app was started successfully and laptop HTTP plus LAN HTTPS were verified. Current phone URL: `https://192.168.1.3:3443/exit`; check the launcher again after network changes. Physical Android scanning, an actual laptop reboot and three timed spoken rehearsals remain separate, pending checks; the automated results do not complete them.
