const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Node 24 can require ESM TypeScript directly, erasing the type-only import.
const { parseAgentScreen } = require('../src/features/agents/agent-screen.ts');

const emptyStatus = { model: null, effort: null, context: null, mode: null, notes: [] };
const emptyScreen = { banner: null, status: emptyStatus, choice: null, overlay: 'none' };
const claudeBanner = {
  product: 'Claude Code', version: '2.1.293', model: 'Opus 5.5', effort: 'high',
  plan: 'Claude Max', directory: 'C:\\work\\demo-app',
};
const codexBanner = {
  product: 'OpenAI Codex', version: '0.161.0', model: null, effort: null,
  plan: null, directory: 'C:\\work\\demo-app',
};
const codexStatus = context => ({ ...emptyStatus, model: 'GPT-6.1-Sol', effort: 'high', context });
const option = (number, label, selected = false, detail = '', hotkey = null) =>
  ({ number, label, detail, hotkey, selected });
const readFixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/screens', name + '.txt'), 'utf8').split('\n');
const claudeScreen = fields => ({ ...emptyScreen, banner: claudeBanner, ...fields });
const codexScreen = fields => ({ ...emptyScreen, banner: codexBanner, ...fields });
const codexFooterScreen = (context, fields) => codexScreen({
  banner: { ...codexBanner, model: 'GPT-6.1-Sol', effort: 'high' }, status: codexStatus(context), ...fields,
});

const expected = {
  'claude-startup': claudeScreen({ status: { ...emptyStatus, mode: 'manual mode on' } }),
  'claude-after-deny': claudeScreen({ status: {
    ...emptyStatus, model: 'Opus 5.5', effort: 'high', context: 'ctx 4%', mode: 'manual mode on',
  } }),
  'claude-permission': claudeScreen({ choice: {
    kind: 'permission', title: 'Do you want to create hello.txt?',
    context: ['Create file', 'hello.txt', '1 hi'],
    options: [
      option(1, 'Yes', true),
      option(2, 'Yes, and switch to accept edits (auto-approve file edits and common file commands) for this session (shift+tab)'),
      option(3, 'No'),
    ], hint: 'Esc to cancel · Tab to amend',
  } }),
  'claude-model-menu': claudeScreen({ choice: {
    kind: 'menu', title: 'Select model', context: [
      'Switch between Claude models. Your pick becomes the default for new sessions. For other/previous model names,',
      'specify with --model.',
    ], options: [
      option(1, 'Default (recommended)', false, 'Opus 5.5 · Best for everyday, complex tasks'),
      option(2, 'Opus 5.5 ✔', true, 'For complex work and everyday tasks'),
      option(3, 'Fable 5.1', false, 'For your toughest challenges'),
      option(4, 'Sonnet 5.5', false, 'Most efficient for simpler tasks'),
      option(5, 'Haiku 5.5', false, 'Fastest for quick answers'),
      option(6, 'Haiku 4.5', false, 'Fastest for quick answers'),
      option(7, 'Sonnet 5', false, 'Efficient for routine tasks'),
      option(8, 'Opus 5', false, 'Best for everyday, complex tasks'),
      option(9, 'Fable 5', false, 'Most capable for your hardest and longest-running tasks'),
      option(10, 'Opus 4.8', false, 'Best for everyday, complex tasks'),
    ], hint: 'Enter to set as default · s to use this session only · Esc to cancel',
  } }),
  'claude-slash-typed': claudeScreen({ overlay: 'slash' }),
  'claude-mention': claudeScreen({ overlay: 'mention' }),
  'claude-shortcuts': claudeScreen({ overlay: 'shortcuts' }),
  'codex-startup': codexFooterScreen('872K wi…', { status: {
    ...codexStatus('872K wi…'), notes: ['⚠ 1 warning · f2 to view'],
  } }),
  'codex-permission': codexScreen({ choice: {
    kind: 'permission', title: 'Would you like to run the following command?', context: [
      'Environment: local',
      'Reason: Allow creating hello.txt containing hi in this workspace? The filesystem sandbox is read-only.',
      "$ Set-Content -LiteralPath 'hello.txt' -Value 'hi' -NoNewline -Encoding ascii",
    ], options: [
      option(1, 'Yes, proceed', true, '', 'y'),
      option(2, "Yes, and don't ask again for commands that start with `Set-Content -LiteralPath hello.txt -Value hi -NoNewline -Encoding ascii`", false, '', 'p'),
      option(3, 'No, and tell Codex what to do differently', false, '', 'esc'),
    ], hint: 'Press enter to confirm or esc to cancel',
  } }),
  'codex-model-menu': codexScreen({ choice: {
    kind: 'menu', title: 'Select Model and Effort', context: [], options: [
      option(1, 'GPT-6.1-Sol (current)', true, 'Latest workhorse model for coding and everyday work.'),
      option(2, 'GPT-6-Astra', false, 'Frontier intelligence for the most demanding work.'),
      option(3, 'GPT-6-Sol', false, 'Previous generation workhorse model.'),
      option(4, 'GPT-6-Luna', false, 'Fast and affordable model for easier tasks.'),
      option(5, 'GPT-5.6-Sol', false, 'Older generation workhorse model.'),
      option(6, 'GPT-5.6-Terra', false, 'Older balanced model for straightforward work.'),
      option(7, 'GPT-5.6-Luna', false, 'Older fast and efficient model.'),
    ], hint: 'enter select · esc back',
  } }),
  'codex-slash-typed': codexFooterScreen('872K wi…', { overlay: 'slash' }),
  'codex-mention': codexFooterScreen('828K wi…', { overlay: 'mention' }),
  'codex-shortcuts': codexFooterScreen('828K wi…', { overlay: 'shortcuts' }),
};

