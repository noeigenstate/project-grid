function registerClipboardIpc({ handle, clipboardWrites, clipboard }) {
  handle('clipboard:copy', async text => {
    if (typeof text !== 'string') throw new Error('无效的剪贴板内容。');
    await clipboardWrites.commit(clipboardWrites.reserve(), () => clipboard.writeText(text));
  });
  handle('clipboard:read', () => clipboard.readText());
}

module.exports = { registerClipboardIpc };
