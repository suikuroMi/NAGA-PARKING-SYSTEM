# Laptop and phone presentation

## Launch

1. Connect laptop and phone to the same Wi-Fi; keep the laptop awake.
2. Double-click `START-PARKING.cmd` in this repository, or run `npm run thesis:start`, and keep its window open. Start it again after restarting the laptop. If the app is already running, do not launch a second copy.
3. Open `http://localhost:3100/kiosk` and `/admin` on the laptop.
4. On the phone open the Wi-Fi address printed by the launcher plus `/exit`.

On November 9, 2026, the user confirmed Android could load `http://192.168.1.37:3100/exit` after an approved launch outside the restricted development sandbox. No sandbox firewall rule was disabled. DHCP can change this address.

## Local HTTPS camera setup

The certificate authority is named **Naga Thesis Local CA**. Installing it lets the phone trust certificates issued by this laptop. Keep `.runtime/tls` private and share only the public certificate. Remove the phone's installed CA after the demonstration when no longer needed.

1. Run `npm run https:setup`, then restart the production server. Regenerate after an address change and before the December presentation because certificates are temporary.
2. On Android download `http://192.168.1.37:3100/naga-local-ca.crt`. In Settings search for **Install a certificate** or **CA certificate**, choose the file and confirm device authentication. Menus vary by manufacturer.
3. Open `https://192.168.1.37:3443/exit` in Chrome. Confirm that no certificate warning appears.
4. Sign in using the attendant details in the laptop's `LOCAL-ACCESS.txt`. Tap **Scan with camera**, allow access, and scan a newly issued laptop QR.
5. If permission was denied, enable Camera in Chrome's site settings. Manual ticket entry remains available.

For iPhone, use the `.cer` download, install the downloaded profile in Settings, then enable full trust under General > About > Certificate Trust Settings. Real iPhone verification remains pending.

If HTTP works but HTTPS fails, check that the production launcher reports port 3443. If neither works, check the current address, running server and Wi-Fi client isolation. Do not disable the firewall globally.

## Defense walkthrough

1. Introduce the kiosk, attendant and administrator roles.
2. Issue a ticket in an available category on the laptop; show the space, entry time and QR. Motorcycle or Other are available in the current sample data; Car is full.
3. Scan it on the phone, review the fee and record a cash payment with sufficient tender.
4. Show the receipt, released space and matching laptop dashboard transaction.
5. Reload both clients to demonstrate persistence.
6. Use designated sample records for a lost-ticket payment and an authorized correction. Show their audit entries.
7. Show date-filtered gross, voids, refunds and net. Explain that rates are presentation settings and digital references are manually verified.
8. Preview output for printing; claim physical printing only after testing the actual printer.

Back up before rehearsing. Restore into a separate database for repeatable fresh demonstrations.

## Remaining device evidence

- Timed repeat of Android camera scan/payment and laptop synchronization (user-confirmed working November 11).
- iPhone Safari if cross-platform support is claimed.
- Print-to-PDF QR readability and any confirmed physical printer.
- Cold start and three complete timed rehearsals.

Record evidence in `tasks/test-results.md`. A build alone does not establish presentation readiness.

Follow [exception rehearsal](EXCEPTION-REHEARSAL.md) for the next demonstration scenarios and recovery verification.

Use the [eight-minute defense script](DEFENSE-SCRIPT.md) for speaking notes, panel questions and a three-run human rehearsal log. The time allocation is a target until you measure a real practice run.
