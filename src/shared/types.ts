import type { ThemeId } from './themes';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type AgentCommand = { name: string; description: string; source: 'builtin' | 'project' | 'user' | 'skill'; view: 'terminal' | 'reading' };
// messages is exact within 256 KiB, estimated from record density for larger transcripts.
export type AgentSession = { id: string; updatedAt: number; title: string; messages: number };
export type ProjectLocation = { kind: 'external' } | { kind: 'file' | 'directory'; path: string };
export type Project = {
  id: string; name: string; path: string; branch: string; unread: number;
  kind: 'local' | 'ssh'; ssh: { host: string; configFile: string | null } | null;
  lastCompletedAt: number | null;
  sessionId: string | null; status: 'stopped' | 'starting' | 'shell' | 'codex' | 'exited';
  action: AgentActionBrief | null;
  codexActive: boolean; agent: 'codex' | 'claude' | null; codexActivity: 'unknown' | 'working' | 'complete' | 'interrupted'; shellReady: boolean; codexAvailable: boolean | null; error: string | null;
  terminals: ProjectTerminal[];
};
export type ProjectTerminal = { agentStartedAt?: number | null; action: AgentActionBrief | null; task: string; prompts: PendingPrompt[]; id: string; title: string; shell: 'powershell' | 'cmd' | 'bash' | 'zsh'; sessionId: string | null; status: Project['status']; codexActive: boolean; agent: Project['agent']; codexActivity: Project['codexActivity']; needsInput: string | null; shellReady: boolean; codexAvailable: boolean | null; lastActivityAt: number | null; lastCompletedAt: number | null; error: string | null };
// A model reached over HTTP for the spoken summary. The API key is not part of the settings.
export type SummaryEndpoint = { provider: string; protocol: 'openai' | 'anthropic'; baseUrl: string; model: string };
type SummaryKeys = { keys: { cloud: boolean; local: boolean } };
export type Settings = { surface: 'glass' | 'solid'; terminalRenderer: 'gpu' | 'dom'; summary: { mode: 'fast' | 'agent' | 'cloud' | 'local'; cloud: SummaryEndpoint; local: SummaryEndpoint }; autoSave: boolean; activityPane: boolean; notifications: boolean; sound: boolean; closeToTray: boolean; explorerCollapsed: boolean; fontSize: number; restoreSessions: boolean; focusAnimation: 'smooth' | 'system' | 'off'; theme: ThemeId; announce: boolean; announcePhrase: string; language: 'zh' | 'en'; shortcuts: Partial<Record<'search' | 'addProject' | 'voice' | 'overview' | 'explorer' | 'settings' | 'nextProject' | 'previousProject' | 'maximize' | 'fullscreen' | 'newTerminal', string>>; guideVersion: string; shell: 'powershell' | 'cmd' | 'bash' | 'zsh'; voiceModel: string };
export type SpeechState = { phase: 'missing' | 'downloading' | 'ready' | 'error'; ready: boolean; percent: number; error: string | null; downloadBytes: number };
export type RecentProject = { path: string; name: string; lastOpenedAt: number; exists: boolean };
export type SSHInfo = { hosts: string[]; configFile: string; configExists: boolean; sshPath: string; source: string };
export type SSHAuthPrompt = { id: string; host: string; message: string; kind: 'secret' | 'confirm' };
export type Workspace = { projects: Project[]; settings: Settings; warning: string | null; platform: string; version: string; guide: boolean; autoHideTitlebar: boolean;
  // Linux: the shell new local terminals use and whether zsh is installed.
  localShell: { kind: 'bash' | 'zsh'; zsh: boolean } | null };
