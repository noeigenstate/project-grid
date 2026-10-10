const { test } = require('node:test');
const assert = require('node:assert/strict');

function handlers() {
  const handles = new Map(), listeners = new Map();
  return { handles, listeners, handle: (name, fn) => handles.set(name, fn), listen: (name, fn) => listeners.set(name, fn) };
}

test('voice registrar delegates the original arguments and results', async () => {
  const h = handlers(), calls = [];
  const voiceManager = Object.fromEntries(['getState', 'prepare', 'warm', 'transcribe'].map(name => [name, (...args) => { calls.push([name, ...args]); return name; }]));
  require('../electron/features/voice/ipc.cjs').registerVoiceIpc({ ...h, voiceManager });
  for (const [channel, method] of [['state', 'getState'], ['prepare', 'prepare'], ['warm', 'warm'], ['transcribe', 'transcribe']]) {
    assert.equal(await h.handles.get(`voice:${channel}`)('audio'), method);
  }
  assert.deepEqual(calls, [['getState'], ['prepare'], ['warm'], ['transcribe', 'audio']]);
});

test('notices registrar keeps keys private, validates targets and reads live settings', async () => {
  const h = handlers(), calls = [], keys = { cloud: 'secret', local: '' };
  let settings = { language: 'en', summary: { cloud: { model: 'first' } } };
  require('../electron/features/notices/ipc.cjs').registerNoticesIpc({ ...h,
    speechManager: { getState: () => 'state', prepare: () => 'prepare', speak: text => text },
    summarySecrets: { has: target => !!keys[target], get: target => keys[target], set: (target, key) => { keys[target] = key; } },
    agents: { getState: () => ({ claude: { installed: true } }) }, getSettings: () => settings,
    summaryDirectory: () => '/summaries', fetcher: () => {}, SUMMARY_TARGETS: ['cloud', 'local'],
    connection: (target, entry, apiKey) => ({ target, entry, apiKey }),
    listModels: options => { calls.push(options); return ['model']; },
    modelSummary: options => { calls.push(options); return 'summary'; },
    summarizeRound: options => { calls.push(options); return 'agent summary'; },
  });
  assert.deepEqual(h.handles.get('summary:state')(), { keys: { cloud: true, local: false } });
  assert.deepEqual(h.handles.get('summary:set-key')('local', 'local secret'), { keys: { cloud: true, local: true } });
  assert.throws(() => h.handles.get('summary:set-key')('invalid', 'key'), /无效的模型类型/);
  assert.throws(() => h.handles.get('summary:models')('invalid'), /无效的模型类型/);
  await assert.rejects(h.handles.get('summary:test')('invalid'), /无效的模型类型/);
  settings = { language: 'zh', summary: { cloud: { model: 'second' } } };
  assert.deepEqual(await h.handles.get('summary:models')('cloud'), ['model']);
  assert.equal(calls.at(-1).entry.model, 'second');
  const result = await h.handles.get('summary:test')('cloud');
  assert.equal(result.text, 'summary'); assert.equal(typeof result.ms, 'number');
  assert.equal(calls.at(-1).language, 'zh'); assert.equal(calls.at(-1).apiKey, 'secret');
  assert.equal((await h.handles.get('summary:test')('agent')).text, 'agent summary');
  assert.equal(calls.at(-1).agent, 'claude'); assert.equal(calls.at(-1).directory, '/summaries');
});

test('updates latch precedes editor confirmation and resets on cancellation and errors', async () => {
  const h = handlers(), calls = [];
  let resolveEditor, quitting = false, response = 0, fail = false;
  const controller = require('../electron/features/updates/ipc.cjs').registerUpdatesIpc({ ...h,
    updateManager: { canInstall: () => true, install: () => { calls.push('install'); if (fail) throw new Error('install failed'); } },
    allowEditorClose: () => new Promise(resolve => { calls.push('editor'); resolveEditor = resolve; }),
    liveTerminalCount: () => 1, getWindow: () => 'window', t: text => text,
    dialog: { showMessageBox: async window => { assert.equal(window, 'window'); calls.push('terminals'); return { response }; } },
    setQuitting: value => { quitting = value; },
  });
  const install = h.handles.get('updates:install');
  let first = install(); assert.equal(await install(), false); resolveEditor(false); assert.equal(await first, false);
  first = install(); resolveEditor(true); assert.equal(await first, false);
  response = 1; fail = true; first = install(); resolveEditor(true); await assert.rejects(first, /install failed/); assert.equal(quitting, false);
  fail = false; first = install(); resolveEditor(true); assert.equal(await first, true); assert.equal(quitting, true);
  assert.equal(await install(), false);
  controller.onStateChange({ status: 'error' }); assert.equal(quitting, false);
  first = install(); resolveEditor(false); assert.equal(await first, false);
  assert.deepEqual(calls, ['editor', 'editor', 'terminals', 'editor', 'terminals', 'install', 'editor', 'terminals', 'install', 'editor']);
});

