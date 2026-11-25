# Exception rehearsal

Use sample records. These steps record demonstration payments and corrections; no real money should change hands during rehearsal. Back up first with `npm run db:verify-recovery`.

## Lost ticket

1. Issue a new Motorcycle or Other ticket on the laptop. Note its space and entry time.
2. At the phone exit terminal select **Driver lost their ticket?**
3. Select the category, search the space, and select the matching session.
4. Confirm the parking location and approximate entry time with the driver.
5. Open lost-ticket checkout. Show the time charge and the separate lost-ticket fee.
6. Record sufficient cash received and complete payment. Show the receipt and released space.

Explain: the original entry time and frozen rate determine the fee. The configured lost-ticket fee applies once. It cannot be waived by the attendant.

## Partial refund

1. Sign in to administration and open **Transaction History**.
2. Search the ticket from the preceding scenario and select its payment.
3. Select **Refund**, enter PHP 10, choose **Overcharge**, and enter the administrator PIN.
4. Select **Issue refund**. Show **Partially refunded**, the retained original payment and the reduced net amount.
5. Reload and verify that the correction persists. Show its audit entry.

Explain: the administrator must authorize the correction. The total refunded cannot exceed the payment. A refunded payment cannot also be voided. Repeating a network request with the same request ID cannot create another refund.

## Full capacity

1. Choose a category showing **Currently full** on the kiosk (Car in the current sample dataset).
2. Show the full-capacity message and return to category selection.
3. Confirm that no ticket or payment was created by the failed allocation.

Explain: availability is checked on the server. Concurrent kiosks cannot claim the same final space. Do not manually mark occupied spaces available to prepare this scenario.

## Recovery evidence

Run `npm run db:verify-recovery`. This creates a backup, restores it into a new database and compares counts, SHA-256 row-content digests, and gross/void/refund/net totals for all nine application tables. A successful run writes a `.verification.json` alongside the dump in `backups`.

The comparison and dump use the same [PostgreSQL exported snapshot](https://www.postgresql.org/docs/17/functions-admin.html), so continued use of the original app does not invalidate the comparison. The command retains the restored database and never switches the running app to it.

The November 11 verification matched 60 spaces, 136 sessions, 92 payments and PHP 9,070 net at the snapshot. Browser exception tests were then run against that restored copy; its contents now include rehearsal corrections. The backup file remains the verified original snapshot.

Keep backups private: they include accounts and session data. A restore verification is not a substitute for an actual timed laptop restart rehearsal.
