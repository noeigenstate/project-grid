const { claudeAction, codexActions } = require('./agent-actions.cjs');

// The conversation of a terminal's agent, for the reading view: what the user asked, what the agent
// answered (Markdown), and the tools it called in between. It is read from the records each agent already
// writes (Claude Code's transcript, Codex's rollout), the same ones the activity pane follows, so it shows
// exactly what was said, laid out properly, instead of the terminal's character grid.
//
// An entry is { id, at, role: 'user' | 'assistant' | 'tool', text?, tool? }.
const TEXT_LIMIT = 20000;
// Wrappers the agents put around a prompt that are not what the user typed.
const WRAPPERS = /<(system-reminder|environment_context|user_instructions|command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|task-notification|user-prompt-submit-hook)\b[^>]*>[\s\S]*?<\/\1>/g;
// Claude marks where a pasted image went ("[Image #2]"); the image itself is shown, so the mark goes.
// Only the start of a huge record is cleaned: the wrapper pattern scans to the end for each unclosed tag, and what is
// shown is cut to TEXT_LIMIT anyway.
const CLEAN_LIMIT = 60000;
// Claude Code wraps pasted text in <pasted_content id=…> tags: the text is what was said, the tags are not.
const PASTED = /<\/?pasted_content\b[^>]*>\n?/g;
const clean = text => String(text || '').slice(0, CLEAN_LIMIT).replace(WRAPPERS, '').replace(PASTED, '').replace(/\[Image #\d+\]\s?/g, '').trim();
// Images the user attached to a message, as data URLs the reading view shows: at most four, none over about 2 MB,
// each made small by the main process (setThumbnailer) so a conversation full of screenshots stays light to send.
const IMAGE_LIMIT = 2_800_000;
let shrink = url => url;
function images(parts) {
  return pictures(parts).map(url => { try { return shrink(url) || url; } catch { return url; } });
}
function pictures(parts) {
  const found = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    if (found.length >= 4) break;
    if (part?.type === 'image' && part.source?.type === 'base64' && /^image\/[\w.+-]+$/.test(part.source.media_type || '') && typeof part.source.data === 'string' && part.source.data.length <= IMAGE_LIMIT) found.push(`data:${part.source.media_type};base64,${part.source.data}`);
    else {
      const url = part?.image_url?.url ?? part?.image_url ?? part?.url;
      if (['image', 'input_image'].includes(part?.type) && typeof url === 'string' && /^data:image\/[\w.+-]+;base64,/.test(url) && url.length <= IMAGE_LIMIT) found.push(url);
    }
  }
  return found;
}
const withImages = (entry, parts) => { const attached = images(parts); return attached.length ? { ...entry, images: attached } : entry; };
// A picture Codex generated (its image_gen tool) and saved under generated_images. The reading view shows a small copy
// made from the saved file (the main process sets how, see setThumbnailer), never the full image inline, and opens
// the file itself on a click.
const GENERATED = /[\\/]generated_images[\\/][^\\/]+[\\/][^\\/]+\.(?:png|jpe?g|webp)$/i;
// Codex records the path on the system it runs on; either form of an absolute path is read the same way everywhere.
const isGeneratedImage = file => typeof file === 'string' && (require('node:path').win32.isAbsolute(file) || require('node:path').posix.isAbsolute(file)) && GENERATED.test(file);
let thumbnail = () => null;
// fromFile(path) and fromDataUrl(url) return a small data URL, or null to keep what there is.
function setThumbnailer(fromFile, fromDataUrl = url => url) { thumbnail = fromFile; shrink = fromDataUrl; }
function generatedImage(item, at) {
  const kind = item?.type === 'Extension' ? item.kind : item?.type;
  if (!['image_gen.generation', 'imageGeneration'].includes(kind) || item.status !== 'completed' || !isGeneratedImage(item.savedPath)) return null;
  let src = null;
  try { src = thumbnail(item.savedPath); } catch { }
  if (!src && typeof item.result === 'string' && item.result.length <= IMAGE_LIMIT) src = `data:image/png;base64,${item.result}`;
  if (!src) return null;
  return { id: `g:${item.id}`, at, role: 'assistant', text: '', images: [src], generated: { path: item.savedPath, prompt: bounded(String(item.revisedPrompt || '')) } };
}
const bounded = text => text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}\n\n…` : text;
// A step as the reading view shows it; an edit names the files it left (not deleted ones), so the documents, pages and
// videos among them can be previewed.
const brief = action => ({ kind: action.kind, tool: action.tool, target: action.target, detail: action.detail, done: action.done, failed: action.failed, phrase: action.phrase, object: action.object,
  ...(action.kind === 'edit' && action.files?.length ? { written: action.files.filter(file => file.change !== 'delete').map(file => file.path).slice(0, 8) } : {}) });

// Entries keep their order; a later record about the same entry (a tool that finished) replaces it.
class ConversationLog {
  constructor(changed = () => {}, limit = 400) { this.changed = changed; this.limit = limit; this.list = []; }
  // Records still feed activity tracking during replay, but reading snapshots wait for the file tail.
  beginHistory() { this.loading = true; }
  endHistory() { if (!this.loading) return; this.loading = false; this.changed({ reset: true }); }
  snapshot() { return this.loading ? [] : this.list; }
  reset() { if (!this.list.length) return; this.list = []; this.changed({ reset: true }); }
  put(entry) {
    const index = this.list.findIndex(item => item.id === entry.id);
    if (index >= 0) this.list[index] = entry;
    else { this.list.push(entry); if (this.list.length > this.limit) this.list.shift(); }
    this.changed({ entry });
  }
  // A tool whose result arrived. prefix: a Codex call id covers every step its script made.
  finish(id, failed = false, prefix = false) {
    for (let index = 0; index < this.list.length; index++) {
      const entry = this.list[index];
      if (entry.role !== 'tool' || entry.tool.done || !(prefix ? entry.id.startsWith(`${id}:`) : entry.id === id)) continue;
      const next = { ...entry, tool: { ...entry.tool, done: true, failed } };
      this.list[index] = next; this.changed({ entry: next });
    }
  }
  // A round that ended leaves nothing running.
  settle() {
    for (let index = 0; index < this.list.length; index++) {
      const entry = this.list[index];
      if (entry.role !== 'tool' || entry.tool.done) continue;
      const next = { ...entry, tool: { ...entry.tool, done: true } };
      this.list[index] = next; this.changed({ entry: next });
    }
  }
}

function claudeConversation(log, record, cwd) {
  const queued = record?.type === 'attachment' && record.attachment?.type === 'queued_command' && record.attachment.commandMode !== 'bash' ? record.attachment : null;
  if (queued && !record.isSidechain) {
    const text = clean(typeof queued.prompt === 'string' ? queued.prompt : Array.isArray(queued.prompt) ? queued.prompt.filter(block => block?.type === 'text').map(block => block.text).join('\n') : '');
    const entry = withImages({ id: `u:${record.uuid || record.timestamp}`, at: Date.parse(record.timestamp) || Date.now(), role: 'user', text: bounded(text) }, queued.prompt);
    if (text || entry.images) log.put(entry);
    return;
  }
  if (!record || record.isSidechain || !record.message || record.isMeta) return;
  const content = record.message.content, at = Date.parse(record.timestamp) || Date.now(), base = String(record.uuid || at);
  if (record.type === 'user') {
    if (Array.isArray(content) && content.some(block => block.type === 'tool_result')) {
      for (const block of content) if (block.type === 'tool_result') log.finish(String(block.tool_use_id || ''), block.is_error === true);
      return;
    }
    const text = clean(typeof content === 'string' ? content : Array.isArray(content) ? content.filter(block => block.type === 'text').map(block => block.text).join('\n') : '');
    const entry = withImages({ id: `u:${base}`, at, role: 'user', text: bounded(text) }, content);
    if (text || entry.images) log.put(entry);
    return;
  }
  if (record.type !== 'assistant' || !Array.isArray(content)) return;
  content.forEach((block, index) => {
    const text = block.type === 'text' ? clean(block.text) : '';
    if (text) log.put({ id: `a:${base}:${index}`, at, role: 'assistant', text: bounded(text) });
    else if (block.type === 'tool_use') { const action = claudeAction(block, at, cwd); log.put({ id: action.id, at, role: 'tool', tool: brief(action) }); }
  });
}

// Newer Codex reports each message once as a completed item; older versions as event messages.
function codexMessage(item) {
  const parts = Array.isArray(item?.content) ? item.content : [];
  return clean(parts.map(part => typeof part?.text === 'string' ? part.text : '').join('\n'));
}
function codexConversation(log, record, cwd) {
  if (!record?.payload) return;
  const payload = record.payload, at = Date.parse(record.timestamp) || Date.now();
  if (record.type === 'session_meta') { log.reset(); return; }
  if (record.type === 'event_msg') {
    const picture = payload.type === 'item_completed' ? generatedImage(payload.item, at) : null;
    if (picture) log.put(picture);
    else if (payload.type === 'item_completed' && ['UserMessage', 'AgentMessage'].includes(payload.item?.type)) {
      const text = codexMessage(payload.item), user = payload.item.type === 'UserMessage';
      const entry = { id: `${user ? 'u' : 'a'}:${payload.item.id || at}`, at, role: user ? 'user' : 'assistant', text: bounded(text) };
      const shown = user ? withImages(entry, payload.item.content) : entry;
      if (text || shown.images) log.put(shown);
    } else if (['user_message', 'agent_message'].includes(payload.type) && typeof payload.message === 'string' && clean(payload.message)) {
      log.put({ id: `${payload.type[0]}:${at}:${payload.message.length}`, at, role: payload.type === 'user_message' ? 'user' : 'assistant', text: bounded(clean(payload.message)) });
    } else if (['task_complete', 'turn_completed', 'turn_aborted', 'turn_interrupted'].includes(payload.type)) log.settle();
    return;
  }
  if (record.type !== 'response_item') return;
  if (['custom_tool_call_output', 'function_call_output', 'local_shell_call_output'].includes(payload.type)) { log.finish(String(payload.call_id || ''), false, true); return; }
  for (const action of codexActions(payload, at, cwd)) log.put({ id: action.id, at, role: 'tool', tool: brief(action) });
}

module.exports = { ConversationLog, claudeConversation, codexConversation, clean, brief, generatedImage, isGeneratedImage, setThumbnailer };