test('every checked-in screen fixture has an explicit expectation', () => {
  assert.deepEqual(fs.readdirSync(path.join(__dirname, 'fixtures/screens')).sort(),
    Object.keys(expected).map(name => name + '.txt').sort());
});
for (const [name, result] of Object.entries(expected)) {
  test(name + ': full structured screen', () => {
    assert.deepEqual(parseAgentScreen(name.startsWith('claude') ? 'claude' : 'codex', readFixture(name)), result);
  });
}

for (const agent of ['claude', 'codex']) {
  test(agent + ': empty screen and plain PowerShell are empty state', () => {
    for (const rows of [[], ['', '  ', '\r'], ['PS C:\\work\\demo-app> ']]) {
      assert.deepEqual(parseAgentScreen(agent, rows), emptyScreen);
    }
  });
  test(agent + ': historical options are dismissed by later input or conversation', () => {
    const rows = readFixture(agent + '-permission');
    const marker = agent === 'claude' ? '❯' : '›';
    for (const suffix of [[marker + ' Continue', '● Done'], ['● Permission denied'], [marker]]) {
      assert.equal(parseAgentScreen(agent, [...rows, ...suffix]).choice, null);
    }
  });
  test(agent + ': only the final live list is parsed', () => {
    const rows = [...readFixture(agent + '-permission'), ...readFixture(agent + '-model-menu')];
    assert.deepEqual(parseAgentScreen(agent, rows).choice, expected[agent + '-model-menu'].choice);
  });
  test(agent + ': ordinary numbered conversation is not a choice', () => {
    assert.equal(parseAgentScreen(agent, ['Here are the results:', '  1. First', '  2. Second']).choice, null);
  });
}

test('padding and trailing carriage returns preserve every fixture without mutating input', () => {
  for (const [name, result] of Object.entries(expected)) {
    const rows = Object.freeze(readFixture(name).map(row => row.replace(/\r$/, '') + '   \r'));
    assert.deepEqual(parseAgentScreen(name.startsWith('claude') ? 'claude' : 'codex', rows), result, name);
  }
});

test('Claude mode symbols and parenthetical cycle hints', () => {
  for (const [symbol, mode] of [['⏵⏵', 'bypass permissions on'], ['⏵⏵', 'accept edits on'], ['⏸', 'plan mode on']]) {
    assert.deepEqual(parseAgentScreen('claude', ['────', '❯', '────', `${symbol} ${mode} (shift+tab to cycle)`]), {
      ...emptyScreen, status: { ...emptyStatus, mode },
    });
  }
});

