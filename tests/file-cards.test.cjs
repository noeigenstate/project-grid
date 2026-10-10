const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFileCards, cardKind } = require('../electron/features/files/file-cards.cjs');
const { brief } = require('../electron/conversation.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-'));
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'guide.md'), '# Guide\n\n' + 'x'.repeat(20000));
  fs.writeFileSync(path.join(root, 'page.html'), '<h1>Page</h1>');
  fs.writeFileSync(path.join(root, 'clip.mp4'), Buffer.alloc(16));
  const opened = [], closed = [];
  const previews = { open: (project, file, kind, mime) => { opened.push([file, kind, mime]); return { previewId: `p${opened.length}`, url: `project-preview://p${opened.length}/${file}` }; }, close: id => closed.push(id) };
  return { project: { id: 'p', kind: 'local', path: root }, previews, opened, closed };
}

test('a Markdown card carries only the start of the file; a video card a preview address', async () => {
  const { project, previews, opened } = fixture();
  const card = createFileCards({ previews, capture: async () => null });
  const doc = await card(project, 'docs/guide.md');
  assert.equal(doc.kind, 'markdown'); assert.equal(doc.path, path.join('docs', 'guide.md'));
  assert.ok(doc.excerpt.startsWith('# Guide') && doc.excerpt.length <= 8192);
  const video = await card(project, path.join(project.path, 'clip.mp4'));
  assert.deepEqual([video.kind, video.path, video.url], ['video', 'clip.mp4', 'project-preview://p1/clip.mp4']);
  assert.deepEqual(opened, [['clip.mp4', 'video', 'video/mp4']]);
});

test('an HTML page is pictured once per version of the file, one page at a time, and its preview closed after', async () => {
  const { project, previews, closed } = fixture();
  let captures = 0, running = 0, most = 0;
  const card = createFileCards({ previews, capture: async url => { captures++; running++; most = Math.max(most, running); await new Promise(resolve => setTimeout(resolve, 20)); running--; return `picture of ${url}`; } });
  const [first, second] = await Promise.all([card(project, 'page.html'), card(project, 'page.html')]);
  assert.equal(first.picture, second.picture);
  assert.equal(captures, 1, 'the same version is pictured once');
  assert.equal(most, 1);
  assert.equal(closed.length, 2, 'each preview address is closed once its card is made');
  fs.writeFileSync(path.join(project.path, 'page.html'), '<h1>Changed page</h1>');
  await card(project, 'page.html');
  assert.equal(captures, 2, 'a changed file is pictured again');
});

test('files outside the project or of other kinds get no card', async () => {
  const { project, previews } = fixture();
  const card = createFileCards({ previews, capture: async () => null });
  await assert.rejects(card(project, '../outside.md'), /只能预览项目里的文件/);
  await assert.rejects(card(project, 'notes.txt'), /没有预览卡片/);
  await assert.rejects(card({ ...project, kind: 'ssh' }, 'docs/guide.md'), /远程项目/);
  assert.equal(cardKind('README.MD'), 'markdown'); assert.equal(cardKind('a/b.htm'), 'html'); assert.equal(cardKind('x.webm'), 'video'); assert.equal(cardKind('x.ts'), null);
});

test('an edit step names the files it wrote for the reading view, not those it deleted', () => {
  const step = brief({ kind: 'edit', tool: 'apply_patch', target: 'a、b', detail: '', done: true, failed: false, files: [{ path: 'docs/a.md', change: 'add' }, { path: 'old.html', change: 'delete' }, { path: 'b.html', change: 'update' }] });
  assert.deepEqual(step.written, ['docs/a.md', 'b.html']);
  assert.equal('written' in brief({ kind: 'command', tool: 'shell', target: 'ls', detail: '', done: true, failed: false }), false);
});
