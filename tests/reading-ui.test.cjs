const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { choiceKeys, selectedChoiceIndex, choiceIdentity, writeChoiceKeys } = require('../src/features/reading/choice-keys.ts');
const { parseAgentScreen } = require('../src/features/agents/agent-screen.ts');
const en = require('../electron/locales/en.json');

// Components use test-only screen values until feat/screen-parser replaces the stub.
const fakeScreen = overrides => ({
  banner: { product: 'Claude Code', version: '2.1.293', model: 'Opus 5.5', effort: 'high', plan: 'Claude Max', directory: 'C:\\work\\demo-app' },
  status: { model: null, effort: null, context: 'ctx 4%', mode: 'manual mode on', notes: [] },
  choice: null, overlay: 'none', ...overrides,
});
const fakeChoice = () => ({
  kind: 'permission', title: 'Run this command?', context: ['$ echo hello', 'Reason: write hello.txt'],
  options: [
    { number: 1, label: 'Yes', detail: '', hotkey: 'y', selected: false },
    { number: 2, label: 'Always allow', detail: 'Commands starting with echo', hotkey: 'p', selected: true },
    { number: 3, label: 'No', detail: '', hotkey: 'esc', selected: false },
  ], hint: 'Enter to confirm · Esc to cancel',
});

// Transpile only these UI modules. No Electron, DOM, terminal or production parser is started.
function loadUI(name, overrides = {}) {
  const filename = path.join(__dirname, '..', 'src', name);
  const mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = name => {
    const key = name.startsWith('.') ? './' + path.basename(name) : name;
    if (Object.hasOwn(overrides, key)) return overrides[key];
    if (name === '@phosphor-icons/react') return { CircleNotch: props => React.createElement('svg', { className: props.className }) };
    if (key === './i18n') return { currentLanguage: () => 'en', t: (text, values = {}) => (en[text] ?? text).replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match) };
    if (key === './choice-keys') return require('../src/features/reading/choice-keys.ts');
    if (key === './reading-sessions') return require('../src/features/reading/reading-sessions.ts');
    return originalRequire(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}

test('choice keys move up, down or confirm in place using option positions', () => {
  assert.deepEqual(choiceKeys(1, 3), ['\x1b[B', '\x1b[B', '\r']);
  assert.deepEqual(choiceKeys(3, 0), ['\x1b[A', '\x1b[A', '\x1b[A', '\r']);
  assert.deepEqual(choiceKeys(2, 2), ['\r']);
  assert.equal(selectedChoiceIndex(fakeChoice()), 1);
  assert.equal(selectedChoiceIndex({ ...fakeChoice(), options: [] }), 0);
});

test('choice identity survives cursor redraws and changes for the next menu', () => {
  const choice = fakeChoice();
  assert.equal(choiceIdentity(choice), choiceIdentity({ ...choice, options: choice.options.map(option => ({ ...option, selected: !option.selected })) }));
  assert.notEqual(choiceIdentity(choice), choiceIdentity({ ...choice, title: 'Select effort' }));
  assert.notEqual(choiceIdentity(choice), choiceIdentity({ ...choice, options: choice.options.slice(1) }));
});

test('choice writes are separate and spaced 25 ms apart, with Enter last', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const written = [];
  const pending = writeChoiceKeys(0, 2, key => written.push(key));
  assert.deepEqual(written, ['\x1b[B']);
  t.mock.timers.tick(24); await Promise.resolve(); assert.equal(written.length, 1);
  t.mock.timers.tick(1); await Promise.resolve(); assert.deepEqual(written, ['\x1b[B', '\x1b[B']);
  t.mock.timers.tick(25); await pending; assert.deepEqual(written, ['\x1b[B', '\x1b[B', '\r']);
});

test('dismissing a choice aborts its remaining keys', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let active = true; const written = [];
  const pending = writeChoiceKeys(2, 0, key => written.push(key), () => active);
  active = false; t.mock.timers.tick(25); await pending;
  assert.deepEqual(written, ['\x1b[A']);
});

