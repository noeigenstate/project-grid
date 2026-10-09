import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { waitFor } from './wait.mjs';
import { testRun } from './test-output.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), require = createRequire(import.meta.url);
const { desktopGlassKind } = require('../electron/desktop-glass.cjs'), backend = desktopGlassKind();
const output = await testRun('appearance'), profile = path.join(output, 'profile'), project = path.join(output, 'project'), home = path.join(output, 'codex-home');
for (const folder of [profile, project, home]) await fs.mkdir(folder);
await fs.writeFile(path.join(project, 'README.md'), '# 六套主题\n\n中文与 English 0123456789。\n\n```ts\nconst theme = "optional";\n```\n');
await fs.writeFile(path.join(profile, 'workspace.json'), JSON.stringify({ version: 2, projects: [{ id: 'appearance', name: '主题与字体', path: project, kind: 'local', restore: { terminal: false, codex: false } }], settings: { theme: 'mono-amber', surface: 'glass', glassBackground: backend ? 'desktop' : 'theme', terminalRenderer: 'dom', fontSize: 16, terminalFontFamily: 'Cascadia Code', terminalCjkFontFamily: 'Noto Sans SC', glassTransparency: 25, restoreSessions: false, closeToTray: false, notifications: false, sound: false, announce: false, shortcuts: { search: 'Ctrl+K' } } }));
const env = { ...process.env, PROJECT_GRID_DATA_DIR: profile, CODEX_HOME: home }; delete env.ELECTRON_RUN_AS_NODE; delete env.PROJECT_GRID_DEV_URL;
const themes = ['daylight', 'forest', 'mountain-blue', 'wild-red', 'mono-amber', 'mono-amber-dark'];
const modes = [{ surface: 'glass', glassBackground: 'theme', visual: 'glass' }, ...(backend ? [{ surface: 'glass', glassBackground: 'desktop', visual: 'desktop-glass' }] : []), { surface: 'solid', glassBackground: 'desktop', visual: 'solid' }];
const errors = [], fontRequests = [], results = { backend, cases: [], recommendations: [] }; let app, page;
const state = async () => (await page.evaluate(() => window.projectGrid.getState())).value;
async function launch() {
  const packaged = process.env.PROJECT_GRID_APPEARANCE_EXE;
  app = await electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : [root], cwd: root, env }); page = await app.firstWindow(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.resourceType() === 'font') fontRequests.push(request.url()); });
  await app.evaluate(({ BrowserWindow, dialog }) => { globalThis.appearanceWindow = BrowserWindow.getAllWindows()[0]; appearanceWindow.setBounds({ x: 180, y: 100, width: 1500, height: 940 }); appearanceWindow.setAlwaysOnTop(true); appearanceWindow.showInactive(); dialog.showMessageBox = async () => ({ response: 1 }); });
  await page.waitForSelector('.project-panel');
}
async function settings(patch) {
  await page.evaluate(patch => window.projectGrid.settings(patch), patch);
  await waitFor(async () => { const saved = (await state()).settings; return Object.entries(patch).every(([key, value]) => saved[key] === value); }, 'settings stored'); await page.waitForTimeout(120);
}
async function capture(name) {
  await app.evaluate(() => { appearanceWindow.show(); appearanceWindow.focus(); });
  await page.waitForTimeout(300);
  const bytes = await page.screenshot({ animations: 'disabled', timeout: 15000 });
  await fs.writeFile(path.join(output, name), bytes);
  if (name.endsWith('-solid.png')) {
    const pane = await app.evaluate(({ nativeImage }, encoded) => { const image = nativeImage.createFromBuffer(Buffer.from(encoded, 'base64')), size = image.getSize(), pixels = image.toBitmap(), offset = (Math.floor(size.height * .7) * size.width + Math.floor(size.width / 2)) * 4; return [pixels[offset + 2], pixels[offset + 1], pixels[offset]]; }, bytes.toString('base64'));
    assert.deepEqual(pane, name.startsWith('mono-amber-dark') ? [21, 23, 26] : [244, 245, 246], 'screenshot must show the selected solid theme');
  }
}
try {
  await launch(); if (backend) assert.ok((await state()).desktopGlass.active);
  await page.getByRole('button', { name: '启动终端', exact: true }).click(); await waitFor(async () => (await state()).projects[0].shellReady, 'real terminal');
  const session = (await state()).projects[0].sessionId;
  await page.evaluate(() => window.projectGrid.writeTerminal('appearance', "Clear-Host; Write-Host 'APPEARANCE / THEME MATRIX'; Write-Host '中文清晰与 English 0123456789'; Write-Host 'const attention = unread || waitingForInput;'; Write-Host (([string][char]27)+'[48;2;30;30;30m'+([string][char]27)+'[38;2;255;255;255mTRUECOLOR_SURFACE'+([string][char]27)+'[0m')\r"));
  await waitFor(() => page.locator('.xterm-rows').innerText().then(text => text.includes('TRUECOLOR_SURFACE')), 'terminal sample');
  const terminal = await page.locator('.terminal-host').elementHandle();
  for (const theme of themes) for (const renderer of ['gpu', 'dom']) for (const mode of modes) {
    await settings({ theme, terminalRenderer: renderer, surface: mode.surface, glassBackground: mode.glassBackground, glassTransparency: 25 });
    await page.waitForFunction(mode => document.documentElement.dataset.surface === mode, mode.visual);
    if (renderer === 'gpu') assert.ok(await page.locator('.xterm canvas').count()); else {
      await page.locator('.xterm-rows').waitFor();
      await waitFor(() => page.evaluate(() => [...document.querySelectorAll('.xterm-rows span')].some(node => node.textContent === 'TRUECOLOR_SURFACE' && getComputedStyle(node).backgroundColor === 'rgb(30, 30, 30)' && getComputedStyle(node).color === 'rgb(255, 255, 255)')), 'truecolor after renderer redraw');
      await waitFor(() => page.evaluate(() => [...document.querySelectorAll('.xterm-rows')].some(node => getComputedStyle(node).fontFamily.includes('Noto Sans SC'))), 'font after renderer redraw');
    }
    const sample = await page.locator('.project-panel').evaluate(node => ({ ink: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor, opacity: getComputedStyle(node).opacity, backdrop: getComputedStyle(node).backdropFilter }));
    assert.equal(sample.opacity, '1'); if (mode.visual !== 'glass') assert.equal(sample.backdrop, 'none');
    if (theme.startsWith('mono-amber')) assert.equal(sample.ink, theme === 'mono-amber' ? 'rgb(23, 25, 29)' : 'rgb(241, 242, 244)');
    if (mode.visual === 'desktop-glass' && theme.startsWith('mono-amber')) {
      const titlebar = await page.locator('.titlebar').evaluate(node => {
        const context = document.createElement('canvas').getContext('2d');
        const rgba = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
        return { background: rgba(getComputedStyle(node).backgroundColor), ink: rgba(getComputedStyle(node.querySelector('.titlebar-brand')).color) };
      });
      const luminance = rgb => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      for (const backdrop of [0, 255]) {
        const background = titlebar.background.slice(0, 3).map(value => value * titlebar.background[3] / 255 + backdrop * (1 - titlebar.background[3] / 255));
        const ink = luminance(titlebar.ink.slice(0, 3)), fill = luminance(background);
        assert.ok((Math.max(ink, fill) + .05) / (Math.min(ink, fill) + .05) >= 7, 'window titlebar contrast: ' + JSON.stringify(titlebar));
      }
    }
    assert.equal((await state()).projects[0].sessionId, session); assert.ok(await terminal.evaluate(node => node.isConnected));
    results.cases.push({ theme, renderer, mode: mode.visual, ...sample });
    if (mode.surface === 'solid' && renderer === 'dom' && theme.startsWith('mono-amber')) await capture(theme + '-solid.png');
  }
  await page.evaluate(() => window.projectGrid.writeTerminal('appearance', "Write-Output 'APPEARANCE_UNSENT_DRAFT'"));
  for (const theme of themes) {
    await settings({ theme, fontSize: 18, terminalFontWeight: 600, terminalFontFamily: 'Consolas', terminalCjkFontFamily: 'Noto Sans SC', surface: 'glass', glassBackground: backend ? 'desktop' : 'theme' });
    assert.equal((await state()).settings.fontSize, 18);
    await page.getByRole('button', { name: '工作台设置', exact: true }).click();
    if (theme.startsWith('mono-amber')) {
      const dialog = await page.locator('.settings-dialog').evaluate(node => ({ background: getComputedStyle(node).backgroundColor, ink: getComputedStyle(node).color }));
      assert.equal(dialog.ink, theme === 'mono-amber' ? 'rgb(23, 25, 29)' : 'rgb(241, 242, 244)');
      assert.ok(dialog.background.startsWith(theme === 'mono-amber' ? 'rgba(249, 250, 251,' : 'rgba(21, 23, 26,'), 'dialog must use its theme surface: ' + JSON.stringify(dialog));
      if (theme === 'mono-amber') await capture('light-settings.png');
    }
    const material = page.getByRole('combobox', { name: '界面材质', exact: true });
    assert.deepEqual(await material.locator('option').evaluateAll(options => options.map(option => option.value)), ['glass', 'solid']);
    const background = page.getByRole('combobox', { name: '玻璃背景', exact: true }); assert.equal(await background.inputValue(), backend ? 'desktop' : 'theme');
    await material.selectOption('solid'); await background.waitFor({ state: 'detached' });
    await material.selectOption('glass'); await background.waitFor(); assert.equal(await background.inputValue(), backend ? 'desktop' : 'theme');
    await page.getByRole('button', { name: '应用推荐配置', exact: true }).click();
    const recommended = (await state()).settings, mono = theme.startsWith('mono-amber');
    assert.equal(recommended.fontSize, mono ? 16 : 12); assert.equal(recommended.terminalFontWeight, 400);
    assert.equal(recommended.glassTransparency, mono ? (theme === 'mono-amber' ? 25 : 20) : null);
    assert.equal(recommended.glassBackground, mono && backend ? 'desktop' : 'theme');
    assert.equal(recommended.notifications, false); assert.equal(recommended.restoreSessions, false); assert.deepEqual(recommended.shortcuts, { search: 'Ctrl+K' });
    assert.equal((await state()).projects[0].sessionId, session);
    results.recommendations.push({ theme, fontSize: recommended.fontSize, transparency: recommended.glassTransparency, renderer: recommended.terminalRenderer });
    if (theme === 'mono-amber-dark') await capture('dark-settings.png');
    await page.getByRole('button', { name: '完成', exact: true }).click();
  }
  assert.ok((await page.evaluate(() => window.projectGrid.attachTerminal('appearance'))).value.data.includes('APPEARANCE_UNSENT_DRAFT')); await page.evaluate(() => window.projectGrid.writeTerminal('appearance', '\x03'));
  const marker = path.join(output, 'after-font-change.done').replaceAll("'", "''");
  await page.evaluate(command => window.projectGrid.writeTerminal('appearance', command), "[System.IO.File]::WriteAllText('" + marker + "','ok')\r");
  await waitFor(() => fs.access(path.join(output, 'after-font-change.done')).then(() => true, () => false), 'typing works after font and grid reflow');
  for (const theme of themes) {
    await settings({ theme }); await page.getByRole('button', { name: '全屏查看 主题与字体', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('[data-focus-motion]'));
    await page.getByRole('treeitem', { name: 'README.md', exact: true }).click(); await page.locator('.file-preview').waitFor();
    assert.equal(await page.locator('.file-preview').evaluate(node => getComputedStyle(node).opacity), '1'); await page.getByRole('button', { name: '返回总览', exact: true }).click();
  }
  await settings({ language: 'en' }); await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Glass background', exact: true }).waitFor(); await page.getByRole('button', { name: 'Apply recommendations', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Done', exact: true }).click(); await settings({ language: 'zh', theme: 'mono-amber-dark' });
  await app.close(); app = null; await launch(); assert.equal((await state()).settings.theme, 'mono-amber-dark'); assert.equal((await state()).settings.glassBackground, backend ? 'desktop' : 'theme');
  assert.deepEqual(fontRequests, [], 'installed fonts must not trigger font downloads'); assert.deepEqual(errors, []);
  results.checks = ['six themes × renderers × linked materials', 'native/theme background selection remembered through solid mode', 'truecolor program surfaces preserved', 'font, session, host and draft preserved', 'recommendations touch appearance only', 'file preview on all themes', 'English settings', 'restart and no font downloads'];
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2)); console.log('PASS ' + results.cases.length + ' appearance combinations: ' + output);
} catch (error) { await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2)); if (app) await capture('failure.png').catch(() => {}); throw error; }
finally { if (app) await app.close(); }