const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { normalizeSSH } = require('./ssh-config.cjs');
const SUMMARY_PRESETS = require('./summary-presets.json');
const { MODELS: VOICE_MODELS, DEFAULT_MODEL: DEFAULT_VOICE_MODEL } = require('./voice.cjs');

// Local folders once opened as projects, newest first, so a removed project can be added again in one click.
const HISTORY_LIMIT = 30;
const folderKey = folder => process.platform === 'win32' ? folder.toLowerCase() : folder;
function cleanHistory(input) {
  const seen = new Set();
  return (Array.isArray(input) ? input : []).filter(item => {
    if (!item || typeof item.path !== 'string' || item.path.length > 4096 || !path.isAbsolute(item.path) || seen.has(folderKey(item.path))) return false;
    seen.add(folderKey(item.path)); return true;
  }).slice(0, HISTORY_LIMIT).map(item => ({ path: item.path, name: String(item.name || path.basename(item.path) || item.path).slice(0, 120), lastOpenedAt: Number.isSafeInteger(item.lastOpenedAt) ? item.lastOpenedAt : 0 }));
}

// Which coding agent a terminal restores (Codex unless recorded as Claude Code), whether its last Claude turn was
// left unfinished, and whether Codex ran connected directly (no terminal). Only non-default values are stored.
const agentFields = restore => ({ ...(restore?.agent === 'claude' ? { agent: 'claude' } : {}), ...(restore?.interrupted === true ? { interrupted: true } : {}), ...(restore?.direct === true ? { direct: true } : {}) });

const defaults = { codexDirect: false, surface: 'glass', glassBackground: 'theme', glassTransparency: null, terminalRenderer: 'gpu', autoSave: true, activityPane: true, notifications: true, sound: true, announce: true, announcePhrase: '', language: 'zh', shortcuts: {}, guideVersion: '', shell: 'powershell', closeToTray: true, explorerCollapsed: false, fontSize: 12, terminalFontWeight: 400, terminalFontFamily: '', terminalCjkFontFamily: '', restoreSessions: true, focusAnimation: 'smooth', theme: 'daylight', voiceModel: DEFAULT_VOICE_MODEL };

