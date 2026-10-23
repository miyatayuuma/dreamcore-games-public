# Windows GC201 controller — public/private production integration

## Repository boundaries

- Public repository owns the common Gamepad API input relay, diagnostic page, styles and the CORE BREAK / FACTOR RAID adapter.
- Private repository owns the protected launcher, catalog, original games, CORE BREAK entry HTML, personal imagery and physical geography.
- The public FACTOR RAID index loads the math adapter. The private protected CORE BREAK index loads the **same public file** after production assembly.
- The private protected index.html and play.html load the generic navigation JS and CSS. These public files are allowlisted individually in production-public-sync.json.
- Five original private games and michitanken do **not** receive gameplay adapters in this stage.
- Old private PR #27 is reference-only; never cherry-pick the branch or its private history.

## Current controls (replaces the old selection-menu specification)

One left-stick cursor emulates the existing touch interface. A presses/releases at its position and remains held during a drag. B cancels a pointer hold, and Select returns to the launcher. The controller must not create a separate selection menu or instructional HUD.

| Game/rule | L/R | A and left stick | ZR | Other |
| --- | --- | --- | --- | --- |
| CORE BREAK SPARK | — | Position-dependent dot/part selection and drag | Attack with the selected complete number | — |
| CORE BREAK RACK (`link`) | Immediately adjust decomposition, as in phone horizontal swiping | Existing touch-equivalent drag | Attack the current group | — |
| CORE BREAK GEAR | Preview a column count without moving dots | A confirms the pending count; otherwise cursor drag works | Attack both arrays after confirmation | — |
| CORE BREAK PACK | Preview radix | A confirms pending radix, otherwise holds the only mass; release deposits it | While mass is held, cycle the destination place | Cursor not required; target attack resolves automatically |
| FACTOR RAID CASUAL/NORMAL | Cycle four factor cards and PRIME | Cursor+A selects level and operates touch controls | Attack with highlighted card | X selects PRIME without attacking |
| FACTOR RAID EXPERT/BLITZ | L selects numeric-factor card, R selects PRIME | Cursor+A presses on-screen digit keys and menus | Attack with selected numeric factor or PRIME | B deletes last digit; X selects PRIME on every level |

The launcher polls a **standard-mapping** Gamepad API device and relays only button edges to the same-origin math-game iframe using `dreamcore:gamepad-v2`. The child math adapter accepts messages only from its own same-origin parent; the child CORE BREAK runtime implements its own rule semantics. Synthetic drags keep the original pressed element as their target, even after crossing the iframe edge. Blur, pagehide, modal transitions and disconnection cancel held input. Mouse/keyboard/touch controls stay enabled.

The GC201 should be in XInput mode on Windows. The standalone gamepad-check.html is available after assembled deployment, but does not collect or transmit diagnostic data.

## Verification and release

1. Public repository: run the public-only Actions workflow, including tests/gamepad-public.test.mjs.
2. Locally or in Cloud Shell, check out both repositories at explicitly recorded commits into **separate** directories.
3. Run the public scripts/assemble-production.mjs with --private PRIVATE_DIR, --public PUBLIC_DIR and --out FRESH_DIR. Output must not already exist.
4. Run the independent public scripts/verify-production-overlay.mjs with --private PRIVATE_DIR, --public PUBLIC_DIR and --site FRESH_DIR; require status PASS and unchanged protected paths.
5. Inspect the staged index.html, play.html, games/core-break/index.html and games/factor-raid/index.html to ensure each referenced file exists inside FRESH_DIR.
6. Serve the staged site on a preview port and use Chrome or Edge on Windows to verify GC201 cursor drag, Select return, the four CORE BREAK rules, both FACTOR RAID control styles, and mouse/keyboard/touch fallback. Check that there is no obsolete gamepad HUD. In PACK confirm radix with A, then hold A and cycle input places with ZR before release. In GEAR verify that L/R changes only the count preview until A.
7. After explicit physical acceptance, deploy only FRESH_DIR to the correct Firebase Hosting project through the user's manual Cloud Shell process.

**Never run GitHub Actions in dreamcore-games or michitanken. Never send the private checkout into public CI.** Public CI alone cannot prove the private assembly or physical controller compatibility.

## Status

The older menu-driven controller adapter is superseded by these direct controls. Public tests and repository merge do not imply Windows hardware acceptance or production deployment; those are separate gates.
