const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ActionLog, TranscriptTail, claudeRecord, codexRecord, skillDescription } = require('../electron/agent-actions.cjs');

const cwd = path.join(os.tmpdir(), 'pg-actions-project');
const claude = (type, content, extra = {}) => ({ type, timestamp: '2026-10-03T08:00:00.000Z', cwd, message: { content }, ...extra });
const use = (id, name, input) => claude('assistant', [{ type: 'tool_use', id, name, input }]);
const result = (id, failed = false) => claude('user', [{ type: 'tool_result', tool_use_id: id, is_error: failed }]);

test('a Claude Code transcript becomes the steps of the current round', () => {
  const changes = [], log = new ActionLog(change => changes.push(change));
  const feed = record => claudeRecord(log, record, cwd);
  feed(use('old', 'Read', { file_path: path.join(cwd, 'old.txt') }));
  feed(claude('user', 'next task'));
  assert.deepEqual(log.list, [], 'a new prompt starts a new round');
  feed(use('t1', 'Edit', { file_path: path.join(cwd, 'src', 'App.tsx'), old_string: 'a', new_string: 'b' }));
  assert.deepEqual({ kind: log.current().kind, target: log.current().target, done: log.current().done }, { kind: 'edit', target: 'src/App.tsx', done: false });
  feed(result('t1'));
  feed(use('t2', 'Bash', { command: 'npm   test\n', description: 'Run the unit tests' }));
  feed(use('t3', 'Skill', { skill: 'code-review', args: '--fix' }));
  feed(use('t4', 'mcp__github__create_issue', { title: 'x' }));
  feed(use('t5', 'Read', { file_path: 'D:\\elsewhere\\notes.md' }));
  feed(use('side', 'Bash', { command: 'ls' }), 'ignored');
  claudeRecord(log, { ...use('child', 'Bash', { command: 'ls' }), isSidechain: true }, cwd);
  feed(result('t2', true));
  const byId = Object.fromEntries(log.list.map(action => [action.id, action]));
  assert.equal(byId.t1.done, true);
  assert.deepEqual([byId.t2.kind, byId.t2.target, byId.t2.detail, byId.t2.failed], ['command', 'npm test', 'Run the unit tests', true]);
  assert.deepEqual([byId.t3.kind, byId.t3.target, byId.t3.detail], ['skill', 'code-review', '--fix']);
  assert.deepEqual([byId.t4.kind, byId.t4.target, byId.t4.server], ['mcp', 'github · create_issue', 'github']);
  assert.equal(byId.t5.target, 'D:/elsewhere/notes.md', 'files outside the project keep their full path');
  assert.equal(byId.child, undefined, 'a child agent\'s steps belong to its parent\'s step');
  assert.equal(log.current().id, 'side', 'the card names the latest step still running');
  log.settle();
  assert.ok(log.list.every(action => action.done), 'a finished round leaves nothing running');
  assert.ok(changes.some(change => change.reset) && changes.some(change => change.action?.id === 't4'));
});

test('a Codex rollout becomes steps: commands, patches, skills read from disk and MCP tools', () => {
  const log = new ActionLog();
  const item = (payload, type = 'response_item') => codexRecord(log, { type, timestamp: '2026-10-03T08:00:00.000Z', payload }, cwd);
  item({ type: 'custom_tool_call', call_id: 'stale', name: 'exec', input: 'text(await tools.exec_command({cmd:"dir"}))' });
  item({ type: 'task_started', turn_id: 'turn' }, 'event_msg');
  assert.deepEqual(log.list, []);
  item({ type: 'custom_tool_call', call_id: 'c1', name: 'exec', input: 'text(await tools.exec_command({cmd:"npm run \\"build\\"",workdir:"x"})); text(await tools.write_stdin({chars:""}))' });
  item({ type: 'custom_tool_call', call_id: 'c2', name: 'exec', input: `text(await tools.exec_command({cmd:${JSON.stringify(`apply_patch <<'EOF'\n*** Begin Patch\n*** Update File: src/a.ts\n*** Add File: ${path.join(cwd, 'src', 'b.ts')}\n*** End Patch\nEOF`)}}))` });
  item({ type: 'custom_tool_call', call_id: 'c3', name: 'exec', input: 'text(await tools.exec_command({cmd:"Get-Content C:/Users/me/.codex/skills/release-notes/SKILL.md"}))' });
  item({ type: 'custom_tool_call', call_id: 'c4', name: 'exec', input: 'text(await tools.mcp__figma__get_file({key:"k"}))' });
  item({ type: 'custom_tool_call', call_id: 'c5', name: 'exec', input: 'text(await tools.exec_command({cmd:"node -e \\"require(\'fs\').writeFileSync(\'x\', \'y\')\\""}))' });
  item({ type: 'function_call', call_id: 'c6', name: 'shell', arguments: JSON.stringify({ command: ['git', 'status'] }) });
  const byId = Object.fromEntries(log.list.map(action => [action.id, action]));
  assert.deepEqual([byId['c1:0'].kind, byId['c1:0'].target], ['command', 'npm run "build"']);
  assert.equal(log.list.filter(action => action.id.startsWith('c1:')).length, 1, 'writing to a running command is not a step');
  assert.deepEqual([byId['c2:0'].kind, byId['c2:0'].target], ['edit', 'src/a.ts、src/b.ts']);
  assert.deepEqual(byId['c2:0'].files.map(file => file.path), ['src/a.ts', 'src/b.ts'], 'each patched file keeps what happened to it');
  assert.deepEqual([byId['c3:0'].kind, byId['c3:0'].target], ['skill', 'release-notes']);
  assert.deepEqual([byId['c4:0'].kind, byId['c4:0'].target], ['mcp', 'figma · get_file']);
  assert.deepEqual([byId['c5:0'].kind, byId['c5:0'].target], ['edit', ''], 'a script that writes files is an edit without a named file');
  assert.deepEqual([byId['c6:0'].kind, byId['c6:0'].target], ['command', 'git status']);
  item({ type: 'custom_tool_call_output', call_id: 'c1', output: [] });
  assert.equal(byId['c1:0'].done, true); assert.equal(byId['c2:0'].done, false);
  item({ type: 'task_complete', turn_id: 'turn' }, 'event_msg');
  assert.ok(log.list.every(action => action.done));
  item({ type: 'session_meta' === 'x' ? '' : 'noop' });
  codexRecord(log, { type: 'session_meta', payload: { id: 'another' } }, cwd);
  assert.deepEqual(log.list, [], 'another conversation starts over');
});

