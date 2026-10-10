const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { app, BrowserWindow, protocol, nativeImage } = require('electron');
const { PreviewResources, resourceResponse } = require('../electron/preview-resources.cjs');
const { createFileCards } = require('../electron/features/files/file-cards.cjs');
const { createPageCapture } = require('../electron/features/files/capture-page.cjs');

// Run only in a fresh test profile; this standalone app never starts Agentrix terminals or sessions.
const output = path.resolve(process.env.AGENTRIX_DATA_DIR || '');
assert.ok(output.startsWith(path.resolve(__dirname, '../.test-output') + path.sep));
app.setPath('userData', output);
protocol.registerSchemesAsPrivileged([{ scheme: 'project-preview', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const previews = new PreviewResources();
// Each capture window closes when done; the check itself has no other window to keep the app running.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  protocol.handle('project-preview', async request => {
    // A pending external asset must not prevent capturing the already rendered local page.
    if (new URL(request.url).pathname.endsWith('/slow.png')) return new Promise(() => {});
    try { return resourceResponse(await previews.resolve(request.url), request); }
    catch { return new Response('Not found', { status: 404 }); }
  });
  const project = { id: 'cards-smoke', kind: 'local', path: path.join(output, 'project') };
  await fs.mkdir(path.join(project.path, 'docs'), { recursive: true });
  await fs.writeFile(path.join(project.path, 'docs/style.css'), 'body{margin:0;background:rgb(25,100,180);color:white;font:48px sans-serif}h1{margin:40px}#paint{width:640px;height:300px;background:rgb(230,80,40)}');
  await fs.writeFile(path.join(project.path, 'docs/page.js'), 'document.querySelector("h1").textContent="Agentrix HTML preview";document.querySelector("#paint").style.background="rgb(40,180,70)"');
  const capture = createPageCapture(BrowserWindow);
  const card = createFileCards({ previews, capture: async url => {
    try { return await capture(url); }
    catch (error) { await fs.writeFile(path.join(output, 'capture-error.txt'), error.stack); throw error; }
  } });
  const checks = [];
  for (const pending of [false, true]) {
    const file = `docs/template #中文%${pending ? '-pending' : ''}.html`;
    await fs.writeFile(path.join(project.path, file), `<link rel="stylesheet" href="style.css"><h1>Loading</h1><div id="paint"></div><script src="page.js"></script>${pending ? '<img src="slow.png">' : ''}`);
    const started = Date.now(), result = await card(project, path.join(project.path, file).replace(/\\/g, '/'));
    assert.equal(result.path, file); assert.match(result.picture || '', /^data:image\/jpeg;base64,/);
    const image = nativeImage.createFromDataURL(result.picture), { width, height } = image.getSize(), pixels = image.toBitmap();
    assert.equal(width, 480); assert.ok(height >= 250);
    const pixel = (x, y) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)];
    // Electron bitmaps use BGRA: CSS paints blue outside the box; local JS turns the box green.
    const blue = pixel(450, 240), green = pixel(40, 100);
    assert.ok(blue[0] > 150 && blue[1] > 70 && blue[2] < 60, JSON.stringify({ blue }));
    assert.ok(green[1] > 140 && green[0] < 100 && green[2] < 90, JSON.stringify({ green }));
    await fs.writeFile(path.join(output, pending ? 'pending.jpg' : 'template.jpg'), image.toJPEG(90));
    checks.push({ file, width, height, blue, green, elapsedMs: Date.now() - started });
  }
  assert.equal(previews.sessions.size, 0);
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ ok: true, checks }, null, 2));
  console.log(JSON.stringify({ ok: true, output, checks })); app.quit();
}).catch(async error => {
  console.error(error);
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ ok: false, error: error.stack }));
  app.exit(1);
});
