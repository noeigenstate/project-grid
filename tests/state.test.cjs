const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WorkspaceStore, cleanSettings } = require('../electron/state.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentrix-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const projectDir = path.join(directory, "中文项目 & 空格 [a] 'b' $c");
  fs.mkdirSync(projectDir);
  const file = path.join(directory, 'workspace.json');
  const store = new WorkspaceStore(file);
  const { project } = store.add(projectDir);
  return { directory, projectDir, file, store, project };
}

test('adding the same real folder twice keeps one project', t => {
  const { store, projectDir, project } = fixture(t);
  const second = store.add(path.join(projectDir, '.'));
  assert.equal(second.added, false);
  assert.equal(second.project.id, project.id);
  assert.equal(store.projects.length, 1);
});

test('Windows transient save locks retry atomically and persistent failures remain explicit', { skip: process.platform !== 'win32' }, t => {
  const { file, store, project } = fixture(t);
  const rename = fs.renameSync; let attempts = 0, locked = 2;
  t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === file && attempts++ < locked) { const error = new Error('file temporarily locked'); error.code = 'EBUSY'; throw error; }
    return rename(source, target);
  });
  store.setRestore(project.id, { terminal: true, threadId: '00000000-0000-4000-8000-000000000003' });
  assert.equal(attempts, 3);
  assert.equal(new WorkspaceStore(file).projects[0].restore.threadId, '00000000-0000-4000-8000-000000000003');
  assert.equal(fs.existsSync(file + '.tmp'), false);
  const previous = fs.readFileSync(file, 'utf8'); attempts = 0; locked = Infinity;
  assert.throws(() => store.save(), /temporarily locked/);
  assert.equal(attempts, 5); assert.equal(fs.readFileSync(file, 'utf8'), previous);
});

test('extra terminals keep independent recovery identities and closing one preserves the others', t => {
  const { store, project, file } = fixture(t);
  const first = store.addTerminal(project.id), second = store.addTerminal(project.id);
  const thread = '00000000-0000-4000-8000-000000000001';
  store.setRestore(first, { codex: true, threadId: thread });
  const reopened = new WorkspaceStore(file);
  assert.equal(reopened.findTerminal(first).record.restore.threadId, thread);
  assert.equal(reopened.findTerminal(second).record.restore.codex, false);
  reopened.removeTerminal(first);
  assert.equal(reopened.findTerminal(first), null);
  assert.equal(reopened.findTerminal(second).project.id, project.id);
  reopened.removeTerminal(project.id);
  assert.equal(reopened.findTerminal(second).record.restore.terminal, true);
  assert.equal(reopened.projects[0].primaryTerminalClosed, true);
  reopened.setRestore(project.id, { terminal: true });
  assert.equal(new WorkspaceStore(file).projects[0].primaryTerminalClosed, false);
});

test('turn completion is unread, deduplicated, and survives restarting the app', t => {
  const { store, project, file } = fixture(t);
  store.expectCompletion(project.id);
  assert.equal(store.complete(project.id, 'thread:turn1', 1700000000000), true);
  assert.equal(store.complete(project.id, 'thread:turn1'), false);
  store.expectCompletion(project.id);
  assert.equal(store.complete(project.id, 'thread:turn2', 1700000001000), true);
  const restored = new WorkspaceStore(file);
  assert.equal(restored.projects[0].unread, 2);
  assert.equal(restored.projects[0].lastCompletedAt, 1700000001000);
  assert.equal(restored.complete(project.id, 'thread:turn2'), false);
});

test('viewing a round clears unread without introducing a manual completion flag', t => {
  const { store, project, file } = fixture(t);
  store.expectCompletion(project.id);
  store.complete(project.id, 'thread:turn1');
  store.acknowledge(project.id);
  assert.equal(project.unread, 0);
  assert.equal('done' in project, false);
  assert.equal('done' in new WorkspaceStore(file).projects[0], false);
});

test('a genuinely new round can make a previously viewed round need attention', t => {
  const { store, project } = fixture(t);
  store.expectCompletion(project.id); store.complete(project.id, 'previous-turn'); store.acknowledge(project.id);
  store.expectCompletion(project.id);
  store.complete(project.id, 'thread:turn-new');
  assert.equal(project.unread, 1);
});

test('unknown projects and invalid event identifiers do not create completion', t => {
  const { store, project } = fixture(t);
  assert.equal(store.complete('other', 'turn'), false);
  assert.equal(store.complete(project.id, ''), false);
  assert.equal(store.complete(project.id, {}), false);
  assert.equal(project.unread, 0);
});

