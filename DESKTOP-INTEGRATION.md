# Desktop integration

Source interface: `C:/Users/Admin/Desktop/Parking Lot System App/src`.
GitHub base: `suikuroMi/NAGA-PARKING-SYSTEM`, commit `a709354`.
Branch: `feature/desktop-edits`.

The Desktop screens and workflows run in the GitHub application's Next.js structure. The original Desktop project is unchanged. Vite is not used here.

The initial browser-storage bridge has been replaced by PostgreSQL and `/api/system`. Authentication, staff, settings, lost-ticket fees, refunds, void/reopen and administrative closure execute on the server. The client has no automatic browser-only demo fallback. Legacy routes return 410.

See [README](README.md) and [presentation guide](docs/PRESENTATION.md). Initial configured PINs are in the private `LOCAL-ACCESS.txt`; seed-source PINs are not the live credentials.

Changes remain local; nothing has been pushed to GitHub. Actual camera and printer verification are separate acceptance steps.