test('git registrar preserves detached labels, option coercion and editor cancellation', async () => {
  const h = handlers(), calls = [];
  require('../electron/features/git/ipc.cjs').registerGitIpc({ ...h, findProject: id => ({ id }),
    projectGit: { read: async (project, action, options) => { calls.push([project.id, action, options]); return { repository: true, detached: true, head: '1234567890' }; } },
    setBranch: (id, label) => calls.push([id, label]), affectsEditor: () => true, allowEditorClose: async () => false,
  });
  await h.handles.get('project:git-status')('p');
  assert.deepEqual(calls.at(-1), ['p', 'HEAD 12345678']);
  await h.handles.get('project:git-diff')('p', 'a', { staged: 1, untracked: true });
  assert.deepEqual(calls.at(-1), ['p', 'diff', { path: 'a', staged: false, untracked: true }]);
  const count = calls.length;
  assert.deepEqual(await h.handles.get('project:git-apply')('p', 'patch', { path: 'a' }), { applied: false });
  assert.equal(calls.length, count);
});

test('git runtime shares branch labels and broadcasts only local label changes', () => {
  const calls = []; let broadcasts = 0;
  const runtime = require('../electron/features/git/runtime.cjs').createGitRuntime({ getProjects: () => [{ id: 'p' }],
    broadcast: () => { broadcasts++; }, execFile: (_file, args, options, done) => { calls.push([args, options]); done(null, args.includes('symbolic-ref') ? '' : 'abcdef012345\n'); },
  });
  runtime.captureBranch({ id: 'p', path: '/p' });
  assert.equal(runtime.getBranch('p'), 'HEAD abcdef01'); assert.equal(broadcasts, 1);
  runtime.setBranch('p', 'HEAD abcdef01'); runtime.setBranch('gone', 'main'); assert.equal(broadcasts, 1);
  runtime.captureBranch({ id: 'p', kind: 'ssh' }); assert.equal(calls.length, 2);
  runtime.remoteBranch('p', 'remote'); runtime.remoteBranch('p', 'remote'); assert.equal(broadcasts, 3);
  runtime.forgetBranch('p'); assert.equal(runtime.getBranch('p'), undefined);
});

test('editor guard shares one pending close, validates replies and times out after 60 seconds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = handlers(), sent = []; let shown = 0, seq = 0, window = { isDestroyed: () => false };
  const guard = require('../electron/features/files/editor-guard.cjs').createEditorGuard({ getWindow: () => window,
    showWindow: () => { shown++; }, send: (...args) => sent.push(args), randomUUID: () => String(++seq), t: text => text,
    dialog: { showMessageBox: async () => ({ response: 1 }) },
  });
  guard.registerEditorIpc(h);
  assert.equal(await guard.allowEditorClose(), true);
  h.listeners.get('editor:dirty')(true, 'p', 'folder/file');
  assert.equal(guard.affectsEditor('p', ['folder']), true); assert.equal(guard.affectsEditor('other', ['folder']), false);
  const first = guard.allowEditorClose(); assert.equal(guard.allowEditorClose(), first); assert.equal(shown, 1);
  h.listeners.get('editor:close-result')('wrong', true);
  t.mock.timers.tick(59999); assert.equal(guard.allowEditorClose(), first);
  t.mock.timers.tick(1); assert.equal(await first, false);
  const second = guard.allowEditorClose(); h.listeners.get('editor:close-result')('2', 'true'); assert.equal(await second, false);
  const third = guard.allowEditorClose(); h.listeners.get('editor:close-result')('3', true); assert.equal(await third, true);
  assert.equal(await h.handles.get('editor:confirm-close')('name'), 'discard');
  assert.deepEqual(sent, [['editor:request-close', '1'], ['editor:request-close', '2'], ['editor:request-close', '3']]);
  window = null; assert.equal(await guard.allowEditorClose(), true);
  h.listeners.get('editor:dirty')(false); assert.equal(guard.getEditorFile(), null);
});

