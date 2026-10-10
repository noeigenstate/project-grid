const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConversationLog, codexConversation, generatedImage, isGeneratedImage, setThumbnailer } = require('../electron/conversation.cjs');
const { CodexEvents } = require('../electron/features/agents/codex-direct.cjs');
const { ActionLog } = require('../electron/agent-actions.cjs');

const saved = 'C:\\Users\\me\\.codex\\generated_images\\01a123e3-8a13-7942-bb51-447487989afc\\exec-f90e4bcb-0fdf-4441-aae9-03dfb167f4eb.png';
// The record Codex 0.162 writes when its image_gen tool finishes (result shortened).
const record = { timestamp: '2026-10-10T03:38:31.000Z', type: 'event_msg', payload: { type: 'item_completed', thread_id: 't', turn_id: 'r', item: {
  type: 'Extension', kind: 'image_gen.generation', id: 'exec-f90e4bcb-0fdf-4441-aae9-03dfb167f4eb', status: 'completed',
  revisedPrompt: 'A uniform deep navy background with one pink circular icon.', result: 'iVBORw0KGgo', transparentBackground: false, failure: null, savedPath: saved,
} } };

test('a picture Codex generated shows in its answer as a small copy of the saved file, with its prompt', t => {
  const asked = [];
  setThumbnailer(file => { asked.push(file); return 'data:image/jpeg;base64,THUMB'; });
  t.after(() => setThumbnailer(() => null));
  const log = new ConversationLog();
  codexConversation(log, record, 'C:\\work');
  assert.deepEqual(log.list, [{ id: 'g:exec-f90e4bcb-0fdf-4441-aae9-03dfb167f4eb', at: Date.parse(record.timestamp), role: 'assistant', text: '', images: ['data:image/jpeg;base64,THUMB'],
    generated: { path: saved, prompt: 'A uniform deep navy background with one pink circular icon.' } }]);
  assert.deepEqual(asked, [saved]);
});

test('without a thumbnail a small result is shown as is; failures and unfinished pictures show nothing', () => {
  assert.equal(generatedImage(record.payload.item, 1).images[0], 'data:image/png;base64,iVBORw0KGgo');
  assert.equal(generatedImage({ ...record.payload.item, status: 'failed' }, 1), null);
  assert.equal(generatedImage({ ...record.payload.item, result: 'x'.repeat(3_000_000) }, 1), null, 'a full-size image is never put inline');
});

test('only pictures under a generated_images folder can be shown or opened', () => {
  assert.equal(isGeneratedImage(saved), true);
  assert.equal(isGeneratedImage('/home/me/.codex/generated_images/thread/exec-1.webp'), true);
  assert.equal(isGeneratedImage('C:\\Windows\\System32\\calc.exe'), false);
  assert.equal(isGeneratedImage('C:\\Users\\me\\.codex\\generated_images\\thread\\run.bat'), false);
  assert.equal(isGeneratedImage('generated_images/thread/exec-1.png'), false, 'relative paths are refused');
});

test('Codex connected directly shows its generated pictures the same way', t => {
  setThumbnailer(() => 'data:image/jpeg;base64,THUMB');
  t.after(() => setThumbnailer(() => null));
  const conversation = new ConversationLog(), actions = new ActionLog(() => {});
  const events = new CodexEvents({ conversation, actions, cwd: 'C:\\work', now: () => 5 });
  events.notify('item/started', { item: { type: 'imageGeneration', id: 'ig1', status: 'inProgress' } });
  assert.equal(conversation.list[0].tool.done, false, 'the picture being drawn is a running step, so the view can show its progress');
  events.notify('item/completed', { item: { type: 'imageGeneration', id: 'ig1', status: 'completed', revisedPrompt: 'A pink circle', result: 'iVBOR', savedPath: saved } });
  const picture = conversation.list.find(entry => entry.generated);
  assert.deepEqual([picture.id, picture.role, picture.images[0], picture.generated.prompt], ['g:ig1', 'assistant', 'data:image/jpeg;base64,THUMB', 'A pink circle']);
  assert.equal(conversation.list.find(entry => entry.tool).tool.done, true, 'the step ends with the picture');
});