type TerminalSnapshot = { sessionId: string | null; seq: number; data: string };
export type TerminalPacket = TerminalSnapshot & { id: string };
export type FileEntry = { name: string; path: string; kind: 'directory' | 'file' | 'link' };
export type FileProgress = { projectId: string; text: string } | null;
// One offline recognizer: downloaded (ready), downloading, paused (missing) or failed (error).
type VoiceModel = { id: string; label: string; downloadBytes: number; phase: 'missing' | 'downloading' | 'ready' | 'error'; percent: number; error: string | null };
// phase, percent and error describe the model in use (active), or the chosen one before any is downloaded.
export type VoiceState = { phase: 'missing' | 'downloading' | 'ready' | 'transcribing' | 'error'; ready: boolean; percent: number; error: string | null; model: string; downloadBytes: number; choice: string; active: string | null; models: VoiceModel[] };
export type DirectoryListing = { path: string; entries: FileEntry[]; total: number; nextOffset: number | null };
export type MentionFile = { path: string; kind: 'file' | 'dir' };
export type GitChange = { path: string; index: string; worktree: string; originalPath: string | null; submodule: boolean; conflict: boolean; untracked: boolean };
export type GitStatus = { repository: boolean; branch: string; head: string; detached: boolean; unborn: boolean; upstream: string | null; ahead: number | null; behind: number | null; files: GitChange[]; total: number; staged: number; unstaged: number; conflicts: number; truncated: boolean };
export type GitCommit = { hash: string; parents: string[]; author: string; date: string; refs: string; subject: string };
export type GitHistory = { commits: GitCommit[]; nextOffset: number | null };
// One step an agent took (a tool call). The card shows the brief form, the activity pane the whole list.
type AgentActionKind = 'edit' | 'command' | 'read' | 'search' | 'web' | 'skill' | 'mcp' | 'agent' | 'other';
export type AgentActionBrief = { kind: AgentActionKind; tool: string; target: string; detail: string; done: boolean; phrase?: string; object?: string };
export type PendingPrompt = { id: string; text: string; state: 'queued' | 'working'; at: number };
export type AgentAction = AgentActionBrief & { id: string; at: number; description: string; failed: boolean; server?: string; files?: { path: string; change: 'add' | 'update' | 'delete' | 'write' }[] };
export type AgentActionPacket = { id: string; list?: AgentAction[]; changes?: AgentAction[] };
// One message or tool call of an agent's conversation, for the reading view.
export type ConversationEntry = { id: string; at: number; role: 'user' | 'assistant' | 'tool'; text?: string; tool?: AgentActionBrief & { failed: boolean } };
export type ConversationPacket = { id: string; list?: ConversationEntry[]; changes?: ConversationEntry[] };
type GitDiffLine = { type: ' ' | '+' | '-' | '\\'; text: string };
export type GitHunk = { header: string; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: GitDiffLine[]; patch: string };
export type GitDiff = { repository: boolean; binary: boolean; text: boolean; added: number; removed: number; hunks: GitHunk[]; patch: string };
export type GitCommitFiles = { files: { path: string; status: string; originalPath: string | null }[]; total: number; truncated: boolean };
type TextPage = { index: number; count: number; byteStart: number; byteEnd: number; encoding: string };
export type AppUpdateState = { supported: boolean; currentVersion: string; status: 'unavailable' | 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'error'; version: string | null; percent: number; error: string | null };
export type AgentsState = { codex: { installed: boolean }; claude: { installed: boolean }; npm: boolean; installing: 'codex' | 'claude' | null; message: string; error: string };
export type FilePreview = { path: string; name: string; size: number; modifiedAt: number; revision: string } & (
  { kind: 'text'; content: string; page: TextPage } | { kind: 'unsupported'; reason: string }
  | { kind: 'image' | 'video'; mimeType: string; url: string; previewId: string }
  | { kind: 'html' | 'markdown'; content: string; page: TextPage; url: string; previewId: string }
);
type Bridge = {
  getState(): Promise<Result<Workspace>>;
  getAgents(): Promise<Result<AgentsState>>;
  installAgent(agent: 'codex' | 'claude'): Promise<Result<AgentsState>>;
  openNode(): Promise<Result<void>>;
  onAgents(callback: (state: AgentsState) => void): () => void;
  getUpdateState(): Promise<Result<AppUpdateState>>;
  checkForUpdates(): Promise<Result<AppUpdateState>>;
  installUpdate(): Promise<Result<boolean>>;
  openDownloadPage(): Promise<Result<void>>;
  onUpdateState(callback: (state: AppUpdateState) => void): () => void;
  addProjects(): Promise<Result<string[]>>;
  onAnnounce(callback: (event: { projectId: string; name: string; task: string; summary?: string }) => void): () => void;
  getSpeechState(): Promise<Result<SpeechState>>;
  summaryState(): Promise<Result<SummaryKeys>>;
  setSummaryKey(target: 'cloud' | 'local', key: string): Promise<Result<SummaryKeys>>;
  summaryModels(target: 'cloud' | 'local'): Promise<Result<string[]>>;
  testSummary(mode: 'agent' | 'cloud' | 'local'): Promise<Result<{ text: string; ms: number }>>;
  prepareSpeech(): Promise<Result<SpeechState>>;
  speak(text: string): Promise<Result<{ samples: Float32Array<ArrayBuffer>; sampleRate: number }>>;
  onSpeechState(callback: (state: SpeechState) => void): () => void;
  getRecentProjects(): Promise<Result<RecentProject[]>>;
  addRecentProject(folder: string): Promise<Result<string>>;
  forgetRecentProject(folder: string): Promise<Result<RecentProject[]>>;
  clearRecentProjects(): Promise<Result<RecentProject[]>>;
  addSSHProject(input: { host: string; path: string; name?: string }): Promise<Result<string>>;
  getSSHInfo(): Promise<Result<SSHInfo>>;
  getSSHAuth(): Promise<Result<SSHAuthPrompt[]>>;
  answerSSHAuth(id: string, answer: string | null): Promise<Result<void>>;
  onSSHAuth(callback: (prompts: SSHAuthPrompt[]) => void): () => void;
  removeProject(id: string): Promise<Result<boolean>>;
  reorderProjects(ids: string[]): Promise<Result<void>>;
  acknowledge(id: string): Promise<Result<void>>;
  settings(patch: Partial<Settings>): Promise<Result<void>>;
  listDirectory(id: string, relativePath?: string, offset?: number): Promise<Result<DirectoryListing>>;
  findFiles(projectId: string, query: string): Promise<Result<MentionFile[]>>;
  gitStatus(id: string): Promise<Result<GitStatus>>;
  gitHistory(id: string, offset?: number): Promise<Result<GitHistory>>;
  gitFiles(id: string, hash: string): Promise<Result<GitCommitFiles>>;
  gitDiff(id: string, path: string, options?: { staged?: boolean; untracked?: boolean }): Promise<Result<GitDiff>>;
  gitApply(id: string, patch: string, options?: { path?: string; reverse?: boolean; cached?: boolean }): Promise<Result<{ applied: boolean }>>;
  confirmGitRevert(id: string, path: string, count: number): Promise<Result<boolean>>;
  createEntry(id: string, directory: string, name: string, kind: 'file' | 'directory'): Promise<Result<{ path: string; kind: string }>>;
  renameEntry(id: string, relative: string, name: string): Promise<Result<{ path: string }>>;
  deleteEntries(id: string, paths: string[]): Promise<Result<{ deleted: string[] }>>;
  copyEntries(id: string, paths: string[]): Promise<Result<{ count: number; superseded?: boolean }>>;
  copyPaths(id: string, paths: string[], format: 'absolute' | 'relative'): Promise<Result<{ count: number; superseded?: boolean }>>;
  pasteEntries(id: string, directory: string): Promise<Result<{ pasted: string[] }>>;
  fileTreeFocus(id: string, focused: boolean): void;
  getFileProgress(): Promise<Result<FileProgress>>;
  onFileProgress(callback: (progress: FileProgress) => void): () => void;
  cancelFileOperation(): Promise<Result<void>>;
  getVoiceState(): Promise<Result<VoiceState>>;
  prepareVoice(): Promise<Result<VoiceState>>;
  warmVoice(): Promise<Result<void>>;
  transcribe(audio: ArrayBuffer): Promise<Result<string>>;
  onVoiceState(callback: (state: VoiceState) => void): () => void;
  pasteTerminal(id: string, text: string, sessionId: string): Promise<Result<void>>;
  onTerminalPaste(callback: (packet: { id: string; sessionId: string; text: string; lineBreak: string | null }) => void): () => void;
  readFile(id: string, relativePath: string, pageIndex?: number): Promise<Result<FilePreview>>;
  saveFile(id: string, relativePath: string, pageIndex: number, revision: string, content: string): Promise<Result<FilePreview>>;
  confirmEditorClose(filename: string): Promise<Result<'save' | 'discard' | 'cancel'>>;
  editorDirty(dirty: boolean, id?: string, filename?: string): void;
  onEditorClose(callback: (id: string) => void): () => void;
  editorCloseResult(id: string, accepted: boolean): void;
  closePreview(id: string): Promise<Result<void>>;
  openLink(id: string, target: string): Promise<Result<ProjectLocation>>;
  openVideo(id: string, relativePath: string): Promise<Result<void>>;
  revealProject(id: string): Promise<Result<ProjectLocation>>;
  startTerminal(id: string): Promise<Result<void>>;
  addTerminal(id: string): Promise<Result<string>>;
  closeTerminal(id: string): Promise<Result<boolean>>;
  restartTerminal(id: string): Promise<Result<boolean>>;
  attachTerminal(id: string): Promise<Result<TerminalSnapshot>>;
  terminalCommands(id: string): Promise<Result<AgentCommand[]>>;
  agentSessions(id: string): Promise<Result<AgentSession[]>>;
  followAgentSession(id: string, sessionId: string): Promise<Result<boolean>>;
  writeTerminal(id: string, data: string): void;
  resizeTerminal(id: string, cols: number, rows: number): void;
  copy(text: string): Promise<Result<void>>;
  readClipboard(): Promise<Result<string>>;
  terminalFocus(id: string, focused: boolean): void;
  onState(callback: (state: Workspace) => void): () => void;
  onTerminalData(callback: (packet: TerminalPacket) => void): () => void;
  onFocusProject(callback: (id: string) => void): () => void;
  onError(callback: (message: string) => void): () => void;
  minimize(): void; maximize(): void; toggleFullScreen(): void; isFullScreen(): Promise<Result<boolean>>; onFullScreen(callback: (fullScreen: boolean) => void): () => void; terminalActions(id: string): Promise<Result<AgentAction[]>>; terminalConversation(id: string): Promise<Result<ConversationEntry[]>>; onTerminalConversation(callback: (packet: ConversationPacket) => void): () => void; onTerminalAction(callback: (packet: AgentActionPacket) => void): () => void; close(): void; focusMode(enabled: boolean): void;
  quit(): Promise<Result<boolean>>;
};
declare global { interface Window { projectGrid: Bridge; } }