test('footers use the bottom composer and ignore historical status lines', () => {
  const claude = [...readFixture('claude-after-deny'), '────', '❯', '────', '⏸ plan mode on · ← for agents'];
  assert.deepEqual(parseAgentScreen('claude', claude).status, { ...emptyStatus, mode: 'plan mode on' });
  const codex = [...readFixture('codex-startup'), '› New input', '', 'Other-Model low · /tmp/demo · 90% left', '? for shortcuts'];
  assert.deepEqual(parseAgentScreen('codex', codex).status, {
    ...emptyStatus, model: 'Other-Model', effort: 'low', context: '90% left',
  });
});

test('missing banner fields and footer effort stay null', () => {
  assert.deepEqual(parseAgentScreen('claude', ['Claude Code v2.1.293']), {
    ...emptyScreen, banner: { ...claudeBanner, model: null, effort: null, plan: null, directory: null },
  });
  assert.deepEqual(parseAgentScreen('codex', ['›', 'GPT-6.1-Sol · /tmp/demo · 90% left']).status, {
    ...emptyStatus, model: 'GPT-6.1-Sol', context: '90% left',
  });
});

test('wrapped two-column detail, scroll prefixes, hotkeys, and missing hint', () => {
  assert.deepEqual(parseAgentScreen('codex', [
    'Select Model and Effort', '  ↓ 10. Some Model  For complex', '        work (p)', '  › 11. Other (current)',
  ]).choice, {
    title: 'Select Model and Effort', kind: 'menu', context: [], hint: null,
    options: [option(10, 'Some Model', false, 'For complex work', 'p'), option(11, 'Other (current)', true)],
  });
});

test('Allow titles are permissions; a list without a cursor has no selected option', () => {
  assert.deepEqual(parseAgentScreen('codex', ['Allow editing this file?', '  1. Yes (y)', '  2. No (esc)']).choice, {
    kind: 'permission', title: 'Allow editing this file?', context: [], hint: null,
    options: [option(1, 'Yes', false, '', 'y'), option(2, 'No', false, '', 'esc')],
  });
});

test('old popup text above new conversation does not set an overlay', () => {
  for (const agent of ['claude', 'codex']) {
    for (const popup of ['slash-typed', 'mention', 'shortcuts']) {
      const marker = agent === 'claude' ? '❯' : '›';
      const suffix = agent === 'claude' ? ['────', marker, '────'] : [marker, '', 'GPT-6.1-Sol high · /tmp/demo · 90% left'];
      assert.equal(parseAgentScreen(agent, [...readFixture(agent + '-' + popup), marker + ' Continue', '● Done', ...suffix]).overlay, 'none');
    }
  }
});

