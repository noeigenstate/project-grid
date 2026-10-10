const fs = require('node:fs/promises');
const path = require('node:path');
const { VIDEO_TYPES, resolveProjectPath } = require('../../project-files.cjs');

// What the reading view shows of a document, page, video or image an agent wrote or named: the start of a Markdown
// file, a picture of an HTML page, a video to play, a small copy of the image. Cards are asked for only once they
// scroll into view.
const MARKDOWN = new Set(['.md', '.markdown', '.mdx']), HTML = new Set(['.html', '.htm']), IMAGES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
// A remote image travels over the SSH connection in pieces the size the remote worker reads at once.
const EXCERPT = 8 * 1024, IMAGE_BYTES = 64 * 1024 * 1024, REMOTE_IMAGE_BYTES = 16 * 1024 * 1024, REMOTE_CHUNK = 256 * 1024;
const cardKind = file => { const ext = path.extname(file).toLowerCase(); return MARKDOWN.has(ext) ? 'markdown' : HTML.has(ext) ? 'html' : VIDEO_TYPES[ext] ? 'video' : IMAGES.has(ext) ? 'image' : null; };
const isImageFile = file => typeof file === 'string' && IMAGES.has(path.extname(file).toLowerCase());
const localPath = value => { const normalized = value.replace(/\\/g, '/'); return process.platform === 'win32' ? normalized.replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\/(?=[a-z]:\/)/i, '') : normalized; };
const checked = file => { if (typeof file !== 'string' || !file || file.length > 4096 || /[\0-\x1f]/.test(file)) throw new Error('无法预览此文件。'); return file; };

// The file inside the project, as a path relative to its folder; anything outside it is refused.
async function inside(project, file, cwd = project.path) {
  const absolute = path.resolve(localPath(cwd), localPath(checked(file)));
  const relative = path.relative(localPath(project.path), absolute).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative) || relative.includes(':')) throw new Error('文件在项目目录之外，无法在此预览。');
  // Use the preview's real-path check too: a junction may lead outside the project.
  try { return { absolute: await resolveProjectPath(project, relative), relative }; }
  catch (error) { if (error.message === '该链接指向项目目录之外，无法在此打开。') throw new Error('文件在项目目录之外，无法在此预览。'); throw error; }
}

// capture(url) renders a page off screen and returns a small JPEG data URL; pages are captured one at a time and the
// pictures are kept for the latest 60 versions of files. shrink(file) and shrinkBytes(buffer) make a small data URL of
// an image (or null).
function createFileCards({ previews, capture, shrink = () => null, shrinkBytes = () => null }) {
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
  // A small copy of an image, made once per version of the file.
  const thumbnail = async (key, make) => {
    if (!pictures.has(key)) { pictures.set(key, Promise.resolve().then(make).catch(() => null)); if (pictures.size > 60) pictures.delete(pictures.keys().next().value); }
    const value = await pictures.get(key);
    if (!value) { pictures.delete(key); throw new Error('无法读取这张图片。'); }
    return value;
  };
  // A project on another computer: the agent names files on that computer, which are read over the connection.
  async function remoteCard(project, file, kind) {
    const connection = previews.remote(project); await connection.ready;
    const root = connection.info.root, value = /^file:\/\//i.test(file) ? decodeURIComponent(new URL(file).pathname) : checked(file);
    const relative = path.posix.relative(root, path.posix.resolve(root, value.replace(/\\/g, '/')));
    if (!relative || relative === '..' || relative.startsWith('../')) throw new Error('文件在项目目录之外，无法在此预览。');
    const stat = await connection.request('stat', { path: relative }).catch(() => null);
    if (!stat?.file) throw new Error(kind === 'image' ? '找不到这张图片。' : '这个文件没有预览卡片。');
    const read = async (length, offset = 0) => Buffer.from(await connection.request('read', { path: relative, offset, length }), 'base64');
    if (kind === 'markdown') return { kind, path: relative, excerpt: (await read(Math.min(EXCERPT, stat.size))).toString('utf8').replace(/�+$/, '') };
    if (kind === 'video') return { kind, path: relative, url: previews.open(project, relative, 'video', VIDEO_TYPES[path.extname(relative).toLowerCase()]).url };
    const key = `${project.id}|${relative}|${stat.modifiedAt}|${stat.size}`;
    if (kind === 'html') return { kind, path: relative, picture: await picture(key, project, relative) };
    if (stat.size > REMOTE_IMAGE_BYTES) throw new Error('图片太大，无法预览。');
    return { kind, path: relative, remote: true, picture: await thumbnail(`image|${key}`, async () => {
      const parts = [];
      for (let offset = 0; offset < stat.size; offset += REMOTE_CHUNK) parts.push(await read(Math.min(REMOTE_CHUNK, stat.size - offset), offset));
      return shrinkBytes(Buffer.concat(parts));
    }) };
  }
  return async function card(project, file, cwd) {
    const kind = cardKind(file);
    if (!kind) throw new Error('这个文件没有预览卡片。');
    if (project.kind === 'ssh') return remoteCard(project, file, kind);
    // An image is only shown here, never served by the preview, so one the agent saved anywhere on this computer (its
    // own output folder, the desktop) is shown as well.
    if (kind === 'image') {
      const absolute = path.resolve(localPath(cwd), localPath(checked(file)));
      const stat = await fs.stat(absolute).catch(() => null);
      if (!stat?.isFile()) throw new Error('找不到这张图片。');
      if (stat.size > IMAGE_BYTES) throw new Error('图片太大，无法预览。');
      return { kind, path: absolute, picture: await thumbnail(`image|${absolute}|${stat.mtimeMs}|${stat.size}`, () => shrink(absolute)) };
    }
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

module.exports = { createFileCards, cardKind, inside, isImageFile };
