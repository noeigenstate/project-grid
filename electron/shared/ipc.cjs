function createIpcAdapter({ ipcMain, getWindow, devUrl, t, report }) {
  function checkSender(event) {
    const window = getWindow();
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Rejected IPC sender');
    const url = event.senderFrame.url;
    if (!(devUrl ? url.startsWith(`${devUrl}/`) : url.startsWith('agentrix://app/'))) throw new Error('Rejected IPC origin');
  }
  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
      checkSender(event);
      try { return { ok: true, value: await fn(...args) }; }
      // Errors from every module are written in Chinese; they reach the window in the chosen language.
      catch (error) { return { ok: false, error: t(String(error?.message || error)) }; }
    });
  }
  function listen(channel, fn) {
    ipcMain.on(channel, (event, ...args) => { try { checkSender(event); fn(...args); } catch (error) { report(error); } });
  }
  return { handle, listen };
}

module.exports = { createIpcAdapter };