test('prompts shown before the input exists are choices: Codex update offer, folders to trust, resuming from a summary', () => {
  // Codex 0.162 at start-up, as captured.
  const update = ['', '  Update available · 0.162.0 → 0.162.1', '  Release notes: https://github.com/openai/codex/releases/latest',
    "› 1. Update now (runs `powershell -ExecutionPolicy Bypass -c 'irm https://chatgpt.com/codex/install.ps1 | iex'`)", '  2. Skip',
    '  3. Skip until next version', '  enter continue · esc skip', ''];
  const offer = parseAgentScreen('codex', update).choice;
  assert.equal(offer.title, 'Update available · 0.162.0 → 0.162.1');
  assert.deepEqual(offer.context, ['Release notes: https://github.com/openai/codex/releases/latest']);
  assert.deepEqual(offer.options.map(option => [option.number, option.label.slice(0, 10), option.selected]), [[1, 'Update now', true], [2, 'Skip', false], [3, 'Skip until', false]]);
  assert.equal(offer.hint, 'enter continue · esc skip');
  const codexTrust = ['', '> You are running Codex in C:\work\demo', '', '  Since this folder is not version controlled, we recommend requiring approval of all edits and commands.', '',
    '› 1. Allow Codex to work in this folder without asking for approval', '  2. Require approval of edits and commands', '', '  Press enter to continue'];
  const trusting = parseAgentScreen('codex', codexTrust).choice;
  assert.equal(trusting.title, 'Since this folder is not version controlled, we recommend requiring approval of all edits and commands.');
  assert.equal(trusting.options.length, 2);
  // Claude 2.1.296 hides the numbers and puts the cursor on "No, exit" first.
  const claudeTrust = [' Accessing workspace:', '', ' C:\work\demo', '', ' Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source', ' project, or work from your team).',
    '', ' Security guide', '', ' ❯ No, exit', '   Yes, I trust this folder', '', ' Enter to confirm · Esc to cancel'];
  const trust = parseAgentScreen('claude', claudeTrust).choice;
  assert.equal(trust.title, 'Accessing workspace:');
  assert.equal(trust.context[0], 'C:\work\demo');
  assert.match(trust.context.join(' '), /Quick safety check/);
  assert.deepEqual(trust.options.map(option => [option.number, option.label, option.selected]), [[1, 'No, exit', true], [2, 'Yes, I trust this folder', false]]);
  assert.equal(trust.hint, 'Enter to confirm · Esc to cancel');
  // Claude's own input box with a key hint under it is no choice.
  assert.equal(parseAgentScreen('claude', ['────', '❯ draft', '────', ' Enter to confirm · Esc to cancel']).choice, null);
  const resume = [' This session is 3h 12m old and 230.6k tokens.', ' Resuming the full session will consume a substantial portion of your usage limits.', '',
    ' ❯ 1. Resume from summary (recommended)', '   2. Resume full session as-is', "   3. Don't ask me again", '', ' Enter to confirm · Esc to cancel'];
  assert.deepEqual(parseAgentScreen('claude', resume).choice.options.map(option => option.label), ['Resume from summary (recommended)', 'Resume full session as-is', "Don't ask me again"]);
});

test('a numbered list in a reply is never taken for a choice', () => {
  const reply = ['● Steps:', '  1. Build', '  2. Test', '', '────', '❯ ', '────', '  ? for shortcuts'];
  assert.equal(parseAgentScreen('claude', reply).choice, null);
  const noCursor = ['  Plan', '  1. Build', '  2. Test'];
  assert.equal(parseAgentScreen('codex', noCursor).choice, null);
  // Claude's /help over a conversation (2.1.296, as captured): sent prompts and their output are no options.
  const help = [' ▐▛███▛█   Claude Code v2.1.296', '▝▜██████▀  Opus 5.5 with high effort · Claude Pro', '', '❯ /model', '  ⎿  Kept model as Opus 5.5', '', '❯ /agents',
    '  ⎿  The /agents wizard has been removed.', '', '▔▔▔▔▔▔▔▔▔▔', '   Help  General   Commands   Custom commands', '', '   For more help: https://code.claude.com/docs/en/overview', '', '   Esc to cancel'];
  assert.equal(parseAgentScreen('claude', help).choice, null);
  const numbered = ['❯ 1. Build it', '  ⎿  Interrupted', '', '▔▔▔▔▔▔▔▔▔▔', '   Usage', '   Esc to cancel'];
  assert.equal(parseAgentScreen('claude', numbered).choice, null);
});