test('screen parser stub preserves its replacement contract', () => {
  for (const agent of ['claude', 'codex']) assert.deepEqual(parseAgentScreen(agent, ['anything']), {
    banner: null, status: { model: null, effort: null, context: null, mode: null, notes: [] }, choice: null, overlay: 'none',
  });
});

test('welcome renders CLI metadata and the cached agent commands without a terminal toggle', () => {
  const { ReadingWelcome } = loadUI('features/reading/ReadingWelcome.tsx');
  for (const agent of ['claude', 'codex']) {
    const names = agent === 'claude' ? ['/init', '/help', '/model', '/status', '/review'] : ['/init', '/model', '/status', '/review', '/permissions'];
    const commands = names.map(name => ({ name, source: 'builtin', description: '审查代码', view: 'reading' }));
    const html = renderToStaticMarkup(React.createElement(ReadingWelcome, { agent, screen: fakeScreen(), commands, complete: () => {}, disabled: false }));
    assert.match(html, /Claude Code/); assert.match(html, /v2\.1\.293/); assert.match(html, /Opus 5\.5/); assert.match(html, /high/);
    assert.match(html, /Claude Max/); assert.match(html, /C:\\work\\demo-app/); assert.match(html, /Review code/);
    assert.equal((html.match(/<button/g) ?? []).length, 5);
    for (const name of names) assert.ok(html.includes(name));
    assert.doesNotMatch(html, /切换到终端|Switch to terminal/);
  }
});

test('welcome uses startup spinner and status model before a banner is available', () => {
  const { ReadingWelcome } = loadUI('features/reading/ReadingWelcome.tsx');
  const screen = fakeScreen({ banner: null, status: { model: 'GPT-6.1-Sol', effort: 'high', context: null, mode: null, notes: [] } });
  const html = renderToStaticMarkup(React.createElement(ReadingWelcome, { agent: 'codex', screen, commands: [], complete: () => {}, disabled: false }));
  assert.match(html, /Codex/); assert.match(html, /Starting…/); assert.match(html, /loading-spinner/); assert.match(html, /GPT-6\.1-Sol/);
});

test('welcome without a banner settles to the agent name and parsed status without a spinner', () => {
  const { ReadingWelcome } = loadUI('features/reading/ReadingWelcome.tsx');
  const html = renderToStaticMarkup(React.createElement(ReadingWelcome, {
    agent: 'claude', screen: fakeScreen({ banner: null }), commands: [], complete() {}, disabled: false, starting: false,
  }));
  assert.match(html, /Claude Code/); assert.doesNotMatch(html, /Starting…|loading-spinner/);
  const withModel = renderToStaticMarkup(React.createElement(ReadingWelcome, {
    agent: 'claude', screen: fakeScreen({ banner: null, status: { model: 'Opus 5.5', effort: 'high', notes: [] } }), commands: [], complete() {}, disabled: false, starting: false,
  }));
  assert.match(withModel, /Opus 5\.5/); assert.match(withModel, /high/); assert.doesNotMatch(withModel, /Starting…|loading-spinner/);
});

