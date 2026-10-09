// The reading view against the real Claude Code and Codex on this machine, scenario by scenario: Markdown answers,
// tool calls, an interrupted turn, a follow-up, /clear and switching views. After every turn it compares the reading
// view with what the agent did (its own terminal screen and the window's state) and records how long the answer
// took to reach the reading view after the terminal showed it. It spends a few tokens.
// Run: node scripts/reading-live.mjs [claude|codex]
import { testRun } from './test-output.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await testRun('reading-live');
const agents = process.argv[2] ? [process.argv[2]] : ['claude', 'codex'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const check = (agent, scenario, name, ok, detail = '') => { results.push({ agent, scenario, name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${agent} · ${scenario} · ${name}${detail ? ` — ${detail}` : ''}`); };
// Text as words, so Markdown rendering and terminal wrapping compare equal.
const words = text => text.replace(/[`*#>|_\-─│•●⏺⎿]+/g, ' ').replace(/\s+/g, ' ').trim();

for (const agent of agents) {
  const profile = path.join(output, agent, 'profile');
  const project = { id: randomUUID(), name: '阅读实测', path: path.join(root, '.test-output', 'slash-live-project'), restore: { terminal: false, codex: false } };
  await fs.mkdir(profile, { recursive: true }); await fs.mkdir(project.path, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', project.path, ...args], { encoding: 'utf8', windowsHide: true });
  try { git('rev-parse', '--git-dir'); } catch { git('init', '-b', 'main'); git('config', 'user.name', 'Reading Test'); git('config', 'user.email', 'reading@example.invalid'); await fs.writeFile(path.join(project.path, 'README.md'), '# Reading test\n'); git('add', '.'); git('commit', '-m', 'base'); }
  await fs.writeFile(path.join(project.path, 'notes.txt'), 'alpha\nbeta\ngamma\n');
  await fs.writeFile(path.join(profile, 'workspace.json'), JSON.stringify({ version: 2, projects: [project], settings: { terminalRenderer: 'dom', restoreSessions: false, closeToTray: false, notifications: false, sound: false, announce: false, language: 'zh' } }));
  const env = { ...process.env, PROJECT_GRID_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.PROJECT_GRID_DEV_URL;
  for (const name of Object.keys(env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT$|CLAUDE_PID$)/.test(name)) delete env[name];
  const app = await electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env });
  const page = await app.firstWindow();
  let crashed = false; page.on('crash', () => { crashed = true; console.log('renderer crashed'); });
  try {
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setContentSize(1500, 950); window.webContents.setBackgroundThrottling(false); window.setFocusable(false); });
    await page.waitForSelector('.project-panel');
    const card = page.locator(`[data-project-id="${project.id}"]`), terminal = page.locator(`[data-terminal-id="${project.id}"]`), composer = terminal.locator('.reading-composer textarea');
    const state = async () => (await page.evaluate(() => window.projectGrid.getState())).value.projects[0].terminals[0];
    const screenText = async () => (await terminal.locator('.xterm-rows > div').allTextContents()).join('\n');
    const readingText = async () => (await terminal.locator('.reading-content').innerText().catch(() => ''));
    const shot = async name => page.screenshot({ path: path.join(output, agent, `${name}.png`) }).catch(() => {});
    await card.getByRole('button', { name: `全屏查看 ${project.name}`, exact: true }).click();
    await card.getByRole('button', { name: '启动终端', exact: true }).click();
    for (let i = 0; i < 150 && !(await state()).shellReady; i++) await sleep(200);
    await page.evaluate(({ id, agent }) => window.projectGrid.writeTerminal(id, agent + '\r'), { id: project.id, agent });
    for (let i = 0; i < 150 && !(await state()).codexActive; i++) await sleep(300);
    await composer.waitFor({ state: 'visible' }); await sleep(4000);

    // Sends a prompt and waits for the round to end. While it runs, notes when the marker first shows in the terminal
    // and in the reading view, and whether the view says it is working.
    const turn = async (scenario, prompt, marker, { interruptAfter } = {}) => {
      const sent = Date.now();
      await composer.fill(prompt); await composer.press('Enter');
      let inTerminal = null, inReading = null, sawWorking = false, interrupted = false;
      for (let i = 0; i < 600; i++) {
        await sleep(200);
        const s = await state();
        if (await terminal.locator('.reading-status.is-working').count()) sawWorking = true;
        if (marker && inTerminal === null && (await screenText()).includes(marker)) inTerminal = Date.now();
        if (marker && inReading === null && (await readingText()).includes(marker)) inReading = Date.now();
        if (interruptAfter && !interrupted && Date.now() - sent > interruptAfter) { interrupted = true; await composer.press('Escape').catch(() => {}); await page.evaluate(id => window.projectGrid.writeTerminal(id, '\x1b'), project.id); }
        if (Date.now() - sent > 5000 && s.codexActivity !== 'working' && (!marker || inReading !== null || interrupted)) break;
      }
      await sleep(1500);
      const after = await state(), text = await readingText();
      check(agent, scenario, 'showed it was working', sawWorking);
      check(agent, scenario, 'not stuck working afterwards', !(await terminal.locator('.reading-status.is-working').count()), `activity ${after.codexActivity}`);
      check(agent, scenario, 'message box usable afterwards', await composer.isEnabled().catch(() => false));
      check(agent, scenario, 'card no longer working', after.codexActivity !== 'working', after.codexActivity);
      check(agent, scenario, 'prompt shown once', text.split(prompt.slice(0, 18)).length - 1 === 1, `${text.split(prompt.slice(0, 18)).length - 1} times`);
      if (marker && !interrupted) {
        check(agent, scenario, 'answer reached the reading view', inReading !== null);
        if (inTerminal && inReading) check(agent, scenario, 'answer delay after the terminal', inReading - inTerminal < 2500, `${inReading - inTerminal} ms`);
      }
      // No answer block repeated back to back.
      const blocks = await terminal.locator('.reading-assistant').allInnerTexts();
      const repeated = blocks.findIndex((block, index) => index && words(block) && words(block) === words(blocks[index - 1]));
      check(agent, scenario, 'no repeated answer blocks', repeated < 0, repeated < 0 ? '' : words(blocks[repeated]).slice(0, 60));
      await shot(scenario);
      await fs.writeFile(path.join(output, agent, `${scenario}.screen.txt`), await screenText());
      return { text, blocks };
    };

    const markdown = await turn('markdown', '用 Markdown 写一段很短的说明：一个二级标题“示例”，一个三项列表，一个 2 列 2 行的表格，一个 PowerShell 代码块。最后单独一行写 MARK-1。不要调用任何工具。', 'MARK-1');
    check(agent, 'markdown', 'heading, list, table and code rendered', await terminal.locator('.reading-markdown h2').count() > 0 && await terminal.locator('.reading-markdown li').count() >= 3 && await terminal.locator('.reading-markdown table').count() > 0 && await terminal.locator('.reading-code').count() > 0);
    check(agent, 'markdown', 'no raw Markdown left', !/^\s*(##|\|---|```)/m.test(markdown.blocks.join('\n')));

    await turn('tools', '读取 notes.txt 的内容，再运行一个列出当前目录文件的命令，然后用一句话总结。最后单独一行写 MARK-2。', 'MARK-2');
    check(agent, 'tools', 'tool calls grouped', await terminal.locator('.reading-tools').count() > 0);

    await turn('interrupt', '写一篇 1500 字的文章，介绍终端模拟器从电传打字机到现代 GPU 渲染的历史。最后单独一行写 MARK-3。', null, { interruptAfter: 6000 });
    await turn('follow-up', '只回复：MARK-4', 'MARK-4');

    await terminal.locator('.reading-scroll').evaluate(node => { node.scrollTop = 0; });
    await card.locator('.panel-header').getByRole('button', { name: '切换到终端', exact: true }).click();
    await sleep(1500);
    await card.getByRole('button', { name: '阅读视图：按文档排版显示对话', exact: true }).click();
    await composer.waitFor({ state: 'visible' }); await sleep(1500);
    check(agent, 'switch views', 'conversation kept after switching', (await readingText()).includes('MARK-4'));
    check(agent, 'switch views', 'back on the latest message', await terminal.locator('.reading-scroll').evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight < 40));

    await composer.fill('/clear'); await composer.press('Enter');
    const cleared = Date.now();
    await sleep(1500);
    check(agent, 'clear', 'old conversation gone after /clear', !(await readingText()).includes('MARK-4'));
    while (Date.now() - cleared < 15000 && !(await composer.isEnabled().catch(() => false))) await sleep(200);
    check(agent, 'clear', 'message box usable soon after /clear', Date.now() - cleared < 4000, `${Date.now() - cleared} ms`);
    await fs.writeFile(path.join(output, agent, 'clear.screen.txt'), await screenText());
    await shot('clear');
    await turn('after clear', '只回复：MARK-5', 'MARK-5');
    check(agent, 'whole run', 'renderer never crashed', !crashed);
  } catch (error) {
    check(agent, 'harness', 'scenario ran to the end', false, error.message.split('\n')[0]);
    await page.screenshot({ path: path.join(output, agent, 'failure.png') }).catch(() => {});
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
}
await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
const failed = results.filter(result => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Evidence: ${output}`);
process.exitCode = failed.length ? 1 : 0;
