const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseAgentScreen } = require('../src/features/agents/agent-screen.ts');
const { cliHistory, isCliIdle, extractCliPanelRows, extractCliOutputRows, advanceCliCommand, mergeCliResults, cliPanelKey } = require('../src/features/reading/cli-panel.ts');
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/screens', name + '.txt'), 'utf8').split('\n');
const inspect = (agent, rows) => parseAgentScreen(agent, rows);
const footer = agent => agent === 'claude' ? ['  ⏺ Opus 5.5 · demo · ctx 4%   ● high · /effort', '  ⏸ manual mode on · ← for agents'] : ['  GPT-6.1-Sol high · C:\\work\\demo · 90% left', '? for shortcuts'];
const input = (agent, text = '') => agent === 'claude' ? ['────', '❯ ' + text, '────', ...footer(agent)] : ['› ' + text, '', ...footer(agent)];
const marker = agent => agent === 'claude' ? '❯' : '›';

for (const agent of ['claude', 'codex']) {
  test(agent + ': startup fixture is idle with its own placeholder', () => {
    const rows = fixture(agent + '-startup');
    assert.equal(isCliIdle(agent, rows, inspect(agent, rows)), true);
  });
  for (const suffix of ['model-menu', 'permission', 'slash-typed', 'mention', 'shortcuts']) {
    test(agent + ': ' + suffix + ' fixture is not idle', () => {
      const rows = fixture(agent + '-' + suffix);
      assert.equal(isCliIdle(agent, rows, inspect(agent, rows)), false);
    });
  }
  test(agent + ': empty input needs a parsed footer; arbitrary text is not a placeholder', () => {
    for (const [rows, expected] of [[input(agent), true], [input(agent, '/status'), false], [input(agent, 'Try my prompt'), false], [[marker(agent)], false]]) {
      assert.equal(isCliIdle(agent, rows, inspect(agent, rows)), expected);
    }
  });
  test(agent + ': result excludes history, command, composer and footer, preserving spacing', () => {
    const command = '! dir';
    const output = ['  Directory: C:\\work', '', '    42    file.txt'];
    const rows = ['old answer', marker(agent) + ' ' + command, '', ...output, '', ...input(agent), ''];
    assert.deepEqual(extractCliOutputRows(agent, rows, inspect(agent, rows), command), output);
  });
  test(agent + ': dialog without printed text produces no output', () => {
    const rows = [marker(agent) + ' /config', '', ...input(agent)];
    assert.deepEqual(extractCliOutputRows(agent, rows, inspect(agent, rows), '/config'), []);
  });
  test(agent + ': repeated echo uses the latest command and never old output', () => {
    const rows = [marker(agent) + ' /cost', 'old cost', marker(agent) + ' /cost', 'new cost', ...input(agent)];
    assert.deepEqual(extractCliOutputRows(agent, rows, inspect(agent, rows), '/cost'), ['new cost']);
  });
  test(agent + ': command arguments with repeated spaces still anchor output', () => {
    const command = '! dir  /a';
    const rows = [marker(agent) + ' ' + command, '  file.txt', ...input(agent)];
    assert.deepEqual(extractCliOutputRows(agent, rows, inspect(agent, rows), command), ['  file.txt']);
  });
  test(agent + ': missing echo produces no fabricated result', () => {
    const rows = ['old answer', '────', 'panel', ...input(agent)];
    assert.deepEqual(extractCliOutputRows(agent, rows, inspect(agent, rows), '/config'), []);
  });
  test(agent + ': live panel removes echo and footer, retains search input and hints', () => {
    const rows = ['old answer', marker(agent) + ' /config', '', '────', '  Config   Status', '  search: ', '', ...input(agent, 'search'), ''];
    assert.deepEqual(extractCliPanelRows(agent, rows, inspect(agent, rows), '/config'), ['────', '  Config   Status', '  search: ', '', ...input(agent, 'search').slice(0, agent === 'claude' ? 3 : 2)].filter((row, i, all) => i < all.length - 1 || row.trim()));
  });
  test(agent + ': missing echo falls back to last upper panel rule', () => {
    const rows = ['old answer', '────', 'other text', '╌╌╌╌', '', '  Status   Config', '  CLI content', '', ...input(agent, 'search')];
    const result = extractCliPanelRows(agent, rows, inspect(agent, rows), '/status');
    assert.deepEqual(result.slice(0, 2), ['  Status   Config', '  CLI content']);
    assert.ok(!result.includes('old answer'));
    assert.ok(!result.some(row => row.includes('ctx 4%') || row.includes('90% left')));
  });
  test(agent + ': submitted composer echo does not become panel content', () => {
    const rows = ['old text', '────', ...input(agent, '/status')];
    assert.ok(!extractCliPanelRows(agent, rows, inspect(agent, rows), '/status').some(row => row.includes('/status')));
  });
  test(agent + ': input history cannot be mistaken for an idle composer', () => {
    const rows = [marker(agent) + ' old command', '  panel contents', 'Esc to close'];
    assert.equal(isCliIdle(agent, rows, inspect(agent, rows)), false);
  });
}

