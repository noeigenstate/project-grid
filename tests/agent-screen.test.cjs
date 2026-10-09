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
