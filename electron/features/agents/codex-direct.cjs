const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { codexActions } = require('../../agent-actions.cjs');
const { generatedImage } = require('../../conversation.cjs');

// Codex without its terminal: the reading view talks to `codex app-server` (JSON-RPC, one message per line on
// stdio), the same protocol Codex's IDE extensions use. The answer arrives word by word, a round starts and ends
// with explicit events, and approvals and questions come as requests to answer, so nothing is read off a screen
// and a new Codex release that redraws its terminal changes nothing here.

// The shell wrapper Codex puts around a command on each system, so the step names the command itself.
const WRAPPED = /^\s*"?[^"]*?(?:powershell|pwsh)(?:\.exe)?"?\s+(?:-NoProfile\s+)?-Command\s+(['"])([\s\S]*)\1\s*$|^\s*"?[^"]*?\b(?:bash|zsh|sh)"?\s+-l?c\s+(['"])([\s\S]*)\3\s*$/i;
const innerCommand = command => { const match = WRAPPED.exec(String(command || '')); return match ? match[2] ?? match[4] : String(command || ''); };
const text = content => (Array.isArray(content) ? content : []).filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n').trim();
const FILE_CHANGES = { add: 'add', delete: 'delete', update: 'update' };
// What the reading view shows of an answer, as for Codex in a terminal: the first 20,000 characters.
const shown = answer => answer.length > 20000 ? `${answer.slice(0, 20000)}\n\n…` : answer;
// The pictures a message carried, as data URLs the reading view shows: at most four, none over about 2 MB.
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
function pictures(content) {
  const found = [];
  for (const part of Array.isArray(content) ? content : []) {
    if (found.length >= 4) break;
    if (part?.type === 'image' && typeof part.url === 'string' && /^data:image\/[\w.+-]+;base64,/.test(part.url) && part.url.length <= 2_800_000) found.push(part.url);
    const type = part?.type === 'localImage' && typeof part.path === 'string' ? IMAGE_TYPES[path.extname(part.path).toLowerCase()] : null;
    if (!type) continue;
    try { const data = fs.readFileSync(part.path); if (data.length <= 2_000_000) found.push(`data:${type};base64,${data.toString('base64')}`); } catch { }
  }
  return found;
}
const brief = action => ({ kind: action.kind, tool: action.tool, target: action.target, detail: action.detail, done: action.done, failed: action.failed, phrase: action.phrase, object: action.object });

// What a tool item is, as the step the activity pane and the reading view name.
function itemAction(item, at, cwd) {
  const base = { id: String(item.id), at, detail: '', description: '', done: false, failed: false };
  if (item.type === 'commandExecution') {
    const [action] = codexActions({ type: 'function_call', name: 'shell', call_id: item.id, arguments: JSON.stringify({ command: innerCommand(item.command) }) }, at, cwd);
    return action && { ...action, id: String(item.id) };
  }
  if (item.type === 'fileChange') {
    const files = (item.changes || []).map(change => ({ path: String(change.path || ''), change: FILE_CHANGES[change.kind?.type] || 'update' }));
    return { ...base, kind: 'edit', tool: 'apply_patch', target: files.slice(0, 3).map(file => file.path).join('、') + (files.length > 3 ? ` +${files.length - 3}` : ''), files };
  }
  if (item.type === 'mcpToolCall') return { ...base, kind: 'mcp', tool: `mcp__${item.server}__${item.tool}`, target: `${item.server} · ${item.tool}`, server: String(item.server || '') };
  if (item.type === 'webSearch') return { ...base, kind: 'web', tool: 'web_search', target: String(item.query || item.action?.query || '') };
  if (item.type === 'dynamicToolCall') return { ...base, kind: 'other', tool: String(item.tool || ''), target: String(item.tool || '') };
  if (item.type === 'collabAgentToolCall') return { ...base, kind: 'agent', tool: 'agent', target: String(item.prompt || '').slice(0, 160) };
  return null;
}
const failedItem = item => ['failed', 'declined'].includes(item.status) || (item.type === 'commandExecution' && typeof item.exitCode === 'number' && item.exitCode !== 0) || !!item.error;

