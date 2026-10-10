const fs = require('node:fs/promises');
const path = require('node:path');
const { VIDEO_TYPES } = require('../../project-files.cjs');

// What the reading view shows of a document, page or video an agent wrote: the start of a Markdown file, a picture
// of an HTML page, or a video to play. Cards are asked for only once they scroll into view.
const MARKDOWN = new Set(['.md', '.markdown', '.mdx']), HTML = new Set(['.html', '.htm']);
const EXCERPT = 8 * 1024;
const cardKind = file => { const ext = path.extname(file).toLowerCase(); return MARKDOWN.has(ext) ? 'markdown' : HTML.has(ext) ? 'html' : VIDEO_TYPES[ext] ? 'video' : null; };

// The file inside the project, as a path relative to its folder; anything outside it is refused.
function inside(project, file) {
  const absolute = path.resolve(project.path, String(file || ''));
  const relative = path.relative(project.path, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('只能预览项目里的文件。');
  return { absolute, relative };
}

// capture(url) renders a page off screen and returns a small JPEG data URL; pages are captured one at a time and the
// pictures are kept for the latest 60 versions of files.
function createFileCards({ previews, capture }) {
  const pictures = new Map();
  let queue = Promise.resolve();
  const picture = (key, url) => {
    if (pictures.has(key)) return pictures.get(key);
    const job = queue.then(() => capture(url)).catch(() => null);
    queue = job;
    pictures.set(key, job);
    if (pictures.size > 60) pictures.delete(pictures.keys().next().value);
    return job;
  };
  return async function card(project, file) {
    if (project.kind === 'ssh') throw new Error('远程项目暂不支持预览卡片。');
    const kind = cardKind(file);
    if (!kind) throw new Error('这个文件没有预览卡片。');
    const { absolute, relative } = inside(project, file);
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
    const { url, previewId } = previews.open(project, relative, 'html');
    try { return { kind, path: relative, picture: await picture(`${absolute}|${stat.mtimeMs}|${stat.size}`, url) }; }
    finally { previews.close(previewId); }
  };
}

module.exports = { createFileCards, cardKind };