test('idle callbacks with different IDs never repeat an alert, even after viewing or restarting', t => {
  const { store, project, file } = fixture(t);
  assert.equal(store.complete(project.id, 'background-before-input'), false);
  store.expectCompletion(project.id);
  assert.equal(store.complete(project.id, 'main:first', 1000), true);
  assert.equal(store.complete(project.id, 'background:second', 60000), false);
  assert.equal(store.complete(project.id, 'different-thread:third', 3600000), false);
  assert.equal(project.unread, 1); assert.equal(project.lastCompletedAt, 1000);
  store.acknowledge(project.id);
  assert.equal(store.complete(project.id, 'after-viewing', 7200000), false);
  const restored = new WorkspaceStore(file);
  assert.equal(restored.complete(project.id, 'after-restart', 86400000), false);
  assert.equal(restored.projects[0].unread, 0);
  assert.equal(restored.projects[0].lastCompletedAt, 1000);
  restored.expectCompletion(project.id);
  assert.equal(restored.complete(project.id, 'background:second'), false, 'previously ignored events cannot consume a fresh submission');
  assert.equal(restored.complete(project.id, 'main:new-input', 86401000), true);
  assert.equal(restored.complete(project.id, 'background:new-ID', 86402000), false);
  assert.equal(restored.projects[0].unread, 1);
});

test('pending input survives restart; cancelling it closes the alert until another submission', t => {
  const { store, project, file } = fixture(t);
  store.expectCompletion(project.id);
  const restored = new WorkspaceStore(file);
  assert.equal(restored.complete(project.id, 'pending-work'), true);
  restored.expectCompletion(project.id);
  restored.expectCompletion(project.id, false);
  assert.equal(restored.complete(project.id, 'late-background-work'), false);
  restored.expectCompletion(project.id);
  assert.equal(restored.complete(project.id, 'new-instruction'), true);
});

test('migrating a previous workspace does not rearm idle completion notifications', t => {
  const { file, projectDir } = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ version: 2, projects: [{ id: 'legacy', name: 'Idle project', path: projectDir, unread: 1, lastCompletedAt: 1000, seenEvents: ['old-turn'] }], settings: {} }));
  const restored = new WorkspaceStore(file);
  assert.equal(restored.complete('legacy', 'fresh-background-id', 9000000), false);
  assert.equal(restored.projects[0].unread, 1);
  assert.equal(restored.projects[0].lastCompletedAt, 1000);
});

test('removing a project preserves all project files', t => {
  const { store, project, projectDir } = fixture(t);
  const source = path.join(projectDir, 'keep.txt');
  fs.writeFileSync(source, 'keep this');
  store.remove(project.id);
  assert.equal(store.projects.length, 0);
  assert.equal(fs.readFileSync(source, 'utf8'), 'keep this');
});

test('corrupt workspace is copied aside before a new workspace can be saved', t => {
  const { file, directory } = fixture(t);
  fs.writeFileSync(file, '{ invalid');
  const store = new WorkspaceStore(file);
  assert.ok(store.warning);
  const backups = fs.readdirSync(directory).filter(x => x.includes('.unreadable-'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(directory, backups[0]), 'utf8'), '{ invalid');
});

test('daylight is the default for new workspaces and settings without a saved theme', t => {
  const { store, file } = fixture(t);
  assert.equal(store.settings.theme, 'daylight');
  assert.equal(cleanSettings().theme, 'daylight');
  assert.equal(cleanSettings({ theme: 'unknown' }).theme, 'daylight');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete saved.settings.theme;
  fs.writeFileSync(file, JSON.stringify(saved));
  assert.equal(new WorkspaceStore(file).settings.theme, 'daylight');
});

test('saved forest and other theme choices survive loading and unrelated settings updates', t => {
  const { store, file } = fixture(t);
  for (const theme of ['forest', 'mountain-blue', 'wild-red', 'daylight']) {
    store.updateSettings({ theme });
    const restored = new WorkspaceStore(file);
    assert.equal(restored.settings.theme, theme);
    restored.updateSettings({ fontSize: 14 });
    assert.equal(new WorkspaceStore(file).settings.theme, theme);
  }
});

