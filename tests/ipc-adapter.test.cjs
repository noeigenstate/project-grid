const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createIpcAdapter } = require('../electron/shared/ipc.cjs');

test('secured IPC checks live sender, main frame and origin before invoking handlers', async () => {
  for (const devUrl of [null, 'http://localhost:5173']) {
    const handles = new Map(), listeners = new Map(), reports = [];
    const mainFrame = { url: devUrl ? `${devUrl}/index.html` : 'project-grid://app/index.html' };
    let window = { webContents: { mainFrame } }, calls = 0;
    const adapter = createIpcAdapter({ ipcMain: { handle: (name, fn) => handles.set(name, fn), on: (name, fn) => listeners.set(name, fn) },
      getWindow: () => window, devUrl, t: text => `translated:${text}`, report: error => reports.push(error.message) });
    adapter.handle('value', (...args) => { calls++; return args; });
    adapter.handle('error', () => { throw new Error('错误'); });
    adapter.listen('event', () => { calls++; throw new Error('listener'); });
    const valid = { sender: window.webContents, senderFrame: mainFrame };
    assert.deepEqual(await handles.get('value')(valid, 1, 'two'), { ok: true, value: [1, 'two'] });
    assert.deepEqual(await handles.get('error')(valid), { ok: false, error: 'translated:错误' });
    listeners.get('event')(valid);
    assert.deepEqual(reports, ['listener']);
    for (const event of [{ ...valid, sender: {} }, { ...valid, senderFrame: { url: mainFrame.url } }]) {
      await assert.rejects(handles.get('value')(event), /Rejected IPC sender/);
      listeners.get('event')(event);
    }
    mainFrame.url = devUrl ? `${devUrl}.evil/index.html` : 'project-grid://other/index.html';
    await assert.rejects(handles.get('value')(valid), /Rejected IPC origin/);
    listeners.get('event')(valid);
    window = null;
    await assert.rejects(handles.get('value')(valid), /Rejected IPC sender/);
    assert.equal(calls, 2);
    assert.deepEqual(reports, ['listener', 'Rejected IPC sender', 'Rejected IPC sender', 'Rejected IPC origin']);
  }
});
