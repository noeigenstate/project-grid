const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const en = require('../electron/locales/en.json');
const {
  normalizePrompt, isTypedCommand, createPendingPrompts, addPendingPrompt,
  reconcilePendingPrompts, removePendingPrompt, PENDING_PROMPT_TIMEOUT,
} = require('../src/features/reading/pending-prompts.ts');

const user = (id, text) => ({ id, role: 'user', text });
const add = (state, id, text, at = 1000) => addPendingPrompt(state, id, text, at);
const sync = (state, entries, now = 1001, session = 'session') => reconcilePendingPrompts(state, session, entries, now);

function pendingMarkup(prompts) {
  const filename = path.join(__dirname, '../src/features/reading/PendingPromptEntries.tsx');
  const mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = name => name.endsWith('/i18n') ? { t: text => en[text] ?? text } : name.endsWith('.css') ? {} : originalRequire(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  return renderToStaticMarkup(React.createElement(mod.exports.PendingPromptEntries, { prompts }));
}

test('pending messages use the user style and translated sending note, and escape pasted markup', () => {
  const state = add(createPendingPrompts('session'), 'p', '<script>hello</script>');
  const html = pendingMarkup(state.prompts);
  assert.match(html, /reading-user reading-pending is-sending/);
  assert.match(html, /role="status">Sending/);
  assert.match(html, /&lt;script&gt;hello&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('an expired echo still renders its text without a sending note', () => {
  const state = sync(add(createPendingPrompts('session'), 'p', 'keep me'), [], 21000);
  const html = pendingMarkup(state.prompts);
  assert.match(html, /reading-user reading-pending/);
  assert.match(html, /keep me/);
  assert.doesNotMatch(html, /Sending|is-sending|role="status"/);
});

test('a normal prompt is echoed synchronously with its original formatting', () => {
  const original = createPendingPrompts('session');
  const next = add(original, 'pending:1', 'first line\n  second line');
  assert.deepEqual(next.prompts, [{ id: 'pending:1', role: 'user', text: 'first line\n  second line', at: 1000, sending: true }]);
  assert.deepEqual(original.prompts, [], 'pure updates leave the previous state intact');
});

test('normalization trims and collapses spaces, tabs, CRLF and trailing newlines', () => {
  assert.equal(normalizePrompt(' \n hello\t world\r\n again\n\n'), 'hello world again');
});

test('typed slash and shell commands and empty prompts have no echo', () => {
  const state = createPendingPrompts('session');
  for (const text of ['/model', '/resume abc', '!echo hello', '', ' \n\t']) assert.equal(add(state, 'p', text), state);
  assert.equal(isTypedCommand('/model'), true);
  assert.equal(isTypedCommand('!echo hello'), true);
});

test('multiline pasted text beginning with slash or bang remains a normal prompt', () => {
  for (const text of ['/some text\nplease explain', '!a\r\nb']) {
    assert.equal(isTypedCommand(text), false);
    assert.equal(add(createPendingPrompts('session'), 'p', text).prompts[0].text, text);
  }
});

test('a matching real user record removes its echo despite whitespace differences', () => {
  const state = add(createPendingPrompts('session'), 'p', 'hello\n  world');
  const next = sync(state, [user('real:1', ' hello world\n\n')]);
  assert.deepEqual(next.prompts, []);
  assert.equal(state.prompts.length, 1);
});

test('assistant and tool records and different user text cannot remove an echo', () => {
  const state = add(createPendingPrompts('session'), 'p', 'hello');
  const next = sync(state, [{ id: 'a', role: 'assistant', text: 'hello' }, { id: 't', role: 'tool', text: 'hello' }, user('u', 'Hello')]);
  assert.equal(next.prompts.length, 1);
});

test('an older identical message cannot acknowledge a new send', () => {
  const previous = [user('old', 'same')];
  const state = add(createPendingPrompts('session', previous), 'p', 'same');
  assert.equal(sync(state, previous).prompts.length, 1);
  assert.equal(sync(state, [...previous, user('new', 'same')]).prompts.length, 0);
});

test('quick sends stack in order and remove only the matching entry', () => {
  let state = createPendingPrompts('session');
  for (const [id, text] of [['p1', 'first'], ['p2', 'second'], ['p3', 'third']]) state = add(state, id, text);
  assert.deepEqual(state.prompts.map(prompt => prompt.id), ['p1', 'p2', 'p3']);
  state = sync(state, [user('u2', 'second')]);
  assert.deepEqual(state.prompts.map(prompt => prompt.id), ['p1', 'p3']);
});

test('repeated identical sends consume one new user ID each, even on packet replay', () => {
  let state = add(add(createPendingPrompts('session'), 'p1', 'same'), 'p2', 'same');
  state = sync(state, [user('u1', 'same')]);
  assert.deepEqual(state.prompts.map(prompt => prompt.id), ['p2']);
  assert.equal(sync(state, [user('u1', 'same')]), state);
  state = sync(state, [user('u1', 'same'), user('u2', ' same\n')]);
  assert.deepEqual(state.prompts, []);
  state = add(state, 'p3', 'same');
  assert.equal(sync(state, [user('u1', 'same'), user('u2', 'same')]).prompts.length, 1);
});

test('the 20-second boundary drops only the sending note and retains the full text', () => {
  const state = add(createPendingPrompts('session'), 'p', 'Keep\n  everything');
  assert.equal(sync(state, [], 1000 + PENDING_PROMPT_TIMEOUT - 1), state);
  const expired = sync(state, [], 1000 + PENDING_PROMPT_TIMEOUT);
  assert.equal(expired.prompts[0].sending, false);
  assert.equal(expired.prompts[0].text, 'Keep\n  everything');
  assert.equal(sync(expired, [], 999999), expired);
  assert.deepEqual(sync(expired, [user('late', 'Keep everything')], 999999).prompts, []);
});

test('each quick send expires independently without changing order', () => {
  const state = add(add(createPendingPrompts('session'), 'p1', 'first', 1000), 'p2', 'second', 5000);
  const next = sync(state, [], 21000);
  assert.deepEqual(next.prompts.map(prompt => [prompt.id, prompt.sending]), [['p1', false], ['p2', true]]);
});

test('terminal states are independent and session changes clear all echoes', () => {
  const first = add(createPendingPrompts('session'), 'p1', 'one');
  const second = add(createPendingPrompts('other'), 'p2', 'two');
  const cleared = sync(first, [user('history', 'one')], 1001, 'new-session');
  assert.deepEqual(cleared, createPendingPrompts('new-session', [user('history', 'one')]));
  assert.equal(second.prompts[0].text, 'two');
  assert.deepEqual(sync(first, [], 1001, null).prompts, []);
});

test('a failed paste cancels only its own echo', () => {
  const state = add(add(createPendingPrompts('session'), 'p1', 'first'), 'p2', 'second');
  assert.deepEqual(removePendingPrompt(state, 'p1').prompts.map(prompt => prompt.id), ['p2']);
  assert.equal(removePendingPrompt(state, 'missing'), state);
});

test('a prompt received after one Claude put back in its input still acknowledges the echo', () => {
  const state = add(createPendingPrompts('session'), 'p', '只回复：MARK-4');
  assert.deepEqual(sync(state, [user('u', '写一篇文章。最后写 MARK-3。只回复：MARK-4')]).prompts, []);
});
