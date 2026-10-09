// Command Prompt terminals: the shell chosen in settings starts, reports its prompt and directory,
// runs codex through the same wrapper as PowerShell, and restores an interrupted session with "继续".
import { testRun } from './test-output.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import { waitFor } from './wait.mjs';

const require = createRequire(import.meta.url);
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await testRun('cmd');
const dataDir = path.join(output, 'profile'), codexHome = path.join(output, 'codex-home'), bin = path.join(output, 'bin');
const project = { id: randomUUID(), name: '命令提示符项目', path: path.join(output, '命令提示符 项目'), kind: 'local', seenEvents: [] };
const sessionId = randomUUID();
for (const folder of [dataDir, path.join(codexHome, 'sessions'), bin, path.join(project.path, 'sub')]) await fs.mkdir(folder, { recursive: true });
await exec(path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:exe', '/reference:System.Web.Extensions.dll', `/out:${path.join(bin, 'codex.exe')}`, path.join(root, 'tests/fixtures/restore-codex.cs')], { windowsHide: true });
// An interrupted Codex turn from the last run, owned by this project.
await fs.writeFile(path.join(codexHome, 'sessions', `rollout-${sessionId}.jsonl`), [
  { type: 'session_meta', payload: { id: sessionId, cwd: project.path, source: 'cli' } },
  { type: 'event_msg', payload: { type: 'task_started' } },
].map(value => JSON.stringify(value)).join('\n') + '\n');
// These checks read the terminal's rows as HTML, so the compatible (DOM) renderer draws them; gpu-terminal-smoke covers the GPU one.
await fs.writeFile(path.join(dataDir, 'workspace.json'), JSON.stringify({ version: 2, projects: [{ ...project, restore: { terminal: true, codex: true, cwd: project.path, threadId: sessionId } }], settings: { terminalRenderer: 'dom', shell: 'cmd', restoreSessions: true, notifications: false, sound: false, announce: false, closeToTray: false } }));
const env = { ...process.env, PROJECT_GRID_DATA_DIR: dataDir, PROJECT_GRID_TEST_RESTORE: '1', CODEX_HOME: codexHome };
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path'); env[pathKey] = bin + path.delimiter + env[pathKey];
delete env.ELECTRON_RUN_AS_NODE; delete env.PROJECT_GRID_DEV_URL;
const packaged = process.argv.includes('--packaged');
let application, page;
const terminal = async () => (await page.evaluate(() => window.projectGrid.getState())).value.projects[0].terminals[0];
const receipt = async () => { try { return JSON.parse(await fs.readFile(path.join(project.path, 'resume-receipt.json'), 'utf8')); } catch { return null; } };
try {
  application = await electron.launch({ executablePath: packaged ? path.join(root, 'release/win-unpacked/Project Grid.exe') : require('electron'), args: packaged ? [] : [root], cwd: root, env, timeout: 30000 });
  page = await application.firstWindow();
  await page.waitForSelector('.project-panel');
  await waitFor(receipt, 'the interrupted session is resumed through Command Prompt', 60000);
  assert.deepEqual((await receipt()).args.slice(4), ['resume', sessionId, '继续'], 'cmd passes the resume arguments, Chinese included, through the codex wrapper');
  assert.equal((await terminal()).shell, 'cmd');
  await waitFor(async () => (await terminal()).codexActive, 'the wrapper reports Codex as started');
  await page.screenshot({ path: path.join(output, 'cmd-codex.png') });
  // Leaving Codex returns to the cmd prompt, which reports itself through its invisible marker.
  await page.evaluate(id => window.projectGrid.writeTerminal(id, '\x03'), project.id);
  await waitFor(async () => { const state = await terminal(); return !state.codexActive && state.shellReady; }, 'back at the cmd prompt after Codex exits');
  await page.evaluate(id => window.projectGrid.writeTerminal(id, 'cd sub\r'), project.id);
  await waitFor(async () => { const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'workspace.json'), 'utf8')); return saved.projects[0].restore.cwd === path.join(project.path, 'sub'); }, 'the prompt reports the new directory');
  const text = await page.locator('.xterm-rows').first().innerText();
  // The welcome has scrolled away under Codex's output; the new prompt is on screen.
  await waitFor(async () => (await page.locator('.xterm-rows').first().innerText()).includes(`${path.join(project.path, 'sub')}>`), 'the cmd prompt shows the new directory');
  assert.ok(!text.includes('6973') && !text.includes('ProjectGrid;prompt'), 'the prompt marker stays invisible');
  await page.screenshot({ path: path.join(output, 'cmd-prompt.png') });
  console.log('PASS: Command Prompt terminals start from settings, report prompts and directories, run codex through the wrapper and resume interrupted sessions with 继续');
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
} finally { if (application) await application.close(); }
