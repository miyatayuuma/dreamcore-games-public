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
  return { step, press, release, pad, cards, target, frame, calls, handlers,
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
  h.press(8); h.step();
  assert.equal(h.assigned, './');
  assert.ok(h.calls.every(c => c.origin === 'https://game.test'));
  assert.ok(h.calls.some(c => c.message.action === 'release-all'));
});

test('math adapter rejects foreign messages and accepts same-origin parent input', () => {
  const handlers = new Map(), parent = {};
  const button = fakeElement('button'), overlay = fakeElement();
  overlay.hidden = true;
  const nodes = {
    '#overlay': overlay, '#keyboard-controls button': button
  };
  const document = {
    hidden: false,
    head: fakeElement(), body: fakeElement(),
    createElement: fakeElement,
    querySelector: selector => nodes[selector] || null,
    querySelectorAll: selector => selector === '#keyboard-controls button' ? [button] : [],
    addEventListener: (name, fn) => handlers.set('document:' + name, fn)
  };
  const window = { parent, addEventListener: (name, fn) => handlers.set(name, fn) };
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
  assert.equal(button.clicks || 0, 0);
  receive({ source: parent, origin: 'https://game.test', data: message });
  assert.equal(button.clicks, 1);
  receive({ source: parent, origin: 'https://game.test',
    data: { type: 'dreamcore:gamepad-v2', action: 'release-all' } });
});


test('FACTOR RAID page loads the public math controller adapter once', () => {
  const html = read('public/games/factor-raid/index.html');
  assert.equal((html.match(/src="\.\.\/\.\.\/assets\/gamepad-math-adapters\.mjs"/g) || []).length, 1);
  assert.match(html, /src="game\.js\?/);
});

test('FACTOR RAID adapter turns A into a pointer drop on the arena', () => {
  const handlers = new Map(), parent = {}, events = [];
  const card = fakeElement('div', 10), arena = fakeElement('div', 280);
  card.dataset.v = '2';
  card.dispatchEvent = event => { events.push({ target: 'card', type: event.type }); return true; };
  arena.dispatchEvent = event => { events.push({ target: 'arena', type: event.type }); return true; };
  const document = {
    hidden: false, head: fakeElement(), body: fakeElement(),
    createElement: fakeElement,
    querySelector: selector => selector === '#arena' ? arena : null,
    querySelectorAll: selector => selector === '#dock .card' ? [card] : [],
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
  handlers.get('message')({
    source: parent, origin: 'https://game.test',
    data: { type: 'dreamcore:gamepad-v2', action: 'button', phase: 'down', button: 0 }
  });
  assert.deepEqual(events.map(x => [x.target, x.type]), [
    ['card', 'pointerdown'], ['window', 'pointermove'], ['window', 'pointerup']
  ]);
});
