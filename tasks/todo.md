# Thesis readiness tasks

Status: implementation and validation in progress. Server persistence, authentication, core parking and correction workflows, reports, HTTPS and backup tooling are implemented. Checkboxes below are full acceptance gates, not implementation status; unchecked gates still require their listed evidence. See `test-results.md` for verified results.
Confirmed target: laptop-hosted Next.js/PostgreSQL plus a phone exit terminal. Screen QR and receipt/PDF are the initial output; printer integration is conditional. Test laptop-to-phone connectivity and camera access early during task 2. First functional milestone is laptop ticket issuance → phone scan/payment → laptop dashboard update → records survive reload.
Scheduling target: earliest presentation December 1, 2026; functional readiness November 28, followed by November 29–30 stabilization/rehearsal. Target Android Chrome and iPhone Safari; record actual device testing separately from browser emulation. Reassess the schedule after the first live database milestone.
Shared completion gate: relevant automated tests pass, affected behavior is exercised, and `npm run build` succeeds at phase checkpoints. Split any larger file group into focused batches before implementation.

## 1. Confirm thesis scope

- [ ] Complete this task.
- **Dependencies:** None.
- **Acceptance:** Map each approved objective to a demonstration scenario; decide devices and payment/printing scope.
- **Verification:** Review the feature-to-evidence matrix with the user's thesis objectives.
- **Likely files:** tasks/plan.md; tasks/requirements.md.
- **Scope:** Small documentation/tooling task.

## 2. Make PostgreSQL setup reproducible

- [ ] Complete this task.
- **Dependencies:** 1.
- **Acceptance:** A fresh local database initializes successfully; migration and sample-data operations are separate; environment loading is documented.
- **Verification:** Initialize a disposable database twice and confirm existing records are preserved.
- **Likely files:** scripts/setup-db.js; schema.sql; .env.example; README.md.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 3. Prepare recoverable demonstration data

- [ ] Complete this task.
- **Dependencies:** 2.
- **Acceptance:** Normal/overtime/full-capacity fixtures are repeatable; reset is limited to a designated demo database; backup restores successfully.
- **Verification:** Restore to a fresh database and compare record counts and financial totals.
- **Likely files:** scripts/seed-demo.js; scripts/backup-db.*; tasks/demo-data.md.
- **Scope:** Small documentation/tooling task.

### Checkpoint after task 3

- [ ] Relevant tests and build pass.
- [ ] All preceding required acceptance criteria are demonstrated.
- [ ] Record remaining defects and evidence before the next phase.

## 4. Implement server sign-in

- [ ] Complete this task.
- **Dependencies:** 2.
- **Acceptance:** Credentials are hashed server-side; sessions expire and log out; repeated failed sign-ins are limited.
- **Verification:** Exercise valid/invalid login, expiration and logout against PostgreSQL.
- **Likely files:** migrations/*auth*; lib/auth.ts; app/api/auth/*; scripts/*account*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 5. Enforce roles on APIs

- [ ] Complete this task.
- **Dependencies:** 4.
- **Acceptance:** Admin, attendant and kiosk permissions are explicit; administrative setup/reset endpoints are restricted; unauthorized requests cannot mutate data.
- **Verification:** Call each endpoint as anonymous and each role; verify allowed/denied results.
- **Likely files:** lib/authorization.ts; app/api/*/route.ts (split into batches of at most 5 files).
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 6. Connect sign-in and account screens

- [ ] Complete this task.
- **Dependencies:** 4,5.
- **Acceptance:** UI uses server sessions; staff creation/reset/disable persists; disabled accounts lose access.
- **Verification:** Reload and sign in from a second browser after each account change.
- **Likely files:** admin/AdminGate.tsx; exit/ExitGate.tsx; admin/AttendantsPage.tsx; lib/api.ts; store/store.ts.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

### Checkpoint after task 6

- [ ] Relevant tests and build pass.
- [ ] All preceding required acceptance criteria are demonstrated.
- [ ] Record remaining defects and evidence before the next phase.

