function registerWindowIpc({ handle, listen, getWindow, requestQuit, platform = process.platform }) {
  let userFullScreen = false;
  listen('window:minimize', () => getWindow().minimize());
  listen('window:maximize', () => getWindow().isMaximized() ? getWindow().unmaximize() : getWindow().maximize());
  listen('window:fullscreen', () => { userFullScreen = !getWindow().isFullScreen(); getWindow().setFullScreen(userFullScreen); });
  listen('window:close', () => getWindow().close());
  // Keep full screen chosen with the shortcut when returning to the overview. On macOS full screen is a Space of
  // its own with a sliding transition, so an expanded project stays in the window there.
  listen('window:focus-mode', enabled => { if (typeof enabled === 'boolean' && platform !== 'darwin') getWindow().setFullScreen(enabled || userFullScreen); });
  handle('window:is-fullscreen', () => getWindow().isFullScreen());
  handle('app:quit', requestQuit);
}

module.exports = { registerWindowIpc };