// Turns app-server notifications into the conversation, the steps and the round's state. conversation and actions are
// the session's ConversationLog and ActionLog; turn(state, turnId) reports working / complete / interrupted.
class CodexEvents {
  constructor({ conversation, actions, cwd, turn = () => {}, now = Date.now }) {
    Object.assign(this, { conversation, actions, cwd, turn, now });
    this.answers = new Map(); this.turnId = null;
  }
  notify(method, params = {}) {
    const at = this.now();
    if (method === 'turn/started') { this.turnId = params.turn?.id || null; this.turn('working', this.turnId); return; }
    if (method === 'turn/completed') {
      const status = params.turn?.status;
      // An answer cut short never completes; what it said stays in the conversation, not here.
      this.answers.clear();
      this.actions.settle(); this.conversation.settle();
      this.turn(status === 'interrupted' ? 'interrupted' : 'complete', params.turn?.id || this.turnId, status === 'failed' ? params.turn?.error?.message || '' : '');
      this.turnId = null; return;
    }
    if (method === 'item/agentMessage/delta') {
      const id = String(params.itemId || ''), so = (this.answers.get(id) || '') + String(params.delta || '');
      this.answers.set(id, so);
      if (so.trim()) this.conversation.put({ id: `a:${id}`, at, role: 'assistant', text: shown(so) });
      return;
    }
    if (method !== 'item/started' && method !== 'item/completed') return;
    const item = params.item || {}, done = method === 'item/completed';
    if (item.type === 'userMessage') {
      const said = text(item.content), shown = done ? pictures(item.content) : [];
      if (done && (said || shown.length)) this.conversation.put({ id: `u:${item.id}`, at, role: 'user', text: said, ...(shown.length ? { images: shown } : {}) });
      return;
    }
    const picture = done ? generatedImage(item, at) : null;
    if (picture) { this.conversation.put(picture); return; }
    if (item.type === 'agentMessage') {
      if (!done) return;
      this.answers.delete(String(item.id));
      if (String(item.text || '').trim()) this.conversation.put({ id: `a:${item.id}`, at, role: 'assistant', text: shown(String(item.text)) });
      return;
    }
    const action = itemAction(item, at, this.cwd);
    if (!action) return;
    if (!done) { this.actions.add(action); this.conversation.put({ id: action.id, at, role: 'tool', tool: brief(action) }); return; }
    const failed = failedItem(item);
    // A file change is only known once its patch is final: name its files from the completed item.
    if (item.type === 'fileChange') { const known = this.actions.list.find(entry => entry.id === action.id); if (known) Object.assign(known, { target: action.target, files: action.files }); }
    this.actions.finish(action.id, failed);
    const finished = this.actions.list.find(entry => entry.id === action.id) || { ...action, done: true, failed };
    this.conversation.put({ id: action.id, at: finished.at, role: 'tool', tool: brief(finished) });
  }
}

// A question or approval Codex is waiting on, in the form the reading view shows as a card.
function cardFor(method, params) {
  if (method === 'item/commandExecution/requestApproval' || method === 'execCommandApproval') {
    return { kind: 'approval', subject: 'command', title: params.reason || '', detail: innerCommand(params.command || (Array.isArray(params.command) ? params.command.join(' ') : '')), options: ['accept', 'acceptForSession', 'decline'] };
  }
  if (method === 'item/fileChange/requestApproval' || method === 'applyPatchApproval') {
    return { kind: 'approval', subject: 'files', title: params.reason || '', detail: params.grantRoot || '', options: ['accept', 'acceptForSession', 'decline'] };
  }
  if (method === 'item/tool/requestUserInput') {
    return { kind: 'question', questions: (params.questions || []).map(question => ({ id: String(question.id), header: String(question.header || ''), question: String(question.question || ''),
      other: !!question.isOther, secret: !!question.isSecret, options: (question.options || []).map(option => ({ label: String(option.label || ''), description: String(option.description || '') })) })) };
  }
  return null;
}
// The reply Codex expects for a card's answer.
function replyFor(method, answer) {
  if (method === 'item/tool/requestUserInput') return { answers: Object.fromEntries(Object.entries(answer?.answers || {}).map(([id, values]) => [id, { answers: [].concat(values).map(String) }])) };
  const decision = ['accept', 'acceptForSession', 'decline', 'cancel'].includes(answer?.decision) ? answer.decision : 'cancel';
  // The older approval requests answer with the legacy review decisions.
  if (method === 'execCommandApproval' || method === 'applyPatchApproval') return { decision: { accept: 'approved', acceptForSession: 'approved_for_session', decline: 'denied', cancel: 'abort' }[decision] };
  return { decision };
}

