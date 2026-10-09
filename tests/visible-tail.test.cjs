const { test } = require('node:test');
const assert = require('node:assert/strict');
const { blocks, blockId, visibleTail, prependScrollTop, VISIBLE_TAIL_PAGE } = require('../src/features/reading/useVisibleTail.ts');
const en = require('../electron/locales/en.json');
const message = id => ({ id: String(id), role: 'assistant', text: 'message', at: 0 });
const messages = count => Array.from({ length: count }, (_, index) => message(index));

test('an empty or short history keeps all blocks without an earlier button', () => {
  for (const count of [0, 1, 39, 40]) {
    const grouped = blocks(messages(count)), tail = visibleTail(grouped);
    assert.deepEqual(tail, { visible: grouped, earlier: 0 });
  }
});

test('opening a capped history renders exactly the last 40 blocks', () => {
  const tail = visibleTail(blocks(messages(400)));
  assert.equal(tail.visible.length, VISIBLE_TAIL_PAGE);
  assert.equal(tail.earlier, 360);
  assert.equal(blockId(tail.visible[0]), '360');
  assert.equal(blockId(tail.visible.at(-1)), '399');
});

test('each earlier page adds 40 blocks and the final page clamps to the start', () => {
  const grouped = blocks(messages(95));
  assert.deepEqual([40, 80, 120].map(count => visibleTail(grouped, count).earlier), [55, 15, 0]);
  assert.deepEqual([40, 80, 120].map(count => visibleTail(grouped, count).visible.length), [40, 80, 95]);
});

test('consecutive tools remain whole and count as one block', () => {
  const entries = [...messages(42), ...Array.from({ length: 80 }, (_, index) => ({ id: 'tool' + index, role: 'tool', at: 0 })), message('last')];
  const grouped = blocks(entries), tail = visibleTail(grouped);
  assert.equal(grouped.length, 44);
  assert.equal(tail.earlier, 4);
  assert.equal(tail.visible.at(-2).entries.length, 80);
  assert.equal(blockId(tail.visible.at(-2)), 'tool0');
  assert.deepEqual(entries.length, 123, 'grouping does not mutate the source');
});

test('messages separate tool groups and keep stable entry keys', () => {
  const entries = [{ id: 't1', role: 'tool' }, message('a'), { id: 't2', role: 'tool' }];
  assert.deepEqual(blocks(entries).map(blockId), ['t1', 'a', 't2']);
});

test('a scrolled-up reader retains the first visible block as new entries arrive', () => {
  const grouped = blocks(messages(102));
  const tail = visibleTail(grouped, 40, block => blockId(block) === '60');
  assert.equal(tail.visible.length, 42);
  assert.equal(blockId(tail.visible[0]), '60');
  assert.equal(blockId(visibleTail(grouped).visible[0]), '62', 'a stuck reader follows the rolling tail');
});

test('an anchor survives removal of earlier entries from the capped log', () => {
  const grouped = blocks(messages(400).slice(2).concat(message(400), message(401)));
  assert.equal(blockId(visibleTail(grouped, 40, block => blockId(block) === '360').visible[0]), '360');
  assert.equal(visibleTail(grouped, 40, block => blockId(block) === 'removed').earlier, 360);
});

test('prepending compensates the scroll position by the actual added height', () => {
  assert.equal(prependScrollTop(320, 1200, 2400), 1520);
  assert.equal(prependScrollTop(0, 1200, 1180), -20, 'removing the final earlier button is included in measured layout');
});

test('the earlier button has an English translation with the same count placeholder', () => {
  assert.equal(en['显示更早的对话（{count}）'], 'Show earlier conversation ({count})');
});
