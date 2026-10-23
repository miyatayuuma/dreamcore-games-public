/* Shared direct controller input for the two DreamCore 3D adventures.
 * Existing touch and mouse controls remain the source of truth for those paths.
 * Same-origin launcher: button edges arrive via dreamcore:gamepad-v2.
 * Standalone page: button edges are sampled locally.
 */
(() => {
  'use strict';

  const adventure = document.body.dataset.adventureGamepad;
  if (adventure !== 'gecko' && adventure !== 'tanabata') return;
  if (!('getGamepads' in navigator)) return;

  const TYPE = 'dreamcore:gamepad-v2';
  const DEADZONE = 0.18;
  const MAX_DELTA = 0.05;
  const padMove = { x: 0, y: 0, active: false };
  window.__dreamcoreAdventurePad = padMove;
  window.__dreamcoreGamepadCursorMode = () => 'off';
  window.__dreamcoreGamepadCaptureA = () => true;

  let lastTime = 0;
  let lastLocalButtons = [];
  let localArmed = false;
  let lastNarrationAt = -Infinity;

  function visible(id) {
    const element = document.getElementById(id);
    return !!(element && !element.hidden && element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden');
  }
  function activate(id) {
    if (!visible(id)) return false;
    document.getElementById(id).click();
    return true;
  }
  function overlayActive() {
    return adventure === 'gecko'
      ? visible('storyLayer')
      : visible('intro-overlay') || visible('ending-overlay');
  }
  function playEnabled() {
    return !overlayActive() &&
      (adventure !== 'tanabata' || !window.__GREETER_INPUT_LOCK);
  }
  function buttonDown(button) {
    if (button !== 0 && button !== 1) return;
    // Page fades and speech initialization are asynchronous; reject rapid repeats.
    if (overlayActive() || visible('intro-audio-ask')) {
      const now = performance.now();
      if (now - lastNarrationAt < 300) return;
      lastNarrationAt = now;
    }

    if (adventure === 'gecko') {
      if (!visible('storyLayer')) return;
      if (button === 0) {
        activate('storyStart') || activate('storyNext') || activate('storyRestart');
      } else {
        activate('storyPrev');
      }
      return;
    }

    // The narration's first-run audio question has priority over page navigation.
    // A chooses spoken narration; B chooses silent narration.
    if (visible('intro-audio-ask')) {
      activate(button === 0 ? 'audio-yes' : 'audio-no');
      return;
    }
    if (visible('ending-overlay')) {
      if (button === 0) activate('ending-home') || activate('ending-next');
      else activate('ending-prev');
      return;
    }
    if (visible('intro-overlay')) {
      if (button === 0) activate('intro-start') || activate('intro-next');
      else activate('intro-prev');
      return;
    }
    // Contact itself triggers a greeting, so the only field action is density.
    if (button === 0 && playEnabled()) {
      window.__dreamcoreGamepadAdvanceDensity?.();
    }
  }
  function reset() {
    padMove.x = padMove.y = 0;
    padMove.active = false;
    lastLocalButtons = [];
    localArmed = false;
    lastTime = 0;
    lastNarrationAt = -Infinity;
  }
  window.addEventListener('message', event => {
    if (window.parent === window || event.source !== window.parent ||
        event.origin !== location.origin || event.data?.type !== TYPE) return;
    if (event.data.action === 'release-all') { reset(); return; }
    if (event.data.action === 'button' && event.data.phase === 'down') {
      buttonDown(event.data.button);
    }
  });

  function pad() {
    try {
      const devices = Array.from(navigator.getGamepads() || []).filter(item => item?.connected);
      return devices.find(item => item.mapping === 'standard') || null;
    } catch {
      return null;
    }
  }
  function axis(v) {
    if (!Number.isFinite(v)) return 0;
    const x = Math.max(-1, Math.min(1, v));
    return Math.abs(x) <= DEADZONE ? 0 :
      Math.sign(x) * Math.pow((Math.abs(x) - DEADZONE) / (1 - DEADZONE), 1.2);
  }
  function sample(now) {
    requestAnimationFrame(sample);
    if (document.hidden) { reset(); return; }
    const device = pad();
    if (!device) { reset(); return; }

    const dt = Math.min(MAX_DELTA, lastTime ? Math.max(0, (now - lastTime) / 1000) : 0);
    lastTime = now;
    const axes = device.axes || [];
    let mx = axis(axes[0]), my = axis(axes[1]);
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    const allowed = playEnabled();
    padMove.x = allowed ? mx : 0;
    padMove.y = allowed ? my : 0;
    padMove.active = allowed && Math.hypot(mx, my) > 0.001;

    const rx = axis(axes[2]), ry = axis(axes[3]);
    if (allowed && dt && (rx || ry)) {
      window.__dreamcoreAdventureLook?.(rx, ry, dt);
    }

    // In a DreamCore iframe, the parent owns button edges.
    if (window.parent !== window) return;

    const buttons = Array.from(device.buttons || [],
      item => !!(item?.pressed || item?.value > 0.5));
    if (!localArmed) {
      if (buttons.every(value => !value)) localArmed = true;
    } else {
      for (const index of [0, 1]) {
        if (buttons[index] && !lastLocalButtons[index]) buttonDown(index);
      }
    }
    lastLocalButtons = buttons;
  }

  for (const event of ['blur', 'pagehide', 'gamepaddisconnected']) {
    window.addEventListener(event, reset);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
  });
  requestAnimationFrame(sample);
})();