test('Claude after-deny fixture is idle', () => {
  const rows = fixture('claude-after-deny');
  assert.equal(isCliIdle('claude', rows, inspect('claude', rows)), true);
});
test('Claude model fixture panel cuts everything through echoed /model', () => {
  const rows = fixture('claude-model-menu');
  const panel = extractCliPanelRows('claude', rows, inspect('claude', rows), '/model');
  assert.ok(panel.some(row => row.includes('Select model')));
  assert.ok(panel.at(-1).includes('Esc to cancel'));
  assert.ok(!panel.some(row => row.includes('PROJECT GRID') || row.includes('❯ /model')));
});
test('live slash overlays retain CLI suggestions instead of stripping them as footer rows', () => {
  for (const agent of ['claude', 'codex']) {
    const rows = fixture(agent + '-slash-typed');
    const panel = extractCliPanelRows(agent, rows, inspect(agent, rows), '/model');
    assert.ok(panel.some(row => row.includes(agent === 'claude' ? 'Set the AI model' : 'choose what model')));
    assert.ok(!panel.some(row => row.includes('872K wi')));
  }
});
test('replacement panel without composer strips status footer and retains keyboard hints', () => {
  const rows = ['❯ /status', '  Status', '  Tab to switch · Esc to close', ...footer('claude')];
  assert.deepEqual(extractCliPanelRows('claude', rows, inspect('claude', rows), '/status'), ['  Status', '  Tab to switch · Esc to close']);
});
test('panel extraction ignores historical status and does not treat tab hints as a footer', () => {
  const claude = [...footer('claude'), '❯ /status', '  Status', '  Esc to close', ...footer('claude')];
  assert.deepEqual(extractCliPanelRows('claude', claude, inspect('claude', claude), '/status'), ['  Status', '  Esc to close']);
  const noFooter = [...footer('claude'), '❯ /status', '  Status', '  Esc to close'];
  assert.deepEqual(extractCliPanelRows('claude', noFooter, inspect('claude', noFooter), '/status'), ['  Status', '  Esc to close']);
  const codex = ['› /config', '  Config', '  Tab to switch · Enter to select · Esc to close'];
  assert.deepEqual(extractCliPanelRows('codex', codex, inspect('codex', codex), '/config'), ['  Config', '  Tab to switch · Enter to select · Esc to close']);
});
test('idle debounce needs post-submit observation, survives ticks, resets when panel returns', () => {
  let command = { id: 'one', command: '/cost', at: 0, anchor: null, observed: false, idleSince: null, output: [] };
  const rows = ['❯ /cost', '  Total $1.00', ...input('claude')];
  const step = (now, observation = false, live = rows) => {
    const next = advanceCliCommand(command, 'claude', live, inspect('claude', live), now, observation);
    command = next.command;
    return next.done;
  };
  assert.equal(step(1000), false);
  assert.equal(step(1100, true), false);
  assert.equal(step(1499), false);
  assert.equal(step(1500), true);
  assert.deepEqual(command.output, ['  Total $1.00']);
  assert.equal(step(1600, true, ['❯ /cost', '  Cost dialog', 'Esc to close']), false);
  assert.equal(command.idleSince, null);
  assert.equal(step(1700, true), false);
  assert.equal(step(2100), true);
});
test('live output updates during idle debounce and dialog close adds nothing', () => {
  const command = { id: 'one', command: '/cost', at: 0, anchor: null, observed: true, idleSince: 0, output: ['old'] };
  const rows = ['❯ /cost', '  final', ...input('claude')];
  assert.deepEqual(advanceCliCommand(command, 'claude', rows, inspect('claude', rows), 400, true).command.output, ['  final']);
  const empty = ['❯ /cost', ...input('claude')];
  assert.deepEqual(advanceCliCommand(command, 'claude', empty, inspect('claude', empty), 400, true).command.output, []);
});
test('results merge immediately after their transcript command without mutating transcript', () => {
  const entries = [{ id: 'old', at: 1, role: 'user', text: '/cost' }, { id: 'command', at: 3, role: 'user', text: '/cost' }, { id: 'reply', at: 4, role: 'assistant', text: 'Next' }];
  const result = { id: 'output', at: 2, anchor: 'old', command: '/cost', rows: ['cost'] };
  const merged = mergeCliResults(entries, [result]);
  assert.deepEqual(merged.map(entry => entry.id), ['old', 'command', 'output', 'reply']);
  assert.deepEqual(merged[2].cliOutput, ['cost']);
  assert.equal(entries.length, 3);
  assert.deepEqual(mergeCliResults(entries, [result]), merged);
});
test('local command and result precede later transcript entries when CLI does not record commands', () => {
  const entries = [{ id: 'old', at: 1, role: 'assistant', text: 'Old' }, { id: 'new', at: 5, role: 'user', text: 'Next' }];
  const merged = mergeCliResults(entries, [{ id: 'a', at: 2, anchor: 'old', command: '/status', rows: ['status'] }, { id: 'b', at: 3, anchor: 'old', command: '/status', rows: ['status again'] }]);
  assert.deepEqual(merged.map(entry => entry.id), ['old', 'a-command', 'a', 'b-command', 'b', 'new']);
});
test('each repeated transcript command anchors one output', () => {
  const entries = [{ id: 'a', at: 1, role: 'user', text: '/cost' }, { id: 'b', at: 2, role: 'user', text: '/cost' }];
  const results = ['a', 'b'].map((id, i) => ({ id: id + '-out', command: '/cost', at: i + 1, anchor: null, rows: [id] }));
  assert.deepEqual(mergeCliResults(entries, results).map(entry => entry.id), ['a', 'a-out', 'b', 'b-out']);
});
test('panel keys forward navigation, editing, search, tabs and control keys', () => {
  for (const [key, data] of [['ArrowUp', '\x1b[A'], ['ArrowDown', '\x1b[B'], ['ArrowLeft', '\x1b[D'], ['ArrowRight', '\x1b[C'], ['Enter', '\r'], ['Escape', '\x1b'], ['Tab', '\t'], ['Backspace', '\x7f'], [' ', ' '], ['a', 'a'], ['中', '中']]) assert.equal(cliPanelKey({ key }), data);
  assert.equal(cliPanelKey({ key: 'Tab', shiftKey: true }), '\x1b[Z');
  assert.equal(cliPanelKey({ key: 'c', ctrlKey: true }), '\x03');
  assert.equal(cliPanelKey({ key: 'x', altKey: true }), '\x1bx');
  assert.equal(cliPanelKey({ key: 'Shift' }), null);
});

