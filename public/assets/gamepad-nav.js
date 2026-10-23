/* Windows GC201 / standard Gamepad API navigation and input relay.
 * Parent polls one controller and forwards game input through a versioned iframe contract.
 */
(() => {
  'use strict';
  if (!('getGamepads' in navigator)) return;
  const home = !!document.querySelector('#games-grid');
  const shell = !!document.querySelector('#game-frame');
  if (!home && !shell) return;

  const LAST_SELECTION = 'dreamcore-gamepad-selection';
  const TARGET_ORIGIN = location.origin;
  const DEADZONE = 0.18;
  const HOLD_MS = 650;
  const GAMEPAD_MESSAGE = 'dreamcore:gamepad-v2';
  const NAMES = [
    'south', 'east', 'west', 'north', 'lb', 'rb', 'lt', 'rt',
    'select', 'start', 'left-stick', 'right-stick',
    'dpad-up', 'dpad-down', 'dpad-left', 'dpad-right', 'home'
  ];
  const GAME_BUTTONS = NAMES.map((_, i) => i).filter(i => i !== 8 && i !== 9);

  const badge = document.createElement('span');
  badge.id = 'gamepad-status';
  badge.className = 'gamepad-status';
  badge.hidden = true;
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'polite');
  (document.querySelector('.header-actions') || document.querySelector('#game-nav'))?.append(badge);

  const systemDialog = document.createElement('dialog');
  systemDialog.id = 'gamepad-system-dialog';
  systemDialog.className = 'gamepad-system-dialog';
  systemDialog.setAttribute('aria-labelledby', 'gamepad-system-title');
  systemDialog.innerHTML =
    '<div class="gamepad-system-panel">' +
    '<h2 id="gamepad-system-title">コントローラーメニュー</h2>' +
    '<p>Aで決定・Bで戻る</p>' +
    '<div class="gamepad-system-actions">' +
    '<button type="button" data-gamepad-system="resume">ゲームにもどる</button>' +
    '<button type="button" data-gamepad-system="audio">おとのせってい</button>' +
    (shell ? '<button type="button" data-gamepad-system="home">トップページへ</button>' : '') +
    '</div></div>';
  if (home) systemDialog.querySelector('[data-gamepad-system="resume"]').textContent = 'メニューをとじる';
  document.body.append(systemDialog);

  let signature = '';
  let armed = false;
  let previous = [];
  let holdStart = [];
  let holdEmitted = [];
  let selected = null;
  let direction = '';
  let nextMoveAt = 0;
  let priorAxes = '';
  let modalWasOpen = false;
  let inputMode = 'gamepad';

  function setBadge(label, warning = false) {
    badge.hidden = !label;
    badge.textContent = label;
    badge.classList.toggle('is-warning', warning);
  }
  function getPad() {
    try {
      const pads = Array.from(navigator.getGamepads() || []).filter(p => p && p.connected);
      return pads.find(p => p.mapping === 'standard') || pads[0] || null;
    } catch {
      return null;
    }
  }
  function pressedButtons(pad) {
    return Array.from(pad.buttons || [], b => !!(b.pressed || b.value > 0.5));
  }
  function normalizePair(x, y) {
    const size = Math.hypot(x, y);
    if (size < DEADZONE) return [0, 0];
    const gain = Math.pow(Math.min(1, (size - DEADZONE) / (1 - DEADZONE)), 1.18) / size;
    return [x * gain, y * gain].map(v => Math.round(v * 50) / 50);
  }
  function normalizedAxes(pad) {
    const a = pad.axes || [];
    return [
      ...normalizePair(a[0] || 0, a[1] || 0),
      ...normalizePair(a[2] || 0, a[3] || 0)
    ];
  }
  function stickDirection(buttons, axes) {
    if (buttons[14] || axes[0] < -0.62) return 'left';
    if (buttons[15] || axes[0] > 0.62) return 'right';
    if (buttons[12] || axes[1] < -0.62) return 'up';
    if (buttons[13] || axes[1] > 0.62) return 'down';
    return '';
  }
  function audioDialog() {
    const dialog = document.querySelector('#audio-settings-dialog');
    return dialog?.open ? dialog : null;
  }
  function activeDialog() {
    return audioDialog() || (systemDialog.open ? systemDialog : null);
  }
  function dialogControls() {
    return Array.from(activeDialog()?.querySelectorAll('button, input') || [])
      .filter(el => !el.disabled && el.getClientRects().length > 0);
  }
  function cards() {
    return Array.from(document.querySelectorAll('#games-grid a.game-card, #works-grid a.work-card'))
      .filter(el => el.getClientRects().length > 0);
  }
  function choose(element) {
    if (!element) return;
    selected?.classList.remove('gamepad-selected');
    selected = element;
    selected.classList.add('gamepad-selected');
    selected.focus({ preventScroll: true });
    selected.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    if (home && element.matches('a.game-card, a.work-card')) {
      sessionStorage.setItem(LAST_SELECTION, element.getAttribute('href') || '');
    }
  }
  function initialCard() {
    const items = cards();
    const remembered = sessionStorage.getItem(LAST_SELECTION);
    return items.find(el => el.getAttribute('href') === remembered) || items[0] || null;
  }
  function ensureSelection() {
    if (!home || activeDialog() || inputMode !== 'gamepad') return;
    if (!cards().includes(selected)) choose(initialCard());
  }
  function adjustRange(element, amount) {
    if (!(element instanceof HTMLInputElement) || element.type !== 'range') return false;
    if (amount > 0) element.stepUp();
    else element.stepDown();
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function moveInDialog(dir) {
    const items = dialogControls();
    if (!items.length) return;
    const current = items.includes(document.activeElement) ? document.activeElement : items[0];
    if ((dir === 'left' || dir === 'right') && adjustRange(current, dir === 'right' ? 1 : -1)) return;
    if (dir === 'left' || dir === 'right') return;
    const pos = items.indexOf(current);
    choose(items[(pos + (dir === 'down' ? 1 : -1) + items.length) % items.length]);
  }
  function moveInGrid(dir) {
    ensureSelection();
    const items = cards();
    if (!items.length) return;
    const current = items.includes(selected) ? selected : items[0];
    const a = current.getBoundingClientRect();
    const cx = a.left + a.width / 2;
    const cy = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === current) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - cx;
      const dy = b.top + b.height / 2 - cy;
      const parallel = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      if (parallel < 8) continue;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = parallel + across * 2.6;
      if (score < bestScore) { best = el; bestScore = score; }
    }
    if (best) choose(best);
  }
  function emit(detail) {
    const frame = document.querySelector('#game-frame');
    if (!frame || frame.hidden || !frame.contentWindow) return;
    frame.contentWindow.postMessage(Object.assign({ type: GAMEPAD_MESSAGE }, detail), TARGET_ORIGIN);
  }
  function releaseGameInput() {
    if (!shell) return;
    emit({ action: 'release-all' });
    emit({ action: 'axes', axes: [0, 0, 0, 0] });
    priorAxes = '0,0,0,0';
  }
  function resetToNeutral() {
    armed = false;
    const pad = getPad();
    previous = pad ? pressedButtons(pad) : [];
    holdStart = [];
    holdEmitted = [];
    direction = '';
    nextMoveAt = 0;
  }
  function goHome() {
    if (shell) {
      releaseGameInput();
      location.assign('./');
    }
  }
  function openAudio() {
    releaseGameInput();
    resetToNeutral();
    document.querySelector('#audio-settings-open')?.click();
    if (audioDialog() && inputMode === 'gamepad') choose(dialogControls()[0]);
  }
  function toggleSystemMenu() {
    if (audioDialog()) {
      audioDialog().close();
      return;
    }
    if (systemDialog.open) {
      systemDialog.close();
      return;
    }
    releaseGameInput();
    resetToNeutral();
    systemDialog.showModal();
    if (inputMode === 'gamepad') choose(dialogControls()[0]);
  }
  function activate() {
    const dialog = activeDialog();
    if (dialog) {
      const items = dialogControls();
      const element = items.includes(document.activeElement) ? document.activeElement : items[0];
      if (element?.matches('button, input[type="checkbox"]')) element.click();
      return;
    }
    if (home) {
      ensureSelection();
      if (selected?.matches('a.game-card, a.work-card')) selected.click();
    }
  }
  function relayGameInput(buttons, axes, time) {
    for (const index of GAME_BUTTONS) {
      if (buttons[index] && !previous[index]) {
        holdStart[index] = time;
        holdEmitted[index] = false;
        emit({ action: 'button', phase: 'down', button: index, name: NAMES[index] });
      } else if (!buttons[index] && previous[index]) {
        emit({ action: 'button', phase: 'up', button: index, name: NAMES[index] });
        holdStart[index] = 0;
        holdEmitted[index] = false;
      } else if (buttons[index] && !holdEmitted[index] && Number.isFinite(holdStart[index]) &&
                 time - holdStart[index] >= HOLD_MS) {
        holdEmitted[index] = true;
        emit({ action: 'button', phase: 'hold', button: index, name: NAMES[index] });
      }
    }
    const key = axes.join(',');
    if (key !== priorAxes) {
      priorAxes = key;
      emit({ action: 'axes', axes });
    }
  }
  function sample(time) {
    if (document.hidden) return;
    const pad = getPad();
    const nextSignature = pad ? String(pad.index) + ':' + pad.id + ':' + pad.mapping : '';
    if (nextSignature !== signature) {
      if (signature) releaseGameInput();
      signature = nextSignature;
      resetToNeutral();
      priorAxes = '';
      if (!pad) {
        setBadge('');
        selected?.classList.remove('gamepad-selected');
        selected = null;
      } else if (pad.mapping !== 'standard') {
        setBadge('🎮 XInputモードで接続してください', true);
      } else {
        setBadge(shell ? '🎮 SELECT: ホーム / START: メニュー' : '🎮 コントローラー接続中');
      }
    }

    const dialog = activeDialog();
    const isModal = !!dialog;
    if (isModal && !modalWasOpen) {
      releaseGameInput();
      resetToNeutral();
    } else if (!isModal && modalWasOpen) {
      releaseGameInput();
      resetToNeutral();
    }
    modalWasOpen = isModal;

    if (pad && pad.mapping === 'standard') {
      const buttons = pressedButtons(pad);
      const axes = normalizedAxes(pad);
      const dir = stickDirection(buttons, axes);
      if (!armed) {
        if (!dir && !buttons.some(Boolean) && axes.every(v => v === 0)) {
          armed = true;
          if (home) ensureSelection();
        }
      } else {
        const justPressed = i => buttons[i] && !previous[i];
        if (dir || buttons.some(Boolean)) inputMode = 'gamepad';
        if (shell && justPressed(8) && !isModal) {
          goHome();
          resetToNeutral();
        } else if (justPressed(9)) {
          toggleSystemMenu();
        } else if (isModal || home) {
          if (home && !isModal) ensureSelection();
          if (dir) {
            if (dir !== direction || time >= nextMoveAt) {
              if (isModal) moveInDialog(dir);
              else moveInGrid(dir);
              nextMoveAt = time + (dir !== direction ? 290 : 135);
            }
          } else nextMoveAt = 0;
          direction = dir;
          if (justPressed(0)) activate();
          if (isModal && justPressed(1)) dialog.close();
        } else if (shell) {
          relayGameInput(buttons, axes, time);
        }
      }
      previous = buttons;
    }
  }

  systemDialog.addEventListener('click', event => {
    const button = event.target.closest('button[data-gamepad-system]');
    if (!button) return;
    const action = button.dataset.gamepadSystem;
    if (action === 'home') goHome();
    if (action === 'resume') systemDialog.close();
    if (action === 'audio') {
      systemDialog.close();
      openAudio();
    }
  });
  for (const dialog of [systemDialog]) {
    dialog.addEventListener('close', () => {
      releaseGameInput();
      resetToNeutral();
    });
  }
  window.addEventListener('pointerdown', () => {
    inputMode = 'pointer';
    selected?.classList.remove('gamepad-selected');
    selected = null;
    releaseGameInput();
    resetToNeutral();
  }, { capture: true });
  window.addEventListener('keydown', () => {
    inputMode = 'keyboard';
    selected?.classList.remove('gamepad-selected');
    selected = null;
    releaseGameInput();
    resetToNeutral();
  }, { capture: true });
  window.addEventListener('gamepaddisconnected', () => {
    releaseGameInput();
    signature = '';
    resetToNeutral();
    setBadge('');
    selected?.classList.remove('gamepad-selected');
    selected = null;
  });
  const frame = document.querySelector('#game-frame');
  frame?.addEventListener('load', () => {
    releaseGameInput();
    resetToNeutral();
  });
  for (const name of ['blur', 'pagehide']) {
    window.addEventListener(name, () => {
      releaseGameInput();
      resetToNeutral();
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseGameInput();
      resetToNeutral();
    }
  });
  // Poll input independently of rendering: a heavy WebGL child may throttle the shell RAF.
  setInterval(() => sample(performance.now()), 16);
})();