## 7. Persist claims and issue tickets atomically

- [ ] Complete this task.
- **Dependencies:** 2,5.
- **Acceptance:** Two kiosks cannot reserve the same space; abandoned reservations expire; retrying issuance does not create another ticket.
- **Verification:** Run concurrent requests against the last compatible slot and retry the successful request.
- **Likely files:** migrations/*claims*; app/api/tickets/route.ts; store/store.ts; kiosk/Kiosk.tsx; tests/*allocation*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 8. Freeze rates and unify billing rules

- [ ] Complete this task.
- **Dependencies:** 2,5.
- **Acceptance:** Existing sessions retain issue-time rates; duration/grace/rounding rules are explicit; invalid rates are rejected.
- **Verification:** Test fee boundaries and change rates between ticket issue and checkout.
- **Likely files:** migrations/*rates*; app/api/rates/route.ts; app/api/tickets/route.ts; store/logic.ts; tests/*fees*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 9. Complete persistent checkout

- [ ] Complete this task.
- **Dependencies:** 6,7,8.
- **Acceptance:** Server totals are authoritative; duplicate/retried payment is safe; included provider/reference details survive reload.
- **Verification:** Pay from two clients concurrently, retry after a simulated lost response and verify one transaction.
- **Likely files:** app/api/checkout/route.ts; migrations/*payment*; lib/api.ts; store/store.ts; exit/Exit.tsx.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 10. Synchronize clients and handle outages

- [ ] Complete this task.
- **Dependencies:** 7,9.
- **Acceptance:** Admin/exit/kiosk views refresh without clearing ongoing work; outage blocks unsaved actions with retry; demo mode is explicit.
- **Verification:** Use two clients, interrupt the database connection and verify no false success or silent fallback.
- **Likely files:** app/api/records/route.ts; lib/api.ts; store/store.ts; ParkingApp.tsx; tests/*sync*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

### Checkpoint after task 10

- [ ] Relevant tests and build pass.
- [ ] All preceding required acceptance criteria are demonstrated.
- [ ] Record remaining defects and evidence before the next phase.

## 11. Persist lost-ticket checkout

- [ ] Complete this task.
- **Dependencies:** 8,9.
- **Acceptance:** Eligible sessions can be matched; configured fee is applied once; actor/reason appear in persistent records.
- **Verification:** Reload after lost-ticket payment and verify receipt and report totals.
- **Likely files:** migrations/*lost-ticket*; app/api/checkout/route.ts; store/store.ts; exit/LostTicket.tsx; tests/*lost-ticket*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 12. Persist refunds

- [ ] Complete this task.
- **Dependencies:** 5,9.
- **Acceptance:** Authorized refunds cannot exceed the remaining payment; retries do not duplicate refunds; originals remain auditable.
- **Verification:** Test partial/full/refused/duplicate refunds and reconcile net amounts.
- **Likely files:** migrations/*corrections*; app/api/refunds/route.ts; store/store.ts; admin/CorrectionModal.tsx; tests/*refunds*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 13. Persist void and reopen

- [ ] Complete this task.
- **Dependencies:** 5,9,12.
- **Acceptance:** Voids preserve original transactions; reopening checks slot availability; concurrent reassignment prevents invalid reopening.
- **Verification:** Race reopening against reassignment and verify consistent slot/session state.
- **Likely files:** app/api/voids/route.ts; store/store.ts; exit/SupervisorOverride.tsx; admin/CorrectionModal.tsx; tests/*voids*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 14. Persist administrative session closure

- [ ] Complete this task.
- **Dependencies:** 5,8.
- **Acceptance:** Authorized closure records reason and uncollected amount; no payment is fabricated; the slot is released once.
- **Verification:** Close an eligible session and verify audit, reports and duplicate-request behavior.
- **Likely files:** app/api/sessions/route.ts; store/store.ts; admin/EndSessionModal.tsx; migrations/*closures*; tests/*closures*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 15. Finish spaces and device settings

- [ ] Complete this task.
- **Dependencies:** 5,6.
- **Acceptance:** Adding spaces and updating settings persist; occupied slots cannot be reassigned; validation errors are visible.
- **Verification:** Reload and compare two clients after valid and invalid edits.
- **Likely files:** app/api/slots/route.ts; app/api/settings/route.ts; admin/SlotPages.tsx; admin/SettingsPage.tsx; store/store.ts.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 16. Reconcile audit and reports

- [ ] Complete this task.
- **Dependencies:** 9,11,12,13,14.
- **Acceptance:** Audit captures actor/time/reason; reports distinguish gross/refunds/voids/net; date filters and exports agree.
- **Verification:** Compare known fixture totals with database queries and exported report totals.
- **Likely files:** app/api/records/route.ts; admin/TransactionsPage.tsx; admin/OverviewPages.tsx; admin/adminLogic.ts; tests/*reports*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

### Checkpoint after task 16

- [ ] Relevant tests and build pass.
- [ ] All preceding required acceptance criteria are demonstrated.
- [ ] Record remaining defects and evidence before the next phase.

## 17. Verify scanner input

- [ ] Complete this task.
- **Dependencies:** 7,10.
- **Acceptance:** A real displayed/printed QR scans; invalid and already-paid tickets are handled; manual input works if camera permission is denied.
- **Verification:** On the actual phone, scan a QR displayed on the laptop through the planned local network and trusted HTTPS setup; also exercise denied camera permission and manual ticket entry.
- **Likely files:** exit/CameraScanner.tsx; exit/Exit.tsx; store/logic.ts; tests/*scanning*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 18. Implement ticket and receipt output

- [ ] Complete this task.
- **Dependencies:** 9,11.
- **Acceptance:** Ticket QR and receipt details fit the chosen page; reprints are labeled; failures do not issue tickets or charge again.
- **Verification:** Print-to-PDF and scan the output; test the physical printer if included in thesis scope.
- **Likely files:** lib/printer.ts; kiosk/Kiosk.tsx; exit/Exit.tsx; app/globals.css; tests/*printing*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 19. Check usability on presentation devices

- [ ] Complete this task.
- **Dependencies:** 6,10,16,17,18.
- **Acceptance:** Target resolutions have no clipped controls; loading/errors/empty states work; keyboard navigation and readable contrast are checked.
- **Verification:** Run laptop kiosk/admin and phone exit simultaneously; verify readable controls, cross-device updates, reload and connection recovery.
- **Likely files:** kiosk/*; exit/*; admin/* (small batches); tests/*ui*.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

### Checkpoint after task 19

- [ ] Relevant tests and build pass.
- [ ] All preceding required acceptance criteria are demonstrated.
- [ ] Record remaining defects and evidence before the next phase.

## 20. Run real database end-to-end tests

- [ ] Complete this task.
- **Dependencies:** 3,10,11,12,13,14,15,16,17,18,19.
- **Acceptance:** Happy path and exception scenarios pass on isolated PostgreSQL; concurrent/retry tests pass; restart preserves records.
- **Verification:** Run production build, automated tests and the presentation acceptance scenario.
- **Likely files:** tests/e2e/*; package.json; tasks/test-results.md.
- **Scope:** Medium feature slice; split migrations and route batches if needed.

## 21. Prepare defense evidence and rehearse

- [ ] Complete this task.
- **Dependencies:** 20.
- **Acceptance:** Diagrams match implemented behavior; launch/restore instructions work; three complete rehearsals pass with actual evidence.
- **Verification:** Rehearse from a cold start; time the walkthrough; verify backup recording and restoration.
- **Likely files:** tasks/demo-script.md; tasks/requirements.md; docs/*; tasks/rehearsal.md.
- **Scope:** Small documentation/tooling task.

### Checkpoint after task 21

- [ ] Relevant tests and build pass.
- [ ] All preceding required acceptance criteria are demonstrated.
- [ ] Record remaining defects and evidence before the next phase.
