import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const navigation = read('public/assets/gamepad-nav.js');
const adapter = read('public/assets/gamepad-math-adapters.mjs');
const diagnostic = read('public/gamepad-check.html');

function fakeElement(tag = 'div', left = 0, href = '') {
  const classes = new Set();
  const el = {
    tagName: tag.toUpperCase(), nodeType: 1, parentElement: null,
    hidden: false, disabled: false, isConnected: true, open: false,
    textContent: '', dataset: {}, style: {}, children: [],
    classList: {
      add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name), toggle: (name, enabled) =>
        enabled ? classes.add(name) : classes.delete(name)
    },
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ left, top: 0, width: 120, height: 80 }),
    getAttribute: name => name === 'href' ? href : '',
    setAttribute() {}, append(child) { el.children.push(child); },
    addEventListener() {}, scrollIntoView() {},
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
  const calls = [], handlers = new Map(), session = new Map();
  const frame = fakeElement('iframe');
  frame.contentWindow = { postMessage: (message, origin) => calls.push({ message, origin }) };
  const cards = [fakeElement('a', 0, './game-one'), fakeElement('a', 200, './game-two')];
  const menu = fakeElement('div');
  const pad = {
    index: 0, id: 'mock XInput', mapping: 'standard', connected: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0]
  };
  let now = 0, tick = null, assigned = null;
  const document = {
    body: fakeElement(), hidden: false, activeElement: null,
    querySelector(selector) {
      if (selector === '#games-grid') return mode === 'home' ? fakeElement() : null;
      if (selector === '#game-frame') return mode === 'shell' ? frame : null;
      if (selector === '.header-actions' || selector === '#game-nav') return menu;
      return null;
    },
    querySelectorAll(selector) {
      return selector.startsWith('#games-grid a.game-card') && mode === 'home' ? cards : [];
    },
    createElement: fakeElement,
    addEventListener(name, listener) { handlers.set('document:' + name, listener); }
  };
  runInNewContext(navigation, {
    navigator: { getGamepads: () => [pad] },
    document, window: { addEventListener: (name, fn) => handlers.set(name, fn) },
    location: { origin: 'https://game.test', assign: path => { assigned = path; } },
    sessionStorage: {
      getItem: key => session.get(key) || null,
      setItem: (key, value) => session.set(key, value)
    },
    performance: { now: () => now },
    setInterval: fn => { tick = fn; },
    HTMLInputElement: class {}, Event: class {}
  }, { timeout: 1000 });
  assert.ok(tick, 'polling loop installed');
  const step = () => { now += 30; tick(); };
  const press = index => { pad.buttons[index].pressed = true; pad.buttons[index].value = 1; };
  const release = index => { pad.buttons[index].pressed = false; pad.buttons[index].value = 0; };
  return {
    step, press, release, pad, cards, calls, handlers,
    get assigned() { return assigned; }
  };
}

test('public controller scripts parse, including diagnostic inline script', () => {
  new Script(navigation);
  new Script(adapter);
  const inline = diagnostic.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i);
  assert.ok(inline, 'diagnostic script exists');
  new Script(inline[1]);
});

test('controller core stays on public/sanitized side of repository boundary', () => {
  const source = [navigation, adapter, diagnostic].join('\n');
  for (const privateName of [
    'michitanken', 'lost-gecko', 'tanabata-night', 'ao-quiz',
    'charge-crash', 'tap-challenge', 'miyatayuuma'
  ]) {
    assert.equal(source.includes(privateName), false, 'private identifier: ' + privateName);
  }
  assert.match(navigation, /dreamcore:gamepad-v2/);
  assert.match(navigation, /release-all/);
  assert.match(adapter, /event\.origin !== location\.origin/);
  assert.match(adapter, /event\.source !== window\.parent/);
  assert.match(adapter, /core-break\|factor-raid/);
});

test('home navigation selects nearest card and A activates it', () => {
  const h = navigationHarness('home');
  h.step(); // neutral arming
  assert.equal(h.cards[0].focused, true);
  h.press(15); h.step(); // right
  assert.equal(h.cards[1].focused, true);
  h.release(15); h.step();
  h.press(0); h.step(); // A
  assert.equal(h.cards[1].clicks, 1);
});

test('shell relays button edges and zeros input on blur or Select', () => {
  const h = navigationHarness('shell');
  h.step();
  h.press(0); h.step();
  h.release(0); h.step();
  assert.ok(h.calls.some(c => c.message.action === 'button' && c.message.button === 0 && c.message.phase === 'down'));
  assert.ok(h.calls.some(c => c.message.action === 'button' && c.message.button === 0 && c.message.phase === 'up'));
  assert.ok(h.calls.every(c => c.origin === 'https://game.test'));
  h.handlers.get('blur')();
  assert.ok(h.calls.some(c => c.message.action === 'release-all'));
  h.step(); // re-arm after blur
  h.press(8); h.step();
  assert.equal(h.assigned, './');
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
