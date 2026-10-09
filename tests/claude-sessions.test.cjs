const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { encodeClaudeCwd, findClaudeSession, listClaudeSessions, promptTitle, READ_BUDGET } = require('../electron/claude-sessions.cjs');
const { TranscriptTail, ActionLog, claudeRecord } = require('../electron/agent-actions.cjs');
const { ConversationLog, claudeConversation } = require('../electron/conversation.cjs');
const { monitorActivity } = require('../electron/codex-activity.cjs');
const { claudeResumeCommand } = require('../electron/session-restore.cjs');
const { claudeReply } = require('../electron/round-summary.cjs');
const { HISTORY_WINDOW } = require('../electron/transcript-window.cjs');

const user = content => ({ type: 'user', uuid: 'prompt', message: { content } });
async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-claude-sessions-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const cwd = 'E:\\不负芳华\\project', folder = path.join(home, 'projects', encodeClaudeCwd(cwd));
  await fs.mkdir(folder, { recursive: true });
  const write = async (id, records, when = 1000000) => {
    const file = path.join(folder, `${id}.jsonl`);
    await fs.writeFile(file, records.map(record => JSON.stringify(record)).join('\n') + '\n');
    await fs.utimes(file, when / 1000, when / 1000);
    return file;
  };
  return { home, cwd, folder, write };
}

test('Claude cwd encoding replaces every separator, punctuation and Unicode character separately', () => {
  assert.equal(encodeClaudeCwd('E:\\不负芳华\\pg-worktrees\\bisect\\.test-output\\narrow-claude-1791451017450\\one'),
    'E-------pg-worktrees-bisect--test-output-narrow-claude-1791451017450-one');
  assert.equal(encodeClaudeCwd('/tmp/a_b.c +é😀'), '-tmp-a-b-c----');
});

test('session lookup prefers the encoded project and scans folders only when it is absent', async t => {
  const f = await fixture(t), known = await f.write('known', [user('hello')]);
  const other = path.join(f.home, 'projects', 'edge-encoding'); await fs.mkdir(other);
  await fs.writeFile(path.join(other, 'other.jsonl'), '{}\n');
  assert.equal(await findClaudeSession(f.cwd, 'known', f.home), known);
  assert.equal(await findClaudeSession(f.cwd, 'other', f.home), null);
  await fs.rename(f.folder, path.join(f.home, 'projects', 'legacy-encoding'));
  assert.equal(await findClaudeSession(f.cwd, 'known', f.home), path.join(f.home, 'projects', 'legacy-encoding', 'known.jsonl'));
  assert.equal(await findClaudeSession(f.cwd, 'missing', f.home), null);
  for (const id of ['../other', 'bad\rcommand', '', null]) assert.equal(await findClaudeSession(f.cwd, id, f.home), null);
});

test('titles accept text blocks, trim whitespace and skip metadata, tool results, commands and caveats', () => {
  assert.equal(promptTitle(user('  Fix\n this   project  ')), 'Fix this project');
  assert.equal(promptTitle(user([{ type: 'image' }, { type: 'text', text: 'A prompt' }])), 'A prompt');
  assert.equal(promptTitle(user('好'.repeat(130))).length, 120);
  for (const record of [
    { ...user('meta'), isMeta: true }, { ...user('child'), isSidechain: true },
    { type: 'assistant', message: { content: 'answer' } },
    user([{ type: 'text', text: 'hidden' }, { type: 'tool_result' }]),
    user('<command-name>/resume</command-name>'), user('<command-message>help</command-message>'),
    user('<local-command-stdout>done</local-command-stdout>'), user('<local-command-caveat>hidden</local-command-caveat>'),
    user('[Caveat: The messages below were generated while running local commands.]'), user('Caveat: local commands'), user([]),
  ]) assert.equal(promptTitle(record), '');
});

test('session list extracts the first real prompt, counts records and excludes the current id', async t => {
  const f = await fixture(t);
  await f.write('current', [user('current')], 3000000);
  await f.write('older', [user('old')], 1000000);
  await f.write('newer', [{ ...user('meta'), isMeta: true }, user('<command-name>/model</command-name>'),
    user([{ type: 'tool_result' }]), user('First real prompt'), user('Later prompt'), { type: 'assistant' }], 2000000);
  await fs.writeFile(path.join(f.folder, 'ignore.txt'), 'nothing');
  await fs.mkdir(path.join(f.folder, 'child.jsonl'));
  const list = await listClaudeSessions(f.cwd, 'current', f.home);
  assert.deepEqual(list, [
    { id: 'newer', title: 'First real prompt', updatedAt: 2000000, messages: 6 },
    { id: 'older', title: 'old', updatedAt: 1000000, messages: 1 },
  ]);
});

test('session list takes the newest 30 and missing project folders return an empty list', async t => {
  const f = await fixture(t);
  for (let index = 0; index < 35; index++) await f.write(`session-${index}`, [user(`prompt ${index}`)], 1000000 + index * 1000);
  const list = await listClaudeSessions(f.cwd, null, f.home);
  assert.equal(list.length, 30); assert.equal(list[0].id, 'session-34'); assert.equal(list.at(-1).id, 'session-5');
  assert.deepEqual(await listClaudeSessions('/missing', null, f.home), []);
});

