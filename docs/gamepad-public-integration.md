# Windows GC201 controller — public/private production integration

## Repository boundaries

- Public repository owns the common Gamepad API input relay, diagnostic page, styles and the CORE BREAK / FACTOR RAID adapter.
- Private repository owns the protected launcher, catalog, original games, CORE BREAK entry HTML, personal imagery and physical geography.
- The public FACTOR RAID index loads the math adapter. The private protected CORE BREAK index loads the **same public file** after production assembly.
- The private protected index.html and play.html load the generic navigation JS and CSS. These public files are allowlisted individually in production-public-sync.json.
- Five original private games and michitanken do **not** receive gameplay adapters in this stage.
- Old private PR #27 is reference-only; never cherry-pick the branch or its private history.

## Behavior and safety

The shell polls a standard-mapping gamepad and sends same-origin iframe messages with type "dreamcore:gamepad-v2". Buttons A / B / Start / Select have distinct navigation and gameplay roles. The math adapter accepts messages only from its own same-origin parent. Blur, pagehide, pointer/keyboard mode, modal transitions and disconnection release held input. Keyboard/mouse/touch remain enabled.

The GC201 should be in XInput mode on Windows. The standalone gamepad-check.html is available after assembled deployment, but does not collect or transmit diagnostic data.

## Verification and release

1. Public repository: run the public-only Actions workflow, including tests/gamepad-public.test.mjs.
2. Locally or in Cloud Shell, check out both repositories at explicitly recorded commits into **separate** directories.
3. Run the public scripts/assemble-production.mjs with --private PRIVATE_DIR, --public PUBLIC_DIR and --out FRESH_DIR. Output must not already exist.
4. Run the independent public scripts/verify-production-overlay.mjs with --private PRIVATE_DIR, --public PUBLIC_DIR and --site FRESH_DIR; require status PASS and unchanged protected paths.
5. Inspect the staged index.html, play.html, games/core-break/index.html and games/factor-raid/index.html to ensure each referenced file exists inside FRESH_DIR.
6. Serve the staged site on a preview port and use Chrome or Edge on Windows to verify GC201 home navigation, Start menu, Select return, two games' actions and mouse/keyboard/touch fallback.
7. After explicit physical acceptance, deploy only FRESH_DIR to the correct Firebase Hosting project through the user's manual Cloud Shell process.

**Never run GitHub Actions in dreamcore-games or michitanken. Never send the private checkout into public CI.** Public CI alone cannot prove the private assembly or physical controller compatibility.

## Status

Code mounting and public tests are Stage 3B integration deliverables. Windows hardware acceptance and production deployment remain separate user-operated gates.
