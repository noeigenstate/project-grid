const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyConversationPacket, createConversationBuffer } = require('../src/features/reading/conversation-buffer.ts');
const entry = (id, text = id) => ({ id, text, role: 'assistant', at: 0 });

test('deltas replace entries in place, deduplicate IDs, and cap a rolling list', () => {
  const source = Array.from({ length: 400 }, (_, index) => entry(String(index)));
  const next = applyConversationPacket(source, { changes: [entry('399', 'changed'), entry('400'), entry('400', 'finished')] });
  assert.equal(next.length, 400);
  assert.equal(next[0].id, '1');
  assert.equal(next.at(-2).text, 'changed');
  assert.equal(next.at(-1).text, 'finished');
  assert.equal(source.at(-1).text, '399');
});

test('packets within 50 ms produce one update without extending the flush deadline', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const updates = [], buffer = createConversationBuffer(list => updates.push(list));
  buffer.snapshot([entry('a')]);
  t.mock.timers.tick(20); buffer.push({ changes: [entry('b')] });
  t.mock.timers.tick(29); buffer.push({ changes: [entry('a', 'finished')] });
  assert.equal(updates.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(updates, [[entry('a', 'finished'), entry('b')]]);
  buffer.push({ changes: [entry('c')] }); t.mock.timers.tick(50);
  assert.equal(updates.length, 2, 'normal streaming keeps flushing during continuous traffic');
  buffer.dispose();
});

test('events received before a delayed snapshot remain ordered after the snapshot', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const updates = [], buffer = createConversationBuffer(list => updates.push(list));
  buffer.push({ changes: [entry('a', 'new'), entry('b')] }); t.mock.timers.tick(100);
  assert.equal(updates.length, 0);
  buffer.snapshot([entry('a', 'old')]); t.mock.timers.tick(50);
  assert.deepEqual(updates, [[entry('a', 'new'), entry('b')]]);
});

test('a full list or reset replaces buffered deltas, and later deltas follow it', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const updates = [], buffer = createConversationBuffer(list => updates.push(list));
  buffer.snapshot([entry('old')]);
  buffer.push({ changes: [entry('discard')] }); buffer.push({ list: [] });
  buffer.push({ list: [entry('new')] }); buffer.push({ changes: [entry('last')] });
  t.mock.timers.tick(50);
  assert.deepEqual(updates, [[entry('new'), entry('last')]]);
});

test('cleanup cancels queued updates and ignores late snapshots and packets', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const updates = [], buffer = createConversationBuffer(list => updates.push(list));
  buffer.snapshot([entry('a')]); buffer.dispose();
  buffer.snapshot([entry('late')]); buffer.push({ list: [entry('late')] });
  t.mock.timers.tick(100);
  assert.deepEqual(updates, []);
});