test('files registrar serializes saves, bounds UTF-8 content and keeps preview tokens', async () => {
  const h = handlers(), requests = []; let finish;
  const controller = require('../electron/features/files/ipc.cjs').registerFilesIpc({ ...h,
    findProject: id => ({ id: 'p', kind: 'ssh' }), remoteFor: () => ({ request: (name, args) => { requests.push([name, args]); return new Promise(resolve => { finish = resolve; }); } }),
    previewResources: { open: (...args) => ({ token: args.slice(1) }) }, send: () => {},
  });
  const save = h.handles.get('project:save-file');
  await assert.rejects(save('p', 'a', 0, 'rev', '中'.repeat(350000)), /1 MB/); assert.equal(requests.length, 0);
  const first = save('terminal', 'a', 2, 'rev', '中文');
  await assert.rejects(save('p', 'a', 2, 'rev', 'second'), /正在保存/);
  assert.deepEqual(requests[0], ['save-file', { path: 'a', page: 2, revision: 'rev', data: Buffer.from('中文').toString('base64') }]);
  finish({ kind: 'markdown' }); assert.deepEqual(await first, { kind: 'markdown', token: ['a', 'markdown'] });
  const retry = save('p', 'a', 2, 'rev', 'retry'); finish({ kind: 'text' }); assert.deepEqual(await retry, { kind: 'text' });
  const progress = { text: 'copy' }; controller.setProgress(progress); assert.equal(h.handles.get('files:progress')(), progress);
});

test('file path copying reserves before remote readiness and shares clipboard supersession', async () => {
  const h = handlers(), clipboardWrites = new (require('../electron/clipboard-writes.cjs').ClipboardWrites)();
  let ready, text = '';
  const remote = { ready: new Promise(resolve => { ready = resolve; }), info: { root: '/remote' } };
  require('../electron/features/files/ipc.cjs').registerFilesIpc({ ...h, clipboardWrites, clipboard: { writeText: value => { text = value; } },
    findProject: () => ({ id: 'p', kind: 'ssh' }), remoteFor: () => remote,
  });
  const copy = h.handles.get('project:copy-paths')('p', ['a'], 'absolute');
  await clipboardWrites.commit(clipboardWrites.reserve(), () => { text = 'newer'; });
  ready(); assert.deepEqual(await copy, { count: 0, superseded: true }); assert.equal(text, 'newer');
});

test('remote file links validate the root and try line-suffix removal in order', async () => {
  const h = handlers(), paths = [];
  require('../electron/features/files/ipc.cjs').registerFilesIpc({ ...h, findProject: () => ({ kind: 'ssh' }),
    remoteFor: () => ({ ready: Promise.resolve(), info: { root: '/remote' }, request: async (_name, args) => {
      paths.push(args.path); if (args.path.includes(':')) throw new Error('not found'); return { directory: false };
    } }),
  });
  const open = h.handles.get('project:open-link');
  assert.deepEqual(await open('p', 'a:10:2'), { kind: 'file', path: 'a' }); assert.deepEqual(paths, ['a:10:2', 'a']);
  await assert.rejects(open('p', '../outside'), /项目目录之外/);
  await assert.rejects(open('p', 'javascript:bad'), /只支持网页链接/);
});

test('SSH registrar starts absent or exited projects and preserves configuration and error order', () => {
  const h = handlers(), calls = []; let session;
  require('../electron/features/ssh/ipc.cjs').registerSshIpc({ ...h,
    getSSHInfo: () => ({ configExists: true, configFile: '/config' }), sshAuth: { getPending: () => ['pending'], answer: (...args) => args },
    addSSH: input => { calls.push(input); return { project: { id: 'p' }, added: false }; },
    hasSession: () => !!session, getSession: () => session, startTerminal: id => { calls.push(['start', id]); throw new Error('connect'); },
    setStartupError: (...args) => calls.push(['error', ...args]), broadcast: () => calls.push('broadcast'),
  });
  assert.equal(h.handles.get('workspace:add-ssh')({ host: 'host' }), 'p');
  assert.deepEqual(calls, [{ host: 'host', configFile: '/config' }, ['start', 'p'], ['error', 'p', 'connect'], 'broadcast']);
  session = { status: 'shell' }; calls.length = 0; h.handles.get('workspace:add-ssh')({ host: 'host' }); assert.equal(calls.length, 2);
  session.status = 'exited'; calls.length = 0; h.handles.get('workspace:add-ssh')({}); assert.equal(calls.length, 4);
  assert.deepEqual(h.handles.get('ssh:auth-answer')('id', 'answer'), ['id', 'answer']);
});

