import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const bridge = readFileSync(new URL('../public/assets/gamepad-adventures.js', import.meta.url), 'utf8');

function setup(game) {
  const nodes = new Map();
  const events = new Map();
  const callbacks = [];
  const actions = [];
  const controller = {
    connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false }))
  };
  const parent = {};
  const win = {
    parent, addEventListener(name, callback) { events.set(name, callback); }
  };
  const doc = {
    hidden: false,
    body: { dataset: { adventureGamepad: game } },
    getElementById(id) { return nodes.get(id) || null; },
    addEventListener(name, callback) { events.set('document:' + name, callback); }
  };
  let now = 1000;
  vm.runInNewContext(bridge, {
    window: win, document: doc,
    navigator: { getGamepads: () => [controller] },
    location: { origin: 'https://game.test' },
    getComputedStyle: () => ({ visibility: 'visible' }),
    performance: { now: () => now },
    requestAnimationFrame: callback => callbacks.push(callback)
  });
  return {
    win, doc, controller, actions,
    button(id, source = parent, origin = 'https://game.test') {
      events.get('message')?.({
        source, origin, data: { type: 'dreamcore:gamepad-v2',
          action: 'button', button: id, phase: 'down' }
      });
    },
    release() {
      events.get('message')?.({
        source: parent, origin: 'https://game.test',
        data: { type: 'dreamcore:gamepad-v2', action: 'release-all' }
      });
    },
    show(id) {
      const element = { hidden: false, getClientRects() { return this.hidden ? [] : [{}]; },
        click() { actions.push(id); } };
      nodes.set(id, element);
      return element;
    },
    time(value) { now = value; },
    frame(value) { callbacks.shift()?.(value); }
  };
}

test('adventures direct controller bridge parses', () => {
  assert.doesNotThrow(() => new vm.Script(bridge));
  assert.match(bridge, /dreamcore:gamepad-v2/);
  assert.match(bridge, /__dreamcoreGamepadCaptureA/);
  assert.doesNotMatch(bridge, /innerHTML\s*=/);
});

test('gecko narration A/B and no field A action', () => {
  const h = setup('gecko');
  const layer = h.show('storyLayer');
  h.show('storyPrev'); h.show('storyNext'); const start = h.show('storyStart');
  start.hidden = true;
  h.button(0);
  assert.deepEqual(h.actions, ['storyNext']);
  h.time(1400); h.button(1);
  assert.deepEqual(h.actions, ['storyNext', 'storyPrev']);
  h.time(1800); start.hidden = false; h.button(0);
  assert.equal(h.actions.at(-1), 'storyStart');
  layer.hidden = true; h.button(0);
  assert.equal(h.actions.length, 3);
});

test('tanabata scene navigation and audio choice priority', () => {
  const h = setup('tanabata');
  const intro = h.show('intro-overlay');
  h.show('intro-prev'); h.show('intro-next'); const start = h.show('intro-start');
  start.hidden = true;
  h.button(0); assert.deepEqual(h.actions, ['intro-next']);
  h.time(1400); h.button(1); assert.equal(h.actions.at(-1), 'intro-prev');
  h.time(1800);
  const audio = h.show('intro-audio-ask');
  h.show('audio-yes'); h.show('audio-no');
  h.button(0); assert.equal(h.actions.at(-1), 'audio-yes');
  h.time(2200); h.button(1); assert.equal(h.actions.at(-1), 'audio-no');
  audio.hidden = true;
  start.hidden = false; h.time(2600); h.button(0);
  assert.equal(h.actions.at(-1), 'intro-start');
  intro.hidden = true;
  const ending = h.show('ending-overlay');
  h.show('ending-prev'); h.show('ending-next'); const home = h.show('ending-home');
  home.hidden = true; h.time(3000); h.button(0);
  assert.equal(h.actions.at(-1), 'ending-next');
  home.hidden = false; h.time(3400); h.button(0);
  assert.equal(h.actions.at(-1), 'ending-home');
  ending.hidden = true;
});

test('tanabata field A cycles density once and is blocked during greeting', () => {
  const h = setup('tanabata');
  let cycles = 0;
  h.win.__dreamcoreGamepadAdvanceDensity = () => { cycles++; };
  h.button(0); assert.equal(cycles, 1);
  h.win.__GREETER_INPUT_LOCK = true;
  h.button(0); assert.equal(cycles, 1);
  h.win.__GREETER_INPUT_LOCK = false;
  h.button(0); assert.equal(cycles, 2);
  h.button(1); assert.equal(cycles, 2);
  h.button(0, {}, 'https://game.test');
  h.button(0, h.win.parent, 'https://other.test');
  assert.equal(cycles, 2);
});

test('3D axes use deadzone, camera look, and release on lost input', () => {
  const h = setup('gecko');
  const look = [];
  h.win.__dreamcoreAdventureLook = (...args) => look.push(args);
  h.controller.axes = [0.9, -0.8, 0.6, 0.5];
  h.frame(1020); h.frame(1040);
  assert.equal(h.win.__dreamcoreAdventurePad.active, true);
  assert.ok(h.win.__dreamcoreAdventurePad.x > 0.7);
  assert.ok(h.win.__dreamcoreAdventurePad.y < -0.6, 'diagonal motion is normalized');
  assert.equal(look.length, 1);
  const overlay = h.show('storyLayer');
  h.frame(1060); assert.equal(h.win.__dreamcoreAdventurePad.active, false);
  assert.equal(look.length, 1);
  overlay.hidden = true;
  h.frame(1080); assert.equal(h.win.__dreamcoreAdventurePad.active, true);
  h.release(); assert.equal(h.win.__dreamcoreAdventurePad.active, false);
  h.controller.connected = false;
  h.frame(1100); assert.equal(h.win.__dreamcoreAdventurePad.active, false);
});