const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { CodexEvents, CodexDirect, AppServer, cardFor, replyFor, innerCommand } = require('../electron/features/agents/codex-direct.cjs');
const { ConversationLog } = require('../electron/conversation.cjs');
const { ActionLog } = require('../electron/agent-actions.cjs');

const session = () => {
  const turns = [];
  const conversation = new ConversationLog(), actions = new ActionLog();
  return { conversation, actions, turns, events: new CodexEvents({ conversation, actions, cwd: 'C:\\work\\demo', turn: (...args) => turns.push(args), now: () => 1000 }) };
};
const item = (type, fields) => ({ item: { type, ...fields } });

test('a round from app-server events becomes the prompt, streamed answer, steps and its end', () => {
  const s = session();
  s.events.notify('turn/started', { turn: { id: 't1' } });
  s.events.notify('item/completed', item('userMessage', { id: 'u1', content: [{ type: 'text', text: '运行 git status' }] }));
  s.events.notify('item/started', item('commandExecution', { id: 'e1', command: '"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command \'git status --short\'', status: 'inProgress' }));
  assert.equal(s.actions.current().target, 'git status --short');
  assert.equal(s.actions.current().done, false);
  s.events.notify('item/completed', item('commandExecution', { id: 'e1', command: 'powershell.exe -Command \'git status --short\'', status: 'completed', exitCode: 0 }));
  s.events.notify('item/agentMessage/delta', { itemId: 'm1', delta: 'git 状态' });
  assert.equal(s.conversation.list.at(-1).text, 'git 状态', 'the answer shows as it streams');
  s.events.notify('item/agentMessage/delta', { itemId: 'm1', delta: '干净。' });
  s.events.notify('item/completed', item('agentMessage', { id: 'm1', text: 'git 状态干净。' }));
  s.events.notify('turn/completed', { turn: { id: 't1', status: 'completed' } });
  assert.deepEqual(s.conversation.list.map(entry => [entry.role, entry.text ?? entry.tool.target, entry.tool?.done]), [
    ['user', '运行 git status', undefined], ['tool', 'git status --short', true], ['assistant', 'git 状态干净。', undefined]]);
  assert.deepEqual(s.turns, [['working', 't1'], ['complete', 't1', '']]);
});

test('file changes name their files and what happened to them; failures and interrupts are reported', () => {
  const s = session();
  s.events.notify('item/started', item('fileChange', { id: 'p1', changes: [] }));
  s.events.notify('item/completed', item('fileChange', { id: 'p1', status: 'completed', changes: [{ path: 'src/a.ts', kind: { type: 'update' } }, { path: 'src/b.ts', kind: { type: 'add' } }] }));
  const edit = s.actions.list[0];
  assert.deepEqual([edit.kind, edit.target, edit.files.map(file => file.change)], ['edit', 'src/a.ts、src/b.ts', ['update', 'add']]);
  s.events.notify('item/started', item('commandExecution', { id: 'e2', command: 'npm test' }));
  s.events.notify('item/completed', item('commandExecution', { id: 'e2', command: 'npm test', status: 'completed', exitCode: 1 }));
  assert.equal(s.actions.list[1].failed, true, 'a non-zero exit is a failed step');
  s.events.notify('turn/completed', { turn: { id: 't2', status: 'interrupted' } });
  assert.deepEqual(s.turns.at(-1), ['interrupted', 't2', '']);
});

