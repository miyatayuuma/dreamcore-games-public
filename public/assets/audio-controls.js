/* A single audio-settings interface for the library and embedded game shell. */
(() => {
  'use strict';
  const audio = window.DreamcoreAudio;
  if (!audio) return;
  const mount = () => {
    const anchor = document.querySelector('[data-audio-controls]');
    if (!anchor || anchor.querySelector('button')) return;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'audio-settings-open';
    trigger.className = 'audio-settings-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'audio-settings-dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<svg class="audio-settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg><svg class="audio-settings-icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>';
    anchor.append(trigger);
    const dialog = document.createElement('dialog');
    dialog.id = 'audio-settings-dialog';
    dialog.className = 'audio-settings-dialog';
    dialog.setAttribute('aria-labelledby', 'audio-settings-title');
    dialog.innerHTML = `
      <div class="audio-settings-panel">
        <div class="audio-settings-heading">
          <h2 id="audio-settings-title">おとのせってい</h2>
          <button type="button" class="audio-settings-close" data-audio-close aria-label="音の設定を閉じる">×</button>
        </div>
        <label class="audio-settings-switch">
          <span>音を出す</span>
          <input type="checkbox" data-audio-mute-switch>
        </label>
        <div class="audio-settings-sliders">
          <label class="audio-settings-field" for="audio-master">
            <span>全体の音量</span><output data-audio-output="master" for="audio-master">100%</output>
          </label>
          <input id="audio-master" data-audio-range="master" type="range" min="0" max="100" step="5">
          <label class="audio-settings-field" for="audio-bgm">
            <span>BGM</span><output data-audio-output="bgm" for="audio-bgm">20%</output>
          </label>
          <input id="audio-bgm" data-audio-range="bgm" type="range" min="0" max="100" step="5">
          <label class="audio-settings-field" for="audio-se">
            <span>効果音</span><output data-audio-output="se" for="audio-se">100%</output>
          </label>
          <input id="audio-se" data-audio-range="se" type="range" min="0" max="100" step="5">
        </div>
        <label class="audio-settings-switch audio-settings-speech">
          <span>読み上げを使う</span>
          <input type="checkbox" data-audio-speech>
        </label>
        <p class="audio-settings-note">すべてのゲームで設定を共有します。音を出すには、ゲーム画面の操作が必要な場合があります。</p>
      </div>`;
    document.body.append(dialog);
    const mute = dialog.querySelector('[data-audio-mute-switch]');
    const speech = dialog.querySelector('[data-audio-speech]');
    const ranges = [...dialog.querySelectorAll('[data-audio-range]')];
    const outputs = Object.fromEntries([...dialog.querySelectorAll('[data-audio-output]')].map(o => [o.dataset.audioOutput, o]));
    let previousFocus = null;
    const sync = () => {
      const state = audio.get();
      const silent = state.muted || state.master === 0 || (state.bgm === 0 && state.se === 0 && (!state.speech || state.master === 0));
      trigger.classList.toggle('is-muted', silent);
      trigger.setAttribute('aria-label', silent ? 'おとのせってい（音が出ない状態）' : 'おとのせってい');
      mute.checked = !state.muted;
      speech.checked = state.speech;
      ranges.forEach(range => {
        const kind = range.dataset.audioRange;
        range.value = state[kind];
        outputs[kind].textContent = state[kind] + '%';
      });
    };
    audio.subscribe(sync);
    sync();

    mute.addEventListener('change', () => audio.set({ muted: !mute.checked }));
    speech.addEventListener('change', () => audio.set({ speech: speech.checked }));
    ranges.forEach(range => range.addEventListener('input', () => {
      audio.set({ [range.dataset.audioRange]: Number(range.value) });
    }));

    trigger.addEventListener('click', () => {
      if (dialog.open) return;
      previousFocus = document.activeElement;
      dialog.showModal();
      trigger.setAttribute('aria-expanded', 'true');
      dialog.querySelector('[data-audio-close]').focus();
    });
    dialog.querySelector('[data-audio-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('cancel', () => {
      trigger.setAttribute('aria-expanded', 'false');
    });
    dialog.addEventListener('close', () => {
      trigger.setAttribute('aria-expanded', 'false');
      if (previousFocus?.isConnected) previousFocus.focus();
      previousFocus = null;
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else mount();
})();