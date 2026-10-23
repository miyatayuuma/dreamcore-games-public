/* Public controller adapter for CORE BREAK and FACTOR RAID only.
 * The parent launcher is responsible for standard Gamepad API polling and
 * sending same-origin dreamcore:gamepad-v2 messages.
 */
(() => {
  'use strict';
  const game = location.pathname.match(/\/games\/(core-break|factor-raid)\//)?.[1];
  if (!game || window.parent === window) return;
  const TYPE = 'dreamcore:gamepad-v2';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const pressed = new Set();
  let active = false, axes = [0, 0, 0, 0], selected = null, index = 0;
  let phase = '', lastMove = 0, usedDirectionalInput = false;

  const style = document.createElement('style');
  style.textContent = '#dreamcore-pad-hud{position:fixed;z-index:2147482000;right:10px;bottom:8px;max-width:min(460px,calc(100vw - 20px));padding:6px 10px;border-radius:8px;color:#fff;background:rgba(9,17,34,.79);box-shadow:0 3px 12px #0005;font:600 12px/1.45 system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .18s}#dreamcore-pad-hud.is-visible{opacity:1}#dreamcore-pad-hud .pad-choice{display:block;color:#ffe18a;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dreamcore-pad-focus{outline:3px solid #ffe16a!important;outline-offset:3px!important;filter:brightness(1.14)}';
  document.head.append(style);
  const hud = document.createElement('div');
  hud.id = 'dreamcore-pad-hud';
  hud.setAttribute('role', 'status');
  hud.setAttribute('aria-live', 'off');
  hud.textContent = game === 'core-break'
    ? '十字キー: 操作選択　A: 実行　B: 戻る　X: エリア　Y: 一時停止'
    : '十字キー: 数を選択　A: 送る　Y: PRIME　LB/RB: モード変更';
  const detail = document.createElement('span');
  detail.className = 'pad-choice';
  hud.append(detail);
  document.body.append(hud);

  function visible(el) {
    if (!el || !el.isConnected || el.disabled || el.hidden || !el.getClientRects().length) return false;
    for (let parent = el; parent && parent.nodeType === 1; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      if (css.display === 'none' || css.visibility === 'hidden') return false;
    }
    return true;
  }
  function click(el) {
    if (!visible(el)) return false;
    el.click();
    return true;
  }
  function clearFocus() {
    selected?.classList.remove('dreamcore-pad-focus');
    selected = null;
  }
  function currentPhase() {
    if (game === 'core-break') return visible($('#overlay')) ? 'overlay' : 'play';
    if ($('#win')?.classList.contains('show')) return 'win';
    if ($('#lose')?.classList.contains('show')) return 'lose';
    return visible($('#digitPad')) ? 'manual' : 'cards';
  }
  function candidates() {
    if (game === 'core-break') {
      return currentPhase() === 'overlay' ? $$('#overlay button') : $$('#keyboard-controls button');
    }
    const p = currentPhase();
    if (p === 'win') return [$('#next')];
    if (p === 'lose') return [$('#retry')];
    if (p === 'manual') return $$('#digitPad [data-digit]');
    return $$('#dock .card');
  }
  function focus(delta = 0) {
    const current = currentPhase();
    const options = candidates().filter(visible);
    if (phase !== current) {
      phase = current;
      index = 0;
      usedDirectionalInput = false;
      clearFocus();
    }
    if (!options.length) {
      clearFocus();
      detail.textContent = '';
      return null;
    }
    if (delta) {
      index = (index + delta + options.length) % options.length;
      usedDirectionalInput = true;
    }
    index = Math.min(index, options.length - 1);
    const el = options[index];
    if (selected !== el) {
      clearFocus();
      selected = el;
      el.classList.add('dreamcore-pad-focus');
    }
    detail.textContent = (el.getAttribute('aria-label') || el.textContent?.trim() || el.dataset.v || '操作')
      .replace(/\s+/g, ' ').slice(0, 85);
    return el;
  }
  function direction(dx, dy) {
    if (game === 'core-break' && currentPhase() === 'play' && dx) {
      const radix = $('#keyboard-controls [data-pack-radix]');
      if (visible(radix)) {
        dx > 0 ? radix.stepUp() : radix.stepDown();
        radix.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
    focus((dx || dy) > 0 ? 1 : -1);
  }
  function dragToArena(el) {
    const target = $('#arena');
    if (!visible(el) || !visible(target)) return false;
    const a = el.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const fromX = a.left + a.width / 2, fromY = a.top + a.height / 2;
    const toX = b.left + b.width / 2, toY = b.top + b.height / 2;
    const base = { bubbles: true, cancelable: true, pointerId: 41, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: fromX, clientY: fromY }));
    window.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: toX, clientY: toY }));
    window.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: toX, clientY: toY }));
    return true;
  }
  function factor(action) {
    if (currentPhase() === 'win') return click($('#next'));
    if (currentPhase() === 'lose') return click($('#retry'));
    if (action === 'prime') {
      const prime = visible($('#manualPrime')) ? $('#manualPrime')
        : $$('#dock .card').find(el => el.dataset.p === '1');
      return dragToArena(prime);
    }
    if (action === 'fire' && visible($('#factorReadout'))) {
      return dragToArena($('#factorReadout'));
    }
    const option = focus();
    if (action === 'append' && option?.dataset.digit !== undefined) return click(option);
    if (option?.dataset.v) return dragToArena(option);
    return false;
  }
  function buttonDown(button) {
    if (button >= 12 && button <= 15) {
      const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      direction(...directions[button - 12]);
      lastMove = performance.now();
      return;
    }
    if (game === 'core-break') {
      if (button === 0) click(focus());
      if (button === 1) document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', code: 'Escape' }));
      if (button === 2) click($('#areas'));
      if (button === 3) click($('#pause'));
      return;
    }
    if (button === 0) factor(visible($('#digitPad')) ? 'append' : 'fire');
    if (button === 1) click($('#factorClear'));
    if (button === 2) {
      if (visible($('#digitPad'))) document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace' }));
      else factor('fire');
    }
    if (button === 3) factor('prime');
    if (button === 4 || button === 5) {
      const options = $$('#modes button[data-mode]');
      if (options.length) {
        const current = options.findIndex(el => el.classList.contains('on'));
        const next = (Math.max(0, current) + (button === 5 ? 1 : -1) + options.length) % options.length;
        click(options[next]);
      }
    }
    if (button === 6 && visible($('#digitPad'))) factor('fire');
    if (button === 7 && visible($('#digitPad'))) factor('prime');
  }
  function release() {
    pressed.clear();
    axes = [0, 0, 0, 0];
    active = false;
    index = 0;
    phase = '';
    usedDirectionalInput = false;
    clearFocus();
    hud.classList.remove('is-visible');
    detail.textContent = '';
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.type !== TYPE) return;
    if (data.action === 'release-all') return release();
    if (data.action === 'axes') {
      const next = Array.isArray(data.axes) ? data.axes.slice(0, 4)
        .map(value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0) : [];
      axes = [...next, 0, 0, 0, 0].slice(0, 4);
      if (!active && axes.every(value => value === 0)) return;
      active = true;
      hud.classList.add('is-visible');
      return;
    }
    if (data.action === 'button' && data.phase === 'down' &&
        Number.isInteger(data.button) && data.button >= 0 && data.button <= 16 &&
        data.button !== 8 && data.button !== 9) {
      pressed.add(data.button);
      active = true;
      hud.classList.add('is-visible');
      buttonDown(data.button);
    } else if (data.action === 'button' && data.phase === 'up') {
      pressed.delete(data.button);
    }
  });
  document.addEventListener('pointerdown', event => { if (event.isTrusted) release(); }, { capture: true });
  document.addEventListener('keydown', event => { if (event.isTrusted) release(); }, { capture: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  window.addEventListener('blur', release);
  window.addEventListener('pagehide', release);
  setInterval(() => {
    if (!active || document.hidden) return;
    if (phase !== currentPhase() || (selected && !selected.isConnected)) focus();
    const x = Math.abs(axes[0]) > .7 ? Math.sign(axes[0]) : 0;
    const y = Math.abs(axes[1]) > .7 ? Math.sign(axes[1]) : 0;
    const directionButton = pressed.has(12) ? [0, -1] : pressed.has(13) ? [0, 1]
      : pressed.has(14) ? [-1, 0] : pressed.has(15) ? [1, 0]
      : (x || y) ? [x, y] : null;
    const now = performance.now();
    if (directionButton && now - lastMove >= 180) {
      direction(...directionButton);
      lastMove = now;
    }
  }, 80);
})();
