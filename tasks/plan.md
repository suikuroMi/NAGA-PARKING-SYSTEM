# Thesis presentation readiness plan

Status: proposed; user confirmed one laptop, a phone (Android/iPhone compatibility requested), and a working PostgreSQL-backed system with realistic parking workflows. Presentation is tentatively the first week or middle of December 2026. Plan against December 1 as the earliest date; printer availability and exact presentation date remain pending.
Scope: preserve GitHub's Next.js/PostgreSQL architecture and complete the imported Desktop workflows.
Implementation is underway. See `test-results.md` for current evidence and remaining device checks.

## Completion target

“Ready” means every feature included in the thesis demonstration has working persistence, role enforcement and repeatable acceptance tests. A successful build alone does not establish readiness. Real facility deployment would require a separate operational assessment.

Current baseline (November 12): PostgreSQL workflows, server authentication, exception handling, reporting, verified backup recovery and local HTTPS are implemented. Android scanning/payment was confirmed by the user. Seventeen automated tests, the separate-cluster outage/browser suite, three post-fix app-restart rehearsals, TypeScript and the production build passed. The reliability phase added deadlines, stale-response protection, ticket recovery and startup diagnostics. Full laptop reboot and three spoken rehearsals remain user-operated acceptance steps; iPhone and physical printing are outside the current milestone. See `test-results.md` for evidence and limitations.

## Architecture and behavior decisions

- PostgreSQL is authoritative for slots, claims, sessions, rate snapshots, transactions, corrections, accounts and audit events.
- Retain Next.js routes and the edited interface; replace local business mutations one complete workflow at a time.
- Use server authentication and role checks for administration and attendants, with a separately constrained kiosk identity. Browser PIN gates cannot authorize API requests.
- Keep a separate, explicitly selected demonstration dataset. In normal mode, database outages show an unavailable/retry state instead of automatically becoming a working browser-only simulation.
- Freeze a session's rates when issuing its ticket. Server-side checkout determines the amount and handles retries without duplicate charges.
- Persist payment provider/reference details if digital-payment recording remains in scope. Treat manual verification as manual recording; do not claim gateway verification without an implemented integration.
- Presentation target: the laptop hosts the Next.js production build and PostgreSQL. The phone connects to the same application over a tested local network. Validate network reachability and trusted HTTPS/camera access on the actual phone early, before relying on it in the demonstration.
- Start with browser print layouts and print-to-PDF. Thermal printer integration is conditional on the model and connection available.
- Keep the current design; prioritize functional gaps, understandable errors and presentation legibility over a redesign.

## Confirmed equipment and proposed roles

| Device | Proposed demonstration role |
|---|---|
| Laptop | Hosts application/database; displays kiosk QR ticket and administration dashboard in separate tabs |
| Phone | Runs the attendant exit terminal; scans the QR displayed on the laptop and confirms payment |
| Printer, if confirmed | Produces a physical ticket/receipt using a tested print layout |

The phone is a second client of the laptop-hosted system, not an independent local-storage demo. A phone payment must update the laptop dashboard and persist after both clients reload. No dedicated QR scanner or laptop webcam is assumed.

Printing does not block the initial milestone: show the ticket on screen and provide a receipt preview/PDF. Physical printing becomes an acceptance requirement if the thesis scope or confirmed equipment requires it. Do not claim a PDF demonstrates a physical printer.

First milestone: start real PostgreSQL on the laptop, connect the phone, issue a ticket on the laptop, scan and pay on the phone, and verify the released space and persisted transaction on the laptop. Test phone connectivity and camera permissions during database setup; complete billing and authorization before accepting the milestone.

## Delivery sequence

### Target schedule (proposed, not a completion guarantee)

- November 7–13: establish real PostgreSQL, reproducible setup, laptop-to-phone connectivity and server authentication foundations. Test camera access on available Android/iPhone hardware early.
- November 14–20: complete and test ticket issuance, stable pricing, payment, receipts and cross-device updates against PostgreSQL.
- November 21–25: finish the approved management/exception workflows and reporting; run database integration and concurrency tests.
- November 26–28: fix presentation-blocking defects, prepare diagrams/test evidence and rehearse the complete scenario.
- November 29–30: freeze the demonstrated feature set, verify backup/restore and finish three successful rehearsals. Reserve these days for fixes rather than new features.
- December 1 onward: presentation-ready target. If the date is mid-December, use the extra time for fixes, equipment verification and rehearsal rather than expanding scope automatically.

