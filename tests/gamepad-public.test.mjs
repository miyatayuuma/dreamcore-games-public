import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const navigation = read('public/assets/gamepad-nav.js');
const adapter = read('public/assets/gamepad-math-adapters.mjs');
const diagnostic = read('public/gamepad-check.html');

function fakeElement(tag = 'div', left = 0, href = '') {
  const classes = new Set(), events = [];
  const el = {
    tagName: tag.toUpperCase(), nodeType: 1, parentElement: null,
    hidden: false, disabled: false, isConnected: true, open: false,
    textContent: '', dataset: {}, style: {}, children: [], events,
    classList: {
      add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name), toggle: (name, enabled) =>
        enabled ? classes.add(name) : classes.delete(name)
    },
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({
      left, top: 0, right: left + 120, bottom: 80, width: 120, height: 80
    }),
    getAttribute: name => name === 'href' ? href : '',
    setAttribute() {}, append(child) { el.children.push(child); },
    addEventListener() {}, scrollIntoView() {},
    dispatchEvent(event) { events.push(event.type); return true; },
    matches: selector => (tag === 'a' && selector.includes('a.game-card')) ||
      (tag === 'button' && selector.includes('button')),
    focus() { el.focused = true; },
    click() { el.clicks = (el.clicks || 0) + 1; },
    querySelector: () => fakeElement('button'),
    querySelectorAll: () => [],
    showModal() { el.open = true; },
    close() { el.open = false; }
  };
  return el;
}

function navigationHarness(mode) {
  const calls = [], handlers = new Map();
  class SyntheticEvent {
    constructor(type, init) { Object.assign(this, { type }, init); }
  }
  const cards = [fakeElement('a', 0, './one'), fakeElement('a', 200, './two')];
  const target = fakeElement('button');
  const frame = fakeElement('iframe');
  frame.getBoundingClientRect = () =>
    ({ left: 0, top: 50, right: 800, bottom: 600, width: 800, height: 550 });
  const child = {
    document: { elementFromPoint: () => target },
    PointerEvent: SyntheticEvent, MouseEvent: SyntheticEvent,
    postMessage: (message, origin) => calls.push({ message, origin }),
    __dreamcoreGamepadCaptureA: () => false,
    __dreamcoreGamepadCursorMode: () => 'on',
    scrollBy() {}
  };
  frame.contentWindow = child;
  const pad = {
    index: 0, id: 'mock XInput', mapping: 'standard', connected: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0]
  };
  let now = 0, tick = null, assigned = null, currentX = 400;
  const document = {
    body: fakeElement(), hidden: false,
    querySelector(selector) {
      if (selector === '#games-grid') return mode === 'home' ? fakeElement() : null;
      if (selector === '#game-frame') return mode === 'shell' ? frame : null;
      if (selector === '.header-actions' || selector === '#game-nav') return fakeElement();
      return null;
    },
    elementFromPoint(x) { currentX = x; return x < 250 ? cards[0] : cards[1]; },
    createElement: fakeElement,
    addEventListener(name, listener) { handlers.set('document:' + name, listener); }
  };
  const window = {
    innerWidth: 800, innerHeight: 600,
    PointerEvent: SyntheticEvent, MouseEvent: SyntheticEvent,
    addEventListener: (name, fn) => handlers.set(name, fn),
    scrollBy() {}
  };
  runInNewContext(navigation, {
    navigator: { getGamepads: () => [pad] },
    document, window,
    location: { origin: 'https://game.test', assign: path => { assigned = path; } },
    performance: { now: () => now },
    setInterval: fn => { tick = fn; }
  }, { timeout: 1000 });
  assert.ok(tick, 'polling loop installed');
  const step = () => { now += 33; tick(); };
  const press = index => { pad.buttons[index].pressed = true; pad.buttons[index].value = 1; };
  const release = index => { pad.buttons[index].pressed = false; pad.buttons[index].value = 0; };
  return { step, press, release, pad, cards, target, frame, child, calls, handlers,
    get currentX() { return currentX; },
    get assigned() { return assigned; } };
}

test('public controller scripts parse, including diagnostic inline script', () => {
  new Script(navigation);
  new Script(adapter);
  const inline = diagnostic.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i);
  assert.ok(inline, 'diagnostic script exists');
  new Script(inline[1]);
});

test('controller core stays sanitized and uses one compact tap cursor', () => {
  const source = [navigation, adapter, diagnostic].join('\n');
  for (const privateName of [
    'michitanken', 'lost-gecko', 'tanabata-night', 'ao-quiz',
    'charge-crash', 'tap-challenge', 'miyatayuuma'
  ]) assert.equal(source.includes(privateName), false, privateName);
  assert.match(navigation, /dreamcore:gamepad-v2/);
  assert.match(navigation, /release-all/);
  assert.match(navigation, /dreamcore-gamepad-cursor/);
  assert.doesNotMatch(navigation, /コントローラーメニュー|moveInGrid|pad-choice/);
  assert.match(adapter, /event\.origin !== location\.origin/);
  assert.match(adapter, /event\.source !== window\.parent/);
});

