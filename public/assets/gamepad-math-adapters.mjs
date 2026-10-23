/* Direct Gamepad API actions for the two number games.
 * The same-origin launcher owns the cursor, A pointer emulation, and button relay.
 * There is no controller menu: the game itself shows the active choice.
 */
(() => {
  'use strict';
  const game = location.pathname.match(/\/games\/(core-break|factor-raid)\//)?.[1];
  if (!game || window.parent === window) return;
  const TYPE = 'dreamcore:gamepad-v2';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const style = document.createElement('style');
  style.textContent = '.dreamcore-pad-focus{outline:2px solid #ffe16a!important;outline-offset:2px!important;filter:brightness(1.12)}';
  document.head.append(style);

  let focused = null, cardIndex = 0, manualChoice = 'factor';
  function visible(el) {
    if (!el || !el.isConnected || el.disabled || el.hidden || !el.getClientRects().length) return false;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden') return false;
    }
    return true;
  }
  function clearFocus() {
    focused?.classList.remove('dreamcore-pad-focus');
    focused = null;
  }
  function focus(el) {
    if (!visible(el)) { clearFocus(); return false; }
    if (focused !== el) {
      clearFocus();
      focused = el;
      focused.classList.add('dreamcore-pad-focus');
    }
    return true;
  }
  function factorPhase() {
    if ($('#win')?.classList.contains('show')) return 'win';
    if ($('#lose')?.classList.contains('show')) return 'lose';
    return visible($('#digitPad')) ? 'manual' : 'cards';
  }
  function cards() {
    return $$('#dock .card').filter(visible);
  }
  function factorOption() {
    const phase = factorPhase();
    if (phase === 'manual') return manualChoice === 'prime' ? $('#manualPrime') : $('#factorReadout');
    if (phase === 'cards') {
      const list = cards();
      if (!list.length) return null;
      if (focused && list.includes(focused)) cardIndex = list.indexOf(focused);
      cardIndex = Math.max(0, Math.min(cardIndex, list.length - 1));
      return list[cardIndex];
    }
    return null;
  }
  function selectPrime() {
    if (factorPhase() === 'manual') {
      manualChoice = 'prime';
      focus($('#manualPrime'));
    } else {
      const list = cards();
      const i = list.findIndex(el => el.dataset.p === '1');
      if (i !== -1) { cardIndex = i; focus(list[i]); }
    }
  }
  function moveChoice(delta) {
    const phase = factorPhase();
    if (phase === 'manual') {
      manualChoice = delta > 0 ? 'prime' : 'factor';
      focus(factorOption());
    } else if (phase === 'cards') {
      const list = cards();
      if (!list.length) return;
      if (focused && list.includes(focused)) cardIndex = list.indexOf(focused);
      cardIndex = (cardIndex + delta + list.length) % list.length;
      focus(list[cardIndex]);
    }
  }
  function dragToArena(el) {
    const target = $('#arena');
    if (!visible(el) || !visible(target)) return false;
    const source = el.getBoundingClientRect(), dest = target.getBoundingClientRect();
    const x = source.left + source.width / 2, y = source.top + source.height / 2;
    const tx = dest.left + dest.width / 2, ty = dest.top + dest.height / 2;
    const init = { bubbles: true, cancelable: true, pointerId: 41, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: x, clientY: y }));
    window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: tx, clientY: ty }));
    window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: tx, clientY: ty }));
    return true;
  }
  function factorButton(button) {
    const phase = factorPhase();
    if (phase === 'win' || phase === 'lose') return;
    if (button === 4 || button === 5) moveChoice(button === 5 ? 1 : -1);
    else if (button === 2) selectPrime();
    else if (button === 1 && phase === 'manual') {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace', code: 'Backspace' }));
      manualChoice = 'factor';
      focus($('#factorReadout'));
    } else if (button === 7) {
      dragToArena(factorOption());
    }
  }
  function release() {
    if (game === 'core-break') window.__coreBreakGamepad?.release();
    clearFocus();
    cardIndex = 0;
    manualChoice = 'factor';
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.type !== TYPE) return;
    if (data.action === 'release-all') return release();
    if (data.action !== 'button' || !Number.isInteger(data.button) ||
        data.button < 0 || data.button > 16 ||
        (data.phase !== 'down' && data.phase !== 'up')) return;
    if (game === 'core-break') window.__coreBreakGamepad?.button(data.button, data.phase);
    else if (data.phase === 'down') factorButton(data.button);
  });
  if (game === 'factor-raid') {
    document.addEventListener('click', event => {
      if (factorPhase() !== 'manual') return;
      if (event.target.closest('#digitPad [data-digit], #factorClear, #factorReadout')) {
        manualChoice = 'factor';
        clearFocus();
      }
    });
  }
  document.addEventListener('pointerdown', event => { if (event.isTrusted) clearFocus(); }, { capture: true });
  document.addEventListener('keydown', event => { if (event.isTrusted) clearFocus(); }, { capture: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  window.addEventListener('blur', release);
  window.addEventListener('pagehide', release);
})();
