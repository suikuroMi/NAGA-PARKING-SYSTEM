# Balanced upgrade verification

Verification date: November 18, 2026 (Asia/Manila). Work began November 14 and resumed November 18. Target: the existing Next.js/PostgreSQL app on one laptop with one Android exit terminal.

**Automated acceptance passed. The validated app is running.** Physical Android scanning, a user-operated laptop restart and three timed human rehearsals remain pending for this upgrade.

The existing brand, navigation, permissions, `/api/system` contract and database schema are preserved. No live records or credentials were reset. No public deployment, payment gateway, physical-printer integration or GitHub publishing was performed.

## Changes and demonstrated failures

| Failure or gap | Reproduction / impact | Fix and evidence |
|---|---|---|
| Camera test stopped with `__name is not defined` | The TypeScript-transformed synthetic camera function referenced a helper absent in the browser. This prevented scanner validation. | Execute a plain-JavaScript IIFE. Feed it an image of the **rendered kiosk QR**, run the real decoder and verify the captured video track ends after scanning. |
| Camera fixture threw after shutdown | The scanner removed its tracks; the fixture timer still indexed the stream's now-empty track list. | Retain the track reference and stop the fixture timer when it ends. Successful quality runs have no page exceptions. |
| Blocked camera described as missing | Deny camera permission, then start scanning. The QR library can discard the original permission error. | Check permission state and show “Camera blocked” with site-settings and manual-entry guidance. Unsupported permission queries retain the existing fallback. |
| Fractional-centavo refund was enabled | Enter `0.015` with a valid reason/PIN. The client enabled submission, although the server rejected it. | Validate the complete amount, maximum two decimal places and remaining refundable balance before enabling submission. `1.25` saves exactly once. |
| Repaid ticket could select its voided payment | Void/reopen/repay, then open transaction history for that ticket. Records share a checkout time; initial selection used repository order. | Default to the history's payment-time ordering. An explicit selection must belong to the filtered rows. The refund browser test now acts on the current payment. |
| Payment dates and amounts were inconsistently labelled | Attendant recent history and supervisor confirmation displayed checkout time as payment time; correction notes omitted dates. | Use shared timestamp resolution, include estimated provenance, dated corrections and exact centavo displays. Counts identify payment records, including voids; collection totals identify all recorded dates. |
| Narrow-screen overflow | Audit administrator pages at 1280/390/320px; audit kiosk and attendant flows at phone widths. Overflow occurred in cards, rates/settings controls, kiosk header, ticket, assignment badge and ready-to-park panel. | Responsive grids, wrapping labels/buttons, smaller phone padding and QR sizing; wide tables scroll inside cards. Final viewport assertions and screenshots are retained below. |
| Keyboard focus escaped dialogs / menus | Tab through a dialog, use the mobile navigation and close with Escape. | Native modal dialogs with explicit Tab boundaries and focus restoration; mobile navigation isolation; keyboard controls for attendant and station menus; working skip links. |
| Reliability account selector was ambiguous | The harness searched while creation was still completing, then matched several “Manage” buttons. | Wait for the creation dialog to close and scope Manage to the named staff row. The complete account lifecycle passes after this harness fix. |

Other retained regression fixes cover integer-centavo fee/change calculations, five-or-more-digit ticket sequences, multi-letter slot blocks, renewed supervisor checkout review windows, malformed request envelopes returning 400, and cached payment retries while another checkout has expired. Styles use local/system fonts, visible keyboard focus, reduced-motion rules and larger touch targets. Existing loading, offline and uncertain-outcome handling remains server-confirmed.

## Protection and recovery

The configured PostgreSQL cluster was started in place. PostgreSQL reported recovery from an unclean prior shutdown and then became ready. No initialization or replacement of the demonstration cluster was performed.

`npm run db:verify-recovery` created `backups/verified-2026-11-18T01-53-49-711Z.dump` and restored `naga_recovery_09fe10f6f52d`. All nine application-table hashes matched the backup snapshot. Its verification JSON is beside the dump. The live database was unchanged: 60 slots, 137 sessions, 94 payments, gross/net PHP 9,830.00, no void or refund amounts. The restored copy is retained.

Destructive outage tests use a separately initialized PostgreSQL cluster under `.runtime/reliability-*` on a random loopback port. Only that test cluster is stopped. Other browser suites use separate `naga_rehearsal_*` databases. Browser suites run sequentially on port 3102. Diagnostic files and retained test copies are kept separate from live records and excluded from Git where appropriate.

## Automated results