test('D-pad moves a free cursor, A taps the element under the cursor', () => {
  const h = navigationHarness('home');
  h.step(); // neutral arm at screen center (x = 400)
  h.press(14);
  for (let i = 0; i < 15; i++) h.step();
  h.release(14); h.step();
  h.press(0); h.step();
  assert.ok(h.currentX < 250, 'cursor moved horizontally, not card-focus navigation');
  assert.ok(h.cards[0].events.includes('pointerdown'));
  h.release(0); h.step();
  assert.ok(h.cards[0].events.includes('pointerup'));
  assert.equal(h.cards[0].clicks, 1);
  assert.equal(h.cards[1].clicks || 0, 0);
});

test('shell A produces pointer tap, dragging holds pointer, Select returns home', () => {
  const h = navigationHarness('shell');
  h.step();
  h.press(0); h.step();
  h.release(0); h.step();
  assert.deepEqual(h.target.events.slice(0, 4),
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup']);
  assert.equal(h.target.clicks, 1);
  h.press(0); h.step();
  h.pad.axes[0] = 1;
  for (let i = 0; i < 5; i++) h.step();
  h.release(0); h.step();
  assert.ok(h.target.events.includes('pointermove'));
  assert.equal(h.target.clicks, 1, 'drag must not synthesize a tap');
  h.pad.axes[0] = 0; h.step();
  h.press(0); h.step();
  h.press(1); h.step();
  assert.ok(h.target.events.includes('pointercancel'));
  h.release(0); h.release(1); h.step();
  h.press(8); h.step();
  assert.equal(h.assigned, './');
  assert.ok(h.calls.every(c => c.origin === 'https://game.test'));
  assert.ok(h.calls.some(c => c.message.action === 'release-all'));
  assert.ok(h.calls.some(c => c.message.action === 'button' && c.message.button === 0));
});

test('a dragged pointer remains captured by its original canvas even over another element', () => {
  const h = navigationHarness('shell');
  const overlay = fakeElement('button');
  h.step();
  h.press(0); h.step();
  h.child.document.elementFromPoint = () => overlay;
  h.pad.axes[0] = 1;
  for (let i = 0; i < 5; i++) h.step();
  h.release(0); h.step();
  assert.ok(h.target.events.includes('pointermove'));
  assert.ok(h.target.events.includes('pointerup'));
  assert.equal(overlay.events.length, 0, 'other controls cannot steal an active drag');
  assert.equal(h.target.clicks || 0, 0, 'drag must not click its origin');
});

test('the shell relays L/R/X/ZR and does not create a pointer for a button-only game state', () => {
  const h = navigationHarness('shell');
  h.child.__dreamcoreGamepadCaptureA = () => true;
  h.child.__dreamcoreGamepadCursorMode = () => 'off';
  h.step();
  for (const button of [4, 5, 2, 7, 0]) {
    h.press(button); h.step(); h.release(button); h.step();
  }
  assert.equal(h.target.events.length, 0, 'captured A never fires pointer events');
  for (const button of [4, 5, 2, 7, 0]) {
    assert.equal(h.calls.filter(c => c.message.action === 'button' &&
      c.message.button === button && c.message.phase === 'down').length, 1);
    assert.equal(h.calls.filter(c => c.message.action === 'button' &&
      c.message.button === button && c.message.phase === 'up').length, 1);
  }
});

test('math adapter rejects foreign messages and accepts same-origin parent input', () => {
  const handlers = new Map(), parent = {};
  const actions = [];
  const document = {
    hidden: false,
    head: fakeElement(), body: fakeElement(),
    createElement: fakeElement,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (name, fn) => handlers.set('document:' + name, fn)
  };
  const window = { parent,
    __coreBreakGamepad: {
      button: (...args) => actions.push(args),
      release: () => actions.push(['release'])
    },
    addEventListener: (name, fn) => handlers.set(name, fn)
  };
  runInNewContext(adapter, {
    window, document, location: {
      pathname: '/games/core-break/index.html', origin: 'https://game.test'
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    performance: { now: () => 1000 },
    setInterval() {},
    Event: class {}, KeyboardEvent: class {}, PointerEvent: class {}
  }, { timeout: 1000 });
  const message = { type: 'dreamcore:gamepad-v2', action: 'button', phase: 'down', button: 0 };
  const receive = handlers.get('message');
  assert.ok(receive);
  receive({ source: {}, origin: 'https://game.test', data: message });
  receive({ source: parent, origin: 'https://foreign.test', data: message });
  assert.equal(actions.length, 0);
  receive({ source: parent, origin: 'https://game.test', data: message });
  assert.deepEqual(actions[0], [0, 'down']);
  receive({ source: parent, origin: 'https://game.test',
    data: { type: 'dreamcore:gamepad-v2', action: 'release-all' } });
  assert.deepEqual(actions[1], ['release']);
});


test('FACTOR RAID page loads the public math controller adapter once', () => {
  const html = read('public/games/factor-raid/index.html');
  assert.equal((html.match(/src="\.\.\/\.\.\/assets\/gamepad-math-adapters\.mjs"/g) || []).length, 1);
  assert.match(html, /src="game\.js\?/);
});

test('FACTOR RAID L/R selects a card, X selects PRIME, and only ZR attacks', () => {
  const handlers = new Map(), parent = {}, events = [];
  const cards = Array.from({ length: 5 }, (_, i) => fakeElement('div', 10 + i * 20));
  cards.forEach((card, i) => {
    card.dataset.v = i < 4 ? String(i + 2) : 'PRIME';
    card.dataset.p = i === 4 ? '1' : '0';
    card.dispatchEvent = event => { events.push({ target: String(i), type: event.type }); return true; };
  });
  const arena = fakeElement('div', 280);
  const document = {
    hidden: false, head: fakeElement(), body: fakeElement(),
    createElement: fakeElement,
    querySelector: selector => selector === '#arena' ? arena : null,
    querySelectorAll: selector => selector === '#dock .card' ? cards : [],
    addEventListener: (name, fn) => handlers.set('document:' + name, fn)
  };
  const window = {
    parent, addEventListener: (name, fn) => handlers.set(name, fn),
    dispatchEvent: event => { events.push({ target: 'window', type: event.type }); return true; }
  };
  class SyntheticPointer {
    constructor(type, init) { Object.assign(this, { type }, init); }
  }
  runInNewContext(adapter, {
    window, document, location: {
      pathname: '/games/factor-raid/index.html', origin: 'https://game.test'
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    performance: { now: () => 1000 }, setInterval() {},
    Event: class {}, KeyboardEvent: class {}, PointerEvent: SyntheticPointer
  }, { timeout: 1000 });
  const send = button => handlers.get('message')({
    source: parent, origin: 'https://game.test',
    data: { type: 'dreamcore:gamepad-v2', action: 'button', phase: 'down', button }
  });
  send(5);
  assert.equal(events.length, 0, 'selection must not auto-attack');
  assert.equal(cards[1].classList.contains('dreamcore-pad-focus'), true);
  send(2);
  assert.equal(events.length, 0, 'X only selects PRIME');
  assert.equal(cards[4].classList.contains('dreamcore-pad-focus'), true);
  send(7);
  assert.deepEqual(events.map(x => [x.target, x.type]), [
    ['4', 'pointerdown'], ['window', 'pointermove'], ['window', 'pointerup']
  ]);
});

test('FACTOR RAID manual input keeps PRIME selection separate from backspace and ZR', () => {
  const handlers = new Map(), parent = {}, events = [];
  const digitPad = fakeElement('div'), readout = fakeElement('div', 10),
    prime = fakeElement('div', 140), arena = fakeElement('div', 280);
  const document = {
    hidden: false, head: fakeElement(), body: fakeElement(),
    createElement: fakeElement,
    querySelector(selector) {
      return { '#digitPad': digitPad, '#factorReadout': readout,
        '#manualPrime': prime, '#arena': arena }[selector] || null;
    },
    querySelectorAll: () => [],
    addEventListener: (name, fn) => handlers.set('document:' + name, fn),
    dispatchEvent: event => events.push(['document', event.key])
  };
  const window = {
    parent, addEventListener: (name, fn) => handlers.set(name, fn),
    dispatchEvent: event => events.push(['window', event.type])
  };
  readout.dispatchEvent = e => { events.push(['factor', e.type]); return true; };
  prime.dispatchEvent = e => { events.push(['prime', e.type]); return true; };
  class SyntheticPointer {
    constructor(type, init) { Object.assign(this, { type }, init); }
  }
  runInNewContext(adapter, { window, document,
    location: { pathname: '/games/factor-raid/index.html', origin: 'https://game.test' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    PointerEvent: SyntheticPointer, KeyboardEvent: SyntheticPointer
  }, { timeout: 1000 });
  const send = button => handlers.get('message')({
    source: parent, origin: 'https://game.test',
    data: { type: 'dreamcore:gamepad-v2', action: 'button', phase: 'down', button }
  });
  send(5); send(7);
  assert.deepEqual(events.slice(0, 3), [
    ['prime', 'pointerdown'], ['window', 'pointermove'], ['window', 'pointerup']
  ]);
  events.length = 0;
  send(4); send(1); send(7);
  assert.deepEqual(events.slice(0, 4), [
    ['document', 'Backspace'], ['factor', 'pointerdown'],
    ['window', 'pointermove'], ['window', 'pointerup']
  ]);
});

test('CORE BREAK exposes rule-specific direct controller actions and no menu HUD', () => {
  const game = read('public/games/core-break/src/game.mjs');
  const flowView = read('public/games/core-break/src/flow-view.mjs');
  assert.match(game, /__coreBreakGamepad = \{ button: padButton, release: clearPadState \}/);
  assert.match(game, /padPackNext\(\)/);
  assert.match(game, /pad\.gearCandidate !== null/);
  assert.match(flowView, /drawSelectorDots\(this, displayedWidth,/,
    'GEAR selector renders the pending choice without changing piece widths');
  assert.doesNotMatch(adapter, /dreamcore-pad-hud|data-piece|data-target/);
});
