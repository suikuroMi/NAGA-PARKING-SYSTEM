# Eight-minute defense demonstration

This is a speaking outline, not a measured presentation duration. Rehearse it aloud with the actual laptop and Android phone. Adjust names and thesis objectives to match the approved manuscript.

## Before the panel arrives

- Start `START-PARKING.cmd`; keep the laptop awake and connected to power.
- Open the kiosk and admin pages in separate laptop tabs. Keep the phone on the same Wi-Fi.
- On the phone use the complete `https://<laptop Wi-Fi address>:3443/exit` address. Verify the camera works before presenting; do not spend presentation time installing a certificate.
- Confirm an available category. Car is full in the saved sample data; use Motorcycle or Other for a normal arrival.
- Keep initial PINs private. Use the local credential file, not the projected notes.
- Create a backup beforehand. Prepare sample records for corrections. Open the sample receipt PDF as a fallback for explaining output, clearly labeled as a saved example.

## 0:00–0:45 — Purpose and scope

“This system manages a parking session from entrance to payment and space release. The entrance kiosk, exit attendant, and administrator share records stored in PostgreSQL. Today the laptop hosts the server and database, and this Android phone acts as the exit terminal.”

Show the three roles. Describe only the objectives stated in the approved thesis; do not claim measured reductions in queues or errors without study data.

## 0:45–2:00 — Vehicle entry

“The driver selects a vehicle category. The server checks for an available compatible space and reserves it while the ticket is issued.”

Choose an available category, continue to the ticket, and point out its identifier, assigned space, timestamp and QR.

“The QR identifies the parking session. The authoritative entry time, space and rate are stored in the database. The rate is frozen at entry, so later rate changes do not change this vehicle's agreed rate.”

## 2:00–3:30 — Exit and payment

Sign in on the phone and scan the laptop ticket.

“The attendant retrieves the stored session. The fee uses its entry time and stored rate. We review the charge, enter the cash received, and confirm receipt before completing the transaction.”

Complete payment. Show the receipt and calculated change.

“This is a demonstration cash record. Digital references can also be recorded after external verification; this system does not process GCash or Maya transfers.”

## 3:30–4:30 — Shared records and persistence

Open Transaction History on the laptop and search the exact ticket. Point out the payment and released space, then reload.

“The phone and laptop read the same database. Reloading retains the payment. The payment operation also releases the assigned space. Request IDs protect retries from recording the same payment twice.”

## 4:30–6:00 — One exception

Use the [exception rehearsal](EXCEPTION-REHEARSAL.md). Choose either lost-ticket checkout or a partial refund for the live presentation; keep the other ready for questions.

For lost ticket: “The attendant matches the active session using the vehicle category, parking location and approximate arrival time. The configured lost-ticket fee is added to the time charge.”

For refund: “An administrator authorizes the amount and reason. The original payment remains visible, the correction is recorded, and net revenue decreases. A refund cannot exceed the remaining amount.”

## 6:00–7:00 — Reports and audit

Show the matching transaction, correction and audit event. Select a report date range that includes the demonstrated payment.

“The report separates gross payments, voids, refunds and net revenue. This report groups payments by their payment date in Asia/Manila and applies their current corrections; it is not a separate cash-movement report by refund date.”

## 7:00–8:00 — Reliability and limitations

“Tests cover simultaneous allocation, payment retries, refunds, rate snapshots and role restrictions. A backup was restored into a separate database and compared against the original snapshot. If the server becomes unavailable, the interface shows a connection warning and cannot confirm new writes until the server returns.”

“This demonstration uses one facility and one shared exit terminal. Android scanning has been tested. iPhone and physical printer support require actual device verification. Browser PDF output is available. The current rates are configurable sample settings.”

End by returning to the dashboard and inviting questions.

## Questions to prepare for

| Panel question | Answer supported by the implementation |
|---|---|
| Why PostgreSQL? | It provides persistent shared records, transactions and constraints for related slots, sessions and payments. |
| Can two kiosks get the same space? | Commands are serialized through a facility-row lock; an active-session uniqueness constraint also protects slot use. Concurrent final-space tests passed. |
| Is the schema fully normalized? | No. Core records use separate relational tables, with JSONB data for detailed snapshots. This is a design tradeoff; do not describe it as a fully normalized schema. |
| Does the app work offline? | It does not accept offline business writes. It displays a warning and reconnects. Existing displayed data may remain visible. |
| What if the user taps payment twice? | Same-request retries return the stored result. A completed session cannot create a second normal payment. |
| Is a QR ticket an identity check? | No. It identifies a session. The implementation does not identify a driver or prove vehicle ownership. |
| Is this a payment gateway? | No. Cash and manually verified digital payments are recorded, not transferred by the app. |
| Can it support many exit lanes? | This version has one shared exit terminal. Multiple independently active terminals require additional design and testing. |
| How are credentials handled? | PIN hashes and sessions are server-side; API role checks authorize operations. Four-digit PINs and rate limits suit this controlled demonstration, but production requirements need separate review. |
| Does backup success prove recovery? | The tested backup was restored and all nine application tables and financial totals matched its snapshot. Full laptop reboot rehearsal is a separate check. |

## Human rehearsal log

Complete this after actual practice; automated browser timings do not fill these rows.

| Run | Date | Total time | Scan/payment success | Exceptions explained | Issues to fix |
|---|---|---|---|---|---|
| 1 | Pending | | | | |
| 2 | Pending | | | | |
| 3 | Pending | | | | |