// One app-server process, newline-delimited JSON-RPC 2.0 over its stdio.
class AppServer {
  constructor({ command = 'codex', cwd, env, spawnProcess = spawn }) {
    this.child = spawnProcess(command, ['app-server'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: process.platform === 'win32' });
    this.sequence = 0; this.pending = new Map(); this.buffer = ''; this.listeners = { notification: [], request: [], exit: [] };
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.read(chunk));
    this.child.stderr.on('data', () => {});
    const end = error => { for (const { reject } of this.pending.values()) reject(error); this.pending.clear(); for (const listener of this.listeners.exit) listener(error); this.listeners.exit = []; };
    this.child.on('error', error => end(error));
    this.child.on('exit', code => end(new Error(`Codex 已退出（代码 ${code ?? '?'}）。`)));
  }
  on(event, listener) { this.listeners[event].push(listener); }
  // A message can arrive in many chunks: only what came in is searched for its line end, and complete lines are cut
  // from the buffer once per chunk.
  read(chunk) {
    const searched = this.buffer.length;
    this.buffer += chunk;
    let start = 0, at = this.buffer.indexOf('\n', searched);
    const lines = [];
    while (at >= 0) { lines.push(this.buffer.slice(start, at)); start = at + 1; at = this.buffer.indexOf('\n', start); }
    if (start) this.buffer = this.buffer.slice(start);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let message; try { message = JSON.parse(line); } catch { continue; }
      if (message.id !== undefined && !message.method) {
        const waiting = this.pending.get(message.id); if (!waiting) continue;
        this.pending.delete(message.id);
        if (message.error) waiting.reject(new Error(message.error.message || 'Codex 拒绝了请求。')); else waiting.resolve(message.result);
      } else if (message.method && message.id !== undefined) for (const listener of this.listeners.request) listener(message.id, message.method, message.params || {});
      else if (message.method) for (const listener of this.listeners.notification) listener(message.method, message.params || {});
    }
  }
  write(message) { if (this.child.stdin.writable) this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n'); }
  request(method, params) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.write({ id, method, params }); });
  }
  notify(method, params) { this.write(params ? { method, params } : { method }); }
  respond(id, result) { this.write({ id, result }); }
  close() { try { this.child.stdin.end(); } catch { } try { this.child.kill(); } catch { } }
}

// A Codex conversation in one project folder. events: what to tell the session (see CodexEvents); card(card) reports
// the question or approval waiting on the reader, or null; info(info) reports the model and token use.
class CodexDirect {
  constructor({ cwd, env, conversation, actions, turn, card = () => {}, info = () => {}, exit = () => {}, version = '0', server = options => new AppServer(options) }) {
    Object.assign(this, { cwd, card, info, version });
    this.events = new CodexEvents({ conversation, actions, cwd, turn });
    this.server = server({ cwd, env });
    this.waiting = null; this.threadId = null;
    this.server.on('notification', (method, params) => {
      if (method === 'thread/tokenUsage/updated') info({ tokens: params.tokenUsage || params });
      else if (method === 'account/rateLimits/updated') info({ rateLimits: params.rateLimits || params });
      else if (method === 'serverRequest/resolved' && this.waiting) { this.waiting = null; card(null); }
      this.events.notify(method, params);
    });
    this.server.on('request', (id, method, params) => {
      const shown = cardFor(method, params);
      // Nothing the reader can answer (a token refresh, an attestation): decline so Codex is never left waiting.
      if (!shown) { this.server.write({ id, error: { code: -32601, message: 'Not supported by Agentrix' } }); return; }
      this.waiting = { id, method }; card(shown);
    });
    this.server.on('exit', exit);
  }
  async start(threadId = null) {
    await this.server.request('initialize', { clientInfo: { name: 'agentrix', title: 'Agentrix', version: this.version }, capabilities: { experimentalApi: false, requestAttestation: false } });
    this.server.notify('initialized');
    const result = threadId ? await this.server.request('thread/resume', { threadId, cwd: this.cwd }) : await this.server.request('thread/start', { cwd: this.cwd });
    this.threadId = result.thread.id;
    // A resumed conversation brings its earlier turns: they become the history the reading view opens with; the
    // activity pane shows only the round to come.
    const turns = result.thread.turns || [];
    if (turns.length) {
      const { conversation, actions } = this.events;
      conversation.beginHistory();
      // The reading view keeps the latest 400 entries: older items are not converted at all.
      const items = turns.flatMap(turn => turn.items || []).slice(-conversation.limit);
      for (const item of items) this.events.notify('item/completed', { item });
      conversation.settle(); conversation.endHistory(); actions.reset();
    }
    this.info({ threadId: this.threadId, model: result.model || '', effort: result.reasoningEffort || '' });
    return result;
  }
  // A message while a round runs joins that round, as typing into Codex's own box does.
  async send(message, images = []) {
    const input = [...(message.trim() ? [{ type: 'text', text: message, text_elements: [] }] : []), ...images.map(file => ({ type: 'localImage', path: file }))];
    const turnId = this.events.turnId;
    if (turnId) return this.server.request('turn/steer', { threadId: this.threadId, expectedTurnId: turnId, input });
    return this.server.request('turn/start', { threadId: this.threadId, input });
  }
  async interrupt() { if (this.events.turnId) await this.server.request('turn/interrupt', { threadId: this.threadId, turnId: this.events.turnId }); }
  answer(answer) {
    if (!this.waiting) return false;
    const { id, method } = this.waiting; this.waiting = null; this.card(null);
    this.server.respond(id, replyFor(method, answer)); return true;
  }
  compact() { return this.server.request('thread/compact/start', { threadId: this.threadId }); }
  models() { return this.server.request('model/list', {}); }
  async fresh() { const result = await this.server.request('thread/start', { cwd: this.cwd }); this.threadId = result.thread.id; this.info({ threadId: this.threadId, model: result.model || '' }); return result; }
  dispose() { this.server.close(); }
}

module.exports = { CodexDirect, CodexEvents, AppServer, cardFor, replyFor, innerCommand, itemAction };