// Test the renderer's screen subscriptions with fake clocks; no DOM, Electron or
// actual agent sessions are started. This also exercises state across remounts.
function rendererHarness(t) {
  const Module = require('node:module');
  const ts = require('typescript');
  const filename = path.join(__dirname, '..', 'src/features/reading/useReadingCli.ts');
  const mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const screens = new Map(), watchers = new Map();
  let prior = null, focused = 0;
  const react = {
    useMemo: fn => fn(), useRef: () => prior ??= { current: null },
    useLayoutEffect: fn => fn(), useSyncExternalStore: (_subscribe, read) => read(),
  };
  const originalRequire = mod.require.bind(mod);
  mod.require = name => name === 'react' ? react : name.endsWith('/terminal-screen') ? {
    readScreen: id => screens.get(id) ?? null,
    subscribeScreen: (id, fn) => {
      watchers.set(id, fn);
      if (screens.has(id)) fn(screens.get(id));
      return () => { if (watchers.get(id) === fn) watchers.delete(id); };
    },
  } : name.endsWith('/agent-screen') ? { parseAgentScreen } : name.endsWith('/cli-panel') ? require('../src/features/reading/cli-panel.ts') : originalRequire(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
  const previousWindow = globalThis.window;
  globalThis.window = { setInterval, clearInterval };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  const render = (id = 'a', session = 'session', entries = []) => mod.exports.useReadingCli(id, session, 'claude', entries, { current: { focus: () => focused++ } }, true);
  const emit = (id, rows) => { screens.set(id, { rows }); watchers.get(id)?.({ rows }); };
  return { render, emit, tick: ms => t.mock.timers.tick(ms), remount: () => { prior = null; }, focused: () => focused, watchers };
}

test('renderer waits for screen output, keeps panel through 400 ms idle, then restores composer', t => {
  const harness = rendererHarness(t);
  harness.emit('a', input('claude'));
  harness.render().begin('/status');
  harness.tick(1000);
  assert.equal(harness.render().busy, true, 'stale pre-submit idle cannot finish the command');
  harness.emit('a', ['❯ /status', '  Status tabs', 'Esc to close']);
  assert.deepEqual(harness.render().panel.rows, ['  Status tabs', 'Esc to close']);
  harness.emit('a', ['❯ /status', '  Printed status', ...input('claude')]);
  harness.tick(399);
  assert.ok(harness.render().panel);
  harness.tick(1);
  const done = harness.render();
  assert.equal(done.busy, false);
  assert.equal(done.panel, null);
  // The dialog it drew stays as the command's result, followed by what it printed on closing.
  assert.deepEqual(done.entries.map(entry => entry.text ?? entry.cliOutput), ['/status', ['  Status tabs', 'Esc to close', '', '  Printed status']]);
  assert.equal(harness.focused(), 1);
  assert.equal(harness.watchers.size, 0);
});
test('renderer choice takes priority and empty dialog close creates no output', t => {
  const harness = rendererHarness(t);
  harness.render().begin('/model');
  harness.emit('a', fixture('claude-model-menu'));
  assert.equal(harness.render().panel, null);
  assert.equal(harness.render().busy, true);
  harness.emit('a', ['❯ /model', ...input('claude')]);
  harness.tick(400);
  assert.deepEqual(harness.render().entries, []);
});
test('renderer results survive remount, remain terminal-specific and reset for a new PTY session', t => {
  const harness = rendererHarness(t);
  harness.render().begin('! dir');
  harness.remount(); // Opening the raw terminal does not stop the result watcher.
  harness.emit('a', ['❯ ! dir', '  file.txt', ...input('claude')]);
  harness.tick(400);
  assert.equal(harness.render().entries.length, 2);
  assert.equal(harness.render('b').entries.length, 0);
  assert.equal(harness.render('a', 'new-session').entries.length, 0);
  assert.equal(harness.render().entries.length, 2);
});
test('renderer stops an old PTY watcher when the terminal session changes', t => {
  const harness = rendererHarness(t);
  harness.render().begin('/config');
  assert.equal(harness.watchers.size, 1);
  const next = harness.render('a', 'new-session');
  assert.equal(next.busy, false);
  assert.equal(harness.watchers.size, 0);
  harness.tick(1000);
  assert.deepEqual(harness.render('a', 'new-session').entries, []);
});

test('a Claude dialog in a tall terminal shows itself, not the welcome banner above a run of blank rows', () => {
  // Claude Code 2.1 /add-dir in a 45-row terminal: banner at the top, the dialog under its overline (which carries
  // the effort indicator set into it) at the bottom.
  const rows = [
    ' ▐▛███▛█   Claude Code v2.1.294', '▝▜██████▀  Opus 5.5 with xhigh effort · Claude Pro', ' ▝▝   ▝▝   ~/demo',
    ...Array(24).fill(''),
    '▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ ◉ xhigh · /effort ▔',
    '   Add directory to workspace', '', '   Claude Code will be able to read files in this directory.', '', '',
    '   Enter the path to the directory:', '   ╭──────────────────────╮', '   │ Directory path…      │', '   ╰──────────────────────╯', '',
    '   Tab to complete · Enter to add · Esc to cancel',
  ];
  const panel = extractCliPanelRows('claude', rows, inspect('claude', rows), '/add-dir');
  assert.equal(panel[0], '   Add directory to workspace');
  assert.equal(panel.at(-1), '   Tab to complete · Enter to add · Esc to cancel', 'keyboard hints stay');
  assert.ok(!panel.some(row => row.includes('Claude Code v2')), 'no banner');
  assert.ok(!panel.some((row, index) => !row.trim() && !panel[index - 1]?.trim()), 'blank rows never run together');
});

test('a Claude command still in the composer (its hooks running) shows no panel, and the banner never heads one', () => {
  const banner = [' ▐▛███▛█   Claude Code v2.1.294', '▝▜██████▀  Opus 5.5 with xhigh effort · Claude Pro', ' ▝▝   ▝▝   ~/demo', ''];
  // Enter was pressed; Claude still shows /btw in its input while UserPromptSubmit hooks run.
  const waiting = [...banner, ...Array(10).fill(''), ...input('claude', '/btw')];
  assert.deepEqual(extractCliPanelRows('claude', waiting, inspect('claude', waiting), '/btw'), []);
  // A dialog drawn straight under the banner, with neither an echo nor an overline above it.
  const dialog = [...banner, '   Select export method', '   1. Copy to clipboard', '   2. Save to file', '', '   Esc to cancel'];
  const panel = extractCliPanelRows('claude', dialog, inspect('claude', dialog), '/export');
  assert.equal(panel[0], '   Select export method');
  assert.ok(!panel.some(row => row.includes('Claude Code v2')));
});

test('Claude is not idle while its spinner runs, even with an empty input; a finished turn summary is not a spinner', () => {
  const hooks = ['❯ /release-notes', '', '✶ Osmosing… (running UserPromptSubmit hooks… 1/2 · 0s)', '', ...input('claude')];
  assert.equal(isCliIdle('claude', hooks, inspect('claude', hooks)), false);
  const thinking = ['· Beboppin\'… (3s · thinking with xhigh effort)', ...input('claude')];
  assert.equal(isCliIdle('claude', thinking, inspect('claude', thinking)), false);
  const done = ['❯ fix it', '⏺ Fixed.', '✻ Worked for 25s', '', ...input('claude')];
  assert.equal(isCliIdle('claude', done, inspect('claude', done)), true);
});

test('a command sent while the agent is not drawing yet (updating itself in the shell) shows nothing of the shell', () => {
  const shell = ['  PROJECT GRID', '  Type codex to start, or codex resume to continue a session.', '', 'PS C:\work> codex resume 01a1', 'Updating Codex via `powershell ...`', '==> Downloading Codex CLI'];
  assert.deepEqual(extractCliPanelRows('codex', shell, inspect('codex', shell), '/model'), []);
});

test('a Codex command shows only what it printed since it was sent, never the banner above it', () => {
  const banner = ['>_ OpenAI Codex (v0.162.0)', '   ~\work\demo', '   permissions: YOLO mode', ''];
  const sent = [...banner, '• Earlier answer', '', ...input('codex', '/copy')];
  const before = cliHistory('codex', sent, inspect('codex', sent));
  const printed = [...banner, '• Earlier answer', '', '• Copied the last message to the clipboard.', '', ...input('codex')];
  assert.deepEqual(extractCliPanelRows('codex', printed, inspect('codex', printed), '/copy', before), ['• Copied the last message to the clipboard.']);
  assert.deepEqual(extractCliOutputRows('codex', printed, inspect('codex', printed), '/copy', before), ['• Copied the last message to the clipboard.']);
  // Nothing printed yet: an empty card, not the banner.
  const quiet = [...banner, '• Earlier answer', '', ...input('codex')];
  assert.deepEqual(extractCliPanelRows('codex', quiet, inspect('codex', quiet), '/copy', before), []);
  // A screen drawn anew shares no row with what was there: nothing is taken from it.
  const fresh = [...banner, ...input('codex')];
  assert.deepEqual(extractCliOutputRows('codex', fresh, inspect('codex', fresh), '/clear', before), []);
});

test('Codex output taller than the screen is all the command\'s; a screen drawn anew under the banner gives nothing', () => {
  const sent = ['• Earlier answer', '', ...input('codex', '/status')];
  const before = cliHistory('codex', sent, inspect('codex', sent));
  const tall = ['│ Model: gpt-6.1-sol │', '│ Directory: C:\\work │', '╰────────────────────╯', '', ...input('codex')];
  assert.deepEqual(extractCliOutputRows('codex', tall, inspect('codex', tall), '/status', before), ['│ Model: gpt-6.1-sol │', '│ Directory: C:\\work │', '╰────────────────────╯']);
  const cleared = ['>_ OpenAI Codex (v0.162.0)', '   ~\\work', '', ...input('codex')];
  assert.deepEqual(extractCliOutputRows('codex', cleared, inspect('codex', cleared), '/clear', before), []);
});
