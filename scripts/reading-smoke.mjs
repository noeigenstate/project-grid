import { testRun } from './test-output.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright-core';
import { waitFor } from './wait.mjs';

const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await testRun('reading'), profile = path.join(output, 'profile'), home = path.join(output, 'codex-home');
const project = { id: randomUUID(), name: '阅读命令', path: path.join(output, 'project'), restore: { terminal: false, codex: false } };
for (const directory of [profile, home, path.join(project.path, '.claude/commands')]) await fs.mkdir(directory, { recursive: true });
await fs.writeFile(path.join(project.path, '.claude/commands/fix-issue.md'), '---\ndescription: 修复问题\n---\nFix issue $ARGUMENTS.\n');
await fs.writeFile(path.join(profile, 'workspace.json'), JSON.stringify({ version: 2, projects: [project], settings: { terminalRenderer: 'dom', restoreSessions: false, closeToTray: false, notifications: false, sound: false, announce: false, language: 'zh' } }));
const env = { ...process.env, PROJECT_GRID_DATA_DIR: profile, CODEX_HOME: home }; delete env.ELECTRON_RUN_AS_NODE; delete env.PROJECT_GRID_DEV_URL;
const packaged = process.argv.includes('--packaged'), errors = [], checks = [];
let app, page;
const state = async () => (await page.evaluate(() => window.projectGrid.getState())).value.projects[0].terminals[0];
const write = data => page.evaluate(({ id, data }) => window.projectGrid.writeTerminal(id, data), { id: project.id, data });
// xterm reports focus separately when the card switches views.
const writes = () => app.evaluate(() => globalThis.voicePastes.filter(item => !['\x1b[I', '\x1b[O'].includes(item.data)));
const resetWrites = () => app.evaluate(() => { globalThis.voicePastes = []; });
const hook = (kind, payload) => `'${JSON.stringify(payload)}' | & $global:ProjectGridSession.powershellPath -NoProfile -ExecutionPolicy Bypass -File $global:ProjectGridSession.claudeHookPath -PipeName $global:ProjectGridSession.pipeName -ProjectId $global:ProjectGridSession.projectId -SessionKey $global:ProjectGridSession.sessionKey -Kind ${kind}\r`;
try {
  app = await electron.launch({ executablePath: packaged ? path.join(root, 'release/win-unpacked/Project Grid.exe') : require('electron'), args: packaged ? [] : [root], cwd: root, env });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    globalThis.voicePastes = [];
    ipcMain.on('terminal:write', (_event, id, data) => globalThis.voicePastes.push({ id, data, at: Date.now() }));
    BrowserWindow.getAllWindows()[0].setContentSize(1400, 900);
    BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false);
  });
  await page.waitForSelector('.project-panel');
  const card = page.locator(`[data-project-id="${project.id}"]`), terminal = page.locator(`[data-terminal-id="${project.id}"]`);
  const composer = terminal.locator('.reading-composer textarea'), palette = terminal.getByRole('listbox');
  const reading = () => composer.waitFor({ state: 'visible' });
  const raw = () => composer.waitFor({ state: 'detached' });
  const showReading = async () => { await card.getByRole('button', { name: '阅读视图：按文档排版显示对话', exact: true }).click(); await reading(); };
  const showRaw = async () => { await card.locator('.panel-header').getByRole('button', { name: '切换到终端', exact: true }).click(); await raw(); };
  await card.getByRole('button', { name: '启动终端', exact: true }).click();
  await waitFor(async () => (await state()).shellReady, 'isolated PowerShell ready');
  // A normal shell prompt reports the agent's exit. Keep this fixture active without launching a CLI.
  await write("function global:prompt { 'reading-fixture> ' }; Send-ProjectGridEvent 'codex-started' -Agent 'claude'\r");
  await waitFor(async () => (await state()).codexActive && (await state()).agent === 'claude', 'authenticated Claude fixture');
  // Claude's idle input between its two rules, with its footer: a typed command shows its output inside the reading
  // view and is finished once the CLI is idle like this again. The fixture draws it after each command (the helper's
  // own write is left out of the recorded keys).
  const idle = "Clear-Host; Write-Host ([string][char]0x2500 * 40); Write-Host ([string][char]0x276F + ' '); Write-Host ([string][char]0x2500 * 40); Write-Host ('  ' + [char]0x23F8 + ' manual mode on')\r";
  await write(idle);
  const settled = async label => {
    await waitFor(async () => (await writes()).some(item => item.data === '\r'), `${label} submitted`);
    const sent = await app.evaluate(() => globalThis.voicePastes.slice());
    await write(idle);
    await waitFor(async () => await composer.isEnabled(), `${label} finished in the reading view`);
    await app.evaluate((_electron, sent) => { globalThis.voicePastes = sent; }, sent);
  };
  await reading(); await composer.fill('/');
  await palette.getByRole('option').filter({ has: page.getByText('/status', { exact: true }) }).waitFor();
  const custom = palette.getByRole('option').filter({ hasText: '/fix-issue' });
  assert.equal(await custom.locator('small').innerText(), '项目');
  assert.ok((await custom.innerText()).includes('修复问题'));
  assert.equal(await composer.getAttribute('aria-expanded'), 'true');
  assert.equal(await composer.getAttribute('aria-controls'), await palette.getAttribute('id'));
  const count = await palette.getByRole('option').count();
  await waitFor(() => palette.evaluate(node => {
    const list = node.getBoundingClientRect(), box = node.parentElement.getBoundingClientRect();
    return Math.abs(list.width - box.width) < 1 && Math.abs(list.left - box.left) < 1 && list.bottom < box.top && list.height <= 266;
  }), 'palette above composer, same width and at most eight visible rows');
  assert.ok(await palette.evaluate(node => node.scrollHeight > node.clientHeight), 'command list scrolls');
  await page.screenshot({ path: path.join(output, 'all-commands.png') });
  await composer.press('ArrowUp');
  assert.equal(await palette.getByRole('option').nth(count - 1).getAttribute('aria-selected'), 'true');
  await composer.press('ArrowDown');
  assert.equal(await palette.getByRole('option').first().getAttribute('aria-selected'), 'true');
  assert.equal(await composer.getAttribute('aria-activedescendant'), await palette.getByRole('option').first().getAttribute('id'));
  await custom.click(); assert.equal(await composer.inputValue(), '/fix-issue ');
  await composer.fill('/'); await palette.waitFor(); await composer.press('Escape');
  assert.equal(await composer.inputValue(), '/'); assert.equal(await palette.count(), 0);
  checks.push('palette, project tag, ARIA, wraparound, click and Escape');
  await composer.fill('/rev');
  await palette.getByRole('option').filter({ hasText: '/security-review' }).waitFor();
  assert.equal(await palette.getByRole('option').first().locator('code').innerText(), '/review', 'prefix matches precede contained matches');
  await composer.fill('/ISS'); await palette.getByRole('option').filter({ hasText: '/fix-issue' }).waitFor();
  checks.push('case-insensitive contains matching after prefix matches');
  await composer.fill('/sta'); await palette.getByRole('option').filter({ has: page.getByText('/status', { exact: true }) }).waitFor();
  await page.screenshot({ path: path.join(output, 'palette.png') });
  await composer.press('Tab'); assert.equal(await composer.inputValue(), '/status ');
  await resetWrites(); await composer.press('Enter'); await settled('/status');
  let sent = await writes();
  assert.deepEqual(sent.map(item => item.data), ['/status', '\r'], 'slash command is typed, never bracketed paste');
  assert.ok(sent[1].at - sent[0].at >= 140, 'Enter follows the command after its typing delay');
  assert.equal(await composer.count(), 1, 'a typed command keeps the reading view');
  assert.equal(await page.locator('.focus-mode').count(), 0, 'composer interaction keeps the card small');
  checks.push('Tab completion, typed /status and delayed Enter, inside the reading view');
  await composer.fill('/fix-issue 42'); await resetWrites(); await composer.press('Enter');
  await waitFor(async () => (await writes()).some(item => item.data === '\r'), 'project command submitted');
  assert.deepEqual((await writes()).map(item => item.data), ['/fix-issue 42', '\r']);
  await settled('project command');
  assert.equal(await composer.isVisible(), true);
  await resetWrites(); await composer.press('Shift+Tab');
  await waitFor(async () => (await writes()).some(item => item.data === '\x1b[Z'), 'CLI Shift+Tab');
  assert.equal(await composer.evaluate(node => document.activeElement === node), true);
  await composer.press('ArrowUp'); assert.equal(await composer.inputValue(), '/fix-issue 42');
  await composer.press('End'); await composer.press('ArrowDown'); assert.equal(await composer.inputValue(), '');
  await composer.fill('unfinished'); await composer.press('Home'); await composer.press('ArrowUp');
  assert.equal(await composer.inputValue(), '/fix-issue 42');
  await composer.press('End'); await composer.press('ArrowDown'); assert.equal(await composer.inputValue(), 'unfinished');
  checks.push('project command stays in reading, Shift+Tab and history restores unsent draft');
  await composer.fill('/fix-iss'); await palette.getByRole('option').first().waitFor(); await composer.press('Enter');
  assert.equal(await composer.inputValue(), '/fix-issue ', 'Enter completes a partial command');
  await composer.fill('/fix-issue'); await resetWrites(); await composer.press('Enter');
  await settled('exact command');
  assert.equal(await composer.isVisible(), true);
  await composer.fill('/unknown-reading-command'); await resetWrites(); await composer.press('Enter'); await settled('unknown command');
  assert.deepEqual((await writes()).map(item => item.data), ['/unknown-reading-command', '\r']);
  await composer.fill('!echo reading-fixture'); await resetWrites(); await composer.press('Enter'); await settled('shell mode');
  assert.deepEqual((await writes()).map(item => item.data), ['!echo reading-fixture', '\r']);
  checks.push('partial/exact Enter, unknown command and shell mode');
  const permission = { session_id: 's1', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' };
  await write(hook('notify', permission));
  await waitFor(async () => (await state()).needsInput === permission.message, 'permission reaches renderer'); await raw();
  await page.screenshot({ path: path.join(output, 'permission-terminal.png') });
  await write(hook('stop', { session_id: 's1' }));
  await waitFor(async () => (await state()).needsInput === null, 'stop clears permission'); await reading();
  checks.push('permission automatically opens terminal and stop returns to reading');
  await write(hook('notify', permission)); await raw(); await showReading();
  assert.ok((await terminal.locator('.reading-status').innerText()).includes(`等待你确认：${permission.message}`));
  await showRaw();
  await write(hook('stop', { session_id: 's1' }));
  await waitFor(async () => (await state()).needsInput === null, 'manual choice survives permission clear');
  assert.equal(await composer.count(), 0);
  await showReading();
  await write(hook('start', { session_id: 's1', prompt: 'test interrupt' }));
  await waitFor(async () => (await state()).codexActivity === 'working', 'working fixture');
  // Claude's spinner line while it works (an idle input on screen would mean it has finished).
  await write("Clear-Host; Write-Host ([string][char]0x2736 + ' Osmosing' + [char]0x2026)\r");
  await waitFor(async () => await terminal.locator('.reading-status.is-working').count() > 0, 'working status rendered');
  await composer.fill('/'); await palette.waitFor(); await resetWrites(); await composer.press('Escape');
  await waitFor(async () => await composer.getAttribute('aria-expanded') === 'false', 'palette Escape closes the list');
  assert.deepEqual(await writes(), [], 'palette Escape does not interrupt');
  await composer.press('Escape'); await waitFor(async () => (await writes()).some(item => item.data === '\x1b'), 'Escape interrupts working CLI');
  checks.push('manual view choice and status, palette Escape before interrupt');
  await write("Send-ProjectGridEvent 'codex-started' -Agent 'codex'\r");
  await waitFor(async () => (await state()).agent === 'codex', 'fixture agent changes');
  await composer.fill('/a'); await composer.fill('/');
  await palette.getByRole('option').filter({ has: page.getByText('/plan', { exact: true }) }).waitFor();
  assert.equal(await palette.getByRole('option').filter({ hasText: '/fix-issue' }).count(), 0, 'agent change reloads commands');
  assert.equal(await palette.getByRole('option').filter({ hasText: '/security-review' }).count(), 0);
  checks.push('command list reloads when the terminal agent changes');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ packaged, checks, errors }, null, 2));
  console.log(`PASS: reading palette, typed slash/shell commands, CLI keys, history and permission handoff. Evidence: ${output}`);
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ checks, errors, state: await state(), writes: await writes() }, null, 2)).catch(() => {});
  }
  throw error;
} finally {
  if (app) {
    try {
      if (page && !page.isClosed()) {
        await write('\x03exit\r');
        await waitFor(async () => (await state()).status === 'exited', 'isolated test shell exits');
      }
    } finally { await app.close(); }
  }
}
