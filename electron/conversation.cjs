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
const clean = text => String(text || '').replace(WRAPPERS, '').trim();
const bounded = text => text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}\n\n…` : text;
const brief = action => ({ kind: action.kind, tool: action.tool, target: action.target, detail: action.detail, done: action.done, failed: action.failed, phrase: action.phrase, object: action.object });

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
    if (text) log.put({ id: `u:${record.uuid || record.timestamp}`, at: Date.parse(record.timestamp) || Date.now(), role: 'user', text: bounded(text) });
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
    if (text) log.put({ id: `u:${base}`, at, role: 'user', text: bounded(text) });
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
    if (payload.type === 'item_completed' && ['UserMessage', 'AgentMessage'].includes(payload.item?.type)) {
      const text = codexMessage(payload.item);
      if (text) log.put({ id: `${payload.item.type === 'UserMessage' ? 'u' : 'a'}:${payload.item.id || at}`, at, role: payload.item.type === 'UserMessage' ? 'user' : 'assistant', text: bounded(text) });
    } else if (['user_message', 'agent_message'].includes(payload.type) && typeof payload.message === 'string' && clean(payload.message)) {
      log.put({ id: `${payload.type[0]}:${at}:${payload.message.length}`, at, role: payload.type === 'user_message' ? 'user' : 'assistant', text: bounded(clean(payload.message)) });
    } else if (['task_complete', 'turn_completed', 'turn_aborted', 'turn_interrupted'].includes(payload.type)) log.settle();
    return;
  }
  if (record.type !== 'response_item') return;
  if (['custom_tool_call_output', 'function_call_output', 'local_shell_call_output'].includes(payload.type)) { log.finish(String(payload.call_id || ''), false, true); return; }
  for (const action of codexActions(payload, at, cwd)) log.put({ id: action.id, at, role: 'tool', tool: brief(action) });
}

module.exports = { ConversationLog, claudeConversation, codexConversation, clean };
