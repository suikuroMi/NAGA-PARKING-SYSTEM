# Launch, recovery and final acceptance

## Start the presentation

1. Connect the laptop to power and the local network used by the Android phone. Keep the laptop awake.
2. Double-click `START-PARKING.cmd`. Keep its window open. It starts the configured database and checks the build, database schema, ports and HTTPS certificate before serving the app.
3. If it reports the app is already running, use the existing server window. Do not start multiple copies or stop unfamiliar processes.
4. Open `http://localhost:3100/kiosk` and `/admin` on the laptop. Use an available category.
5. Open the **complete HTTPS phone URL printed by the launcher**, including `https://` and `:3443/exit`. Do not assume yesterday's address is still correct. On November 12 the laptop reported `192.168.1.3`; earlier it used `192.168.1.37`.
6. Sign in and verify the camera. Keep PINs off projected screens and shared documents.

For a diagnostic without starting or changing services, run `npm run thesis:check`. It reads configuration/database/certificates and temporarily probes ports. It does not reset records, install trust certificates, print credentials or terminate processes.

## If something fails

| Message or symptom | Action |
|---|---|
| Database unavailable | Run `npm run db:start`. If PostgreSQL is reachable but login/database fails, check the private `.env.local`; do not initialize or overwrite a different database. |
| Build missing | Run `npm run build` before launching. |
| Port occupied | Use the already-running parking app if identified. Otherwise inspect the process owning the port; do not kill it automatically. |
| Certificate missing, invalid or address mismatch | Run `npm run https:setup`, then restart the app. Device trust is a separate manual step. If the CA itself expired, a replacement CA and renewed phone trust are required; setup does not silently replace an existing CA. |
| `ERR_EMPTY_RESPONSE` at port 3443 | Confirm the address begins with `https://`, not `http://`. |
| Action not confirmed / connection lost | Restore connectivity and let the app refresh. Do not assume a timeout means the server rejected the action. Retry the same action if still offered; do not create another payment or correction to compensate for an unknown outcome. |
| Ticket issuance response lost | The kiosk recovers the exact ticket from the server when connectivity returns. Confirm the displayed ticket before starting another vehicle. |

The 10-second client deadline releases a stalled request. It does not cancel a payment already committed by PostgreSQL. Server request IDs make same-request retries safe. This version does not accept offline business writes.

## User-operated laptop reboot test — pending

Perform this when you can interrupt the demonstration and have saved other work. The assistant will not reboot your laptop automatically.

- [ ] Note an existing completed ticket and its payment amount.
- [ ] Back up with `npm run db:verify-recovery` before the rehearsal.
- [ ] Shut down and start the laptop using Windows.
- [ ] Start `START-PARKING.cmd` without editing application code.
- [ ] Use the newly printed Android HTTPS address and confirm camera access.
- [ ] Find the previously noted ticket and verify its amount remains unchanged.
- [ ] Issue, scan and pay for one new ticket; verify one payment and a released space on the laptop.
- [ ] Record startup time, results and any manual steps in `tasks/test-results.md`.

## Three human rehearsals — pending

Use `docs/DEFENSE-SCRIPT.md`, speak aloud, and time each run with the actual laptop and phone. Complete the three log rows there. Automated browser run times do not count as presentation times.

Presentation acceptance is complete only after the reboot test and three human runs pass. Physical printing and iPhone verification remain outside the current laptop/Android milestone.