test('SSH askpass helper stays lazy, uses short paths once and retains fallback cleanup', () => {
  const path = require('node:path'), calls = [];
  const runtime = require('../electron/features/ssh/runtime.cjs').createSshRuntime({ platform: 'win32', integrationDir: '/integration', tempDirectory: () => '/temp',
    fs: { mkdtempSync: prefix => { calls.push(['temp', prefix]); return '/temp/agentrix-ssh-123'; },
      copyFileSync: (...args) => calls.push(['copy', ...args]), rmSync: (...args) => calls.push(['remove', ...args]), rmdirSync: filename => calls.push(['rmdir', filename]) },
    execFileSync: (...args) => { calls.push(['exec', ...args]); throw new Error('short path unavailable'); },
  });
  assert.equal(calls.length, 0);
  const helper = path.join('/temp/agentrix-ssh-123', 'ssh-askpass.exe');
  assert.equal(runtime.prepareAskpass(), helper); assert.equal(runtime.prepareAskpass(), helper); assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].slice(0, 3), ['exec', helper, ['--short-path', helper]]);
  runtime.cleanupAskpass(); assert.deepEqual(calls.at(-1), ['rmdir', '/temp/agentrix-ssh-123']);
});

test('workspace settings keep live language, broadcast, menu, restore and voice ordering', () => {
  const h = handlers(), calls = []; let settings = { language: 'zh', voiceModel: 'first' };
  require('../electron/features/workspace/ipc.cjs').registerWorkspaceIpc({ ...h, getSettings: () => settings,
    updateStoreSettings: patch => { calls.push('settings'); settings = { ...settings, ...patch }; }, broadcast: () => calls.push('broadcast'),
    rebuildMenus: () => calls.push('menus'), clearRestorePlans: () => calls.push('restore'), chooseVoiceModel: model => calls.push(['voice', model]),
  });
  const update = h.handles.get('workspace:settings');
  for (const value of [null, 'bad', []]) assert.throws(() => update(value), /无效的设置/);
  update({ language: 'en', restoreSessions: false, voiceModel: 'second' });
  assert.deepEqual(calls, ['settings', 'broadcast', 'menus', 'restore', ['voice', 'second']]);
  calls.length = 0; update({}); assert.deepEqual(calls, ['settings', 'broadcast', ['voice', 'second']]);
});

test('workspace removal asks the editor first and preserves cleanup order', async () => {
  const h = handlers(), calls = []; let allow = false;
  require('../electron/features/workspace/ipc.cjs').registerWorkspaceIpc({ ...h, getEditorFile: () => ({ id: 'p' }),
    allowEditorClose: async () => { calls.push('editor'); return allow; }, confirmTerminalClose: async (...args) => { calls.push(args); return true; },
    findProject: id => ({ id }), disposeProjectTerminals: project => calls.push(['terminals', project.id]), closeProjectPreviews: id => calls.push(['previews', id]),
    removeProject: id => calls.push(['remove', id]), forgetBranch: id => calls.push(['branch', id]), broadcast: () => calls.push('broadcast'),
  });
  const remove = h.handles.get('workspace:remove'); assert.equal(await remove('p'), false); assert.deepEqual(calls, ['editor']);
  allow = true; calls.length = 0; assert.equal(await remove('p'), true);
  assert.deepEqual(calls, ['editor', ['p', '移除', true], ['terminals', 'p'], ['previews', 'p'], ['remove', 'p'], ['branch', 'p'], 'broadcast']);
});

