# Reporting definitions and verification

Implemented and checked on 13 November 2026. All calendar dates use **Asia/Manila (UTC+8)**. The report includes the start date at midnight and excludes midnight after the end date.

## What the figures mean

| Figure | Definition and time basis |
| --- | --- |
| Payment records | All original payment records in the selected payment dates, including records subsequently voided. A repayment is another payment record. |
| Gross | Original amounts of those records, summed in integer centavos. |
| Voids | Original amounts of selected records currently voided. |
| Refunds | All refund amounts currently attached to the selected records. |
| Net collected | Gross minus voids and refunds. This is not a cash-movement ledger. |
| Net per payment record | Net divided by all selected payment records, including voids; zero for an empty period. |
| Category / attendant collections | Counts and net amounts for the selected payment records, grouped by their recorded category or attendant name. |
| Category average minutes | Sum of recorded parking minutes divided by the category's payment-record count, including voids. |
| Cash / digital records | Counts by original recorded payment method, including voids; these add up to payment records. |
| Arrivals | Sessions whose entry timestamp falls in the selected dates. |
| Completed parking sessions | Distinct sessions currently marked completed, grouped by their completion time. Payment confirmation is the completion time; a legacy session without payment data falls back to its saved exit time. |
| Administrative closures | Sessions closed without payment whose `closure.at` falls in the selected dates. Uncollected amounts are summed from those closures. |
| Lost-ticket payments / fee component | Non-void selected payments with a lost-ticket fee, and their fee components before refunds. Refunds are not allocated between fee components. |
| Occupancy / overdue | Current live values at generation time, independent of the selected dates. Claimed spaces are listed separately; occupied plus claimed matches the dashboard's occupancy count. |

A financial void alone leaves a completed session completed. Reopening changes the session to active and removes it from completed counts. Completing it again counts that session once, on its latest completion date. Administrative closures are a separate operational measure.

## Payment time and historical uncertainty

New payments store `transaction.paidAt` on the server when payment succeeds. The separate checkout timestamp remains the basis for the parking fee.

Older records resolve their payment time in this order:

1. The transaction's own `paidAt`.
2. Its session payment's `paidAt`, only when the transaction IDs match.
3. The transaction's checkout timestamp, explicitly marked **Estimated from checkout time**.

The compatibility rule runs when reading reports; it does not rewrite historical records or alter the SQL schema. Estimated records can fall on an uncertain payment date. Their count appears in report summaries, and detailed exports carry each record's provenance.

**Defense example:** a PHP 100 payment on Monday with a PHP 20 refund on Tuesday gives Monday gross PHP 100, refunds PHP 20, and net PHP 80. Tuesday does not receive that refund in this report. A later full refund reduces Monday's net to zero. Historical reports can therefore change after corrections; keep an exported snapshot when preserving what was reported at a particular time.

## Using and exporting reports

1. Open Administrator → Reports. Today is the default. Select Today, Last 7 Days (today plus the preceding six days), This Month, or Custom.
2. Check the period and any estimated-time notice. Invalid, missing or reversed dates block exports.
3. Export CSV, or choose **Print / Save as PDF**. The print preview captures a fixed copy; later polling cannot change it. Allow pop-ups if the preview is blocked.
4. In the preview choose Print / Save as PDF. Use A4 landscape, default scale, and disable the browser's own headers/footers if enabled. Application navigation is excluded and table headers repeat across pages.
5. For payment-level history use Transaction history → Export CSV. It contains full entry, checkout and resolved payment dates, payment-time provenance, and dated correction descriptions. The history's Print report button opens the date-filtered Reports screen.

CSV cells retain formula escaping. Summary CSV and print tables use the same report sections and captured values as the screen's report calculation. Currency sums use integer centavos; displayed averages are rounded to two decimal places.

## Verification record

- `npx tsc --noEmit`: passed.
- `npm test`: **23 tests passed**, including real isolated PostgreSQL business/permission checks and nine reporting tests. New payments' `paidAt` was checked against the saved session payment and a database reload.
- `npm run build`: passed for the production Next.js build.
- `npm run test:reports`: passed against a newly created isolated PostgreSQL database and Chrome. The test drops only its own database and stops only its own server.
- Boundary coverage: Manila midnight checkout/payment split, inclusive start/exclusive end, closure boundaries, invalid/reversed dates, empty periods, decimal sums, three payment-time resolution paths, Tuesday partial/full refunds of Monday payments, financial void versus reopen and repayment, and category/attendant reconciliation.
- Browser coverage: dashboard section labels, report presets, estimated-time notice, invalid-range export controls, empty totals, history provenance, screen/CSV/print agreement, and a fixed print preview while the source screen changes through polling. No browser page errors were recorded.
- Isolated sample: **120 payment records; 40 estimated; gross PHP 1,332.00; voids PHP 10.10; refunds PHP 0.30; net PHP 1,321.60**. Its 120 currently completed sessions remain completed even though one payment is financially voided.
- PDF inspection: **nine A4 landscape pages**, with payment table headers repeated on seven pages. First, middle and last pages were rendered and visually inspected; text was readable with no clipped columns or application navigation. PDF text contains the expected net total.
- Evidence: [browser results](reporting-results.json), [sample CSV](reporting-evidence/sample.csv), [sample PDF](reporting-evidence/sample.pdf), [report screen](reporting-evidence/screen.png). These contain synthetic test data, not demonstration records.

The existing demonstration database was not reseeded, migrated or used for destructive tests. The startup preflight detected the laptop's new Wi-Fi address, 192.168.1.51; its server certificate was renewed while preserving the existing CA certificate. This does not change phone trust settings.

Physical printing and an Android check after this update were not performed. The broader presentation gate still includes the user-operated laptop restart and three timed human rehearsals; automated reporting checks do not replace them.
