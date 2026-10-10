const { test } = require('node:test');
const assert = require('node:assert/strict');
const { replyImages } = require('../src/features/reading/reply-images.ts');

test('a reply naming a local image shows it: backticks, Markdown images and links, bare paths', () => {
  assert.deepEqual(replyImages('我用 Codex 生成了这张照片，已经保存到 `C:\\Users\\ylc\\Desktop\\生图\\img\\dog_on_lawn.png`（1536×1024，约 2.6 MB）。'),
    ['C:\\Users\\ylc\\Desktop\\生图\\img\\dog_on_lawn.png']);
  assert.deepEqual(replyImages('保存到C:\\Users\\ylc\\生图\\dog.png（1536×1024）。'), ['C:\\Users\\ylc\\生图\\dog.png']);
  assert.deepEqual(replyImages('![dog](C:/out/my%20dog.png) and ![x](<C:/a b/c.jpg>)'), ['C:/out/my dog.png', 'C:/a b/c.jpg']);
  assert.deepEqual(replyImages('relative ./img/a.png, img/b.jpeg and c.gif.'), ['./img/a.png', 'img/b.jpeg', 'c.gif']);
  assert.deepEqual(replyImages('/home/me/pics/cat.webp'), ['/home/me/pics/cat.webp']);
  assert.deepEqual(replyImages('file:///C:/x/y.webp'), ['C:/x/y.webp']);
  // The same file named twice, in backticks and then bare, is one picture.
  assert.deepEqual(replyImages('`C:\\out\\a.png` — C:/out/a.png'), ['C:\\out\\a.png']);
});

test('web addresses, other files and pictures Codex generated itself are left alone', () => {
  assert.deepEqual(replyImages('see https://example.com/a.png and ![x](https://example.com/b.jpg)'), []);
  assert.deepEqual(replyImages('report.pngx, a.png.bak and notes.md'), []);
  assert.deepEqual(replyImages('saved C:\\Users\\u\\.codex\\generated_images\\t\\a.png'), []);
  assert.deepEqual(replyImages('no pictures here at all'), []);
});

test('pictures come in the order the reply names them', () => {
  assert.deepEqual(replyImages('first `C:\\out\\dog.png`, then ![cat](C:/out/cat.jpg) and C:\\out\\bird.webp'), ['C:\\out\\dog.png', 'C:/out/cat.jpg', 'C:\\out\\bird.webp']);
});