test('terminal registrar flushes attach, validates paste and resize, and changes focus ownership', () => {
  const h = handlers(), calls = []; let active = null, fileTree = 'p';
  const session = { status: 'shell', sessionId: 'session', seq: 0, chunks: ['data'], flush: () => { calls.push('flush'); session.seq++; }, terminal: { resize: (...args) => calls.push(args) } };
  require('../electron/features/terminal/ipc.cjs').registerTerminalIpc({ ...h, findProject: () => ({ id: 'p' }), getSession: id => id === 't' ? session : undefined,
    hasSession: id => id === 't', getActiveTerminal: () => active, setActiveTerminal: id => { active = id; }, setActiveFileTree: id => { fileTree = id; },
    send: (...args) => calls.push(args),
  });
  assert.deepEqual(h.handles.get('terminal:attach')('t'), { sessionId: 'session', seq: 1, data: 'data' }); assert.equal(calls[0], 'flush');
  assert.deepEqual(h.handles.get('terminal:attach')('missing'), { sessionId: null, seq: 0, data: '' });
  const paste = h.handles.get('terminal:paste'); assert.throws(() => paste('t', 'text', 'stale'), /终端已变化/);
  session.status = 'starting'; assert.throws(() => paste('t', 'text', 'session'), /终端已变化/);
  session.status = 'shell'; assert.throws(() => paste('t', 'x'.repeat(1024 * 1024 + 1), 'session'), /无效的文字/);
  paste('t', 'text', 'session'); assert.deepEqual(calls.at(-1), ['terminal:paste', { id: 't', sessionId: 'session', text: 'text', lineBreak: null }]);
  // Codex on Windows starts a new line with Alt+Enter; a pasted line break would submit.
  Object.assign(session, { codexActive: true, agent: 'codex' }); paste('t', 'a\nb', 'session');
  assert.equal(calls.at(-1)[1].lineBreak, process.platform === 'win32' ? '\x1b\r' : null);
  session.agent = 'claude'; paste('t', 'a\nb', 'session'); assert.equal(calls.at(-1)[1].lineBreak, null);
  Object.assign(session, { codexActive: false, agent: null });
  const count = calls.length;
  for (const [cols, rows] of [[1, 2], [501, 2], [2, 251], [2.5, 10]]) h.listeners.get('terminal:resize')('t', cols, rows);
  assert.equal(calls.length, count); h.listeners.get('terminal:resize')('t', 500, 250); assert.deepEqual(calls.at(-1), [500, 250]);
  h.listeners.get('terminal:focus')('t', true); assert.equal(active, 't'); assert.equal(fileTree, null);
  h.listeners.get('terminal:focus')('other', false); assert.equal(active, 't'); h.listeners.get('terminal:focus')('t', false); assert.equal(active, null);
});

test('window IPC reads the live window and preserves shortcut fullscreen across focus mode', () => {
  for (const platform of ['win32', 'darwin']) {
    const h = handlers(), calls = []; let fullscreen = false, maximized = false;
    let window = { isFullScreen: () => fullscreen, setFullScreen: value => { fullscreen = value; calls.push(value); },
      isMaximized: () => maximized, maximize: () => { maximized = true; }, unmaximize: () => { maximized = false; } };
    require('../electron/app/window-ipc.cjs').registerWindowIpc({ ...h, platform, getWindow: () => window, requestQuit: () => 'quit' });
    h.listeners.get('window:maximize')(); assert.equal(maximized, true); h.listeners.get('window:maximize')(); assert.equal(maximized, false);
    h.listeners.get('window:fullscreen')(); assert.equal(fullscreen, true);
    h.listeners.get('window:focus-mode')(false); assert.equal(fullscreen, true);
    h.listeners.get('window:fullscreen')(); assert.equal(fullscreen, false);
    h.listeners.get('window:focus-mode')(true); assert.equal(fullscreen, platform !== 'darwin');
    h.listeners.get('window:focus-mode')(false); assert.equal(fullscreen, false);
    const count = calls.length; h.listeners.get('window:focus-mode')('true'); assert.equal(calls.length, count);
    window = { isFullScreen: () => true, minimize: () => calls.push('new window') };
    h.listeners.get('window:minimize')(); assert.equal(calls.at(-1), 'new window');
    assert.equal(h.handles.get('window:is-fullscreen')(), true); assert.equal(h.handles.get('app:quit')(), 'quit');
  }
});
