const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseAgentScreen } = require('../src/features/agents/agent-screen.ts');
const { cliCloseKey, isSideConversation, cliHistory, isCliIdle, extractCliPanelRows, extractCliOutputRows, advanceCliCommand, cliPanelKey } = require('../src/features/reading/cli-panel.ts');
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
  assert.ok(!panel.some(row => row.includes('AGENTRIX') || row.includes('❯ /model')));
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
  const render = (id = 'a', session = 'session') => mod.exports.useReadingCli(id, session, 'claude', { current: { focus: () => focused++ } }, true);
  const emit = (id, rows) => { screens.set(id, { rows }); watchers.get(id)?.({ rows }); };
  return { render, emit, tick: ms => t.mock.timers.tick(ms), remount: () => { prior = null; }, focused: () => focused, watchers };
}

test('renderer waits for screen output, keeps the finished popup until it is closed, then restores the composer', t => {
  const harness = rendererHarness(t);
  harness.emit('a', input('claude'));
  harness.render().begin('/status');
  harness.tick(1000);
  assert.equal(harness.render().busy, true, 'stale pre-submit idle cannot finish the command');
  harness.emit('a', ['❯ /status', '  Status tabs', 'Esc to close']);
  assert.deepEqual(harness.render().panel.rows, ['  Status tabs', 'Esc to close']);
  harness.emit('a', ['❯ /status', '  Printed status', ...input('claude')]);
  harness.tick(399);
  assert.equal(harness.render().busy, true);
  harness.tick(1);
  const done = harness.render();
  assert.equal(done.busy, false);
  // The popup stays on what the command showed: the dialog it drew, then what it printed on closing.
  assert.deepEqual(done.panel, { command: '/status', rows: ['  Status tabs', 'Esc to close', '', '  Printed status'], done: true });
  assert.equal(harness.focused(), 0);
  assert.equal(harness.watchers.size, 0);
  done.close();
  assert.equal(harness.render().panel, null);
  assert.equal(harness.focused(), 1, 'the message box takes the keyboard back once the popup closes');
});
test('renderer choice takes priority and a dialog closed without content leaves no popup', t => {
  const harness = rendererHarness(t);
  harness.render().begin('/model');
  harness.emit('a', fixture('claude-model-menu'));
  assert.equal(harness.render().panel, null);
  assert.equal(harness.render().busy, true);
  harness.emit('a', ['❯ /model', ...input('claude')]);
  harness.tick(400);
  assert.equal(harness.render().busy, false);
  assert.equal(harness.render().panel, null);
});
test('renderer popup survives remount, remains terminal-specific and resets for a new PTY session', t => {
  const harness = rendererHarness(t);
  harness.render().begin('! dir');
  harness.remount(); // Opening the raw terminal does not stop the command's watcher.
  harness.emit('a', ['❯ ! dir', '  file.txt', ...input('claude')]);
  harness.tick(400);
  assert.deepEqual(harness.render().panel.rows, ['  file.txt']);
  assert.equal(harness.render('b').panel, null);
  assert.equal(harness.render('a', 'new-session').panel, null);
  assert.deepEqual(harness.render().panel.rows, ['  file.txt']);
});
test('renderer stops an old PTY watcher when the terminal session changes', t => {
  const harness = rendererHarness(t);
  harness.render().begin('/config');
  assert.equal(harness.watchers.size, 1);
  const next = harness.render('a', 'new-session');
  assert.equal(next.busy, false);
  assert.equal(harness.watchers.size, 0);
  harness.tick(1000);
  assert.equal(harness.render('a', 'new-session').panel, null);
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
  const shell = ['  AGENTRIX', '  Type codex to start, or codex resume to continue a session.', '', 'PS C:\work> codex resume 01a1', 'Updating Codex via `powershell ...`', '==> Downloading Codex CLI'];
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

test('a Codex side conversation closes with Ctrl+C; a pager with q; an open dialog with Escape; the input with nothing', () => {
  const side = ['› what is a side conversation', '', '• An answer.', '', ...input('codex')];
  assert.equal(cliCloseKey('codex', side, inspect('codex', side), '/side'), '\x03');
  const pager = ['/ D I F F', '+ added', '↑/↓ to scroll · pgup/pgdn to page · home/end to jump', 'q close'];
  assert.equal(cliCloseKey('codex', pager, inspect('codex', pager), '/diff'), 'q');
  const idle = ['• Done.', '', ...input('codex')];
  assert.equal(cliCloseKey('codex', idle, inspect('codex', idle), '/pwd'), null);
  // Refused in a conversation with nothing in it yet: no side conversation opened, and Ctrl+C would quit Codex.
  const refused = ["■ '/side' is unavailable until the current conversation has started."];
  assert.equal(cliCloseKey('codex', idle, inspect('codex', idle), '/side', refused), null);
  assert.equal(isSideConversation('codex', '/side', refused), false);
  assert.equal(isSideConversation('codex', '/side'), true);
  const shown = [...refused, '', ...input('codex')];
  assert.equal(cliCloseKey('codex', shown, inspect('codex', shown), '/side'), null, 'the refusal on screen before the command printed anything');
  const later = [...refused, '', '› /side', '', 'Side conversation', '', ...input('codex')];
  assert.equal(cliCloseKey('codex', later, inspect('codex', later), '/side'), '\x03', 'an older refusal above a side conversation');
});

test('a Codex command waits for output that comes a moment after its input returns, then for it to settle', () => {
  const sent = ['• Earlier answer', '', ...input('codex', '/status')];
  let command = { id: 'c', command: '/status', at: 0, anchor: null, observed: true, idleSince: null, output: [], dialog: [], before: cliHistory('codex', sent, inspect('codex', sent)) };
  const step = (rows, now) => { const next = advanceCliCommand(command, 'codex', rows, inspect('codex', rows), now, true); command = next.command; return next.done; };
  const quiet = ['• Earlier answer', '', ...input('codex')];
  assert.equal(step(quiet, 100), false); assert.equal(step(quiet, 600), false, 'nothing printed yet: keep waiting');
  const printed = ['• Earlier answer', '', '│ Model: gpt-6.1-sol │', '', ...input('codex')];
  assert.equal(step(printed, 900), false, 'output just changed');
  assert.equal(step(printed, 1350), true, 'output settled');
  assert.deepEqual(command.output, ['│ Model: gpt-6.1-sol │']);
  command = { ...command, output: [], idleSince: null };
  assert.equal(step(quiet, 2000), false); assert.equal(step(quiet, 8100), true, 'a command that prints nothing ends after several seconds');
});

test('a Codex picker drawn under the input (/copy) fills the card and closes with Escape', () => {
  const sent = ['• MAIN-1', '', ...input('codex', '/copy')];
  const before = cliHistory('codex', sent, inspect('codex', sent));
  const picker = ['› 只回复：MAIN-1', ...input('codex', 'Ask Codex to do anything'), '  Copy user message', '  ↑/↓/j/k select · g/G ends · enter copy · esc close'];
  assert.deepEqual(extractCliPanelRows('codex', picker, inspect('codex', picker), '/copy', before), ['  Copy user message', '  ↑/↓/j/k select · g/G ends · enter copy · esc close']);
  assert.equal(cliCloseKey('codex', picker, inspect('codex', picker), '/copy'), '\x1b');
});

test('Codex /status, whose card repeats the banner, is found by its echo when the history above changed meanwhile', () => {
  const banner = ['>_ OpenAI Codex (v0.162.0)', '   ~\\work\\demo', '   permissions: YOLO mode', ''];
  const sent = [...banner, '  Tip: try /review', '', ...input('codex', '/status')];
  const before = cliHistory('codex', sent, inspect('codex', sent));
  const card = ['  >_ OpenAI Codex (v0.162.0)', '  Model:               GPT-6.1-Sol (reasoning high)', '  Weekly limit:        [███████████████████░] 96% left'];
  const printed = [...banner, '/status', ...card, '', ...input('codex')];
  assert.deepEqual(extractCliOutputRows('codex', printed, inspect('codex', printed), '/status', before), card);
  assert.deepEqual(extractCliPanelRows('codex', printed, inspect('codex', printed), '/status', before), card);
});

test('the command line newer Codex prints above its output is not repeated in the result', () => {
  const sent = ['• MAIN-1', '', ...input('codex', '/status')];
  const before = cliHistory('codex', sent, inspect('codex', sent));
  const printed = ['• MAIN-1', '', '/status', '', '  Model:   gpt-6.1-sol', '', ...input('codex')];
  assert.deepEqual(extractCliOutputRows('codex', printed, inspect('codex', printed), '/status', before), ['  Model:   gpt-6.1-sol']);
});

test('a Claude dialog opened while Claude works is still a dialog: the next command closes it first', () => {
  // Claude 2.1.296 with a round under way: its working line stays above the /status dialog.
  const working = ['· Razzmatazzing… (11s · thinking with high effort)', '▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔', '   Settings  Status   Config   Usage   Stats', '',
    '   Version:           2.1.296', '   Session kind:      interactive', '   Model:             opus (claude-opus-5-5)', '', '   Esc to cancel'];
  assert.equal(cliCloseKey('claude', working, inspect('claude', working), '/status'), '\x1b');
  // Working with no dialog: nothing to close (Escape there would interrupt the round).
  const busy = ['● Writing the poem', '', '✶ Razzmatazzing… (11s · esc to interrupt)', '', ...input('claude')];
  assert.equal(cliCloseKey('claude', busy, inspect('claude', busy), '/status'), null);
  const answering = ['✶ Razzmatazzing… (3s · esc to interrupt)', '', '● Line one of the poem'];
  assert.equal(cliCloseKey('claude', answering, inspect('claude', answering), '/status'), null);
});

test('a Claude dialog closed while Claude still works ends its command at once, with what the dialog showed', () => {
  const working = ['· Razzmatazzing… (11s · thinking with high effort)', '▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔', '   Settings  Status   Config   Usage   Stats', '',
    '   Current session    ██▌ 5% used', '', '   Esc to cancel'];
  const shown = { id: 'c', command: '/usage', at: 0, observed: true, idleSince: null, output: [], dialog: ['   Current session    ██▌ 5% used'] };
  assert.equal(advanceCliCommand(shown, 'claude', working, inspect('claude', working), 100, true).done, false, 'still open');
  const busy = ['● Writing the poem', '', '✶ Razzmatazzing… (12s · esc to interrupt)', '', ...input('claude')];
  assert.equal(advanceCliCommand(shown, 'claude', busy, inspect('claude', busy), 200, true).done, true, 'closed, Claude still working');
  assert.equal(advanceCliCommand({ ...shown, dialog: [] }, 'claude', busy, inspect('claude', busy), 200, true).done, false, 'no dialog seen yet: wait');
});

test('a Codex command that asked something ends once the question is gone, without waiting for output', () => {
  const sent = ['• Earlier answer', '', ...input('codex', '/model')];
  let command = { id: 'c', command: '/model', at: 0, observed: true, idleSince: null, output: [], dialog: [], before: cliHistory('codex', sent, inspect('codex', sent)) };
  const step = (rows, now) => { const next = advanceCliCommand(command, 'codex', rows, inspect('codex', rows), now, true); command = next.command; return next.done; };
  const menu = fixture('codex-model-menu');
  assert.ok(inspect('codex', menu).choice, 'the fixture is a picker');
  assert.equal(step(menu, 100), false);
  const back = ['• Earlier answer', '', ...input('codex')];
  assert.equal(step(back, 200), false);
  assert.equal(step(back, 600), true, 'done after the usual 400 ms idle, not the eight seconds a silent command gets');
});