function sessionsHarness(t, initialSessions = []) {
  const slots = [initialSessions], written = [], followed = [], sent = [], errors = []; let cursor = 0, closed = 0;
  const hooks = {
    useState: initial => {
      const index = cursor++;
      if (!Object.hasOwn(slots, index)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef: initial => {
      const index = cursor++;
      if (!Object.hasOwn(slots, index)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect() {},
  };
  const previous = globalThis.window;
  globalThis.window = { agentrix: {
    writeTerminal: (id, text) => written.push({ id, text }),
    followAgentSession: async (id, sessionId) => { followed.push({ id, sessionId }); return { ok: true, value: true }; },
  } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const { ReadingSessions } = loadUI('features/reading/ReadingSessions.tsx', { react: hooks });
  const render = () => {
    cursor = 0;
    const root = ReadingSessions({ terminalId: 'resume-terminal', onClose: () => { closed++; }, onSent: text => sent.push(text), onError: error => errors.push(error) });
    root.props.ref.current = { focus() {} }; return root;
  };
  const press = key => {
    let prevented = false;
    render().props.onKeyDown({ key, nativeEvent: {}, preventDefault: () => { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, true);
  };
  const options = () => elements(render()).filter(node => node.props.className === 'reading-choice-option');
  return { render, press, options, written, followed, sent, errors, closed: () => closed };
}

test('native session card arrows highlight, Enter types a targeted resume and follows after Enter', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sessions = ['first', 'second'].map(id => ({ id, title: id, updatedAt: Date.now() - 180000, messages: 3 }));
  const h = sessionsHarness(t, sessions);
  assert.equal(h.options()[0].props['data-highlighted'], true);
  h.press('ArrowDown'); assert.equal(h.options()[1].props['data-highlighted'], true);
  h.press('ArrowUp'); assert.equal(h.options()[0].props['data-highlighted'], true);
  h.press('ArrowDown'); h.press('Enter'); h.press('Enter'); h.press('Escape');
  assert.deepEqual(h.written, [{ id: 'resume-terminal', text: '/resume second' }]); assert.deepEqual(h.followed, []);
  assert.ok(h.options().every(option => option.props.disabled));
  t.mock.timers.tick(150);
  for (let index = 0; index < 6; index++) await Promise.resolve();
  assert.deepEqual(h.written, [{ id: 'resume-terminal', text: '/resume second' }, { id: 'resume-terminal', text: '\r' }]);
  assert.deepEqual(h.followed, [{ id: 'resume-terminal', sessionId: 'second' }]);
  assert.deepEqual(h.sent, ['/resume second']); assert.equal(h.closed(), 1); assert.deepEqual(h.errors, []);
});

test('native session card click chooses and Esc closes without sending terminal keys', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = sessionsHarness(t, [{ id: 'clicked', title: 'Restore this prompt', updatedAt: Date.now(), messages: 2 }]);
  const option = h.options()[0]; await option.props.onClick();
  assert.deepEqual(h.written, [{ id: 'resume-terminal', text: '/resume clicked' }]);
  t.mock.timers.tick(150); for (let index = 0; index < 6; index++) await Promise.resolve();
  assert.equal(h.closed(), 1);
  const empty = sessionsHarness(t);
  empty.press('ArrowDown'); empty.press('Enter'); empty.press('Escape');
  assert.equal(empty.closed(), 1); assert.deepEqual(empty.written, []);
  const labels = elements(empty.render()).flatMap(node => typeof node.props.children === 'string' ? [node.props.children] : []);
  assert.ok(labels.includes('This project has no other Claude sessions yet'));
});

test('choice renders context, printed numbers, details, hotkeys and CLI selection', () => {
  const { ReadingChoice } = loadUI('features/reading/ReadingChoice.tsx');
  const html = renderToStaticMarkup(React.createElement(ReadingChoice, { choice: fakeChoice(), terminalId: 'test', onError: () => {} }));
  assert.match(html, /is-permission/); assert.match(html, /Run this command\?/); assert.match(html, /\$ echo hello/);
  assert.match(html, /Commands starting with echo/); assert.match(html, /<kbd>p<\/kbd>/);
  assert.match(html, /is-cli-selected/); assert.match(html, /data-highlighted="true"/); assert.match(html, /Cancel/);
});

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}

// Exercise the component's handlers with persistent hook slots, without a DOM or native GUI.
function choiceHarness(t, choice = fakeChoice()) {
  const slots = []; let cursor = 0;
  const hooks = {
    useState: initial => {
      const index = cursor++;
      if (!Object.hasOwn(slots, index)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef: initial => {
      const index = cursor++;
      if (!Object.hasOwn(slots, index)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect: () => {},
  };
  const written = [], previous = globalThis.window;
  globalThis.window = { agentrix: { writeTerminal: (id, key) => written.push({ id, key }) } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const { ReadingChoice } = loadUI('features/reading/ReadingChoice.tsx', { react: hooks });
  const render = () => {
    cursor = 0;
    const root = ReadingChoice({ choice, terminalId: 'native-choice', onError: message => assert.fail(message) });
    root.props.ref.current = { focus: () => {} };
    return root;
  };
  const press = key => {
    let prevented = false;
    render().props.onKeyDown({ key, nativeEvent: { isComposing: false }, preventDefault: () => { prevented = true; }, stopPropagation: () => {} });
    assert.equal(prevented, true);
  };
  const options = () => elements(render()).filter(node => node.props.className?.split(' ').includes('reading-choice-option'));
  return { written, render, press, options };
}

test('welcome command rows call the existing completion callback with the cached command', () => {
  const { ReadingWelcome } = loadUI('features/reading/ReadingWelcome.tsx');
  const command = { name: '/model', source: 'builtin', description: '切换模型', view: 'terminal' };
  const picked = [];
  const root = ReadingWelcome({ agent: 'claude', screen: fakeScreen(), commands: [command], complete: value => picked.push(value), disabled: false });
  elements(root).find(node => node.type === 'button').props.onClick();
  assert.deepEqual(picked, [command]);
});

test('choice arrows move a local highlight; Enter submits once and keeps a pending card', t => {
  const harness = choiceHarness(t);
  assert.equal(harness.options()[1].props['data-highlighted'], true);
  harness.press('ArrowDown'); assert.equal(harness.options()[2].props['data-highlighted'], true);
  harness.press('ArrowUp'); assert.equal(harness.options()[1].props['data-highlighted'], true);
  assert.deepEqual(harness.written, []);
  harness.press('Enter'); harness.press('Enter'); harness.press('Escape');
  assert.deepEqual(harness.written, [{ id: 'native-choice', key: '\r' }]);
  assert.equal(harness.render().props['aria-busy'], true);
  assert.ok(harness.options().every(option => option.props.disabled));
  assert.ok(elements(harness.options()[1]).some(node => node.props.className === 'loading-spinner'));
});

test('choice number keys target printed numbers and write relative to the CLI cursor', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const choice = fakeChoice(); choice.options.forEach((option, index) => { option.number = [4, 7, 9][index]; });
  const harness = choiceHarness(t, choice);
  harness.press('4'); harness.options()[2].props.onClick();
  assert.deepEqual(harness.written, [{ id: 'native-choice', key: '\x1b[A' }]);
  t.mock.timers.tick(25); await Promise.resolve();
  assert.deepEqual(harness.written, [{ id: 'native-choice', key: '\x1b[A' }, { id: 'native-choice', key: '\r' }]);
});

test('choice Esc and cancel button each send a single Escape and wait for CLI dismissal', t => {
  for (const action of ['Escape', 'button']) {
    const harness = choiceHarness(t);
    if (action === 'Escape') harness.press('Escape');
    else elements(harness.render()).find(node => node.props.className === 'text-button').props.onClick();
    harness.press('Escape'); harness.press('Enter');
    assert.deepEqual(harness.written, [{ id: 'native-choice', key: '\x1b' }]);
    assert.equal(harness.render().props['aria-busy'], true);
  }
});

function readingMode() {
  return loadUI('features/reading/reading-mode.ts', { react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() } });
}
const terminal = (id, needsInput = 'Allow command?') => ({ id, sessionId: 'session', codexActive: true, needsInput });
const isReading = (mode, value) => mode.readingShown(value, mode.useTerminalChoice());

test('needsInput falls back at 1.5 seconds and automatically returns after acknowledgment', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mode = readingMode(), value = terminal('fallback');
  mode.syncReading(value); assert.equal(isReading(mode, value), true);
  t.mock.timers.tick(1499); assert.equal(isReading(mode, value), true);
  t.mock.timers.tick(1); assert.equal(isReading(mode, value), false);
  mode.syncReading(terminal(value.id, null)); assert.equal(isReading(mode, value), true);
});

test('a parsed choice cancels a pending handoff and its disappearance does not rearm that notice', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mode = readingMode(), value = terminal('native');
  mode.syncReading(value); t.mock.timers.tick(1000); mode.setChoiceVisible(value.id, true);
  t.mock.timers.tick(1000); assert.equal(isReading(mode, value), true);
  mode.setChoiceVisible(value.id, false); mode.syncReading(value); t.mock.timers.tick(2000);
  assert.equal(isReading(mode, value), true);
  mode.syncReading(terminal(value.id, null)); mode.syncReading(value); t.mock.timers.tick(1500);
  assert.equal(isReading(mode, value), false, 'a new notice gets its own timeout');
});

test('a choice already visible keeps reading open for a permission hook', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mode = readingMode(), value = terminal('already-visible');
  mode.setChoiceVisible(value.id, true); mode.syncReading(value); t.mock.timers.tick(5000);
  assert.equal(isReading(mode, value), true);
});

test('permission notice clearing or agent exit cancels its timeout', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mode = readingMode(), value = terminal('cancel');
  mode.syncReading(value); mode.syncReading(terminal(value.id, null)); t.mock.timers.tick(1500);
  assert.equal(isReading(mode, value), true);
  mode.syncReading(value); mode.syncReading({ ...value, codexActive: false }); t.mock.timers.tick(1500);
  assert.equal(isReading(mode, value), true);
});

test('one automatic handoff per notice and manual toggles cancel automatic return', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mode = readingMode(), value = terminal('manual');
  mode.syncReading(value); t.mock.timers.tick(1500); assert.equal(isReading(mode, value), false);
  mode.setReading(value.id, true); mode.syncReading(value); t.mock.timers.tick(1500);
  assert.equal(isReading(mode, value), true);
  mode.syncReading(terminal(value.id, null)); mode.syncReading(value); t.mock.timers.tick(1500);
  mode.setReading(value.id, false); mode.syncReading(terminal(value.id, null));
  assert.equal(isReading(mode, value), false);
  mode.agentExited({ ...value, codexActive: false }); assert.equal(isReading(mode, value), true);
});

test('manual choice during the delay cancels the pending handoff', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mode = readingMode(), value = terminal('manual-delay');
  mode.syncReading(value); mode.setReading(value.id, false); mode.setReading(value.id, true); t.mock.timers.tick(1500);
  assert.equal(isReading(mode, value), true);
});

test('choice visibility and handoff timers are isolated per terminal', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mode = readingMode(), first = terminal('first'), second = terminal('second');
  mode.syncReading(first); mode.syncReading(second); mode.setChoiceVisible(first.id, true); t.mock.timers.tick(1500);
  assert.equal(isReading(mode, first), true); assert.equal(isReading(mode, second), false);
});