test('the log keeps a bounded number of steps and skips repeats', () => {
  const log = new ActionLog(() => {}, 3);
  for (const id of ['a', 'b', 'b', 'c', 'd']) log.add({ id, done: true });
  assert.deepEqual(log.list.map(action => action.id), ['b', 'c', 'd']);
  assert.equal(new ActionLog().current(), null);
});

test('a transcript is followed from where the last read stopped, and a skill is explained by its SKILL.md', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-actions-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'session.jsonl'), tail = new TranscriptTail(file), seen = [];
  await tail.read(record => seen.push(record));
  assert.deepEqual(seen, [], 'a transcript that does not exist yet reads as empty');
  await fs.writeFile(file, '{"n":1}\n{"n":2}\n{"n":');
  await tail.read(record => seen.push(record.n));
  await fs.appendFile(file, '3}\nnot json\n{"n":4}\n');
  await tail.read(record => seen.push(record.n));
  assert.deepEqual(seen, [1, 2, 3, 4]);

  const skill = path.join(folder, '.claude', 'skills', 'demo-skill');
  await fs.mkdir(skill, { recursive: true });
  await fs.writeFile(path.join(skill, 'SKILL.md'), '---\nname: demo-skill\ndescription: "Checks a release before it ships."\n---\n\n# Demo\n');
  assert.equal(await skillDescription('demo-skill', folder), 'Checks a release before it ships.');
  assert.equal(await skillDescription('plugin:demo-skill', folder), 'Checks a release before it ships.', 'a plugin prefix is not part of the folder name');
  assert.equal(await skillDescription('x', folder, '.claude/skills/demo-skill/SKILL.md'), 'Checks a release before it ships.', 'a file the agent read itself is used directly');
  assert.equal(await skillDescription('../escape', folder), '');
});

test('a single-poll Claude history stays private until caught up, then streams normally', async t => {
  const { ConversationLog, claudeConversation } = require('../electron/conversation.cjs');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-reading-history-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'session.jsonl'), published = [];
  const log = new ConversationLog(change => { if (!log.loading) published.push(change); });
  const tail = new TranscriptTail(file, { onHistory: ready => ready ? log.endHistory() : log.beginHistory() });
  const line = (id, text) => JSON.stringify({ type: 'assistant', uuid: id, timestamp: new Date().toISOString(), message: { content: [{ type: 'text', text }] } }) + '\n';
  await fs.writeFile(file, Array.from({ length: 100 }, (_, index) => line(String(index), 'x'.repeat(60000))).join(''));
  await tail.read(record => {
    claudeConversation(log, record, folder);
    assert.deepEqual(log.snapshot(), [], 'history remains private while records are processed');
    assert.deepEqual(published, []);
  });
  const read = () => tail.read(record => claudeConversation(log, record, folder));
  assert.equal(log.snapshot().length, 100);
  assert.equal(published.length, 1);
  assert.equal(published[0].reset, true, 'the first publication is a complete replacement');
  await fs.appendFile(file, line('live', 'new answer')); await read();
  assert.equal(published.length, 2);
  assert.equal(published[1].entry.id, 'a:live:0');
  await read(); assert.equal(published.length, 2, 'idle polling does not republish history');
});

test('a Claude window keeps recent replies and actions and ignores tool results with excluded calls', async t => {
  const { HISTORY_WINDOW } = require('../electron/transcript-window.cjs');
  const { ConversationLog, claudeConversation } = require('../electron/conversation.cjs');
  const { claudeReply } = require('../electron/round-summary.cjs');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-claude-cut-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'session.jsonl'), log = new ActionLog(), conversation = new ConversationLog();
  const records = [claude('user', 'Excluded prompt'), use('excluded', 'Read', { file_path: 'old.txt' }),
    { padding: 'x'.repeat(HISTORY_WINDOW + 1000) }, result('excluded'),
    claude('assistant', [{ type: 'text', text: 'Recent reply' }], { uuid: 'reply' }),
    use('recent', 'Bash', { command: 'npm test' }), result('recent')];
  await fs.writeFile(file, records.map(record => JSON.stringify(record) + '\n').join(''));
  let reply = '';
  await new TranscriptTail(file).read(record => {
    claudeRecord(log, record, cwd); claudeConversation(conversation, record, cwd);
    const value = claudeReply(record); if (value?.reset) reply = ''; else if (value?.text) reply = value.text;
  });
  assert.equal(reply, 'Recent reply');
  assert.deepEqual(log.list.map(action => [action.id, action.done]), [['recent', true]]);
  assert.deepEqual(conversation.list.map(entry => entry.role), ['assistant', 'tool']);
  assert.equal(conversation.list[0].text, 'Recent reply'); assert.equal(conversation.list[1].tool.done, true);
});
