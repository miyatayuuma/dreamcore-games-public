# Windows GC201 gamepad — public code integration (Stage 3A)

This repository is **public**. Keep controller input infrastructure here, but keep the five private games, michitanken, protected page shells, credentials, Firebase configuration, personal assets and all private project history out of this repository.

## Public, inert building blocks

| File | Scope |
| --- | --- |
| public/assets/gamepad-nav.js | Standard Gamepad API polling; controller-aware cards, system menu and same-origin iframe message relay |
| public/assets/gamepad-nav.css | Focus/status/menu presentation used by the protected launcher |
| public/assets/gamepad-math-adapters.mjs | Same-origin input adapter for CORE BREAK and FACTOR RAID **only** |
| public/gamepad-check.html | Standalone Windows gamepad diagnostics (axes, buttons, mapping) |
| tests/gamepad-public.test.mjs | Node-only public boundary and input-contract regression tests |

The public controller scripts are deliberately **not mounted** in either application's HTML by this change. Publishing controller functionality requires the private-side integration and a manual production assembly.

Contract: parent sends messages to the game iframe with type "dreamcore:gamepad-v2" and action "button" / "axes" / "release-all", target origin location.origin. Children accept only messages from window.parent at their own origin. Release input on focus loss, navigation, modal activation and disconnection.

The adapter supports the math games already present in this repository; private games are **not** made public and michitanken is not implicitly supported.

## Stage 3B — private integration, separate review

1. Update the private production-public-sync.json allowlist for **only** the four new public files. Preserve all existing protected paths.
2. In private protected public/index.html and public/play.html, mount the navigation script and stylesheet. Preserve keyboard/touch controls.
3. In the private assembled CORE BREAK and FACTOR RAID entry pages, mount the public math adapter. Any private game adapters must remain in the private repository.
4. Run the public CI and private *local/read-only* assembly and scripts/verify-production-overlay.mjs. Never run GitHub Actions in dreamcore-games or michitanken.
5. On Windows, use the GC201 in XInput mode; check gamepad-check.html, home navigation, game actions, Start/Select, blur/disconnect release, and keyboard/touch fallback on actual hardware.
6. Only after verified results, manually deploy the assembled site from Cloud Shell. Do not deploy from CI. Keep any preview/publication choice separate.

The old private Draft PR #27 is a historical implementation reference, **not** a branch to merge or cherry-pick wholesale. Do not transfer its private file history or protected game assets.

## Public regression

Run node --test tests/gamepad-public.test.mjs locally or in this repository's public Actions. This checks the navigation contract and allowed math-game adapter, but it is not a substitute for Windows Bluetooth/USB hardware acceptance.
