const { test } = require('node:test');
const assert = require('node:assert/strict');
const { signInScreen } = require('../src/features/agents/sign-in-screen.ts');

// Screens captured from Claude Code 2.1.296 and Codex 0.162 with empty config folders.
const claudeArt = ['PS C:\\work\\demo> claude', 'Welcome to Claude Code v2.1.296', '..........................................................', '       █████████                                        *', '.......█ █   █ █..........................................'];

test('Claude\'s sign-in link, wrapped over rows, with its code field', () => {
  const rows = [...claudeArt, '', " Browser didn't open? Use the url below to sign in (c to copy)", '',
    'https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcod',
    'e%2Fcallback&scope=org%3Acreate_api_key+user%3Aprofile&code_challenge=d3h2J', 'eQWpfctcWUTUwNPU2&code_challenge_method=S256&state=65Yai_7Pghe1', '', ' Paste code here if prompted >'];
  assert.deepEqual(signInScreen('claude', rows), {
    lines: ["Browser didn't open? Use the url below to sign in"],
    url: 'https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=org%3Acreate_api_key+user%3Aprofile&code_challenge=d3h2JeQWpfctcWUTUwNPU2&code_challenge_method=S256&state=65Yai_7Pghe1',
    code: null, input: 'code', enter: false, cancel: false,
  });
});

test('Claude after signing in waits for Enter', () => {
  const screen = signInScreen('claude', [...claudeArt, '', ' Login successful. Press Enter to continue…']);
  assert.equal(screen.enter, true); assert.equal(screen.input, null);
});

test('Codex device sign-in: the page, the one-time code and Escape to cancel', () => {
  const rows = ["  Welcome to Codex, OpenAI's command-line coding agent", '', '  Finish signing in via your browser', '', '  1. Open this link in your browser and sign in', '',
    '  https://auth.openai.com/codex/device', '', '  2. Enter this one-time code after you are signed in (expires in 15 minutes)', '', '  P4DP-8OSZ4', '',
    '  Continue only if you started this login in Codex. If a website or another person gave you this code, cancel.', '', '  Press esc to cancel'];
  assert.deepEqual(signInScreen('codex', rows), {
    lines: ['Finish signing in via your browser', '1. Open this link in your browser and sign in', '2. Enter this one-time code after you are signed in (expires in 15 minutes)',
      'Continue only if you started this login in Codex. If a website or another person gave you this code, cancel.'],
    url: 'https://auth.openai.com/codex/device', code: 'P4DP-8OSZ4', input: null, enter: false, cancel: true,
  });
});

test('Codex API key field under its mark', () => {
  const rows = ['   ⠸⣿⣿⣿⡆   ⢰⣿⣿⣿⠇', '     ⠉⠙⠛⠿⠿⠿⠛⠋⠁', "  Welcome to Codex, OpenAI's command-line coding agent", '> Use your own OpenAI API key for usage-based billing',
    '  Paste or type your API key below.', '╭API key──────────╮', '│Paste or type your API key │', '╰─────────────────╯', '  Press enter to save', '  Press esc to go back'];
  assert.deepEqual(signInScreen('codex', rows), {
    lines: ['> Use your own OpenAI API key for usage-based billing', 'Paste or type your API key below.'], url: null, code: null, input: 'key', enter: false, cancel: true,
  });
});

test('an ordinary screen is no sign-in', () => {
  assert.equal(signInScreen('claude', ['❯ explain https://example.com/a', '  ⎿  Done']), null);
  assert.equal(signInScreen('codex', ['› hello', '• Hi there']), null);
});
