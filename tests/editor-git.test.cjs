const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findConflicts, lineMarks, resolveConflict } = require('../src/features/git/editor-git.ts');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const { readGitRaw, parseDiff, gitEnvironment } = require('../electron/project-git.cjs');

const apply = (text, conflict, choice) => { const { from, to, replacement } = resolveConflict(text, conflict, choice); return text.slice(0, from) + replacement + text.slice(to); };
const middle = 'top\n<<<<<<< HEAD\nours 1\nours 2\n=======\ntheirs\n>>>>>>> feature\nbottom\n';

test('conflict regions are found with their sides; incomplete markers are ignored', () => {
  assert.deepEqual(findConflicts(middle), [{ start: 1, base: null, middle: 4, end: 6, current: 'HEAD', incoming: 'feature' }]);
  assert.deepEqual(findConflicts('<<<<<<< HEAD\nonly the start\n'), []);
  assert.deepEqual(findConflicts('a ======= b\n>>>>>>> not a conflict\n'), []);
  const diff3 = '<<<<<<< ours\nmine\n||||||| base\nold\n=======\nyours\n>>>>>>> theirs';
  assert.deepEqual(findConflicts(diff3), [{ start: 0, base: 2, middle: 4, end: 6, current: 'ours', incoming: 'theirs' }]);
});

test('each choice keeps exactly what the user picked and nothing else changes', () => {
  const [conflict] = findConflicts(middle);
  assert.equal(apply(middle, conflict, 'current'), 'top\nours 1\nours 2\nbottom\n');
  assert.equal(apply(middle, conflict, 'incoming'), 'top\ntheirs\nbottom\n');
  assert.equal(apply(middle, conflict, 'both'), 'top\nours 1\nours 2\ntheirs\nbottom\n');
  // At the end of a file without a final newline, none is added.
  const last = 'x\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> other';
  assert.equal(apply(last, findConflicts(last)[0], 'incoming'), 'x\nb');
  // The base section of a diff3 conflict is dropped with the markers.
  const diff3 = '<<<<<<< ours\nmine\n||||||| base\nold\n=======\nyours\n>>>>>>> theirs\n';
  assert.equal(apply(diff3, findConflicts(diff3)[0], 'both'), 'mine\nyours\n');
  // An empty side leaves nothing behind.
  const empty = 'a\n<<<<<<< HEAD\n=======\nb\n>>>>>>> x\nc\n';
  assert.equal(apply(empty, findConflicts(empty)[0], 'current'), 'a\nc\n');
});

test('Git marks come from the diff hunks: added, modified and the edge where lines were removed', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'project-grid-marks-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => exec('git', ['-C', root, ...args], { env: gitEnvironment(), windowsHide: true, encoding: 'utf8', timeout: 10000 });
  await git('init', '-b', 'main'); await git('config', 'user.name', 'Test'); await git('config', 'user.email', 'test@example.invalid'); await git('config', 'core.autocrlf', 'false');
  const lines = Array.from({ length: 30 }, (_, index) => `line ${index}`);
  const write = (name, value) => fs.writeFile(path.join(root, name), value);
  await write('a.txt', lines.join('\n') + '\n'); await write('gone.txt', 'only\n'); await git('add', '.'); await git('commit', '-m', 'base');
  const marks = async (name, options = {}) => [...lineMarks(parseDiff(await readGitRaw(root, 'diff', { path: name, ...options })), 1000)];

  // First line removed, line 5 changed, two lines added after line 12, lines 20-21 removed.
  const edited = lines.slice(1).map(line => line === 'line 5' ? 'LINE 5' : line);
  edited.splice(edited.indexOf('line 12') + 1, 0, 'new a', 'new b');
  edited.splice(edited.indexOf('line 20'), 2);
  await write('a.txt', edited.join('\n') + '\n');
  assert.deepEqual(await marks('a.txt'), [[0, ' git-deleted-before'], [4, 'git-modified'], [12, 'git-added'], [13, 'git-added'], [20, ' git-deleted-after']]);
  // Staged changes are no longer marked; the next edit is.
  await git('add', 'a.txt'); assert.deepEqual(await marks('a.txt'), []);
  // An untracked file is compared with nothing: every line is added.
  await write('new.txt', 'x\ny\n'); assert.deepEqual(await marks('new.txt', { untracked: true }), [[0, 'git-added'], [1, 'git-added']]);
  // A file emptied of all its lines marks the edge before its first line.
  await write('gone.txt', ''); assert.deepEqual(await marks('gone.txt'), [[0, ' git-deleted-before']]);
  assert.deepEqual([...lineMarks(null, 10)], []);
});