test('settings reject invalid layout and font values', () => {
  assert.deepEqual(cleanSettings({ columns: 999, fontSize: -2, notifications: 'yes', sound: false }), { codexDirect: false, fontSize: 12, terminalFontWeight: 400, terminalFontFamily: '', terminalCjkFontFamily: '', focusAnimation: 'smooth', theme: 'daylight', language: 'zh', surface: 'glass', glassBackground: 'theme', glassTransparency: null, terminalRenderer: 'gpu', shortcuts: {}, guideVersion: '', shell: 'powershell', announcePhrase: '', notifications: true, sound: false, announce: true, closeToTray: true, explorerCollapsed: false, restoreSessions: true, autoSave: true, activityPane: true, voiceModel: 'sensevoice',
    summary: { mode: 'fast', cloud: { provider: 'openai', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }, local: { provider: 'ollama', protocol: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:1.5b' } } });
  const summary = cleanSettings({ summary: { mode: 'local', local: { provider: 'vllm', baseUrl: ' http://10.0.0.5:8000/v1 ', model: 'Qwen/Qwen2.5-1.5B-Instruct' }, cloud: { provider: 'custom', protocol: 'anthropic', baseUrl: 'https://gateway.example/api', model: '' } } }).summary;
  assert.deepEqual(summary, { mode: 'local', cloud: { provider: 'custom', protocol: 'anthropic', baseUrl: 'https://gateway.example/api', model: '' }, local: { provider: 'vllm', protocol: 'openai', baseUrl: 'http://10.0.0.5:8000/v1', model: 'Qwen/Qwen2.5-1.5B-Instruct' } });
  assert.equal(cleanSettings({ summary: { mode: 'shout', cloud: { provider: 'nope', protocol: 'anthropic' } } }).summary.mode, 'fast');
  assert.equal(cleanSettings({ summary: { cloud: { provider: 'openai', protocol: 'anthropic' } } }).summary.cloud.protocol, 'openai', 'only a custom endpoint chooses its protocol');
  assert.equal(cleanSettings({ autoSave: false }).autoSave, false);
  assert.equal(cleanSettings({ voiceModel: 'toString' }).voiceModel, 'sensevoice', 'only a listed recognizer can be chosen');
  assert.equal(cleanSettings({ surface: 'solid' }).surface, 'solid'); assert.equal(cleanSettings({ surface: 'paper' }).surface, 'glass');
  assert.equal(cleanSettings({ terminalRenderer: 'dom' }).terminalRenderer, 'dom'); assert.equal(cleanSettings({ terminalRenderer: 'canvas' }).terminalRenderer, 'gpu');
  assert.equal(cleanSettings({ language: 'fr' }).language, 'zh');
  assert.equal(cleanSettings({ shell: 'cmd' }).shell, 'cmd');
  assert.equal(cleanSettings({ shell: 'zsh' }).shell, 'zsh'); assert.equal(cleanSettings({ shell: 'bash' }).shell, 'bash');
  assert.equal(cleanSettings({ shell: 'bash -c evil' }).shell, 'powershell', 'only a known shell name');
  assert.equal(cleanSettings({ guideVersion: '0.5.16' }).guideVersion, '0.5.16');
  assert.equal(cleanSettings({ guideVersion: '<script>' }).guideVersion, '', 'only a version number marks the guide as seen');
  assert.deepEqual(cleanSettings({ shortcuts: { search: 'Ctrl+Shift+K', addProject: 'A', voice: 'Alt+V', overview: 'F6', settings: 'Ctrl+rm', nextProject: 'Ctrl+Tab', unknown: 'Ctrl+Q' } }).shortcuts, { search: 'Ctrl+Shift+K', voice: 'Alt+V', overview: 'F6', nextProject: 'Ctrl+Tab' }, 'only valid combinations for known actions are kept');
  assert.equal(cleanSettings({ language: 'en' }).language, 'en');
  assert.equal(cleanSettings({ announce: 'loud' }).announce, true);
  assert.equal(cleanSettings({ announcePhrase: '  {项目}\n做完了  ' }).announcePhrase, '{项目} 做完了', 'phrases are one trimmed line');
  assert.equal(cleanSettings({ announcePhrase: 'x'.repeat(200) }).announcePhrase.length, 80);
  assert.equal(cleanSettings({ focusAnimation: 'invalid' }).focusAnimation, 'smooth');
  assert.equal(cleanSettings({ focusAnimation: 'system' }).focusAnimation, 'system');
  assert.equal(cleanSettings({ focusAnimation: 'off' }).focusAnimation, 'off');
});

test('SSH projects retain their host, remote path and recovery state without becoming local folders', t => {
  const { store, file } = fixture(t);
  const { project } = store.addSSH({ host: 'linux-dev', path: '~/apps/demo', name: '远程项目' });
  store.setRestore(project.id, { terminal: true, codex: true, cwd: '/home/dev/apps/demo/subdir' });
  const restored = new WorkspaceStore(file).projects.find(item => item.id === project.id);
  assert.equal(restored.kind, 'ssh');
  assert.equal(restored.path, '~/apps/demo');
  assert.equal(restored.ssh.host, 'linux-dev');
  assert.deepEqual(restored.restore, { terminal: true, codex: true, cwd: '/home/dev/apps/demo/subdir' });
  assert.equal(store.addSSH({ host: 'linux-dev', path: '~/apps/demo' }).added, false);
  assert.equal(store.addSSH({ host: 'other-host', path: '~/apps/demo' }).added, true);
});

test('insertion reorder preserves all records and rejects stale or duplicated project lists', t => {
  const { store, project, file } = fixture(t);
  const second = store.addSSH({ host: 'two', path: '/srv/two' }).project;
  const third = store.addSSH({ host: 'three', path: '/srv/three' }).project;
  store.expectCompletion(project.id); store.complete(project.id, 'pending-turn');
  store.reorderProjects([second.id, third.id, project.id]);
  assert.deepEqual(new WorkspaceStore(file).projects.map(item => item.id), [second.id, third.id, project.id]);
  assert.equal(store.projects[2], project); assert.equal(project.unread, 1);
  for (const order of [[second.id, project.id], [second.id, project.id, project.id], [second.id, third.id, 'missing'], null]) assert.throws(() => store.reorderProjects(order), /项目列表已变化/);
});

test('removed local projects stay in a bounded recent list that can be pruned or cleared', t => {
  const { directory, projectDir, file, store, project } = fixture(t);
  assert.deepEqual(store.recentProjects(), [], 'open projects are not offered again');
  store.remove(project.id);
  const [recent] = new WorkspaceStore(file).recentProjects();
  assert.equal(recent.path, fs.realpathSync(projectDir));
  assert.equal(recent.name, project.name);
  const reopened = new WorkspaceStore(file);
  assert.equal(reopened.isRecent(projectDir.toUpperCase()), process.platform === 'win32');
  assert.equal(reopened.add(projectDir, recent.name).project.name, project.name, 're-adding keeps the remembered name');
  assert.deepEqual(reopened.recentProjects(), [], 're-adding hides it again');
  const folders = Array.from({ length: 35 }, (_, index) => { const folder = path.join(directory, `p${index}`); fs.mkdirSync(folder); return folder; });
  for (const folder of folders) reopened.remove(reopened.add(folder).project.id);
  const listed = new WorkspaceStore(file).recentProjects();
  assert.equal(listed.length, 30, 'thirty entries at most');
  assert.equal(listed[0].path, fs.realpathSync(folders.at(-1)), 'newest first');
  reopened.forget(listed[0].path);
  assert.equal(new WorkspaceStore(file).isRecent(listed[0].path), false);
  reopened.clearHistory();
  assert.deepEqual(new WorkspaceStore(file).history, []);
});

test('SSH projects and malformed history entries are not remembered', t => {
  const { file, store } = fixture(t);
  store.remember({ kind: 'ssh', path: '/srv/app', name: 'app' });
  assert.equal(store.history.length, 1, 'only the local fixture project');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.history = [{ path: 'relative/folder' }, { path: 42 }, null, { path: path.resolve('/abs/one'), name: 'one', lastOpenedAt: 5 }, { path: path.resolve('/abs/one') }];
  fs.writeFileSync(file, JSON.stringify(saved));
  assert.deepEqual(new WorkspaceStore(file).history, [{ path: path.resolve('/abs/one'), name: 'one', lastOpenedAt: 5 }]);
});

test('each terminal remembers whether Claude Code or Codex ran, and an unfinished Claude turn', t => {
  const { file, store, project } = fixture(t);
  const split = store.addTerminal(project.id), thread = '00000000-0000-4000-8000-000000000009';
  store.setRestore(split, { codex: true, agent: 'claude', threadId: thread, interrupted: true });
  let reopened = new WorkspaceStore(file);
  assert.deepEqual(reopened.findTerminal(split).record.restore, { terminal: true, codex: true, cwd: project.path, threadId: thread, agent: 'claude', interrupted: true });
  assert.equal(reopened.findTerminal(project.id).record.restore.agent, undefined, 'the other terminal still restores Codex');
  reopened.setRestore(split, { interrupted: false });
  assert.equal(new WorkspaceStore(file).findTerminal(split).record.restore.interrupted, undefined, 'a finished turn is not continued');
  reopened.setRestore(split, { agent: 'codex', threadId: null, interrupted: false });
  reopened = new WorkspaceStore(file);
  assert.deepEqual(reopened.findTerminal(split).record.restore, { terminal: true, codex: true, cwd: project.path });
  reopened.setRestore(split, { agent: 'other', interrupted: 'yes' });
  assert.equal(new WorkspaceStore(file).findTerminal(split).record.restore.agent, undefined, 'unknown agents are ignored');
});

test('glass transparency is optional, validated and preserved across material changes and restart', t => {
  const { store, file } = fixture(t);
  assert.equal(store.settings.glassTransparency, null);
  for (const value of [0, 37, 100]) {
    store.updateSettings({ glassTransparency: value });
    assert.equal(new WorkspaceStore(file).settings.glassTransparency, value);
  }
  store.updateSettings({ surface: 'solid', glassTransparency: 72 });
  store.updateSettings({ surface: 'glass' });
  assert.equal(new WorkspaceStore(file).settings.glassTransparency, 72);
  store.updateSettings({ glassTransparency: null });
  assert.equal(new WorkspaceStore(file).settings.glassTransparency, null);
  for (const value of [-1, 101, 0.5, '50', true, NaN, Infinity, undefined]) {
    assert.equal(cleanSettings({ glassTransparency: value }).glassTransparency, null);
  }
});

test('desktop glass is opt-in and persisted separately from the theme', t => {
  const { store, file } = fixture(t);
  assert.equal(store.settings.surface, 'glass');
  store.updateSettings({ glassBackground: 'desktop', theme: 'mono-amber' });
  const saved = new WorkspaceStore(file);
  assert.equal(saved.settings.surface, 'glass'); assert.equal(saved.settings.glassBackground, 'desktop'); assert.equal(saved.settings.theme, 'mono-amber');
  saved.updateSettings({ surface: 'solid' }); assert.equal(new WorkspaceStore(file).settings.glassBackground, 'desktop');
  saved.updateSettings({ surface: 'glass' }); assert.equal(saved.settings.glassBackground, 'desktop'); assert.equal(saved.settings.theme, 'mono-amber');
  saved.updateSettings({ glassBackground: 'theme', theme: 'mono-amber-dark' }); assert.equal(new WorkspaceStore(file).settings.theme, 'mono-amber-dark');
  assert.equal(cleanSettings({ glassBackground: 'unknown' }).glassBackground, 'theme');
});

test('terminal weight is optional, validated and persisted without changing font size', t => {
  const { store, file } = fixture(t);
  assert.equal(store.settings.terminalFontWeight, 400);
  for (const value of [400, 500, 600]) { store.updateSettings({ terminalFontWeight: value }); assert.equal(new WorkspaceStore(file).settings.terminalFontWeight, value); }
  assert.equal(store.settings.fontSize, 12);
  for (const value of [0, 700, '600', NaN, undefined]) assert.equal(cleanSettings({ terminalFontWeight: value }).terminalFontWeight, 400);
});


test('terminal families are optional, sanitized and persisted independently', t => {
  const { store, file } = fixture(t);
  assert.equal(store.settings.terminalFontFamily, ''); assert.equal(store.settings.terminalCjkFontFamily, '');
  store.updateSettings({ terminalFontFamily: ' Consolas ', terminalCjkFontFamily: ' Noto Sans SC ' });
  const saved = new WorkspaceStore(file);
  assert.equal(saved.settings.terminalFontFamily, 'Consolas'); assert.equal(saved.settings.terminalCjkFontFamily, 'Noto Sans SC');
  saved.updateSettings({ terminalFontFamily: '' }); assert.equal(saved.settings.terminalCjkFontFamily, 'Noto Sans SC');
  for (const value of [true, 42, null, undefined, 'x'.repeat(81), 'bad\nfont', 'bad\0font']) {
    for (const key of ['terminalFontFamily', 'terminalCjkFontFamily']) assert.equal(cleanSettings({ [key]: value })[key], '');
  }
});
