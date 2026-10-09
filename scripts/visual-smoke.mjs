import { testRun } from './test-output.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright-core';
import { waitFor } from './wait.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = await testRun('visual');
const profile = path.join(output, 'profile'), home = path.join(output, 'codex-home');
const names = ['界面开发', '文档整理', '本地工具', '服务接口', '数据处理', '工具项目'];
const projects = names.map((name, index) => ({ id: randomUUID(), name, path: path.join(output, name), unread: index === 1 ? 1 : 0, lastCompletedAt: index === 1 ? Date.now() - 60000 : null, restore: { terminal: false, codex: false } }));
const doneFile = path.join(projects[0].path, 'task.done');
for (const directory of [profile, path.join(home, 'sessions'), ...projects.map(project => project.path)]) await fs.mkdir(directory, { recursive: true });
await fs.writeFile(path.join(projects[0].path, 'README.md'), '# 清晰的工作区\n\n保留文字、代码和状态的层次。\n');
// These checks read the terminal's rows as HTML, so the compatible (DOM) renderer draws them; gpu-terminal-smoke covers the GPU one.
await fs.writeFile(path.join(profile, 'workspace.json'), JSON.stringify({ version: 2, projects, settings: { terminalRenderer: 'dom', notifications: false, sound: false, closeToTray: false, restoreSessions: false, fontSize: 14 } }));
const env = { ...process.env, PROJECT_GRID_DATA_DIR: profile, CODEX_HOME: home }; delete env.ELECTRON_RUN_AS_NODE; delete env.PROJECT_GRID_DEV_URL;
const packaged = process.argv.includes('--packaged');
// --daylight-only: run the Daylight checks (material, working glow, body contrast) and stop before the other themes.
const daylightOnly = process.argv.includes('--daylight-only');
class DaylightDone extends Error {}
let app, page;
const state = async () => (await page.evaluate(() => window.projectGrid.getState())).value;
const panel = index => page.locator(`[data-project-id="${projects[index].id}"]`);
const write = (index, data) => page.evaluate(({ id, data }) => window.projectGrid.writeTerminal(id, data), { id: projects[index].id, data });
const breathing = index => panel(index).evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.animationName === 'signal-breathe').length);
async function checkDaylightContrast() {
  // Hide only body content in this isolated profile so the screenshot measures the actual
  // composited wallpaper, blur, glass and working wash without glyphs or the cursor.
  const selector = '.project-panel:not(.has-unread, .round-complete, .has-error) .panel-terminal-area';
  const mask = await page.addStyleTag({ content: `${selector} > * { visibility: hidden !important; }` });
  try {
    const areas = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }));
    assert.ok(areas.length >= 2, 'contrast covers working and resting cards');
    const screenshot = await page.screenshot({ path: path.join(output, 'daylight-body-contrast.png') });
    const contrasts = await page.evaluate(async ({ png, areas }) => {
      const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      const scaleX = image.width / innerWidth, scaleY = image.height / innerHeight;
      const linear = channel => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; };
      return areas.map(box => {
        let brightest = 0;
        // Exclude the status edge and rounded corners; this is the terminal reading surface.
        for (let y = Math.ceil((box.y + 12) * scaleY); y < Math.floor((box.y + box.height - 12) * scaleY); y++) {
          for (let x = Math.ceil((box.x + 12) * scaleX); x < Math.floor((box.x + box.width - 12) * scaleX); x++) {
            const p = (y * image.width + x) * 4;
            brightest = Math.max(brightest, .2126 * linear(pixels[p]) + .7152 * linear(pixels[p + 1]) + .0722 * linear(pixels[p + 2]));
          }
        }
        // Daylight's terminal foreground, #ebebeb: light ink, so its worst ground is the brightest one.
        const ink = .2126 * linear(235) + .7152 * linear(235) + .0722 * linear(235);
        return (Math.max(ink, brightest) + .05) / (Math.min(ink, brightest) + .05);
      });
    }, { png: screenshot.toString('base64'), areas });
    // The wallpaper is darkened once and each card's frost darkens it again, so even the brightest ground behind the
    // text leaves white ink above 3:1 (body text also carries a soft shadow).
    console.log(`Daylight ink contrast with the brightest ground per card: ${contrasts.map(value => value.toFixed(2)).join(', ')}`);
    assert.ok(contrasts.every(value => value >= 3), `white ink stays legible over the brightest ground: ${contrasts.map(value => value.toFixed(2)).join(', ')}`);
    await fs.writeFile(path.join(output, 'daylight-contrast.json'), JSON.stringify(contrasts, null, 2));
  } finally { await mask.evaluate(node => node.remove()); }
}
const pauseBreath = (time, play = false) => panel(0).evaluate((node, { time, play }) => { for (const animation of node.getAnimations({ subtree: true })) if (animation.animationName === 'signal-breathe') { animation.pause(); animation.currentTime = time; if (play) animation.play(); } }, { time, play });
const errors = [];
try {
  app = await electron.launch({ executablePath: packaged ? path.join(root, 'release/win-unpacked/Project Grid.exe') : require('electron'), args: packaged ? [] : [root], cwd: root, env });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 900));
  await page.waitForSelector('.project-panel');
  assert.equal((await state()).settings.theme, 'daylight');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'daylight');
  for (let index = 0; index < 4; index++) {
    await panel(index).getByRole('button', { name: '启动终端', exact: true }).click();
    await waitFor(async () => (await state()).projects[index].shellReady, 'native terminal ready');
    await write(index, `Clear-Host; Write-Host 'Project Grid / ${names[index]}'; Write-Host ''; Write-Host '  项目、终端和输入草稿各自独立。'; Write-Host '  Ctrl + 鼠标左键打开文件与链接'; Write-Host ''; Write-Host '  PASS  ANSI colors and readable text' -ForegroundColor Green; Write-Host '  INFO  状态变更后继续工作' -ForegroundColor Cyan\r`);
    await waitFor(async () => panel(index).locator('.xterm-rows').innerText().then(text => text.includes('ANSI colors and readable text')), 'readable terminal output');
  }
  const thread = randomUUID(), transcript = path.join(home, 'sessions', `rollout-${thread}.jsonl`);
  const record = (type, turn) => JSON.stringify({ type: 'event_msg', timestamp: new Date().toISOString(), payload: { type, turn_id: turn } }) + '\n';
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  await write(0, `Clear-Host; Write-Host 'Project Grid / 界面开发'; Write-Host ''; Write-Host '  正在处理：验证独立项目的任务状态' -ForegroundColor Cyan; Write-Host '  背景任务运行中，可操作其他窗口。'; Write-Host ''; Send-ProjectGridEvent 'codex-started'; for ($pgVisual=0; $pgVisual -lt 2400 -and -not (Test-Path -LiteralPath ${quote(doneFile)}); $pgVisual++) { Start-Sleep -Milliseconds 100 }; Send-ProjectGridEvent 'codex-exited'\r`);
  await waitFor(async () => (await state()).projects[0].codexActive, 'offline task active');
  // The running agent's conversation shows as a document by default; these checks are about the terminal surface.
  await panel(0).locator('button[title="切换到终端"]').click();
  await fs.writeFile(transcript, JSON.stringify({ type: 'session_meta', payload: { id: thread, cwd: projects[0].path, source: 'cli' } }) + '\n' + record('task_started', 'visual-turn'));
  await waitFor(async () => panel(0).getAttribute('data-status').then(status => status === 'working'), 'working lifecycle reaches UI');
  await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(2, 2);
  assert.equal(await page.locator('.panel-edge-light').count(), 0, 'old decorative strips are removed');
  assert.equal(await panel(0).evaluate(node => getComputedStyle(node).animationName), 'none', 'the text surface is not animated');
  // A working turn has a steady blue edge and a wash fading out by 60% height. Nothing flashes until completion.
  const liveSamples = [];
  for (const mode of ['normal', 'hover', 'input-focus']) {
    if (mode === 'hover') await panel(0).locator('.panel-header').hover();
    if (mode === 'input-focus') { await panel(0).locator('textarea.xterm-helper-textarea').focus(); await page.mouse.move(2, 2); }
    const samples = await panel(0).evaluate(async node => {
      const edge = node.querySelector('.panel-signal'), glow = node.querySelector('.panel-glow'), text = node.querySelector('.xterm-rows');
      const values = [];
      for (let index = 0; index < 12; index++) {
        values.push({ edge: Number(getComputedStyle(edge).opacity), edgeShadow: getComputedStyle(edge).boxShadow, glow: Number(getComputedStyle(glow).opacity), tint: getComputedStyle(glow).backgroundImage, text: { opacity: getComputedStyle(text).opacity, color: getComputedStyle(text).color, animation: getComputedStyle(text).animationName } });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return values;
    });
    for (const sample of samples) {
      assert.deepEqual(sample, samples[0], `${mode}: working lights and reading surface stay steady`);
      assert.equal(sample.edge, .95, `${mode}: vivid working edge stays steady`);
      assert.equal(sample.glow, 1, `${mode}: blue body wash stays steady`);
      assert.ok(sample.edgeShadow.includes('24px') && /rgba\((47, 111, 208|59, 158, 255)/.test(sample.tint) && sample.tint.includes('60%'), `${mode}: blue glow and fading wash ${JSON.stringify(sample)}`);
      assert.equal(sample.text.opacity, '1'); assert.equal(sample.text.animation, 'none');
    }
    liveSamples.push({ mode, samples });
  }
  assert.equal(await breathing(0), 0, 'a working turn does not flash');
  await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(2, 2);
  assert.equal(await breathing(1), 0, 'old unread completion stays quiet');
  assert.equal(await breathing(2), 0, 'ready shell stays quiet');
  await page.screenshot({ path: path.join(output, 'daylight-working.png') });
  // Every card is one frosted pane (clarity.css): a dark fill over a strong blur, and nothing inside it is glass again
  // (no header band, no inner screen).
  const pane = await panel(0).evaluate(node => ({ filter: getComputedStyle(node, '::before').backdropFilter, color: getComputedStyle(node, '::before').backgroundColor }));
  assert.ok(/blur\(\d+px\)/.test(pane.filter) && pane.color === 'rgba(28, 32, 40, 0.3)', `a card is one frosted pane: ${JSON.stringify(pane)}`);
  const inner = await panel(0).evaluate(node => [node.querySelector('.panel-header'), node.querySelector('.panel-terminal-area')].map(part => {
    const style = getComputedStyle(part);
    return { backdrop: style.backdropFilter, fill: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow, margin: style.margin };
  }));
  for (const part of inner) assert.deepEqual([part.backdrop, part.fill, part.image, part.shadow, part.margin], ['none', 'rgba(0, 0, 0, 0)', 'none', 'none', '0px'], `nothing inside a card is glass on glass: ${JSON.stringify(inner)}`);
  if (daylightOnly) { await checkDaylightContrast(); await page.screenshot({ path: path.join(output, 'daylight.png') }); throw new DaylightDone(); }
  for (const [theme, name] of [['daylight', '晴空'], ['forest', '林间光影'], ['mountain-blue', '山青蓝'], ['wild-red', '西野红']]) {
    await page.evaluate(theme => window.projectGrid.settings({ theme }), theme);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    await page.screenshot({ path: path.join(output, `${theme}.png`) });
    assert.equal(await panel(0).locator('.status-badge').innerText(), '正在处理');
    assert.equal(await panel(0).locator('.panel-signal').evaluate(node => Number(getComputedStyle(node).opacity)), .95, `${name}: working edge remains visible`);
    const chips = await page.locator('.panel-index').evaluateAll(nodes => nodes.map(node => ({ background: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color, weight: getComputedStyle(node).fontWeight })));
    assert.deepEqual(chips.map(chip => chip.background), ['rgb(59, 130, 246)', 'rgb(100, 116, 139)', 'rgb(139, 92, 246)', 'rgb(245, 158, 11)', 'rgb(244, 63, 94)', 'rgb(14, 165, 233)'], `${name}: project colors survive working and unread states`);
    assert.ok(chips.every(chip => chip.color === 'rgb(255, 255, 255)' && chip.weight === '700'), `${name}: white bold digits`);
    assert.equal(await breathing(2), 0, `${name}: ready shell stays quiet`);
    if (theme === 'daylight') await checkDaylightContrast();
  }
  await page.evaluate(() => window.projectGrid.settings({ theme: 'forest' }));
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'forest');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
  await page.screenshot({ path: path.join(output, 'forest-3840x2160.png') });
  await cdp.send('Emulation.clearDeviceMetricsOverride'); await cdp.detach();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(820, 560));
  await page.waitForFunction(() => Math.abs(innerWidth - 820) <= 1); // Windows DPI can round the client width by one CSS pixel.
  const compact = await page.locator('.panel-header').evaluateAll(headers => headers.map(header => {
    const bounds = header.getBoundingClientRect(), name = header.querySelector('.panel-name').getBoundingClientRect();
    return { titleWidth: name.width, inside: [...header.children].filter(child => getComputedStyle(child).display !== 'none').every(child => { const box = child.getBoundingClientRect(); return box.left >= bounds.left && box.right <= bounds.right + 1; }), metaSize: getComputedStyle(header.querySelector('.status-badge')).fontSize };
  }));
  await page.screenshot({ path: path.join(output, 'compact-820x560.png') });
  assert.ok(compact.every(card => card.inside && card.titleWidth >= 70 && parseFloat(card.metaSize) >= 11), JSON.stringify(compact));
  const compactEdges = await page.evaluate(() => {
    const top = document.querySelector('.titlebar').getBoundingClientRect();
    return { top: top.top, left: top.left, right: top.right, width: innerWidth, height: innerHeight };
  });
  assert.ok([compactEdges.top, compactEdges.left, compactEdges.right - compactEdges.width].every(gap => Math.abs(gap) < 1), `compact bars meet viewport edges within DPI rounding: ${JSON.stringify(compactEdges)}`);
  await panel(3).locator('.panel-terminal-area').click({ position: { x: 40, y: 50 } });
  await page.keyboard.type('DRAFT_STAYS_SMALL'); assert.equal(await page.locator('.focus-mode').count(), 0);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 900));
  await panel(0).getByRole('button', { name: `全屏查看 ${names[0]}`, exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.focus-mode') && !document.querySelector('[data-focus-motion]'));
  await page.screenshot({ path: path.join(output, 'focused-explorer.png') });
  await page.getByRole('button', { name: '返回总览', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.focus-mode') && !document.querySelector('[data-focus-motion]'));
  await fs.appendFile(transcript, record('task_complete', 'visual-turn'));
  await waitFor(async () => panel(0).evaluate(node => node.classList.contains('attention-active')), 'new completion breathes');
  assert.equal(await breathing(0), 3, 'the edge, the status dot and the inner glow breathe');
  const timings = await panel(0).evaluate(node => ['.panel-signal', '.status-dot', '.panel-glow'].map(selector => {
    const animation = node.querySelector(selector).getAnimations()[0];
    return { start: animation.startTime, duration: animation.effect.getTiming().duration, iterations: animation.effect.getTiming().iterations };
  }));
  assert.ok(timings.every(timing => Math.abs(timing.start - timings[0].start) < 35), 'edge, dot and glow breathe in one phase');
  assert.ok(timings.every(timing => timing.duration === 3000 && timing.iterations === 3), `three slow 3 s breaths: ${JSON.stringify(timings)}`);
  // At the peak the glow lights the terminal surface well inside the edge, not only the thin ring.
  const shots = {};
  for (const [name, time] of [['low', 0], ['peak', 1500]]) {
    await pauseBreath(time);
    shots[name] = await page.screenshot({ path: path.join(output, `forest-${name}.png`) });
    const opacity = await panel(0).locator('.panel-glow').evaluate(node => Number(getComputedStyle(node).opacity));
    assert.ok(name === 'peak' ? opacity >= .95 : opacity <= .05, `${name} glow: ${opacity}`);
  }
  const area = await panel(0).locator('.panel-terminal-area').boundingBox(), viewport = await page.evaluate(() => innerWidth);
  const glowReach = await app.evaluate(({ nativeImage }, { low, peak, area, viewport }) => {
    const a = nativeImage.createFromBuffer(Buffer.from(low, 'base64')), b = nativeImage.createFromBuffer(Buffer.from(peak, 'base64'));
    const { width } = a.getSize(), scale = width / viewport, first = a.toBitmap(), second = b.toBitmap();
    const mean = (from, to) => {
      let total = 0, count = 0;
      for (let y = Math.round((area.y + area.height * .45) * scale); y < (area.y + area.height * .55) * scale; y++) {
        for (let x = Math.round((area.x + from) * scale); x < (area.x + to) * scale; x++) {
          const at = (y * width + x) * 4; total += Math.max(...[0, 1, 2].map(channel => Math.abs(first[at + channel] - second[at + channel]))); count++;
        }
      }
      return total / count;
    };
    return { edge: mean(2, 10), inside: mean(30, 60), deep: mean(90, 120) };
  }, { low: shots.low.toString('base64'), peak: shots.peak.toString('base64'), area, viewport });
  assert.ok(glowReach.inside > 8 && glowReach.deep > 2, `the breathing glow spreads into the terminal: ${JSON.stringify(glowReach)}`);
  const text = await panel(0).locator('.xterm-rows').evaluate(node => ({ opacity: getComputedStyle(node).opacity, animation: getComputedStyle(node).animationName }));
  assert.deepEqual(text, { opacity: '1', animation: 'none' }, 'terminal text itself never pulses');
  await pauseBreath(0, true);
  const completed = (await state()).projects[0].lastCompletedAt;
  await page.screenshot({ path: path.join(output, 'fresh-completion.png') });
  await waitFor(async () => (await breathing(0)) === 0, 'three breaths finish', 20000);
  assert.equal(await panel(0).locator('.panel-glow').evaluate(node => Number(getComputedStyle(node).opacity)), .3, 'an unviewed result keeps a quiet steady glow');
  // Rerender via theme changes and repeated lifecycle callbacks must not restart an old alert.
  await fs.appendFile(transcript, record('task_complete', 'visual-turn'));
  await page.evaluate(() => window.projectGrid.settings({ theme: 'wild-red' }));
  assert.equal(await breathing(0), 0); assert.equal((await state()).projects[0].lastCompletedAt, completed);
  await page.evaluate(id => window.projectGrid.acknowledge(id), projects[0].id);
  await waitFor(async () => panel(0).evaluate(node => node.classList.contains('round-complete')), 'viewed automatic round becomes steady green');
  assert.equal(await breathing(0), 0);
  assert.equal(await panel(0).locator('.panel-glow').evaluate(node => Number(getComputedStyle(node).opacity)), 0, 'a viewed result has no glow');
  assert.equal(await panel(0).locator('.status-badge').innerText(), '本轮已完成');
  assert.equal(await panel(0).evaluate(node => getComputedStyle(node).getPropertyValue('--signal-rgb').trim()), '75, 237, 164');
  await page.screenshot({ path: path.join(output, 'automatic-completion.png') });
  await panel(0).locator('.panel-terminal-area').click({ position: { x: 40, y: 50 } });
  assert.equal(await page.locator('.focus-mode').count(), 0, 'automatic green does not expand on terminal clicks');
  await fs.appendFile(transcript, record('task_started', 'next-turn'));
  await waitFor(async () => panel(0).getAttribute('data-status').then(status => status === 'working'), 'a new submitted turn is working');
  assert.equal(await breathing(0), 0, 'working again stays steady');
  await fs.appendFile(transcript, record('task_complete', 'next-turn'));
  await waitFor(async () => (await breathing(0)) === 3, 'the next finished turn breathes again');
  const setMotion = async mode => { await page.evaluate(mode => window.projectGrid.settings({ focusAnimation: mode }), mode); await page.waitForFunction(mode => document.documentElement.dataset.motion === mode, mode); };
  // Windows reports reduced motion whenever its "Animation effects" switch is off. The default
  // setting keeps the lights breathing; only "follow system" or "off" stops them.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setMotion('smooth');
  assert.ok(await breathing(0) > 0, 'default animation setting keeps breathing when Windows animation effects are off');
  await page.screenshot({ path: path.join(output, 'reduced-motion-default.png') });
  await setMotion('system');
  await waitFor(async () => await breathing(0) === 0, 'follow-system stops decorative breathing under reduced motion');
  await page.screenshot({ path: path.join(output, 'reduced-motion.png') });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await setMotion('off');
  await waitFor(async () => await breathing(0) === 0, 'turning animation off stops breathing even without a system preference');
  await setMotion('smooth');
  await waitFor(async () => await breathing(0) > 0, 'turning animation back on resumes breathing');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ packaged, timings, glowReach, liveSamples, compact, compactEdges, errors }, null, 2));
  console.log(`PASS: steady blue working edge and wash, daylight body contrast, a slow diffuse breathing glow on completion, quiet unviewed glow, quiet idle, all themes, high DPI, compact controls, explorer and preserved small-card input. Screenshots: ${output}`);
} catch (error) {
  if (error instanceof DaylightDone) { assert.deepEqual(errors, []); console.log(`PASS (Daylight only): frosted pane material, legible ink and steady working edge. Screenshots: ${output}`); }
  else {
  console.error(error);
  if (page) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    console.error('Visual test viewport:', await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio })).catch(() => null));
  }
  throw error;
  }
} finally {
  // Release our simulated task and exit only this isolated profile's shells
  // before Electron tears down ConPTY handles.
  await fs.writeFile(doneFile, 'done');
  if (app) {
    try {
      if (page && !page.isClosed()) {
        const active = (await state()).projects.filter(project => project.sessionId && project.status !== 'exited');
        if (active.some(project => project.id === projects[0].id)) await waitFor(async () => {
          const project = (await state()).projects.find(project => project.id === projects[0].id);
          return project.shellReady || project.status === 'exited';
        }, 'visual task returned to its shell');
        for (const project of active) await page.evaluate(id => window.projectGrid.writeTerminal(id, '\x03exit\r'), project.id);
        await waitFor(async () => (await state()).projects.every(project => !project.sessionId || project.status === 'exited'), 'visual fixture shells exited');
        console.log('PASS: isolated visual task and terminal processes exited before closing the app');
      }
    } finally { await app.close(); }
  }
}
