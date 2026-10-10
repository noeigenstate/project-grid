// Cards use the same sandbox and project-preview CSP as full previews, without an app preload.
function createPageCapture(BrowserWindow, { timeout = 10000, settle = 500, fontWait = 1200 } = {}) {
  return async function capturePage(url) {
    const page = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const contents = page.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', event => event.preventDefault());
    contents.on('will-redirect', event => event.preventDefault());
    contents.setAudioMuted(true);
    let deadline;
    try {
      const render = async () => {
        // DOM-ready lets local content render even if an external asset never finishes loading.
        await new Promise((resolve, reject) => {
          contents.once('dom-ready', resolve);
          contents.once('render-process-gone', () => reject(new Error('Preview renderer exited')));
          void page.loadURL(url).catch(reject);
        });
        // Electron defers executeJavaScript until loading ends; bound the font wait in the main process.
        let fontTimer;
        try {
          await Promise.race([contents.executeJavaScript('document.fonts.ready.then(() => true)').catch(() => {}),
            new Promise(resolve => { fontTimer = setTimeout(resolve, fontWait); })]);
        } finally { clearTimeout(fontTimer); }
        await new Promise(resolve => setTimeout(resolve, settle));
        contents.invalidate();
        for (let attempt = 0; attempt < 2; attempt++) {
          const image = await contents.capturePage(undefined, { stayHidden: true, stayAwake: true });
          if (!image.isEmpty()) return `data:image/jpeg;base64,${image.resize({ width: 480, quality: 'good' }).toJPEG(82).toString('base64')}`;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return null;
      };
      // Bound painting and capture too; one stalled page must not block all queued cards.
      return await Promise.race([render(), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Preview capture timed out')), timeout); })]);
    } finally { clearTimeout(deadline); if (!page.isDestroyed()) page.destroy(); }
  };
}

module.exports = { createPageCapture };
