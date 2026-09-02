# STFD Dashboard 2.1.0

Springfield Township Fire Department’s Windows kiosk dashboard and its two administrative surfaces:

- `index.html`: the always-on station display.
- `admin.html`: master display settings, slides, weather, logo, and alert controls.
- `deptadmin/index.html`: daily content, ticker, units, addresses, tasks, and maintenance.

## Development

Install dependencies with `npm install`, then use:

- `npm start` — bundle local browser assets and open the Electron dashboard.
- `npm test` — run content-safety tests.
- `npm run check` — validate required files and production safeguards.
- `npm run build` — create a local Windows installer without publishing.
- `npm run release` — test, build, and publish using the configured GitHub provider and token.

Generated browser assets are written to `app/` and must be committed because GitHub Pages serves the repository directly. Installers are written to `release/` and do not belong in source control. Packaging uses a temporary non-synced directory first, which avoids OneDrive locking Electron's intermediate files.

## Kiosk controls

- `Ctrl+Shift+Q`: exit the dashboard.
- `Ctrl+Shift+D`: toggle maintenance mode so the Windows desktop and taskbar can be reached.
- `STFD_DISPLAY_INDEX`: optional zero-based display override.
- `STFD_ALWAYS_ON_TOP=false`: optional always-on-top override.

Without an override, the dashboard selects the largest non-primary display and falls back to the primary display.

## Security setup

The included Firestore rules require the Firebase custom claim `admin: true` for every administrative write. The workspace is pinned to Firebase project `spfld-twp-fire`; future rule updates can be deployed with `firebase deploy --only firestore:rules` after testing them in the Firebase emulator.

The department news Apps Script should verify the Firebase ID token included in each request body before accepting add, edit, or delete actions. The browser now supplies this token, but enforcement must also be implemented in the Apps Script backend.

The ImgBB upload key is session-only and must never be written to Firestore. For stronger protection, move image uploads to a server-side function and store only the returned image URL.

## Release notes

Ordinary builds never publish. Only `npm run release` uses `--publish always`. Keep the GitHub token in the environment; do not store it in this folder.

Auto-updates download in the background and install at 3:00 AM local time. Installation is deferred while an emergency alert is visible.