| Check | Result / evidence |
|---|---|
| TypeScript | `npx tsc --noEmit --incremental false` passed. |
| Production | `npm run build` passed; Next.js 15.5.28, including the final station-menu keyboard changes. A subsequent TypeScript check also passed. |
| Business / PostgreSQL tests | `npm test`: **30 passed, 0 failed, 0 skipped**. Includes every declared API command across roles, account revocation, kiosk privacy, concurrent allocation/payment, retries, financial corrections and reporting boundary cases. |
| Dependency audit | `npm audit --json`: **0 known vulnerabilities**, including development dependencies, at the time checked. This is a package advisory check, not a guarantee against every security defect. |
| Browser quality | [quality-results.json](quality-results.json): all nine admin pages at three widths; kiosk/attendant phone layouts; modal/menu focus; QR decode and camera stop; camera denial/manual lookup; expired quote recovery; invalid cash/refund amounts; cash/digital payments; supervisor void/reopen/repay; reconnect; no page exceptions or external font requests. |
| Reliability | [reliability-results.json](reliability-results.json): ticket/payment/refund offline before submission, rollback before commit, real test-database stop, lost response after commit and same-ID retry; staff lifecycle; stale poll protection; ten-second deadline and late-response recovery. |
| Reports | [reporting-results.json](reporting-results.json): screen/CSV/print reconciliation, fixed export snapshot while polling changes, presets, invalid/empty dates, legacy timestamp provenance. Fixture: 120 payment records, 40 estimated times; gross PHP 1,332.00 − voids PHP 10.10 − refunds PHP 0.30 = net PHP 1,321.60. |
| PDF | [Nine-page A4 landscape sample](reporting-evidence/sample.pdf), [CSV](reporting-evidence/sample.csv). Rendered pages visually inspected; table headers repeat on payment continuation pages; no application navigation. |
| Automated restarts | **3/3 passed**: [rehearsal-results.json](rehearsal-results.json). Workflow times 8.847s / 9.286s / 8.797s; test-app restart times 2.097s / 2.243s / 2.252s. Every round retained exactly one payment, released its space, displayed the outage/reconnect state and recovered saved records without page exceptions. These are automated test timings, not human presentation timings. |
| Backup restoration | Verified all nine tables against the consistent snapshot; main database unchanged. |

Expected error logs during outage tests include injected precommit failure, connection refusal and PostgreSQL starting up. These are deliberate failure scenarios. Successful browser suites assert no unhandled page exceptions. Test failures above were investigated rather than counted as passing.

Screenshots: [Reports at phone width](quality-evidence/after-reports.png), [settings](quality-evidence/after-settings.png), [transaction history](quality-evidence/after-transactions.png), [rates at 320px](quality-evidence/after-rates.png), [kiosk ticket at 320px](quality-evidence/kiosk-ticket-320.png), [cash confirmation](quality-evidence/phone-payment.png), [camera-denied guidance](quality-evidence/camera-denied.png). Older `quality-before.json`, `quality-initial.json` and failure screenshots are intermediate diagnostics, not a pristine original-design baseline.

## Launch and remaining presentation checks

Use `START-PARKING.cmd`, or run `npm run thesis:start`. Keep the server window/process running. `npm run thesis:check` is read-only and identifies database, build, port and certificate problems without printing credentials or stopping unrelated processes.

Current preflight address: laptop `http://localhost:3100/kiosk`, admin `http://localhost:3100/admin`, Android `https://192.168.1.3:3443/exit`. The certificate covers the current address and is valid through December 28, 2026; the CA through January 7, 2027. Always use the URL printed by the current launcher because network addresses can change. Device certificate trust remains user-managed.

Final launch: `npm run thesis:start` succeeded. A subsequent preflight correctly identified the already-running app on both ports. Laptop kiosk/admin/exit returned HTTP 200; the LAN HTTPS exit returned 200 with certificate-chain and IP validation enabled. This verifies access from the laptop, not a fresh physical-phone connection.

Automated scanning uses a canvas camera stream in Chrome. It validates the real decoder and rendered QR but cannot establish physical Android camera focus, lighting, browser trust or Wi-Fi reachability after a real reboot.

Before declaring presentation acceptance complete:

1. Scan a laptop-displayed QR using the actual Android phone and complete one payment; verify the laptop record and released space.
2. Perform the user-operated shutdown/startup checklist in [LAUNCH-RECOVERY-CHECKLIST.md](LAUNCH-RECOVERY-CHECKLIST.md), including finding a previously saved payment.
3. Complete and time three spoken runs of [DEFENSE-SCRIPT.md](DEFENSE-SCRIPT.md), filling its human rehearsal log. Automated restart timings do not replace these runs.

Reporting definitions for the defense remain in [REPORTING.md](REPORTING.md). Payments use Asia/Manila payment dates; subsequent refunds/voids revise the original payment period. Completed sessions are distinct and currently completed; live occupancy is separate from period totals. Digital payments are manually recorded confirmations, not gateway transfers.
