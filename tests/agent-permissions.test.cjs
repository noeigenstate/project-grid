const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { createEventServer } = require('../electron/events.cjs');

const main = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
// Exercise the actual event handlers without opening Electron or the user's terminals.
function handlers() {
  const project = { id: 'p' }, session = { terminalId: 't', projectId: 'p', sessionKey: 'key', codexActive: true, agent: 'claude', codexActivity: 'working', promptQueue: { reset() {} }, submissions: { reset() {} } };
  const calls = { broadcast: 0, restore: 0, activity: 0, follow: 0 };
  const context = vm.createContext({
    sessions: new Map([['t', session]]), store: { projects: [project], setRestore() { calls.restore++; } }, quitting: false,
    broadcast() { calls.broadcast++; }, followClaude() { calls.follow++; }, applyActivity(_project, s, event) { calls.activity++; s.codexActivity = event.state; },
    acceptShellEvent: () => true, resumeAfterPrompt: async () => {}, t: text => text,
  });
  vm.runInContext(main.slice(main.indexOf('function claudeActivity('), main.indexOf('async function resumeAfterPrompt(')), context);
  return { context, session, calls, send: event => context.onEvent({ projectId: 't', sessionKey: 'key', type: 'agent-activity', sessionId: 'session', eventId: 'session:1', ...event }) };
}

test('Claude permission notices broadcast waiting state without changing activity or restore plans', () => {
  const { session, calls, send } = handlers();
  const before = Date.now();
  send({ state: 'attention', message: '长'.repeat(400) });
  assert.equal(session.needsInput.message, '长'.repeat(300));
  assert.ok(session.needsInput.since >= before && session.needsInput.since <= Date.now());
  assert.equal(session.codexActivity, 'working');
  assert.deepEqual(calls, { broadcast: 1, restore: 0, activity: 0, follow: 0 });
  send({ state: 'attention', sessionKey: 'wrong', message: 'Ignored' });
  send({ state: 'attention', sessionId: '../invalid', message: 'Ignored' });
  send({ state: 'idle', message: 'Ignored' });
  assert.equal(calls.broadcast, 1);
  session.agent = 'codex'; send({ state: 'attention', message: 'Ignored' });
  assert.equal(calls.broadcast, 1);
});

test('later working, complete, agent exit and shell prompt events clear the waiting notice', () => {
  for (const event of [{ state: 'working' }, { state: 'complete' }, { type: 'codex-exited', exitCode: 0 }, { type: 'shell-prompt', cwd: '/project' }]) {
    const { session, calls, send } = handlers();
    send({ state: 'attention', message: 'Approve tool' });
    send(event);
    assert.equal(session.needsInput, null);
    assert.equal(calls.restore, 1);
    assert.equal(calls.activity, event.state ? 1 : 0);
    assert.equal(calls.broadcast, event.state ? 1 : 2);
  }
});

test('terminal commands IPC selects the session agent, defaults to Claude and excludes SSH paths', async () => {
  const registrations = new Map(), scans = [];
  const sessions = new Map([['codex', { agent: 'codex' }]]);
  require('../electron/features/agents/ipc.cjs').registerAgentsIpc({
    handle: (name, callback) => registrations.set(name, callback), getSession: id => sessions.get(id),
    findProject: id => ({ kind: id === 'ssh' ? 'ssh' : 'local', path: '/project' }),
    listAgentCommands: async options => { scans.push(options); return [{ source: 'builtin', description: 'Builtin' }, { source: 'project', description: 'Custom' }]; },
    t: text => `Translated ${text}`,
  });
  const list = registrations.get('terminal:commands');
  for (const id of ['codex', 'stopped', 'ssh']) {
    const commands = await list(id);
    assert.equal(commands[0].description, 'Translated Builtin'); assert.equal(commands[1].description, 'Custom');
  }
  assert.deepEqual(scans.map(item => [item.agent, item.projectPath]), [['codex', '/project'], ['claude', '/project'], ['claude', undefined]]);
});

test('public state exposes waiting messages and null for terminals without a notice', () => {
  const context = vm.createContext({
    store: { projects: [{ id: 'p' }], settings: { language: 'zh' } }, sessions: new Map([['waiting', { needsInput: { message: 'Approve tool' } }]]),
    terminalIds: () => ['waiting', 'stopped'], getBranch: () => undefined, startupErrors: new Map(), t: text => text, localShell: () => ({ kind: 'powershell' }),
    process: { platform: 'win32', env: { AGENTRIX_DATA_DIR: 'isolated' } }, app: { getVersion: () => '1' },
    desktopGlassBackend: null, desktopGlassWindow: false, desktopGlassActive: false,
  });
  vm.runInContext(main.slice(main.indexOf('function publicState('), main.indexOf('function terminalIds(')), context);
  const terminals = context.publicState().projects[0].terminals;
  assert.equal(terminals[0].needsInput, 'Approve tool'); assert.equal(terminals[1].needsInput, null);
});

test('PowerShell Claude notification hooks filter idle events and send silent bounded permission notices', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  const events = [], server = await createEventServer(event => events.push(event));
  t.after(() => server.close());
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const run = payload => new Promise((resolve, reject) => {
    const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../integration/claude-hook.ps1'), '-PipeName', server.name, '-ProjectId', 'p', '-SessionKey', 'key', '-Kind', 'notify'], { windowsHide: true });
    let output = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.on('error', reject); child.on('close', code => resolve({ code, output }));
    child.stdin.end(JSON.stringify({ session_id: 's', ...payload }));
  });
  for (const notification_type of ['idle_prompt', 'auth_success', 'other', undefined]) assert.deepEqual(await run({ notification_type, message: 'Ignored' }), { code: 0, output: '' });
  assert.equal(events.length, 0);
  for (const notification_type of ['permission_prompt', 'elicitation_dialog']) assert.deepEqual(await run({ notification_type, message: '长'.repeat(400) }), { code: 0, output: '' });
  assert.equal(events.length, 2);
  assert.ok(events.every(event => event.state === 'attention' && event.message === '长'.repeat(300) && event.projectId === 'p' && event.sessionKey === 'key'));
});
