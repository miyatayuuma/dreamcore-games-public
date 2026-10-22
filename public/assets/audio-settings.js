/* DreamCore shared audio preferences (no autoplay, no browser permissions). */
(() => {
  'use strict';
  if (window.DreamcoreAudio) return;

  const KEY = 'dreamcore.audio.settings.v1';
  const DEFAULTS = Object.freeze({
    muted: false,
    master: 100,
    bgm: 20,
    se: 100,
    speech: true
  });
  const listeners = new Set();
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const pct = value => Math.max(0, Math.min(100, Math.round(value)));
  const readObject = object => {
    const next = { ...DEFAULTS };
    if (!object || typeof object !== 'object' || Array.isArray(object)) return next;
    for (const key of ['master', 'bgm', 'se']) {
      if (finite(object[key])) next[key] = pct(object[key]);
    }
    if (typeof object.muted === 'boolean') next.muted = object.muted;
    if (typeof object.speech === 'boolean') next.speech = object.speech;
    return next;
  };
  const read = () => {
    try { return readObject(JSON.parse(localStorage.getItem(KEY))); }
    catch { return { ...DEFAULTS }; }
  };
  let current = read();
  const get = () => ({ ...current });
  const gain = kind => {
    if (current.muted) return 0;
    const master = current.master / 100;
    if (kind === 'speech') return current.speech ? master : 0;
    if (kind === 'se' || kind === 'bgm') return master * current[kind] / 100;
    throw new TypeError('Unknown audio channel: ' + kind);
  };
  const emit = () => {
    const value = get();
    for (const listener of [...listeners]) {
      try { listener(value); } catch (error) { console.error('Audio preferences listener failed', error); }
    }
    window.dispatchEvent(new CustomEvent('dreamcore:audio-change', { detail: value }));
  };
  const same = (a, b) => Object.keys(DEFAULTS).every(k => a[k] === b[k]);
  const set = patch => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return get();
    const accepted = {};
    for (const key of ['master', 'bgm', 'se']) {
      if (finite(patch[key])) accepted[key] = patch[key];
    }
    for (const key of ['muted', 'speech']) {
      if (typeof patch[key] === 'boolean') accepted[key] = patch[key];
    }
    const updated = readObject({ ...current, ...accepted });
    if (same(current, updated)) return get();
    current = updated;
    try { localStorage.setItem(KEY, JSON.stringify(updated)); } catch {}
    emit();
    return get();
  };
  const subscribe = listener => {
    if (typeof listener !== 'function') throw new TypeError('Listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  // LocalStorage storage events reach same-origin iframe documents and other tabs.
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    const next = read();
    if (same(next, current)) return;
    current = next;
    emit();
  });
  const bindGain = (node, ctx, kind = 'se', base = 1) => {
    if (!node?.gain || !ctx || !finite(base) || base < 0) throw new TypeError('Invalid audio bus');
    const apply = () => {
      const target = base * gain(kind);
      const at = ctx.currentTime || 0;
      try {
        node.gain.cancelScheduledValues(at);
        node.gain.setTargetAtTime(target, at, 0.012);
      } catch { node.gain.value = target; }
    };
    // Set initial gain exactly (before audio starts); live changes are ramped.
    node.gain.value = base * gain(kind);
    return subscribe(apply);
  };
  const createBus = (ctx, kind = 'se', base = 1) => {
    const bus = ctx.createGain();
    bindGain(bus, ctx, kind, base);
    bus.connect(ctx.destination);
    return bus;
  };

  // BGM files use HTMLAudioElement; this binding scales them with the same
  // preferences without starting playback or bypassing browser autoplay rules.
  const bindMedia = (element, kind = 'bgm', base = 1) => {
    if (!element || typeof element.volume !== 'number' || !finite(base) || base < 0)
      throw new TypeError('Invalid media element or volume');
    const apply = () => {
      element.volume = Math.max(0, Math.min(1, base * gain(kind)));
    };
    apply();
    return subscribe(apply);
  };

  Object.defineProperty(window, 'DreamcoreAudio', {
    value: Object.freeze({ KEY, DEFAULTS, get, set, gain, subscribe, bindGain, createBus, bindMedia }),
    writable: false, configurable: false
  });
})();