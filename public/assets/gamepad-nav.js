/* Virtual tap cursor for standard Gamepad API controllers.
 * One shared controller, one on-screen pointer. The launcher owns input;
 * games keep their existing pointer/touch UI and are not given control menus.
 */
(() => {
  'use strict';
  if (!('getGamepads' in navigator)) return;
  const home = !!document.querySelector('#games-grid');
  const frame = document.querySelector('#game-frame');
  if (!home && !frame) return;

  const DEADZONE = 0.19;
  const SPEED = 1600;         // CSS pixels per second at full stick travel.
  const CURSOR_EXPONENT = 0.9; // Faster middle travel, fine control near center.
  const DPAD_SPEED = 480;
  const SCROLL_SPEED = 820;
  const MAX_FRAME_MS = 50;
  const TAP_TOLERANCE = 9;
  const TYPE = 'dreamcore:gamepad-v2';
  const cursor = document.createElement('div');
  cursor.id = 'dreamcore-gamepad-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  document.body.append(cursor);

  const warning = document.createElement('span');
  warning.id = 'gamepad-status';
  warning.className = 'gamepad-status';
  warning.hidden = true;
  warning.setAttribute('role', 'status');
  (document.querySelector('.header-actions') || document.querySelector('#game-nav'))?.append(warning);

  let signature = '';
  let armed = false;
  let lastButtons = [];
  let lastTime = 0;
  let x = 0, y = 0, positioned = false;
  let holding = null;
  let controllerVisible = false;
  let capturedA = false;

  function gameControl(name, fallback) {
    if (!frame || frame.hidden) return fallback;
    try {
      const control = frame.contentWindow?.[name];
      return typeof control === 'function' ? control() : fallback;
    } catch { return fallback; }
  }
  function pointerDisabled() {
    return gameControl('__dreamcoreGamepadCursorMode', 'on') === 'off';
  }
  function relayButton(button, phase) {
    if (!frame || frame.hidden) return;
    try {
      frame.contentWindow?.postMessage({ type: TYPE, action: 'button', button, phase }, location.origin);
    } catch { /* The game may be navigating to another origin. */ }
  }

  function getPad() {
    try {
      const pads = Array.from(navigator.getGamepads() || []).filter(p => p?.connected);
      return pads.find(p => p.mapping === 'standard') || pads[0] || null;
    } catch {
      return null;
    }
  }
  function pressedButtons(pad) {
    return Array.from(pad.buttons || [], b => !!(b?.pressed || b?.value > 0.5));
  }
  function stick(value) {
    const n = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    return Math.abs(n) < DEADZONE ? 0 : Math.sign(n) * Math.pow((Math.abs(n) - DEADZONE) / (1 - DEADZONE), 1.25);
  }
  function cursorAxes(rawX, rawY) {
    const x = Number.isFinite(rawX) ? clamp(rawX, -1, 1) : 0;
    const y = Number.isFinite(rawY) ? clamp(rawY, -1, 1) : 0;
    const length = Math.hypot(x, y);
    if (length <= DEADZONE) return { x: 0, y: 0 };
    // One radial curve avoids boosting diagonals above cardinal speed.
    const speed = Math.pow((Math.min(1, length) - DEADZONE) / (1 - DEADZONE), CURSOR_EXPONENT);
    return { x: x / length * speed, y: y / length * speed };
  }
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function initialPosition() {
    const bounds = frame && !frame.hidden ? frame.getBoundingClientRect() : null;
    x = window.innerWidth / 2;
    y = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2;
    positioned = true;
  }
  function paint() {
    cursor.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
    cursor.classList.toggle('is-visible', controllerVisible && !pointerDisabled());
    cursor.classList.toggle('is-pressed', !!holding);
  }
  function recordAt(clientX, clientY) {
    if (frame && !frame.hidden) {
      const rect = frame.getBoundingClientRect();
      if (clientX >= rect.left && clientX < rect.right &&
          clientY >= rect.top && clientY < rect.bottom) {
        try {
          const inner = frame.contentWindow;
          const doc = inner?.document;
          const px = clientX - rect.left, py = clientY - rect.top;
          const element = doc?.elementFromPoint(px, py);
          if (element) return { element, win: inner, x: px, y: py };
        } catch {
          // An independently hosted/cross-origin game cannot be sent DOM events.
          return null;
        }
      }
    }
    const element = document.elementFromPoint(clientX, clientY);
    return element ? { element, win: window, x: clientX, y: clientY } : null;
  }
  function dispatch(record, phase, buttons) {
    if (!record?.element?.isConnected) return;
    const { element, win, x: clientX, y: clientY } = record;
    const init = {
      bubbles: true, cancelable: true, composed: true, button: 0, buttons,
      clientX, clientY, pointerId: 41, pointerType: 'mouse', isPrimary: true
    };
    if (typeof win.PointerEvent === 'function') {
      element.dispatchEvent(new win.PointerEvent('pointer' + phase, init));
    }
    const mouse = { down: 'mousedown', move: 'mousemove', up: 'mouseup' }[phase];
    if (mouse && typeof win.MouseEvent === 'function') {
      element.dispatchEvent(new win.MouseEvent(mouse, init));
    }
  }
  function heldRecordAt(clientX = x, clientY = y) {
    if (!holding) return null;
    const start = holding.start;
    const rect = frame && start.win === frame.contentWindow
      ? frame.getBoundingClientRect() : null;
    return {
      element: start.element,
      win: start.win,
      x: rect ? clientX - rect.left : clientX,
      y: rect ? clientY - rect.top : clientY
    };
  }
  function finishHold(cancel = false) {
    if (!holding) return;
    // Emulate pointer capture: a held drag must stay owned by its start element,
    // including when the cursor crosses canvas controls or the iframe edge.
    const end = heldRecordAt();
    if (cancel) {
      if (holding.start.element.isConnected && typeof holding.start.win.PointerEvent === 'function') {
        holding.start.element.dispatchEvent(new holding.start.win.PointerEvent('pointercancel', {
          bubbles: true, pointerId: 41, pointerType: 'mouse', isPrimary: true
        }));
      }
      // Many canvas games only clean up their drag on pointerup, not pointercancel.
      // Release outside the playable area, avoiding an accidental drop/action.
      dispatch({ ...holding.start, x: -1, y: -1 }, 'up', 0);
    } else {
      dispatch(end, 'up', 0);
      const distance = Math.hypot(x - holding.x, y - holding.y);
      if (distance <= TAP_TOLERANCE && holding.start.element.isConnected &&
          typeof holding.start.element.click === 'function') {
        holding.start.element.click();
      }
    }
    holding = null;
    paint();
  }
  function release() {
    finishHold(true);
    capturedA = false;
    armed = false;
    lastButtons = [];
    controllerVisible = false;
    paint();
    if (frame?.contentWindow && !frame.hidden) {
      frame.contentWindow.postMessage({ type: TYPE, action: 'release-all' }, location.origin);
    }
  }
  function activateCursor() {
    if (!positioned) initialPosition();
    controllerVisible = true;
    paint();
  }
  function tapDown() {
    if (holding) return;
    activateCursor();
    const start = recordAt(x, y);
    if (!start) return;
    holding = { start, x, y };
    dispatch(start, 'down', 1);
    paint();
  }
  function moveCursor(pad, buttons, dt) {
    if (pointerDisabled()) { paint(); return; }
    const axes = pad.axes || [];
    let { x: vx, y: vy } = cursorAxes(axes[0], axes[1]);
    const dpad = buttons[12] || buttons[13] || buttons[14] || buttons[15];
    if (dpad) {
      vx = Number(!!buttons[15]) - Number(!!buttons[14]);
      vy = Number(!!buttons[13]) - Number(!!buttons[12]);
      const length = Math.hypot(vx, vy);
      if (length > 1) { vx /= length; vy /= length; }
    }
    const speed = dpad ? DPAD_SPEED : SPEED;
    const dx = vx * speed * dt, dy = vy * speed * dt;
    if (dx || dy) {
      x = clamp(x + dx, 0, Math.max(0, window.innerWidth - 1));
      y = clamp(y + dy, 0, Math.max(0, window.innerHeight - 1));
      activateCursor();
      if (holding) dispatch(heldRecordAt(), 'move', 1);
      paint();
    }
    const wheel = stick(axes[3]);
    if (wheel) {
      let target = window;
      if (frame && !frame.hidden && y >= frame.getBoundingClientRect().top) {
        try { target = frame.contentWindow || window; } catch { target = window; }
      }
      target.scrollBy?.(0, wheel * SCROLL_SPEED * dt);
      activateCursor();
    }
    if (home && vy && !holding) {
      const edge = 42;
      if ((y > window.innerHeight - edge && vy > 0) || (y < edge && vy < 0)) {
        window.scrollBy?.(0, vy * SCROLL_SPEED * dt);
      }
    }
  }
  function sample(now) {
    if (document.hidden) return;
    const pad = getPad();
    const nextSignature = pad ? String(pad.index) + ':' + pad.id + ':' + pad.mapping : '';
    if (signature !== nextSignature) {
      release();
      signature = nextSignature;
      positioned = false;
      if (pad && pad.mapping !== 'standard') {
        warning.hidden = false;
        warning.textContent = 'XInputモードで接続してください';
        warning.classList.add('is-warning');
      } else {
        warning.hidden = true;
        warning.textContent = '';
        warning.classList.remove('is-warning');
      }
    }
    const dt = clamp(lastTime ? (now - lastTime) / 1000 : 0, 0, MAX_FRAME_MS / 1000);
    lastTime = now;
    if (!pad || pad.mapping !== 'standard') return;

    const buttons = pressedButtons(pad);
    const axes = pad.axes || [];
    const neutral = !buttons.some(Boolean) &&
      [0, 1, 2, 3].every(i => Math.abs(axes[i] || 0) < DEADZONE);
    if (!armed) {
      if (neutral) {
        armed = true;
        activateCursor();
      }
      lastButtons = buttons;
      return;
    }
    const pressed = index => buttons[index] && !lastButtons[index];
    const released = index => !buttons[index] && lastButtons[index];
    moveCursor(pad, buttons, dt);
    for (let i = 0; i < buttons.length; i++) {
      if (i === 8 || i === 9) continue;
      if (pressed(i)) relayButton(i, 'down');
      if (released(i)) relayButton(i, 'up');
    }
    if (pressed(0)) {
      capturedA = !!gameControl('__dreamcoreGamepadCaptureA', false);
      if (!capturedA) tapDown();
    }
    if (released(0)) {
      if (!capturedA) finishHold();
      capturedA = false;
    }
    if (pressed(1)) finishHold(true);
    if (frame && pressed(8)) {
      release();
      location.assign('./');
      return;
    }
    lastButtons = buttons;
  }

  window.addEventListener('pointerdown', event => {
    if (event.isTrusted) {
      finishHold(true);
      controllerVisible = false;
      paint();
    }
  }, { capture: true });
  window.addEventListener('keydown', event => {
    if (event.isTrusted) {
      finishHold(true);
      controllerVisible = false;
      paint();
    }
  }, { capture: true });
  window.addEventListener('gamepaddisconnected', () => {
    release();
    signature = '';
    warning.hidden = true;
  });
  frame?.addEventListener('load', () => {
    finishHold(true);
    positioned = false;
    if (controllerVisible) { initialPosition(); paint(); }
  });
  for (const name of ['blur', 'pagehide']) window.addEventListener(name, release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  setInterval(() => sample(performance.now()), 16);
})();