test('reading view requires an active agent and a live terminal session', () => {
  const mode = readingMode(), value = terminal('shell', null);
  assert.equal(mode.readingShown({ ...value, codexActive: false }, []), false);
  assert.equal(mode.readingShown({ ...value, sessionId: null }, []), false);
});

test('reading entry rendering parses only the last 40 blocks and leaves the welcome branch intact', t => {
  const tail = require('../src/features/reading/useVisibleTail.ts');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ innerHTML: '', querySelectorAll: () => [] }) } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
  });
  let entries = Array.from({ length: 400 }, (_, index) => ({ id: String(index), at: 0, role: 'assistant', text: `answer-${index}` }));
  const parsed = [], icon = () => React.createElement('svg');
  const { ReadingView } = loadUI('features/reading/ReadingView.tsx', {
    marked: { marked: { parse: text => { parsed.push(text); return text; } } },
    dompurify: { default: () => ({ sanitize: html => html }) },
    '@phosphor-icons/react': Object.fromEntries(['ArrowDown', 'CaretDown', 'CaretRight', 'CircleNotch', 'Image', 'PaperPlaneRight', 'Stop'].map(name => [name, icon])),
    './ActivityPane': {}, './voice-input': {}, './terminal-screen': { useScreen: () => null },
    './agent-screen': { parseAgentScreen: () => fakeScreen() },
    './ReadingWelcome': { ReadingWelcome: () => React.createElement('p', null, 'welcome preserved') },
    './ReadingChoice': {}, './ReadingQuestion': {}, './choice-keys': {}, './reading-mode': {},
    './useStickToBottom': { useStickToBottom: () => ({ stuck: true, unseen: 0, ready: true, holdPosition() {}, toBottom() {} }) },
    './useReadingConversation': { conversationKey: () => 'session', useReadingConversation: () => entries },
    './useVisibleTail': tail, './reading.css': {},
    './useMentions': { useMentions: () => ({ open: false }) }, './MentionPalette': { MentionPalette: () => null },
    './pending-prompts': require('../src/features/reading/pending-prompts.ts'),
    './usePendingPrompts': { usePendingPrompts: () => ({ pending: [], echo() {}, cancelEcho() {} }) },
    './PendingPromptEntries': { PendingPromptEntries: () => null }, './ReadingDirectCard': { ReadingDirectCard: () => null }, './markdown-parse': { parseMarkdown: async () => null, parsedMarkdown: () => undefined },
    './ReadingSessions': { ReadingSessions: () => null }, './reading-sessions': require('../src/features/reading/reading-sessions.ts'),
    './reading-welcome': { useWelcomeStarting: () => false },
    './ReadingCliPanel': { ReadingCliPanel: () => null }, './ReadingCommandOutput': { ReadingCommandOutput: () => null },
    './cli-panel': require('../src/features/reading/cli-panel.ts'),
    './useReadingCli': { useReadingCli: (id, session, agent, list) => ({ entries: list, busy: false, panel: null, begin() {} }) },
    './i18n': { currentLanguage: () => 'en', t: (text, values) => (en[text] ?? text).replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? name)) },
  });
  const render = () => renderToStaticMarkup(React.createElement(ReadingView, {
    projectId: 'project', terminal: { id: 'terminal', sessionId: 'session', agent: 'codex', codexActive: true, needsInput: null },
    autoFocus: false, onShowTerminal() {}, onError() {}, onOpenLink() {},
  }));
  const html = render();
  assert.equal(parsed.length, 40);
  assert.equal(parsed[0], 'answer-360'); assert.equal(parsed.at(-1), 'answer-399');
  assert.match(html, /Show earlier conversation \(360\)/);
  assert.doesNotMatch(html, /answer-359/);
  entries = []; parsed.length = 0;
  assert.match(render(), /welcome preserved/); assert.equal(parsed.length, 0);
});