test('large transcripts never read titles beyond 256 KiB and estimate message density', async t => {
  const f = await fixture(t);
  const line = JSON.stringify({ type: 'assistant', message: { content: 'x'.repeat(500) } }) + '\n';
  const records = Math.ceil(READ_BUDGET / Buffer.byteLength(line)) + 30;
  await fs.writeFile(path.join(f.folder, 'large.jsonl'), line.repeat(records) + JSON.stringify(user('Too late to be read')) + '\n');
  await fs.writeFile(path.join(f.folder, 'broken.jsonl'), '{bad json}\n' + JSON.stringify(user('Valid prompt')) + '\n{"type":"user"');
  const list = await listClaudeSessions(f.cwd, null, f.home);
  assert.equal(list.find(item => item.id === 'large').title, '');
  assert.ok(Math.abs(list.find(item => item.id === 'large').messages - records) <= 2);
  assert.equal(list.find(item => item.id === 'broken').title, 'Valid prompt');
  assert.equal(list.find(item => item.id === 'broken').messages, 1);
});

const main = syncFs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
function mainHarness(t, f) {
  const project = { id: 'project', path: f.cwd, kind: 'local' };
  const restore = { cwd: f.cwd, agent: 'claude' };
  let resets = 0;
  const s = { terminalId: 'terminal', projectId: project.id, sessionKey: 'key', agent: 'claude', codexActive: true,
    actions: new ActionLog(), conversation: new ConversationLog(), promptQueue: { reset() {} }, submissions: { reset() {} } };
  const reset = s.conversation.reset.bind(s.conversation); s.conversation.reset = () => { resets++; reset(); };
  const sessions = new Map([[s.terminalId, s]]);
  const store = { projects: [project], findTerminal: () => ({ record: { restore } }),
    setRestore: (_id, value) => Object.assign(restore, value), expectCompletion() {} };
  const context = vm.createContext({ path, sessions, store, TranscriptTail, monitorActivity, claudeConversation, claudeRecord,
    claudeConfigDir: () => f.home, findClaudeSession: (cwd, id) => findClaudeSession(cwd, id, f.home),
    claudeReply, noteReply: (session, reply) => { if (reply?.reset) session.lastReply = ''; else if (reply?.text) session.lastReply = reply.text; },
    describeActions() {}, broadcast() {}, acceptShellEvent: () => true,
    quitting: false, Date, claudeResumeCommand, restorePlans: new Map(),
  });
  vm.runInContext(main.slice(main.indexOf('function followClaude('), main.indexOf('// A round being worked')), context);
  vm.runInContext(main.slice(main.indexOf('function onEvent('), main.indexOf('function remoteFor(')), context);
  t.after(() => s.activityMonitor?.stop());
  return { project, s, store, sessions, context, restore, resets: () => resets };
}

test('following a known id loads history immediately, and same-session hooks preserve the tail and log', async t => {
  const f = await fixture(t), file = await f.write('session', [user('Before resume'), { type: 'assistant', uuid: 'reply', message: { content: [{ type: 'text', text: 'Previous answer' }] } }]);
  const h = mainHarness(t, f);
  assert.equal(await h.context.followClaudeSession(h.project, h.s, 'session'), true);
  assert.deepEqual(h.s.conversation.list.map(entry => entry.text), ['Before resume', 'Previous answer']);
  assert.equal(h.restore.threadId, 'session');
  const tail = h.s.claudeTranscript;
  h.context.followClaude(h.project, h.s, { sessionId: 'session', transcriptPath: file });
  await h.s.activityMonitor.poll();
  assert.equal(h.s.claudeTranscript, tail); assert.equal(h.resets(), 1); assert.equal(h.s.conversation.list.length, 2);
});