test('first-run screens captured from the real CLIs open as choices', () => {
  // Claude Code 2.1.296 with an empty config folder: the text style, then the sign-in method.
  const theme = ['.......█ █   █ █..........................................', '', " Let's get started.", '', ' Choose the text style that looks best with your terminal', ' To change this later, run /theme', '',
    '     Auto (match terminal)', ' ❯ ✔ Dark mode', '     Light mode', '     Dark mode (colorblind-friendly)', '     Light mode (colorblind-friendly)', '     Dark mode (ANSI colors only)', '     Light mode (ANSI colors only)', '',
    ' ╌╌╌╌╌╌╌╌', '  1  function greet() {', '  2 -  console.log("Hello, World!");', '  2 +  console.log("Hello, Claude!");', '  3  }', ' ╌╌╌╌╌╌╌╌', '  Syntax theme: Monokai Extended (ctrl+t to disable)'];
  const style = parseAgentScreen('claude', theme).choice;
  assert.equal(style.title, "Let's get started.");
  assert.deepEqual(style.context, ['Choose the text style that looks best with your terminal', 'To change this later, run /theme']);
  assert.deepEqual(style.options.map(option => option.label), ['Auto (match terminal)', 'Dark mode', 'Light mode', 'Dark mode (colorblind-friendly)', 'Light mode (colorblind-friendly)', 'Dark mode (ANSI colors only)', 'Light mode (ANSI colors only)']);
  assert.equal(style.options.findIndex(option => option.selected), 1);
  const login = ['.......█ █   █ █..........................................', '', ' Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.', '', ' Select login method:', '',
    ' ❯ 1. Claude account with subscription · Pro, Max, Team, or Enterprise', '   2. Anthropic Console account · API usage billing', '   3. 3rd-party platform · Amazon Bedrock, Microsoft Foundry, Google Vertex AI'];
  const method = parseAgentScreen('claude', login).choice;
  assert.equal(method.title, 'Select login method:');
  assert.deepEqual(method.options.map(option => [option.number, option.selected]), [[1, true], [2, false], [3, false]]);
  // Codex 0.162 with an empty CODEX_HOME: its cursor is ">", each option has a description, blank rows between them.
  const signIn = ["  Welcome to Codex, OpenAI's command-line coding agent", '', '  Sign in with ChatGPT to use Codex as part of your paid plan', '  or connect an API key for usage-based billing', '',
    '> 1. Sign in with ChatGPT', '     Usage included with Plus, Pro, Business, and Enterprise plans', '', '  2. Sign in with Device Code', '     Sign in from another device with a one-time code', '',
    '  3. Provide your own API key', '     Pay for what you use', '', '  Press enter to continue'];
  const codex = parseAgentScreen('codex', signIn).choice;
  assert.equal(codex.title, 'Sign in with ChatGPT to use Codex as part of your paid plan');
  assert.deepEqual(codex.options.map(option => [option.label, option.detail, option.selected]), [
    ['Sign in with ChatGPT', 'Usage included with Plus, Pro, Business, and Enterprise plans', true],
    ['Sign in with Device Code', 'Sign in from another device with a one-time code', false],
    ['Provide your own API key', 'Pay for what you use', false]]);
  assert.equal(codex.hint, 'Press enter to continue');
});

test('prompts reproduced from the CLIs\' own text open as choices', () => {
  // Codex 0.162 asks before working in a folder it has not been told to trust.
  const trust = ['  Trust this folder?', '', '  Codex can read, edit, and run files here, subject to your permission settings. Folder settings can run code', '  automatically, even without a model request. Continue only if you trust these files. Your trust decision will be saved.', '',
    '› 1. Trust and continue', '  2. Open restricted', '  3. Quit', '', '  Press enter to continue'];
  const folder = parseAgentScreen('codex', trust).choice;
  assert.equal(folder.title, 'Trust this folder?');
  assert.match(folder.context.join(' '), /^Codex can read, edit, and run files here/);
  assert.deepEqual(folder.options.map(option => option.label), ['Trust and continue', 'Open restricted', 'Quit']);
  // Claude's warnings without numbers, the refusal first and under the cursor.
  const bypass = [' WARNING: Claude Code running in Bypass Permissions mode', '', ' In Bypass Permissions mode, Claude Code will not ask for your approval before running potentially dangerous commands.',
    ' By proceeding, you accept all responsibility for actions taken while running in Bypass Permissions mode.', '', ' ❯ No, exit', '   Yes, I accept', '', ' Enter to confirm · Esc to cancel'];
  const warning = parseAgentScreen('claude', bypass).choice;
  assert.equal(warning.title, 'WARNING: Claude Code running in Bypass Permissions mode');
  assert.deepEqual(warning.options.map(option => [option.label, option.selected]), [['No, exit', true], ['Yes, I accept', false]]);
  const mcp = [' New MCP server found in this project: github', '', ' MCP servers may execute code or access system resources. All tool calls require approval.', '',
    ' ❯ Use this MCP server', '   Use this and all future MCP servers in this project', '   Continue without using this MCP server', '', ' Enter to confirm · Esc to cancel'];
  assert.deepEqual(parseAgentScreen('claude', mcp).choice.options.map(option => option.label), ['Use this MCP server', 'Use this and all future MCP servers in this project', 'Continue without using this MCP server']);
});