Review feasibility after the first real database end-to-end milestone. If required work exceeds the available time, surface the gap and agree on thesis scope; do not silently drop required features or describe untested features as ready.

| Phase | Deliverable | Exit condition |
|---|---|---|
| 1. Scope and database | Agreed feature checklist, reproducible PostgreSQL setup, migrations and isolated demo fixtures | Clean setup and backup/restore verified against a real database |
| 2. Identity and roles | Server login, role restrictions, persisted attendant management | Direct unauthorized API calls fail; account changes survive restarts |
| 3. Parking and payment | Concurrent slot allocation, real QR lookup, stable pricing and durable checkout | Two clients complete entrance-to-exit without double allocation/payment |
| 4. Management and exceptions | Lost tickets, refunds, void/reopen, session closure, slots, settings, audit and reports | Every included action persists and reports reconcile |
| 5. Equipment and usability | Camera/manual scan, ticket/receipt output, responsive screens, recovery behavior | Demonstration hardware and target screen sizes pass |
| 6. Defense preparation | Production launch procedure, reproducible scenario, evidence and backup | Three consecutive complete rehearsals pass |

The ordered, actionable work is in [todo.md](todo.md). Checkpoints are test gates, not claims of completion.

## Acceptance scenario for the presentation

1. Start the application and database from a documented command sequence.
2. Sign in as administrator; show spaces, rates and attendants.
3. At the laptop kiosk, choose a vehicle, assign a space and display its QR ticket.
4. On the phone exit terminal, sign in, scan the laptop's ticket and explain the server-calculated fee.
5. Confirm payment on the phone, show the receipt/PDF and verify the released space on the laptop administration display. Print physically if the printer is available and tested.
6. Demonstrate an invalid ticket and a duplicate payment attempt.
7. Demonstrate a lost ticket and one approved correction, with permission checks and audit evidence.
8. Reconcile transactions against the report, then restart and prove records remain.
9. Demonstrate a controlled connection interruption: no false success or silent data loss.

Use short, normal, overtime, full-capacity and corrected-session fixtures. Label prepared historical timestamps as demonstration data rather than pretending a vehicle parked for hours during the talk.

## Definition of done

- All approved thesis requirements map to a feature, a test and demonstration evidence.
- No required screen contains a placeholder or browser-only business action.
- Unauthorized role access, allocation races, duplicate requests and payment errors have tests against real PostgreSQL.
- Rates, grace periods, rounding, lost-ticket fees and refund totals follow documented rules.
- Data remains consistent across clients and restarts; credentials and sessions are server-controlled.
- Reports reconcile gross collections, refunds, voids and net collections without double counting.
- Actual QR input and the chosen receipt output work on the presentation equipment.
- Production build, focused tests and end-to-end scenarios pass with no unresolved presentation-blocking defects.
- Three full rehearsals succeed; backup restoration and the launch instructions are tested.
- Remaining limitations are disclosed in the presentation and do not contradict its objectives.

## Evidence package

Prepare an architecture diagram, ER diagram, role/use-case matrix, workflow diagrams, requirements-to-test matrix, actual test results, user/setup guide and a short demo script. Keep screenshots and a backup recording from the final tested version. Align evaluation instruments with the school's required methodology; do not invent participant feedback or results.

## Risks and scope controls

- Exact schedule is pending: use December 1, 2026 as the earliest presentation date, with a November 28 functional-readiness target and November 29–30 stabilization buffer. Reassess after database setup and the first live entrance-to-exit test.
- Schema changes must preserve existing data; migrations and sample-data resets are separate.
- Existing mutable rates can change historical billing; immutable snapshots must precede final checkout validation.
- Current demo PINs are not production authentication; API authorization is a core requirement.
- Laptop and phone are confirmed; target Android Chrome and iPhone Safari, verifying actual devices/browser versions when available. Compatibility with both is a target, not a verified result. Network and printer availability/model still need testing. Keep manual ticket entry as a fallback, not a substitute for the required QR demonstration.
- Any live payment gateway, barrier controller, SMS or other additional integration needs an explicit thesis requirement; none is assumed here.

## Pending answers

- Exact presentation date within early/mid-December 2026 and time allotted for the demo.
- Which Android/iPhone devices are available for testing, and available shared Wi-Fi/router/hotspot; internet availability at the venue.
- Printer availability/model/connection, if physical printing is required.
- Approved thesis objectives and required features.
- Manual digital-payment recording versus an actual payment gateway.