test('approvals and questions become cards, and their answers the replies Codex expects', () => {
  const approval = cardFor('item/commandExecution/requestApproval', { command: 'bash -lc \'rm -rf build\'', reason: 'clean the build' });
  assert.deepEqual([approval.kind, approval.detail, approval.options], ['approval', 'rm -rf build', ['accept', 'acceptForSession', 'decline']]);
  assert.deepEqual(replyFor('item/commandExecution/requestApproval', { decision: 'acceptForSession' }), { decision: 'acceptForSession' });
  assert.deepEqual(replyFor('execCommandApproval', { decision: 'decline' }), { decision: 'denied' });
  assert.deepEqual(replyFor('item/fileChange/requestApproval', { decision: 'nonsense' }), { decision: 'cancel' });
  const question = cardFor('item/tool/requestUserInput', { questions: [{ id: 'color', header: '颜色', question: '选哪种颜色？', isOther: true, isSecret: false, options: [{ label: '红', description: '' }, { label: '蓝', description: '' }] }] });
  assert.deepEqual(question.questions[0].options.map(option => option.label), ['红', '蓝']);
  assert.deepEqual(replyFor('item/tool/requestUserInput', { answers: { color: '蓝' } }), { answers: { color: { answers: ['蓝'] } } });
  assert.equal(innerCommand('"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-ChildItem"'), 'Get-ChildItem');
});

// A stand-in for `codex app-server`: replies to requests and lets the test push notifications and requests.
function fakeServer() {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  const sent = [];
  child.stdin.on('data', chunk => {
    for (const line of String(chunk).split('\n').filter(Boolean)) {
      const message = JSON.parse(line); sent.push(message);
      const results = { initialize: {}, 'thread/start': { thread: { id: 'th1', turns: [] }, model: 'gpt-6.1-sol', reasoningEffort: 'high' },
        'thread/resume': { thread: { id: 'old', turns: [{ items: [{ type: 'userMessage', id: 'u0', content: [{ type: 'text', text: '早先的问题' }] }, { type: 'agentMessage', id: 'a0', text: '早先的回答' }] }] }, model: 'gpt-6.1-sol' },
        'turn/start': { turn: { id: 't1' } }, 'turn/steer': { turnId: 't1' }, 'turn/interrupt': {} };
      if (message.id !== undefined && message.method in results) child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: results[message.method] }) + '\n');
    }
  });
  const push = message => child.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  return { child, sent, push };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

test('a direct session starts or resumes a thread, sends, steers, interrupts and answers a card', async () => {
  const fake = fakeServer(), cards = [], infos = [], turns = [];
  const conversation = new ConversationLog(), actions = new ActionLog();
  const direct = new CodexDirect({ cwd: 'C:\\work', conversation, actions, turn: (...args) => turns.push(args), card: card => cards.push(card), info: info => infos.push(info),
    server: options => new AppServer({ ...options, spawnProcess: () => fake.child }) });
  await direct.start('old');
  assert.deepEqual(conversation.list.map(entry => entry.text), ['早先的问题', '早先的回答'], 'a resumed thread opens with its history');
  assert.equal(infos[0].threadId, 'old');
  await direct.send('只回复 OK');
  assert.equal(fake.sent.at(-1).method, 'turn/start');
  fake.push({ method: 'turn/started', params: { turn: { id: 't1' } } }); await tick();
  await direct.send('再补一句');
  assert.deepEqual([fake.sent.at(-1).method, fake.sent.at(-1).params.expectedTurnId], ['turn/steer', 't1'], 'a message during a round joins it');
  fake.push({ id: 41, method: 'item/commandExecution/requestApproval', params: { command: 'npm install', reason: '' } }); await tick();
  assert.equal(cards.at(-1).kind, 'approval');
  assert.equal(direct.answer({ decision: 'accept' }), true);
  await tick();
  assert.deepEqual(fake.sent.at(-1), { jsonrpc: '2.0', id: 41, result: { decision: 'accept' } });
  assert.equal(cards.at(-1), null, 'the card goes once answered');
  fake.push({ id: 42, method: 'account/chatgptAuthTokens/refresh', params: {} }); await tick();
  assert.equal(fake.sent.at(-1).id, 42); assert.ok(fake.sent.at(-1).error, 'requests nobody can answer are declined, never left waiting');
  await direct.interrupt();
  assert.deepEqual(fake.sent.at(-1).params, { threadId: 'old', turnId: 't1' });
  fake.push({ method: 'turn/completed', params: { turn: { id: 't1', status: 'interrupted' } } }); await tick();
  assert.deepEqual(turns.map(args => args[0]), ['working', 'interrupted']);
});