// Keyboard shortcuts the user changed, by action; defaults live in the window (src/features/shortcuts/shortcuts.ts).
// "Ctrl+Shift+F": Ctrl, Alt and Shift in that order, then one letter, digit, F-key or punctuation key.
const SHORTCUT_ACTIONS = ['search', 'addProject', 'voice', 'overview', 'explorer', 'settings', 'nextProject', 'previousProject', 'maximize', 'fullscreen', 'newTerminal'];
const SHORTCUT = /^(?:(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:F(?:[1-9]|1[0-2]))|(?=Ctrl\+|Alt\+)(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:[A-Z0-9,./;'[\]\\=`-]|Space|Tab|Enter))$/;
function cleanShortcuts(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(SHORTCUT_ACTIONS.filter(action => typeof input[action] === 'string' && SHORTCUT.test(input[action])).map(action => [action, input[action]]));
}

// What the spoken notice says and who writes it. fast: the prompt's first sentence, at once (the default).
// agent: the round's own CLI sums it up. cloud / local: a model reached over HTTP. Only the provider, the
// address and the model name are kept here; an API key is stored encrypted elsewhere (summary-models.cjs).
function cleanEndpoint(input, target) {
  const preset = SUMMARY_PRESETS[target].find(item => item.id === input?.provider) || SUMMARY_PRESETS[target][0];
  const text = (value, limit) => typeof value === 'string' ? value.replace(/[\0-\x1f\x7f]/g, '').trim().slice(0, limit) : null;
  return { provider: preset.id, protocol: preset.id === 'custom' && input?.protocol === 'anthropic' ? 'anthropic' : preset.protocol, baseUrl: text(input?.baseUrl, 300) || preset.baseUrl, model: text(input?.model, 120) ?? preset.model };
}
function cleanSummarySettings(input) {
  return { mode: ['fast', 'agent', 'cloud', 'local'].includes(input?.mode) ? input.mode : 'fast', cloud: cleanEndpoint(input?.cloud, 'cloud'), local: cleanEndpoint(input?.local, 'local') };
}

function cleanSettings(input = {}) {
  return {
    fontSize: Number.isInteger(input.fontSize) && input.fontSize >= 10 && input.fontSize <= 20 ? input.fontSize : defaults.fontSize,
    terminalFontWeight: [400, 500, 600].includes(input.terminalFontWeight) ? input.terminalFontWeight : defaults.terminalFontWeight,
    terminalFontFamily: typeof input.terminalFontFamily === 'string' && input.terminalFontFamily.length <= 80 && !/[\u0000-\u001f\u007f]/.test(input.terminalFontFamily) ? input.terminalFontFamily.trim() : defaults.terminalFontFamily,
    terminalCjkFontFamily: typeof input.terminalCjkFontFamily === 'string' && input.terminalCjkFontFamily.length <= 80 && !/[\u0000-\u001f\u007f]/.test(input.terminalCjkFontFamily) ? input.terminalCjkFontFamily.trim() : defaults.terminalCjkFontFamily,
    focusAnimation: ['smooth', 'system', 'off'].includes(input.focusAnimation) ? input.focusAnimation : defaults.focusAnimation,
    theme: ['daylight', 'forest', 'mountain-blue', 'wild-red', 'mono-amber', 'mono-amber-dark'].includes(input.theme) ? input.theme : defaults.theme,
    language: ['zh', 'en'].includes(input.language) ? input.language : defaults.language,
    // glass: translucent panes over the wallpaper. solid: opaque panes, on which Windows draws text with
    // ClearType and nothing is blurred behind them.
    surface: input.surface === 'solid' ? 'solid' : 'glass',
    // Kept when toggling solid/glass.
    glassBackground: input.glassBackground === 'desktop' ? 'desktop' : 'theme',
    glassTransparency: Number.isInteger(input.glassTransparency) && input.glassTransparency >= 0 && input.glassTransparency <= 100 ? input.glassTransparency : defaults.glassTransparency,
    terminalRenderer: input.terminalRenderer === 'dom' ? 'dom' : 'gpu',
    summary: cleanSummarySettings(input.summary),
    // The offline recognizer for dictation (voice.cjs).
    voiceModel: Object.hasOwn(VOICE_MODELS, input.voiceModel) ? input.voiceModel : defaults.voiceModel,
    shortcuts: cleanShortcuts(input.shortcuts),
    // Shell for local terminals: PowerShell or Command Prompt on Windows, Bash or zsh on Linux (until one is
    // chosen there, the login shell's kind). SSH projects always use Bash on the server.
    shell: ['cmd', 'bash', 'zsh'].includes(input.shell) ? input.shell : 'powershell',
    // The app version whose usage guide was last shown; a newer version shows it again.
    guideVersion: typeof input.guideVersion === 'string' && /^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(input.guideVersion) ? input.guideVersion : '',
    // Spoken completion phrase; empty uses the built-in phrases. {项目} or {project} is the project name.
    announcePhrase: typeof input.announcePhrase === 'string' ? input.announcePhrase.replace(/[\0-\x1f\x7f]/g, ' ').trim().slice(0, 80) : defaults.announcePhrase,
    ...Object.fromEntries(['notifications', 'sound', 'announce', 'closeToTray', 'explorerCollapsed', 'restoreSessions', 'autoSave', 'activityPane', 'codexDirect'].map(key => [key, typeof input[key] === 'boolean' ? input[key] : defaults[key]])),
  };
}

class WorkspaceStore {
  constructor(filename) {
    this.filename = filename;
    this.projects = [];
    this.history = [];
    this.settings = { ...defaults };
    this.warning = null;
    if (!fs.existsSync(filename)) return;
    try {
      const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (value.version !== 2 || !Array.isArray(value.projects)) throw new Error('Unsupported workspace format');
      const ids = new Set();
      this.projects = value.projects.filter(p => {
        if (!p || typeof p.id !== 'string' || typeof p.path !== 'string' || ids.has(p.id)) return false;
        if (p.kind === 'ssh') { try { normalizeSSH({ ...p.ssh, path: p.path }); } catch { return false; } }
        else if (!path.isAbsolute(p.path)) return false;
        ids.add(p.id); return true;
      }).map(p => {
        const project = {
        id: p.id, name: String(p.name || path.basename(p.path)).slice(0, 120), path: p.path,
        kind: p.kind === 'ssh' ? 'ssh' : 'local',
        ...(p.kind === 'ssh' ? { ssh: { host: p.ssh.host, configFile: p.ssh.configFile || null } } : {}),
        primaryTerminalClosed: p.primaryTerminalClosed === true,
        restore: p.restore && typeof p.restore === 'object' ? { terminal: p.restore.terminal === true, codex: p.restore.codex === true, cwd: typeof p.restore.cwd === 'string' && (p.kind === 'ssh' ? p.restore.cwd.startsWith('/') : path.isAbsolute(p.restore.cwd)) ? p.restore.cwd : null, ...(/^[a-f\d-]{36}$/i.test(p.restore.threadId || '') ? { threadId: p.restore.threadId } : {}), ...agentFields(p.restore) } : null,
        terminals: Array.isArray(p.terminals) ? p.terminals.filter(item => item && /^[a-f\d-]{36}$/i.test(item.id || '')).map(item => ({ id: item.id, restore: { terminal: item.restore?.terminal === true, codex: item.restore?.codex === true,
          cwd: typeof item.restore?.cwd === 'string' && (p.kind === 'ssh' ? item.restore.cwd.startsWith('/') : path.isAbsolute(item.restore.cwd)) ? item.restore.cwd : null,
          ...(/^[a-f\d-]{36}$/i.test(item.restore?.threadId || '') ? { threadId: item.restore.threadId } : {}), ...agentFields(item.restore) } })) : [],
        unread: Number.isSafeInteger(p.unread) && p.unread > 0 ? p.unread : 0,
        lastCompletedAt: typeof p.lastCompletedAt === 'number' ? p.lastCompletedAt : null,
        completionArmed: p.completionArmed === true,
        seenEvents: Array.isArray(p.seenEvents) ? p.seenEvents.filter(x => typeof x === 'string').slice(-128) : [],
        };
        return project;
      });
      this.settings = cleanSettings(value.settings);
      this.history = cleanHistory(value.history);
      const terminalIds = new Set(this.projects.map(project => project.id));
      for (const project of this.projects) project.terminals = project.terminals.filter(item => { if (terminalIds.has(item.id)) return false; terminalIds.add(item.id); return true; });
    } catch {
      const backup = `${filename}.unreadable-${Date.now()}`;
      fs.copyFileSync(filename, backup);
      this.warning = `工作区配置无法读取，原文件已保留在 ${backup}`;
    }
  }

  add(folder, name) {
    const canonical = fs.realpathSync(folder);
    if (!fs.statSync(canonical).isDirectory()) throw new Error('请选择项目文件夹。');
    const key = folderKey(canonical);
    const existing = this.projects.find(p => p.kind !== 'ssh' && folderKey(p.path) === key);
    if (existing) return { project: existing, added: false };
    const project = { id: randomUUID(), name: String(name || path.basename(canonical) || canonical).slice(0, 120), path: canonical, kind: 'local', primaryTerminalClosed: false, restore: { terminal: false, codex: false }, unread: 0, lastCompletedAt: null, completionArmed: false, seenEvents: [] };
    this.projects.push(project);
    this.remember(project);
    this.save();
    return { project, added: true };
  }

  // Record a local project as recently opened. Called when it is added and again when it is removed.
  remember(project, now = Date.now()) {
    if (project.kind === 'ssh') return;
    const key = folderKey(project.path);
    this.history = [{ path: project.path, name: project.name, lastOpenedAt: now }, ...this.history.filter(item => folderKey(item.path) !== key)].slice(0, HISTORY_LIMIT);
  }

  // Recent folders that are not open as a project right now.
  recentProjects() {
    const open = new Set(this.projects.filter(p => p.kind !== 'ssh').map(p => folderKey(p.path)));
    return this.history.filter(item => !open.has(folderKey(item.path)));
  }

  recentEntry(folder) { return typeof folder === 'string' ? this.history.find(item => folderKey(item.path) === folderKey(folder)) : undefined; }
  isRecent(folder) { return !!this.recentEntry(folder); }
  forget(folder) { if (typeof folder !== 'string') return; this.history = this.history.filter(item => folderKey(item.path) !== folderKey(folder)); this.save(); }
  clearHistory() { this.history = []; this.save(); }

  addSSH(input) {
    const connection = normalizeSSH(input);
    const existing = this.projects.find(p => p.kind === 'ssh' && p.ssh.host === connection.host && p.ssh.configFile === connection.configFile && p.path === connection.path);
    if (existing) return { project: existing, added: false };
    const base = path.posix.basename(connection.path);
    const project = { id: randomUUID(), name: String(input.name || (base === '~' ? connection.host : base) || connection.host).slice(0, 120), kind: 'ssh', path: connection.path, ssh: { host: connection.host, configFile: connection.configFile }, primaryTerminalClosed: false, restore: { terminal: false, codex: false }, unread: 0, lastCompletedAt: null, completionArmed: false, seenEvents: [] };
    this.projects.push(project); this.save(); return { project, added: true };
  }

  setRestore(id, patch) {
    const found = this.findTerminal(id);
    if (!found) return;
    const { project, record } = found;
    const next = { terminal: record.restore?.terminal === true, codex: record.restore?.codex === true, cwd: record.restore?.cwd || null, ...(record.restore?.threadId ? { threadId: record.restore.threadId } : {}), ...agentFields(record.restore) };
    if (typeof patch.terminal === 'boolean') next.terminal = patch.terminal;
    if (typeof patch.codex === 'boolean') next.codex = patch.codex;
    if (typeof patch.cwd === 'string' && patch.cwd.length <= 4096 && !/[\0\r\n]/.test(patch.cwd) && (project.kind === 'ssh' ? patch.cwd.startsWith('/') : path.isAbsolute(patch.cwd))) next.cwd = patch.cwd;
    if (patch.threadId === null) delete next.threadId;
    else if (/^[a-f\d-]{36}$/i.test(patch.threadId || '')) next.threadId = patch.threadId;
    if (patch.agent === 'codex' || patch.agent === 'claude') { delete next.agent; delete next.interrupted; Object.assign(next, agentFields({ ...record.restore, agent: patch.agent })); }
    if (typeof patch.interrupted === 'boolean') { delete next.interrupted; Object.assign(next, agentFields({ interrupted: patch.interrupted })); }
    if (typeof patch.direct === 'boolean') { delete next.direct; Object.assign(next, agentFields({ direct: patch.direct })); }
    const wasClosed = project.primaryTerminalClosed;
    if (record === project) {
      if (patch.terminal === true) project.primaryTerminalClosed = false;
      else if (patch.primaryClosed === true) project.primaryTerminalClosed = true;
    }
    if (JSON.stringify(next) === JSON.stringify(record.restore) && wasClosed === project.primaryTerminalClosed) return;
    record.restore = next;
    this.save();
  }

  findTerminal(id) {
    for (const project of this.projects) {
      if (project.id === id) return { project, record: project };
      const record = project.terminals?.find(item => item.id === id);
      if (record) return { project, record };
    }
    return null;
  }

  addTerminal(projectId) {
    const project = this.projects.find(item => item.id === projectId);
    if (!project) throw new Error('项目不存在。');
    const terminal = { id: randomUUID(), restore: { terminal: true, codex: false, cwd: project.path } };
    project.terminals ||= []; project.terminals.push(terminal); this.save(); return terminal.id;
  }

  removeTerminal(id) {
    const found = this.findTerminal(id);
    if (!found) return;
    if (found.project.id === id) this.setRestore(id, { terminal: false, codex: false, threadId: null, primaryClosed: true });
    else { found.project.terminals = found.project.terminals.filter(item => item.id !== id); this.save(); }
  }

  reorderProjects(ids) {
    if (!Array.isArray(ids) || ids.length !== this.projects.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !this.projects.some(project => project.id === id))) throw new Error('项目列表已变化，请重新拖动排序。');
    const records = new Map(this.projects.map(project => [project.id, project]));
    this.projects = ids.map(id => records.get(id));
    this.save();
  }

  expectCompletion(id, expected = true) {
    const project = this.projects.find(p => p.id === id);
    if (!project || project.completionArmed === expected) return;
    project.completionArmed = expected;
    this.save();
  }

  complete(id, eventId, now = Date.now()) {
    const project = this.projects.find(p => p.id === id);
    if (!project || typeof eventId !== 'string' || !eventId || eventId.length > 256 || project.seenEvents.includes(eventId)) return false;
    project.seenEvents = [...project.seenEvents, eventId].slice(-128);
    // Background callbacks can use a different thread/turn ID without any new
    // instruction. Remember those IDs too, but grant only one alert per input.
    if (!project.completionArmed) { this.save(); return false; }
    project.completionArmed = false;
    project.unread += 1;
    project.lastCompletedAt = now;
    this.save();
    return true;
  }

  acknowledge(id) {
    const project = this.projects.find(p => p.id === id);
    if (project) project.unread = 0;
    this.save();
  }

  remove(id) {
    const project = this.projects.find(p => p.id === id);
    if (project) this.remember(project);
    this.projects = this.projects.filter(p => p.id !== id); this.save();
  }
  updateSettings(patch) { this.settings = cleanSettings({ ...this.settings, ...patch }); this.save(); }
  save() {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const tmp = `${this.filename}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 2, projects: this.projects, settings: this.settings, history: this.history }, null, 2));
    for (let attempt = 0; ; attempt++) {
      try { fs.renameSync(tmp, this.filename); break; }
      catch (error) {
        if (process.platform !== 'win32' || !['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt >= 4) throw error;
        // Brief Windows reader/indexer locks must not lose a newly captured
        // session ID. Retain atomic replacement and stop after 100ms total.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (attempt + 1) * 10);
      }
    }
  }
}

module.exports = { WorkspaceStore, cleanSettings };
