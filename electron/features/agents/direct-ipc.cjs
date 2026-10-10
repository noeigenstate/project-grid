// What the reading view asks of a Codex session connected directly (no terminal): start it, send a message,
// interrupt the round, answer the card it shows, and the few slash commands it handles itself.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const LIMIT = 1024 * 1024;
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

// Pictures pasted into the reading view arrive as data URLs; Codex reads an attached picture from a file. At most
// four, none over about 10 MB, kept in the system's temporary folder.
async function pictures(images, folder = path.join(os.tmpdir(), 'agentrix-images')) {
  const files = [];
  for (const image of Array.isArray(images) ? images.slice(0, 4) : []) {
    const match = typeof image === 'string' && image.length < 14_000_000 ? /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(image) : null;
    if (!match || !TYPES[match[1]]) continue;
    await fs.mkdir(folder, { recursive: true });
    const file = path.join(folder, `${randomUUID()}.${TYPES[match[1]]}`);
    await fs.writeFile(file, Buffer.from(match[2], 'base64'));
    files.push(file);
  }
  return files;
}

function registerDirectIpc({ handle, findProject, getSession, startDirect, now = () => Date.now() }) {
  const direct = id => {
    findProject(id);
    const s = getSession(id);
    if (!s?.direct || !s.codex || s.status === 'exited') throw new Error('Codex 直连会话未在运行。');
    return s;
  };
  // A direct session that went down reconnects to its own conversation; a terminal starts a new one.
  handle('agent:start', id => { findProject(id); const old = getSession(id); startDirect(id, old?.direct ? old.codex?.threadId || null : null); return true; });
  handle('agent:send', async (id, text, images = []) => {
    const s = direct(id);
    if (typeof text !== 'string' || text.length > LIMIT) throw new Error('无效的文字。');
    const files = await pictures(images);
    if (!text.trim() && !files.length) throw new Error('无效的文字。');
    // What the round was asked, for the activity overview and the spoken notice; the prompt waits in the list until
    // Codex reports it received it.
    s.lastPrompt = text; s.activityInputAt = now();
    s.promptQueue.submit(text, s.codexActivity === 'working');
    await s.codex.send(text, files);
    return true;
  });
  handle('agent:interrupt', async id => { await direct(id).codex.interrupt(); return true; });
  handle('agent:answer', (id, answer) => {
    if (!answer || typeof answer !== 'object') throw new Error('无效的回答。');
    return direct(id).codex.answer(answer);
  });
  handle('agent:command', async (id, name) => {
    const s = direct(id);
    if (name === '/new' || name === '/clear') {
      await s.codex.fresh();
      s.conversation.reset(); s.actions.reset(); s.promptQueue.reset();
      return true;
    }
    if (name === '/compact') { await s.codex.compact(); return true; }
    throw new Error('直连模式暂不支持这个命令。');
  });
}

module.exports = { registerDirectIpc, pictures };
