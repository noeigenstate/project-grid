const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hookHarness } = require('./helpers/hook-harness.cjs');
const buffer = require('../src/features/reading/conversation-buffer.ts');
const entry = id => ({ id, role: 'assistant', at: 0 });

function conversationHarness(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [], subscribers = new Set(), previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { projectGrid: {
    terminalConversation: id => new Promise(resolve => requests.push({ id, resolve })),
    onTerminalConversation: callback => { subscribers.add(callback); return () => subscribers.delete(callback); },
  } } });
  const h = hookHarness('src/features/reading/useReadingConversation.ts', { './conversation-buffer': buffer });
  t.after(() => { h.dispose(); if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window; });
  return {
    requests, subscribers,
    render: (id = 'first', session = 'session') => h.render('useReadingConversation', id, session).result,
    packet: packet => subscribers.forEach(callback => callback(packet)),
    dispose: () => h.dispose(),
  };
}

test('reading mount coalesces snapshot and stream packets and ignores other terminals', async t => {
  const h = conversationHarness(t);
  assert.deepEqual(h.render(), []);
  h.packet({ id: 'other', list: [entry('wrong')] });
  h.packet({ id: 'first', changes: [entry('live')] });
  h.requests[0].resolve({ ok: true, value: [entry('history')] }); await Promise.resolve();
  t.mock.timers.tick(49); assert.deepEqual(h.render(), []);
  t.mock.timers.tick(1); assert.deepEqual(h.render(), [entry('history'), entry('live')]);
});

test('session changes hide old entries immediately and cancel old buffered updates', async t => {
  const h = conversationHarness(t);
  h.render(); h.requests[0].resolve({ ok: true, value: [entry('old')] }); await Promise.resolve();
  t.mock.timers.tick(50); assert.deepEqual(h.render(), [entry('old')]);
  h.packet({ id: 'first', changes: [entry('old-pending')] });
  assert.deepEqual(h.render('first', 'new-session'), []);
  t.mock.timers.tick(50); assert.deepEqual(h.render('first', 'new-session'), []);
  h.requests[1].resolve({ ok: true, value: [entry('new')] }); await Promise.resolve();
  t.mock.timers.tick(50); assert.deepEqual(h.render('first', 'new-session'), [entry('new')]);
  assert.equal(h.subscribers.size, 1);
});

test('terminal switching ignores late IPC replies and unmount cancels work', async t => {
  const h = conversationHarness(t);
  h.render(); assert.deepEqual(h.render('second'), []);
  h.requests[0].resolve({ ok: true, value: [entry('stale')] }); await Promise.resolve();
  t.mock.timers.tick(50); assert.deepEqual(h.render('second'), []);
  h.packet({ id: 'second', changes: [entry('live')] });
  h.requests[1].resolve({ ok: false, error: 'gone' }); await Promise.resolve();
  t.mock.timers.tick(50); assert.deepEqual(h.render('second'), [entry('live')]);
  h.packet({ id: 'second', changes: [entry('late')] }); h.dispose();
  t.mock.timers.tick(50); assert.equal(h.subscribers.size, 0);
});