test('a question renders as its own card: progress, the question, options, an own answer or notes, Submit and Chat', () => {
  const icon = props => React.createElement('svg', { className: props.className });
  const icons = { CircleNotch: icon, CaretLeft: icon, CaretRight: icon, Check: icon, PaperPlaneRight: icon };
  const { ReadingQuestion } = loadUI('features/reading/ReadingQuestion.tsx', { '@phosphor-icons/react': icons, './question-keys': require('../src/features/reading/question-keys.ts') });
  const { parseAgentScreen } = require('../src/features/agents/agent-screen.ts');
  const screen = name => parseAgentScreen(name.startsWith('claude') ? 'claude' : 'codex', fs.readFileSync(path.join(__dirname, 'fixtures/questions', name + '.txt'), 'utf8').split('\n')).choice;
  const render = name => renderToStaticMarkup(React.createElement(ReadingQuestion, { choice: screen(name), terminalId: 'terminal', onError: () => {} }));
  const multi = render('claude-question-multi-checked');
  assert.match(multi, /要清理哪些目录？/); assert.match(multi, /aria-pressed="true"/); assert.match(multi, /Submit this question/);
  assert.match(multi, /Talk it over instead/); assert.match(multi, /placeholder="Type your own answer…"/); assert.match(multi, /清理目录/);
  assert.doesNotMatch(multi, /Chat about this|Type something/, 'the CLI\'s own English rows are shown in the window\'s words');
  const review = render('claude-question-review');
  assert.match(review, /Review your answers/); assert.match(review, /node_modules, abc/); assert.match(review, /Submit answers/);
  const codex = render('codex-question');
  assert.match(codex, /Question 1\/2/); assert.match(codex, /Notes \(optional\)/); assert.doesNotMatch(codex, /Optionally, add details/);
});
