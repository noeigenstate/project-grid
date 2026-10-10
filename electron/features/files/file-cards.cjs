const fs = require('node:fs/promises');
const path = require('node:path');
const { VIDEO_TYPES, resolveProjectPath } = require('../../project-files.cjs');

// What the reading view shows of a document, page or video an agent wrote: the start of a Markdown file, a picture
// of an HTML page, or a video to play. Cards are asked for only once they scroll into view.
const MARKDOWN = new Set(['.md', '.markdown', '.mdx']), HTML = new Set(['.html', '.htm']);
const EXCERPT = 8 * 1024;
const cardKind = file => { const ext = path.extname(file).toLowerCase(); return MARKDOWN.has(ext) ? 'markdown' : HTML.has(ext) ? 'html' : VIDEO_TYPES[ext] ? 'video' : null; };
const localPath = value => { const normalized = value.replace(/\\/g, '/'); return process.platform === 'win32' ? normalized.replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\/(?=[a-z]:\/)/i, '') : normalized; };

// The file inside the project, as a path relative to its folder; anything outside it is refused.
async function inside(project, file, cwd = project.path) {
  if (typeof file !== 'string' || !file || file.length > 4096 || /[\0-\x1f]/.test(file)) throw new Error('无法预览此文件。');
  const absolute = path.resolve(localPath(cwd), localPath(file));
  const relative = path.relative(localPath(project.path), absolute).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative) || relative.includes(':')) throw new Error('文件在项目目录之外，无法在此预览。');
  // Use the preview's real-path check too: a junction may lead outside the project.
  try { return { absolute: await resolveProjectPath(project, relative), relative }; }
  catch (error) { if (error.message === '该链接指向项目目录之外，无法在此打开。') throw new Error('文件在项目目录之外，无法在此预览。'); throw error; }
}

// capture(url) renders a page off screen and returns a small JPEG data URL; pages are captured one at a time and the
// pictures are kept for the latest 60 versions of files.
function createFileCards({ previews, capture }) {
  const pictures = new Map();
  let queue = Promise.resolve();
  const picture = (key, project, relative) => {
    if (pictures.has(key)) return pictures.get(key);
    // Allocate the short-lived URL only when capturing, so queued cards cannot expire it.
    const job = queue.then(async () => {
      const { url, previewId } = previews.open(project, relative, 'html');
      try { return await capture(url); } finally { previews.close(previewId); }
    }).catch(() => null).then(value => { if (!value && pictures.get(key) === job) pictures.delete(key); return value; });
    queue = job;
    pictures.set(key, job);
    if (pictures.size > 60) pictures.delete(pictures.keys().next().value);
    return job;
  };
  return async function card(project, file, cwd) {
    if (project.kind === 'ssh') throw new Error('远程项目暂不支持预览卡片。');
    const kind = cardKind(file);
    if (!kind) throw new Error('这个文件没有预览卡片。');
    const { absolute, relative } = await inside(project, file, cwd);
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) throw new Error('这个文件没有预览卡片。');
    if (kind === 'markdown') {
      const handle = await fs.open(absolute, 'r');
      try {
        const { buffer, bytesRead } = await handle.read(Buffer.alloc(Math.min(EXCERPT, stat.size)), 0, Math.min(EXCERPT, stat.size), 0);
        return { kind, path: relative, excerpt: buffer.subarray(0, bytesRead).toString('utf8').replace(/�+$/, '') };
      } finally { await handle.close(); }
    }
    if (kind === 'video') return { kind, path: relative, url: previews.open(project, relative, 'video', VIDEO_TYPES[path.extname(relative).toLowerCase()]).url };
    return { kind, path: relative, picture: await picture(`${project.path}|${absolute}|${stat.mtimeMs}|${stat.ctimeMs}|${stat.size}`, project, relative) };
  };
}

module.exports = { createFileCards, cardKind, inside };
