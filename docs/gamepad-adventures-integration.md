# Direct GC201 input — 3D adventure pair

Target games: `lost-gecko` and `tanabata-night`. The actual game HTML,
story assets, character graphics and game-specific content remain PRIVATE.

## Control contract

- Standard Gamepad API/XInput mapping. Left stick moves relative to the existing
  virtual touch joystick; right stick applies yaw and pitch with the same camera
  limits as touch. The gamepad has a radial dead zone and no additional HUD.
- Story: **A** advances / starts / restarts when the relevant button is visible.
  **B** returns one page when the previous button is visible.
- Tanabata first-run audio question: **A** selects voiced narration, **B**
  selects silent narration. Existing on-screen buttons still work.
- Gecko field: touching a bug triggers capture automatically, no A/B action.
- Tanabata field: touching a creature triggers a greeting automatically;
  **A** cycles the existing encounter-frequency wheel (normal → few → many).
  During a greeting, axes and A are ignored.
- The parent shell owns button edges and Select-to-home. The child reads standard
  analog axes from Gamepad API and listens for same-origin
  `dreamcore:gamepad-v2` button edges. Standalone pages sample A/B locally.
- Touch remains active: when the left stick is neutral, games use their original
  touch joystick. Pointer gestures continue to rotate the camera. Mouse/keyboard
  input is not intercepted.

## Ownership

- PUBLIC canonical code: `public/assets/gamepad-adventures.js`.
- PRIVATE: game-specific wiring in `public/games/lost-gecko/index.html` and
  `public/games/tanabata-night/index.html`.
- PRIVATE `production-public-sync.json` must explicitly allowlist the PUBLIC
  adventure adapter. Both private game directories stay protected.
- PUBLIC branch starts from the current math gamepad feature branch to avoid
  temporarily losing pending CORE BREAK / FACTOR RAID direct controls.

## Verification and release gates

1. Run `node --test tests/gamepad-adventures.test.mjs` on PUBLIC only.
2. Assemble PUBLIC + PRIVATE into a separate staged directory, using
   `scripts/assemble-production.mjs` and `verify-production-overlay.mjs`.
3. Verify Gecko story A/B, all four stage sizes, left/right stick travel and
   bug contact; verify Tanabata intro/ending A/B, voice choice, camera, three
   encounter-frequency settings, greeting-input lock and contact greetings.
4. Confirm touch/drag fallback and Select-to-home in both games.
5. Require a real Windows GC201/XInput test before merging to stable branches
   or deploying to production.

Do not start GitHub Actions in the PRIVATE DreamCore or Michitanken repos.
Public-only CI cannot prove the private overlay or physical controller behavior.