test('both Claude followers load a large session window and clear old consumers when it is replaced', async t => {
  const f = await fixture(t), file = await f.write('large', [user('excluded'),
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'excluded', name: 'Skill', input: { skill: 'excluded-skill' } }] } },
    { padding: 'x'.repeat(HISTORY_WINDOW + 1000) },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'excluded' }] } },
    { type: 'assistant', uuid: 'recent', message: { content: [{ type: 'text', text: 'Recent answer' },
      { type: 'tool_use', id: 'recent-skill', name: 'Skill', input: { skill: 'recent-skill' } }] } }]);
  const h = mainHarness(t, f), described = [];
  h.context.skillDescription = async name => { described.push(name); return 'Recent skill description'; };
  vm.runInContext(main.slice(main.indexOf('function describeActions('), main.indexOf('// Claude Code writes each tool call')), h.context);
  assert.equal(await h.context.followClaudeSession(h.project, h.s, 'large'), true);
  assert.equal(h.s.claudeTranscript.historyPending, false);
  assert.deepEqual(h.s.conversation.snapshot().filter(entry => entry.text).map(entry => entry.text), ['Recent answer']);
  assert.equal(h.s.lastReply, 'Recent answer');
  assert.deepEqual(described, ['recent-skill'], 'only in-window skill calls reach describeActions');
  assert.deepEqual(h.s.actions.list.map(action => action.id), ['recent-skill']);
  assert.equal(h.s.actions.list[0].description, 'Recent skill description');
  const tail = h.s.claudeTranscript;
  h.context.followClaude(h.project, h.s, { sessionId: 'large', transcriptPath: file });
  await h.s.activityMonitor.poll();
  assert.equal(h.s.claudeTranscript, tail); assert.equal(h.resets(), 1);
  await fs.rename(file, `${file}.old`);
  h.s.lastTask = 'Previous task';
  await fs.writeFile(file, JSON.stringify({ padding: 'x'.repeat(HISTORY_WINDOW + 2000) }) + '\n'
    + JSON.stringify({ type: 'assistant', uuid: 'new', message: { content: [{ type: 'tool_use', id: 'new-tool', name: 'Read', input: { file_path: 'new.txt' } }] } }) + '\n');
  await h.s.activityMonitor.poll();
  assert.equal(h.resets(), 2); assert.equal(h.s.lastReply, '', 'an excluded reply cannot leave the previous session reply behind');
  assert.equal(h.s.lastTask, 'Previous task', 'history callbacks preserve the task remembered from live hooks, including continue prompts');
  assert.deepEqual(h.s.conversation.snapshot().map(entry => entry.role), ['tool']);
  assert.deepEqual(h.s.actions.list.map(action => action.id), ['new-tool']);
});

test('restored sessions follow before a hook and keep history when the agent-started event arrives', async t => {
  const f = await fixture(t), id = '12345678-1234-1234-1234-123456789abc';
  await f.write(id, [user('Restored prompt')]);
  const h = mainHarness(t, f);
  Object.assign(h.restore, { threadId: id });
  const written = [];
  Object.assign(h.s, { ready: true, inputDirty: false, claudeAvailable: true, codexActive: false, gate: { afterPrompt: text => written.push(text) } });
  h.context.restorePlans.set('terminal', { codex: true });
  await h.context.resumeAfterPrompt(h.project, h.s);
  assert.deepEqual(written, [`claude --resume ${id}\r`]);
  assert.equal(h.s.conversation.list[0].text, 'Restored prompt');
  const tail = h.s.claudeTranscript;
  h.context.onEvent({ projectId: 'terminal', sessionKey: 'key', type: 'codex-started', agent: 'claude', cwd: f.cwd });
  await h.s.activityMonitor.poll();
  assert.equal(h.s.claudeTranscript, tail); assert.equal(h.resets(), 1); assert.equal(h.s.conversation.list[0].text, 'Restored prompt');
});

test('following a different session replaces history, and invalid ids or closed terminals cannot bind', async t => {
  const f = await fixture(t); await f.write('first', [user('first')]); await f.write('second', [user('second')]);
  const h = mainHarness(t, f);
  await h.context.followClaudeSession(h.project, h.s, 'first');
  await h.context.followClaudeSession(h.project, h.s, 'second');
  assert.deepEqual(h.s.conversation.list.map(entry => entry.text), ['second']); assert.equal(h.resets(), 2);
  assert.equal(await h.context.followClaudeSession(h.project, h.s, '../bad'), false);
  h.s.codexActive = false;
  assert.equal(await h.context.followClaudeSession(h.project, h.s, 'first'), false);
  h.sessions.delete('terminal');
  assert.equal(await h.context.followClaudeSession(h.project, h.s, 'first'), false);
});

test('session IPC returns Codex empty lists and only follows active local Claude terminals', async t => {
  const f = await fixture(t); await f.write('current', [user('current')]); await f.write('other', [user('other')]);
  const h = mainHarness(t, f), handlers = {};
  h.s.claudeSessionId = 'current';
  require('../electron/features/agents/ipc.cjs').registerAgentsIpc({ handle: (name, handler) => { handlers[name] = handler; },
    findProject: () => h.project, getSession: id => h.sessions.get(id), getRestoreCwd: id => h.context.store.findTerminal(id)?.record.restore?.cwd,
    followClaudeSession: (...args) => h.context.followClaudeSession(...args), listClaudeSessions: (cwd, id) => listClaudeSessions(cwd, id, f.home) });
  assert.deepEqual((await handlers['terminal:agentSessions']('terminal')).map(item => item.id), ['other']);
  h.s.claudeSessionId = null; h.restore.threadId = 'current';
  assert.equal((await handlers['terminal:agentSessions']('terminal')).length, 2, 'an old restore id is not the current fresh session');
  assert.equal(await handlers['terminal:followAgentSession']('terminal', 'other'), true);
  h.s.agent = 'codex';
  assert.equal((await handlers['terminal:agentSessions']('terminal')).length, 0);
  assert.equal(await handlers['terminal:followAgentSession']('terminal', 'other'), false);
  h.s.agent = 'claude'; h.project.kind = 'ssh';
  assert.equal((await handlers['terminal:agentSessions']('terminal')).length, 0);
  assert.equal(await handlers['terminal:followAgentSession']('terminal', 'other'), false);
});
