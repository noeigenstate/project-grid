const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPageCapture } = require('../electron/features/files/capture-page.cjs');

function fixture({ loadFails = false, stall = false, empty = false, pendingFonts = false } = {}) {
  const state = { captures: [], destroyed: false };
  class Window {
    constructor(options) {
      state.options = options;
      this.webContents = Object.assign(new EventEmitter(), {
        setWindowOpenHandler: handler => { state.open = handler; },
        setAudioMuted: value => { state.muted = value; },
        executeJavaScript: async () => pendingFonts ? new Promise(() => {}) : true, invalidate: () => {},
        capturePage: async (rect, options) => {
          state.captures.push(options);
          if (stall) return new Promise(() => {});
          return { isEmpty: () => empty && state.captures.length === 1, resize: () => ({ toJPEG: () => Buffer.from('jpeg') }) };
        },
      });
      state.contents = this.webContents;
    }
    loadURL() {
      if (loadFails) return Promise.reject(new Error('load failed'));
      queueMicrotask(() => this.webContents.emit('dom-ready'));
      return new Promise(() => {}); // An external image need not finish before a card is captured.
    }
    isDestroyed() { return state.destroyed; }
    destroy() { state.destroyed = true; }
  }
  return { state, capture: createPageCapture(Window, { timeout: 500, settle: 0, fontWait: 10 }) };
}

test('DOM-ready captures a hidden sandboxed page even if loadURL is waiting for an asset', async () => {
  const { state, capture } = fixture({ pendingFonts: true });
  assert.match(await capture('project-preview://page/index.html'), /^data:image\/jpeg;base64,/);
  assert.equal(state.options.show, false);
  assert.deepEqual(state.captures, [{ stayHidden: true, stayAwake: true }]);
  assert.equal(state.options.webPreferences.sandbox, true);
  assert.equal(state.options.webPreferences.nodeIntegration, false);
  assert.equal(state.destroyed, true); assert.equal(state.muted, true);
  assert.deepEqual(state.open(), { action: 'deny' });
  for (const event of ['will-navigate', 'will-redirect']) {
    let prevented = false; state.contents.emit(event, { preventDefault: () => { prevented = true; } }); assert.equal(prevented, true);
  }
});

test('an empty first frame retries; load errors and stalled capture destroy the window', async () => {
  const retry = fixture({ empty: true });
  assert.match(await retry.capture('page'), /^data:image\/jpeg/); assert.equal(retry.state.captures.length, 2);
  const failed = fixture({ loadFails: true });
  await assert.rejects(failed.capture('page'), /load failed/); assert.equal(failed.state.destroyed, true);
  const stalled = fixture({ stall: true });
  await assert.rejects(stalled.capture('page'), /timed out/); assert.equal(stalled.state.destroyed, true);
});
