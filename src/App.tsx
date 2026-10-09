import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  SquaresFour, FolderSimplePlus, Bell, MagnifyingGlass, ArrowsOutSimple,
  Play, Plus, Terminal as TerminalIcon, Check, DotsThree, GitBranch, X, Minus, Square,
  GearSix, CheckCircle, FolderOpen, Power, ArrowCounterClockwise,
  Monitor, Cpu, Info, Circle, SpeakerHigh, Globe, Microphone, Waveform, BookOpen, FloppyDisk, ListChecks, Palette, Robot, Keyboard, Article,
} from '@phosphor-icons/react';
import type { AgentsState, AppUpdateState, Project, ProjectLocation, Result, Settings, SpeechState, SSHAuthPrompt, Workspace } from './types';
import { ProjectTerminals } from './ProjectTerminals';
import { ProjectSwitchHud } from './ProjectSwitchHud';
import { projectAccent } from './project-colors';
import { ProjectExplorer } from './ProjectExplorer';
import { ActivityPane } from './ActivityPane';
import { readingShown, setReading, useTerminalChoice } from './reading-mode';
import { AddProjectDialog } from './AddProjectDialog';
import { SSHAuthDialog } from './SSHAuthDialog';
import { useProjectReorder } from './useProjectReorder';
import { pruneReadingCli } from './useReadingCli';
import { useProjectFocusMotion } from './useProjectFocusMotion';
import { applyTheme, themes } from './themes';
import { applyMotion } from './motion';
import { setTerminalRenderer } from './terminal-renderer';
import { VoiceButton, VoiceModelSetting, VoiceOverlay } from './VoiceButton';
import { announce, announcementVoice, onVoicesReady } from './announce';
import { applyLanguage, currentLanguage, t } from './i18n';
import { actionFor, applyShortcuts, editingKeyInField, shortcut } from './shortcuts';
import { quickDictation } from './voice-input';
import { ShortcutSettings } from './ShortcutSettings';
import { AgentsSettings } from './AgentsSettings';
import { SummarySettings } from './SummarySettings';
import { UsageGuide } from './UsageGuide';
import { GuideTour } from './GuideTour';
import { isMac, isLinux } from './platform';
const FilePreview = lazy(() => import('./FilePreview').then(module => ({ default: module.FilePreview })));
const GitDiffView = lazy(() => import('./GitDiffView').then(module => ({ default: module.GitDiffView })));

const api = window.projectGrid;

function IconButton({ label, children, onClick, className = '', disabled = false }: {
  label: string; children: ReactNode; onClick: () => void; className?: string; disabled?: boolean;
}) {
  return <button className={`icon-button ${className}`} type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

// A terminal added by shortcut appears after the next state update; focus it once its input exists.
function focusTerminalWhenReady(id: string, tries = 60) {
  const input = document.querySelector<HTMLElement>(`[data-terminal-id="${CSS.escape(id)}"] .xterm-helper-textarea`);
  if (input) input.focus(); else if (tries > 0) requestAnimationFrame(() => focusTerminalWhenReady(id, tries - 1));
}

// A reading view hides xterm's input. Check each focus attempt before falling back.
function focusOverviewProject(id: string) {
  const panel = document.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(id)}"]`);
  if (!panel) return;
  for (const target of [...panel.querySelectorAll<HTMLElement>('.reading-composer textarea'), ...panel.querySelectorAll<HTMLElement>('.xterm-helper-textarea'), panel]) {
    target.focus({ preventScroll: true });
    if (document.activeElement === target) break;
  }
  panel.scrollIntoView({ block: 'nearest' });
}

function relativeTime(timestamp: number | null, now: number) {
  if (!timestamp) return '';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return t('刚刚');
  if (seconds < 60) return t('{n} 秒前', { n: seconds });
  if (seconds < 3600) return t('{n} 分钟前', { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('{n} 小时前', { n: Math.floor(seconds / 3600) });
  return new Date(timestamp).toLocaleDateString(currentLanguage() === 'en' ? 'en-US' : 'zh-CN');
}

function statusText(project: Project) {
  if (project.codexActive && project.codexActivity === 'working') return t('正在处理');
  if (project.unread) return t('等待你查看');
  if (project.error) return t('需要检查');
  if (project.status === 'codex') return project.codexActivity === 'complete' ? t('本轮已完成') : project.codexActivity === 'interrupted' ? t('已中断') : t('{agent} 会话中', { agent: agentName(project.agent) });
  if (project.status === 'shell') return t('终端就绪');
  if (project.status === 'starting') return project.kind === 'ssh' ? t('正在连接 SSH') : t('正在启动');
  if (project.status === 'exited') return project.kind === 'ssh' ? t('SSH 终端已退出') : t('终端已退出');
  return t('尚未启动');
}

function agentName(agent: Project['agent']) { return agent === 'claude' ? 'Claude' : 'Codex'; }

function isRoundComplete(project: Project) {
  return project.codexActive && project.codexActivity === 'complete' && !project.unread && !project.error;
}

function ProjectPanel({ project, index, hidden, focused, navTarget, navPosition, fontSize, now, activityOpen, onToggleActivity, onFocus, onAction, onError, onOpenLink, onRevealProject, dragging, dropTarget }: {
  project: Project; index: number; hidden: boolean; focused: boolean; fontSize: number; now: number;
  navTarget?: number; navPosition?: string;
  // The activity pane (what the agent is doing, step by step) shows beside the terminal of an expanded project.
  activityOpen: boolean; onToggleActivity: () => void;
  onFocus: (id: string) => void;
  onAction: <T>(promise: Promise<Result<T>>) => Promise<T | undefined>; onError: (message: string) => void;
  onOpenLink: (id: string, target: string) => void;
  onRevealProject: (id: string) => void;
  dragging?: boolean; dropTarget?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const first = project.terminals[0];
  const currentTerminal = project.terminals.find(item => item.id === activeTerminalId) || first;
  const multiple = project.terminals.length > 1;
  const hasTerminal = !!first.sessionId;
  const stopped = first.status === 'stopped' || first.status === 'exited';
  const addTerminal = async () => { const id = await onAction(api.addTerminal(project.id)); if (id) setActiveTerminalId(id); };
  const completionAge = project.lastCompletedAt === null ? Infinity : Date.now() - project.lastCompletedAt;
  const working = project.codexActive && project.codexActivity === 'working';
  const freshCompletion = !!project.unread && !working && completionAge >= 0 && completionAge < 9000;
  const roundComplete = isRoundComplete(project);
  // A new turn starts the edge and dot together; ordinary renders keep their clock.
  const signalKey = `${working ? 'working' : 'rest'}:${project.lastCompletedAt}`;
  const badgeClass = `status-badge ${working ? 'blue' : roundComplete ? 'green' : project.unread ? 'red' : project.error ? 'amber' : ''}`;
  const meta = working ? '' : project.lastCompletedAt ? t('{time}完成', { time: relativeTime(project.lastCompletedAt, now) }) : '';
  const badge = <><span key={signalKey} className="status-dot" aria-hidden="true" /><span>{statusText(project)}</span></>;
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menuOpen]);
  const action = (callback: () => void) => { setMenuOpen(false); callback(); };
  const showActivity = focused && activityOpen;
  // Reading view or raw terminal, for the terminal in use.
  const readingOn = readingShown(currentTerminal, useTerminalChoice());
  return <article
    className={`project-panel ${showActivity ? 'has-activity' : ''} ${project.unread && !working ? 'has-unread' : ''} ${freshCompletion ? 'attention-active' : ''} ${working ? 'is-working' : ''} ${roundComplete ? 'round-complete' : ''} ${focused ? 'is-focused' : ''} ${navTarget ? 'is-nav-target' : ''} ${project.error ? 'has-error' : ''} ${dragging ? 'drag-source' : ''} ${dropTarget ? 'drop-target' : ''}`}
    data-project-id={project.id} data-status={working ? 'working' : project.unread ? 'unread' : project.status}
    tabIndex={-1}
    style={{ display: hidden ? 'none' : undefined, '--project-accent': projectAccent(index) } as CSSProperties}
  >
    <span key={signalKey} className="panel-signal" aria-hidden="true" />
    <span key={`glow:${signalKey}`} className="panel-glow" aria-hidden="true" />
    {navTarget && <span key={`nav:${navTarget}`} className="panel-nav-ring" aria-hidden="true" />}
    {/* Where next/previous project landed, over the card itself (the screen-reader announcement is ProjectSwitchHud). */}
    {navTarget && <div key={`hud:${navTarget}`} className="panel-nav-hud" aria-hidden="true"><span className="project-switch-index">{String(index + 1).padStart(2, '0')}</span><b>{project.name}</b>{navPosition && <small>{navPosition}</small>}</div>}
    <header className="panel-header" title={focused ? undefined : t('点击标题栏放大，按住标题栏拖动排序')} onClick={event => {
      if (!focused && event.button === 0 && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && !(event.target as Element).closest('button, [role="menu"]')) onFocus(project.id);
    }}>
      <span className="panel-index">{String(index + 1).padStart(2, '0')}</span>
      <button className="panel-name" onClick={() => !focused && onFocus(project.id)} title={project.kind === 'ssh' ? `${project.ssh?.host}:${project.path}` : project.path}>
        <span>{project.name}</span>
        {project.branch && <small><GitBranch size={11} />{project.branch}</small>}
        {project.kind === 'ssh' && <small className="ssh-project-label"><Globe size={11} />{project.ssh?.host}</small>}
      </button>
      {!!meta && <span className="panel-meta" title={project.path}>{meta}</span>}
      {!!project.unread && !focused && !working
        ? <button type="button" className={`${badgeClass} status-button`} title={statusText(project)} onClick={() => onFocus(project.id)} aria-label={t('查看 {name} 的完成结果', { name: project.name })}>{badge}</button>
        : <span className={badgeClass} title={statusText(project)}>{badge}</span>}
      {!multiple && stopped && hasTerminal && <button className="text-button panel-action" aria-label={t('重新启动')} onClick={() => onAction(api.startTerminal(first.id))}><Play size={12} weight="fill" /><span>{t('重启')}</span></button>}
      {!multiple && first.codexActive && <span className="session-label"><span className="session-dot" />{agentName(first.agent).toUpperCase()}</span>}
      {!multiple && <VoiceButton terminalId={first.id} sessionId={first.sessionId} name={project.name} onError={onError} />}
      {currentTerminal.sessionId && currentTerminal.codexActive && <IconButton label={readingOn ? t('切换到终端') : t('阅读视图：按文档排版显示对话')} className={readingOn ? 'is-active' : ''} onClick={() => setReading(currentTerminal.id, !readingOn)}>{readingOn ? <TerminalIcon size={16} /> : <Article size={16} />}</IconButton>}
      {focused && <IconButton label={activityOpen ? t('隐藏活动栏') : t('显示活动栏：它正在做什么')} className={activityOpen ? 'is-active' : ''} onClick={onToggleActivity}><ListChecks size={16} /></IconButton>}
      {!focused && <IconButton label={t('全屏查看 {name}', { name: project.name })} onClick={() => onFocus(project.id)}><ArrowsOutSimple size={16} /></IconButton>}
      <div className="panel-menu-anchor" ref={menu}>
        <IconButton label={t('{name} 的更多操作', { name: project.name })} onClick={() => setMenuOpen(!menuOpen)}><DotsThree size={20} weight="bold" /></IconButton>
        {menuOpen && <div className="dropdown panel-menu" role="menu">
          <button role="menuitem" onClick={() => action(() => void addTerminal())}><Plus size={16} />{t('新建终端并分屏')}<span className="menu-shortcut" aria-hidden="true">{shortcut('newTerminal')}</span></button>
          <button role="menuitem" onClick={() => action(() => onRevealProject(project.id))}><FolderOpen size={16} />{t('打开项目目录')}</button>
          <button role="menuitem" onClick={() => action(() => { onAction(api.restartTerminal(currentTerminal.id)); })}><ArrowCounterClockwise size={16} />{project.kind === 'ssh' ? t('重新连接 SSH') : t('重启当前终端')}</button>
          <div className="menu-divider" />
          <button role="menuitem" className="danger-text" onClick={() => action(() => { onAction(api.removeProject(project.id)); })}><X size={16} />{t('移除项目')}</button>
        </div>}
      </div>
    </header>
    <ProjectTerminals project={project} focused={focused} fontSize={fontSize} activeId={activeTerminalId} setActiveId={setActiveTerminalId} onAction={onAction} onError={onError} onOpenLink={onOpenLink} />
    {showActivity && <ActivityPane project={project} terminal={currentTerminal} />}
    {project.error && <div className="panel-error"><Info size={13} /><span>{t(project.error)}</span></div>}
  </article>;
}

// Spoken completion notice: on/off, an optional own phrase, and a preview in the chosen voice.
function AnnounceSettings({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const [voice, setVoice] = useState<string | null>(null);
  const [speech, setSpeech] = useState<SpeechState | null>(null);
  const [phrase, setPhrase] = useState(settings.announcePhrase);
  useEffect(() => onVoicesReady(() => setVoice(announcementVoice(settings.language)?.name.replace(/^Microsoft\s+/, '').replace(/\s+(Desktop|-).*$/, '') || null)), [settings.language]);
  useEffect(() => { void api.getSpeechState().then(result => { if (result.ok) setSpeech(result.value); }); return api.onSpeechState(setSpeech); }, []);
  const example = settings.language === 'zh' ? '{项目}，{任务}，完成。' : '{project}: {task}, done.';
  const savePhrase = () => { if (phrase.trim() !== settings.announcePhrase) update({ announcePhrase: phrase }); };
  const status = speech?.ready ? t('一轮完成时由本地自然女声播报哪个项目完成了什么')
    : speech?.phase === 'downloading' ? t('自然女声下载中 {percent}%，下载前先用系统语音', { percent: speech.percent })
    : voice ? t('一轮完成时由 {voice} 播报；可下载更自然的本地女声（约 74 MB）', { voice }) : t('一轮完成时播报项目名（系统中未找到对应语言的语音）');
  return <div className="setting-group">
    <label className="setting-row"><span><Waveform size={19} /><span><b>{t('语音播报')}</b><small title={speech?.error ? t(speech.error) : undefined}>{status}</small></span></span><input type="checkbox" checked={settings.announce} onChange={event => { update({ announce: event.target.checked }); if (event.target.checked && !speech?.ready) void api.prepareSpeech(); }} /></label>
    {settings.announce && <SummarySettings settings={settings} update={update} />}
    {settings.announce && <div className="announce-options">
      <input aria-label={t('播报语')} placeholder={t('留空使用简短的默认播报，如：{example}', { example })} value={phrase} maxLength={80} onChange={event => setPhrase(event.target.value)} onBlur={savePhrase} onKeyDown={event => { if (event.key === 'Enter') savePhrase(); }} />
      {!speech?.ready && speech?.phase !== 'downloading' && <button type="button" className="button secondary small" onClick={() => void api.prepareSpeech()}>{t('下载自然女声')}</button>}
      <button type="button" className="button secondary small" onClick={() => { savePhrase(); announce(t('示例项目'), t('给登录页加上验证码'), { ...settings, announcePhrase: phrase.trim() }); }}>{t('试听')}</button>
    </div>}
  </div>;
}
function SettingsDialog({ settings, localShell, agents, onAgents, initialSection, updates, onCheckUpdate, onInstallUpdate, onDownloadPage, onGuide, close, update, quit }: {
  localShell: Workspace['localShell']; agents: AgentsState | null; onAgents: (state: AgentsState) => void; initialSection: string;
  settings: Settings; close: () => void; update: (patch: Partial<Settings>) => void; quit: () => void; onGuide: () => void;
  updates: AppUpdateState | null; onCheckUpdate: () => void; onInstallUpdate: () => void; onDownloadPage: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState(initialSection);
  // One category at a time: the sidebar chooses it and the pane beside it shows only that category.
  const sections = [
    { id: 'appearance', title: t('外观'), hint: t('主题、语言、材质与动画'), icon: <Palette size={17} /> },
    { id: 'notifications', title: t('提醒'), hint: t('通知、声音与语音播报'), icon: <Bell size={17} /> },
    { id: 'terminal', title: t('终端与编辑'), hint: t('终端、会话恢复与编辑器'), icon: <TerminalIcon size={17} /> },
    { id: 'agents', title: t('编码助手'), hint: t('Codex 与 Claude Code'), icon: <Robot size={17} /> },
    { id: 'shortcuts', title: t('键盘快捷键'), hint: t('查看和修改快捷键'), icon: <Keyboard size={17} /> },
    { id: 'about', title: t('更新与关于'), hint: t('版本与更新'), icon: <Info size={17} /> },
  ];
  const current = sections.find(section => section.id === activeSection) || sections[0];
  const choose = (id: string) => { setActiveSection(id); pane.current?.scrollTo({ top: 0 }); };
  useEffect(() => { dialog.current?.showModal(); }, []);
  // Up and down move between categories while the sidebar has focus.
  const navKeys = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = sections.findIndex(section => section.id === current.id), next = sections[(index + (event.key === 'ArrowDown' ? 1 : sections.length - 1)) % sections.length];
    choose(next.id); dialog.current?.querySelector<HTMLElement>(`[data-settings-tab="${next.id}"]`)?.focus();
  };
  return <dialog className="settings-dialog settings-paned" ref={dialog} onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <div className="settings-brand"><span className="eyebrow">PREFERENCES</span><h2>{t('工作台设置')}</h2></div>
        <nav className="settings-nav" aria-label={t('设置分类')} onKeyDown={navKeys}>{sections.map(section => <button type="button" key={section.id} data-settings-tab={section.id} aria-controls={`settings-${section.id}`} aria-current={current.id === section.id ? 'page' : undefined} onClick={() => choose(section.id)}>{section.icon}<span>{section.title}</span></button>)}</nav>
        <div className="settings-sidebar-footer"><button className="text-button" onClick={onGuide}><BookOpen size={15} />{t('使用指南')}</button><button className="text-button danger-text" onClick={quit}><Power size={15} />{t('退出应用')}</button></div>
      </aside>
      <div className="settings-main">
        <header className="settings-main-head"><h3>{current.title}</h3><p>{current.hint}</p></header>
        <div className="settings-pane" ref={pane}>
      <section className="settings-section" id="settings-appearance" aria-label={t('外观')} hidden={current.id !== 'appearance'}>
      <fieldset className="theme-picker"><legend>{t('外观主题')}</legend><div className="theme-options">
        {themes.map(theme => <label key={theme.id} className={`theme-option ${settings.theme === theme.id ? 'is-selected' : ''}`}>
          <input type="radio" name="theme" value={theme.id} checked={settings.theme === theme.id} aria-label={t(theme.name)} onChange={() => update({ theme: theme.id })} />
          <span className="theme-swatch" data-theme-preview={theme.id} aria-hidden="true"><span className="theme-mini-window"><i /><i /><i /></span><span className="theme-check"><Check size={12} weight="bold" /></span></span>
          <span className="theme-name">{t(theme.name)}</span><small>{t(theme.description)}</small>
        </label>)}
      </div></fieldset>
      <label className="setting-row"><span><Globe size={19} /><span><b>{t('语言')}</b><small>{t('界面、提示与语音播报的语言')}</small></span></span><select aria-label={t('语言')} value={settings.language} onChange={event => update({ language: event.target.value as Settings['language'] })}><option value="zh">中文</option><option value="en">English</option></select></label>
      <label className="setting-row"><span><Monitor size={19} /><span><b>{t('界面材质')}</b><small>{t('实色：面板不透明，文字用 ClearType 渲染，最锐利，也更省显卡；玻璃：透出壁纸')}</small></span></span><select aria-label={t('界面材质')} value={settings.surface} onChange={event => update({ surface: event.target.value as Settings['surface'] })}><option value="glass">{t('液态玻璃')}</option><option value="solid">{t('实色（更清晰）')}</option></select></label>
      <label className="setting-row"><span><Cpu size={19} /><span><b>{t('终端渲染')}</b><small>{t('GPU 加速：用显卡绘制终端文字，助手工作时处理器占用低得多；如果终端显示异常，改用兼容模式')}</small></span></span><select aria-label={t('终端渲染')} value={settings.terminalRenderer} onChange={event => update({ terminalRenderer: event.target.value as Settings['terminalRenderer'] })}><option value="gpu">{t('GPU 加速')}</option><option value="dom">{t('兼容模式')}</option></select></label>
      <label className="setting-row"><span><ArrowsOutSimple size={19} /><span><b>{t('界面动画')}</b><small>{t('窗口平滑放大与呼吸灯；默认不受 Windows“动画效果”开关影响')}</small></span></span><select aria-label={t('界面动画')} value={settings.focusAnimation} onChange={e => update({ focusAnimation: e.target.value as Settings['focusAnimation'] })}><option value="smooth">{t('开启')}</option><option value="system">{t('跟随系统')}</option><option value="off">{currentLanguage() === 'en' ? 'Off' : '关闭'}</option></select></label>
      <label className="setting-row"><span><TerminalIcon size={19} /><span><b>{t('终端字号')}</b><small>{t('全屏与网格共用字号')}</small></span></span><select aria-label={t('终端字号')} value={settings.fontSize} onChange={e => update({ fontSize: Number(e.target.value) })}>{[10, 11, 12, 13, 14, 16, 18, 20].map(n => <option key={n} value={n}>{n} px</option>)}</select></label>
      </section>
      <section className="settings-section" id="settings-notifications" aria-label={t('提醒')} hidden={current.id !== 'notifications'}>
      <label className="setting-row"><span><Bell size={19} /><span><b>{t('桌面通知')}</b><small>{t('一轮结束时发送系统通知')}</small></span></span><input type="checkbox" checked={settings.notifications} onChange={e => update({ notifications: e.target.checked })} /></label>
      <label className="setting-row"><span><SpeakerHigh size={19} /><span><b>{t('通知声音')}</b><small>{t('播放系统默认提示音')}</small></span></span><input type="checkbox" checked={settings.sound} onChange={e => update({ sound: e.target.checked })} /></label>
      <AnnounceSettings settings={settings} update={update} />
      </section>
      <section className="settings-section" id="settings-terminal" aria-label={t('终端与编辑')} hidden={current.id !== 'terminal'}>
      {!isMac && <label className="setting-row"><span><TerminalIcon size={19} /><span><b>{t('终端')}</b><small>{t('新开或重启的本地终端使用；SSH 项目始终使用 Bash')}</small></span></span>{localShell
        ? <select aria-label={t('终端')} value={localShell.kind} onChange={event => update({ shell: event.target.value as Settings['shell'] })}><option value="bash">Bash</option><option value="zsh" disabled={!localShell.zsh}>{localShell.zsh ? 'zsh' : t('zsh（未安装）')}</option></select>
        : <select aria-label={t('终端')} value={settings.shell} onChange={event => update({ shell: event.target.value as Settings['shell'] })}><option value="powershell">PowerShell</option><option value="cmd">{t('命令提示符 (cmd)')}</option></select>}</label>}
      <label className="setting-row"><span><ArrowCounterClockwise size={19} /><span><b>{t('启动时恢复工作')}</b><small>{t('恢复 Codex 与 Claude Code 的最近会话，被中断的任务自动发送“继续”')}</small></span></span><input type="checkbox" checked={settings.restoreSessions} onChange={event => update({ restoreSessions: event.target.checked })} /></label>
      <label className="setting-row"><span><Monitor size={19} /><span><b>{t('关闭到托盘')}</b><small>{t('关闭窗口后，终端和任务继续运行')}</small></span></span><input type="checkbox" checked={settings.closeToTray} onChange={e => update({ closeToTray: e.target.checked })} /></label>
      <label className="setting-row"><span><FloppyDisk size={19} /><span><b>{t('自动保存')}</b><small>{t('停止输入约 1 秒后、切换文件或离开窗口时保存编辑中的文件；关闭后按 Ctrl+S 保存')}</small></span></span><input type="checkbox" checked={settings.autoSave} onChange={event => update({ autoSave: event.target.checked })} /></label>
      <div className="setting-row"><span><Microphone size={19} /><span><b>{t('本地语音输入')}</b><small>{t('按 {key} 或点击终端上的麦克风说话，按回车识别并发送，Esc 取消', { key: shortcut('voice') })}</small></span></span><VoiceModelSetting choice={settings.voiceModel} onChoose={voiceModel => update({ voiceModel })} /></div>
      </section>
      <section className="settings-section" id="settings-agents" aria-label={t('编码助手')} hidden={current.id !== 'agents'}>
      <AgentsSettings agents={agents} onChange={onAgents} />
      </section>
      {current.id === 'shortcuts' && <ShortcutSettings settings={settings} update={update} />}
      <section className="settings-section" id="settings-about" aria-label={t('更新与关于')} hidden={current.id !== 'about'}>
      {updates && <section className="update-section" aria-label={t('应用更新')}>
        <div className="update-heading"><b>{t('应用更新')}</b><span>{t('当前版本 v{version}', { version: updates.currentVersion })}</span></div>
        <p role="status">{updates.status === 'unavailable' ? isMac ? t('macOS 版不会自动更新。再次运行安装命令，即可更新到最新版本。') : isLinux ? t('Linux 版不会自动更新。在下载页面获取新版本的 AppImage 或压缩包。') : t('当前为便携版或开发版。安装 Windows 版后，即可自动检查和下载更新。')
          : updates.status === 'checking' ? t('正在检查更新…')
          : updates.status === 'current' ? t('当前已是最新版本。')
          : updates.status === 'downloading' ? t('正在下载 v{version} · {percent}%', { version: updates.version || '', percent: updates.percent })
          : updates.status === 'ready' ? t('v{version} 已下载，可在方便时重启安装。', { version: updates.version || '' })
          : updates.status === 'error' ? t(updates.error || '') : t('启动后自动检查更新，并在后台下载新版本。')}</p>
        {updates.status === 'downloading' && <progress aria-label={t('更新下载进度')} max={100} value={updates.percent} />}
        <div className="update-actions">{!updates.supported
          ? <button className="button secondary small" onClick={onDownloadPage}>{isMac || isLinux ? t('打开下载页面') : t('下载 Windows 安装版')}</button>
          : updates.status === 'ready' ? <button className="button primary small" onClick={onInstallUpdate}>{t('重启并安装更新')}</button>
          : <button className="button secondary small" disabled={updates.status === 'checking' || updates.status === 'downloading'} onClick={onCheckUpdate}>{updates.status === 'error' ? t('重试更新') : t('检查更新')}</button>}</div>
      </section>}
      <div className="settings-note"><Info size={15} /><p>{t('一轮结束时，方框从边缘缓缓呼吸三次，之后留一层柔光等你查看；在终端里发送新指令也算已查看。绿色常亮表示已查看的本轮完成。没有新指令时不会重复提醒。')}</p></div>
      </section>
        </div>
        <div className="settings-main-foot"><button className="button primary" onClick={close}>{t('完成')}</button></div>
      </div>
    </div>
  </dialog>;
}

export function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  useEffect(() => { if (workspace) applyTheme(workspace.settings.theme); }, [workspace?.settings.theme]);
  useEffect(() => { applyMotion(workspace?.settings.focusAnimation || 'smooth'); }, [workspace?.settings.focusAnimation]);
  // The surface (glass or solid) is a mode of the whole stylesheet, like the theme.
  useEffect(() => { document.documentElement.dataset.surface = workspace?.settings.surface || 'glass'; }, [workspace?.settings.surface]);
  useEffect(() => { setTerminalRenderer(workspace?.settings.terminalRenderer || 'gpu'); }, [workspace?.settings.terminalRenderer]);
  const [agents, setAgents] = useState<AgentsState | null>(null);
  // Native full screen (F11, or an expanded project): the title bar gets out of the way.
  const [fullScreen, setFullScreen] = useState(false);
  const [agentsDismissed, setAgentsDismissed] = useState(false);
  const [settingsSection, setSettingsSection] = useState('appearance');
  const [updates, setUpdates] = useState<AppUpdateState | null>(null);
  const [query, setQuery] = useState('');
  // With only a few projects the search box is a single icon; Ctrl+K or a click opens it.
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { if (searchOpen) queryInput.current?.focus(); }, [searchOpen]);
  const { root: focusMotionRoot, focusedId, focus: setFocusedId } = useProjectFocusMotion(workspace?.settings.focusAnimation || 'smooth');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The usage guide: welcome page on first use, "what's new" after an update, or opened from settings.
  // tour: the tutorial in the window itself, a bubble at each place to act.
  const [guide, setGuide] = useState<'tour' | 'keys' | 'news' | null>(null);
  const tourWithAdd = useRef(false);
  const startTour = () => { tourWithAdd.current = !workspace?.projects.length; setGuide('tour'); };
  const guideShown = useRef(false);
  useEffect(() => {
    if (!workspace?.guide || guideShown.current) return;
    guideShown.current = true; if (workspace.settings.guideVersion) setGuide('news'); else startTour();
  }, [workspace?.guide, workspace?.settings.guideVersion]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [addOpen, setAddOpen] = useState(false);
  const [sshAuth, setSSHAuth] = useState<SSHAuthPrompt[]>([]);
  const [expandedByProject, setExpandedByProject] = useState<Record<string, string[]>>({});
  // diff: the file is shown as its Git changes (from the Git sidebar) instead of its contents.
  const [previewFile, setPreviewFile] = useState<{ projectId: string; path: string; diff?: 'worktree' | 'staged' | 'untracked' } | null>(null);
  const [changeRevision, setChangeRevision] = useState(0);
  const editorGuard = useRef<(() => Promise<boolean>) | null>(null);
  const navigationGuard = useRef<Promise<boolean> | null>(null);
  const registerEditorGuard = useCallback((guard: (() => Promise<boolean>) | null) => { editorGuard.current = guard; }, []);
  const allowNavigation = useCallback(() => {
    if (navigationGuard.current) return navigationGuard.current;
    const promise = Promise.resolve(editorGuard.current?.() ?? true).finally(() => { navigationGuard.current = null; });
    navigationGuard.current = promise; return promise;
  }, []);
  const queryInput = useRef<HTMLInputElement>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportError = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 10000);
  }, []);
  const perform = useCallback(async <T,>(promise: Promise<Result<T>>) => {
    try { const result = await promise; if (!result.ok) { reportError(result.error); return; } return result.value; }
    catch (err) { reportError(String(err)); }
  }, [reportError]);
  const reorder = useProjectReorder(!focusedId && !addOpen && !settingsOpen && !sshAuth.length && (workspace?.projects.length || 0) > 1, query,
    workspace?.projects.map(project => project.id) || [], ids => perform(api.reorderProjects(ids)));
  const focusProject = useCallback(async (id: string) => {
    if (!await allowNavigation()) return false;
    setPreviewFile(null);
    setFocusedId(id);
    api.focusMode(true);
    perform(api.acknowledge(id));
    return true;
  }, [perform, setFocusedId, allowNavigation]);
  const returnToGrid = useCallback(async () => { if (!await allowNavigation()) return; setFocusedId(null); setPreviewFile(null); api.focusMode(false); }, [setFocusedId, allowNavigation]);
  const showProjectLocation = useCallback(async (id: string, result: ProjectLocation | undefined) => {
    if (!result || result.kind === 'external' || !await focusProject(id)) return;
    if (result.kind === 'file') {
      setPreviewFile({ projectId: id, path: result.path });
    } else {
      const parts = result.path.split('/').filter(Boolean);
      const directories = ['', ...parts.map((_, index) => parts.slice(0, index + 1).join('/'))];
      setExpandedByProject(value => ({ ...value, [id]: [...new Set([...(value[id] || []), ...directories])] }));
      await perform(api.settings({ explorerCollapsed: false }));
    }
  }, [perform, focusProject]);
  const openTerminalLink = useCallback(async (id: string, target: string) => {
    await showProjectLocation(id, await perform(api.openLink(id, target)));
  }, [perform, showProjectLocation]);
  const revealProject = useCallback(async (id: string) => {
    await showProjectLocation(id, await perform(api.revealProject(id)));
  }, [perform, showProjectLocation]);

  useEffect(() => {
    if (!workspace) return;
    const live = workspace.projects.flatMap(project => project.terminals)
      .filter(terminal => terminal.sessionId && terminal.status !== 'exited');
    pruneReadingCli(new Set(live.map(terminal => JSON.stringify([terminal.id, terminal.sessionId]))));
  }, [workspace]);

  const settingsRef = useRef<Settings | null>(null); settingsRef.current = workspace?.settings || null;
  // Project order for next/previous (set each render), and the current card even if focus fails.
  const navigation = useRef<string[]>([]);
  const lastProject = useRef<string | null>(null);
  const [projectSwitch, setProjectSwitch] = useState<{ id: string; sequence: number } | null>(null);
  const switchSequence = useRef(0);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showProjectSwitch = useCallback((id: string) => {
    lastProject.current = id;
    setProjectSwitch({ id, sequence: ++switchSequence.current });
    if (switchTimer.current) clearTimeout(switchTimer.current);
    switchTimer.current = setTimeout(() => { setProjectSwitch(null); switchTimer.current = null; }, 1200);
  }, []);
  useEffect(() => () => { if (switchTimer.current) clearTimeout(switchTimer.current); }, []);
  useEffect(() => {
    const remember = (event: FocusEvent) => { const id = (event.target as Element | null)?.closest?.<HTMLElement>('[data-project-id]')?.dataset.projectId; if (id) lastProject.current = id; };
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);
  useEffect(() => api?.onAnnounce(({ name, task, summary }) => { const settings = settingsRef.current; if (settings?.announce) announce(name, task || '', settings, summary || ''); }), []);
  useEffect(() => {
    if (!api) return;
    const offState = api.onState(setWorkspace);
    const offFocus = api.onFocusProject(focusProject);
    const offError = api.onError(reportError);
    const offUpdates = api.onUpdateState(setUpdates);
    const offAgents = api.onAgents(setAgents);
    const offFullScreen = api.onFullScreen(setFullScreen);
    perform(api.isFullScreen()).then(value => { if (typeof value === 'boolean') setFullScreen(value); });
    const offAuth = api.onSSHAuth(setSSHAuth);
    const offEditor = api.onEditorClose(id => { void allowNavigation().then(accepted => api.editorCloseResult(id, accepted), () => api.editorCloseResult(id, false)); });
    perform(api.getSSHAuth()).then(requests => { if (requests) setSSHAuth(requests); });
    perform(api.getAgents()).then(state => { if (state) setAgents(state); });
    perform(api.getUpdateState()).then(state => { if (state) setUpdates(state); });
    perform(api.getState()).then(state => { if (state) setWorkspace(state); });
    const clock = setInterval(() => setNow(Date.now()), 5000);
    return () => { offState(); offFocus(); offError(); offUpdates(); offAgents(); offFullScreen(); offAuth(); offEditor(); clearInterval(clock); if (errorTimer.current) clearTimeout(errorTimer.current); };
  }, [focusProject, perform, reportError, allowNavigation]);
  useEffect(() => {
    if (focusedId && workspace && !workspace.projects.some(p => p.id === focusedId)) returnToGrid();
  }, [workspace, focusedId, returnToGrid]);
  useEffect(() => {
    // App shortcuts (configurable in settings). In text boxes and the editor, standard editing keys such as
    // Ctrl+A keep their meaning; in terminals and elsewhere the shortcut wins, before xterm sees the key.
    // While a dialog is open (including recording a new shortcut) nothing is intercepted.
    const handler = (event: KeyboardEvent) => {
      const action = actionFor(event);
      if (!action || editingKeyInField(event) || document.querySelector('dialog[open], .tour-layer')) return;
      event.preventDefault(); event.stopPropagation();
      if (event.repeat) return;
      if (action === 'search' && !focusedId) { setSearchOpen(true); requestAnimationFrame(() => queryInput.current?.focus()); }
      else if (action === 'addProject') setAddOpen(true);
      else if (action === 'voice') void quickDictation(reportError);
      else if (action === 'overview') void returnToGrid();
      else if (action === 'explorer' && focusedId) perform(api.settings({ explorerCollapsed: !workspace?.settings.explorerCollapsed }));
      else if (action === 'settings') setSettingsOpen(true);
      else if (action === 'newTerminal') {
        // A new split in the current project, ready to type in.
        const id = currentProject();
        if (!id) { reportError(t('先点一下要分屏的项目，再按 {key}。', { key: shortcut('newTerminal') })); return; }
        void perform(api.addTerminal(id)).then(terminal => { if (terminal) focusTerminalWhenReady(terminal); });
      }
      else if (action === 'maximize') { if (focusedId) void returnToGrid(); else { const id = currentProject(); if (id) void focusProject(id); } }
      else if (action === 'fullscreen') api.toggleFullScreen();
      else if (action === 'nextProject' || action === 'previousProject') {
        const ids = navigation.current, current = currentProject();
        if (!ids.length) return;
        const index = current ? ids.indexOf(current) : -1, forward = action === 'nextProject';
        const next = index < 0 ? ids[forward ? 0 : ids.length - 1] : ids[(index + (forward ? 1 : ids.length - 1)) % ids.length];
        // Expanded: preserve the editor guard. Overview: focus the card without expanding it.
        if (focusedId) void focusProject(next).then(accepted => {
          if (!accepted) return;
          showProjectSwitch(next);
          requestAnimationFrame(() => {
            if (lastProject.current === next) document.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest' });
          });
        });
        else { focusOverviewProject(next); showProjectSwitch(next); }
      }
    };
    const currentProject = () => focusedId || lastProject.current || document.activeElement?.closest<HTMLElement>('[data-project-id]')?.dataset.projectId;
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [focusedId, returnToGrid, focusProject, perform, reportError, showProjectSwitch, workspace?.settings.explorerCollapsed]);

  if (!api) return <div className="startup-message"><SquaresFour size={38} /><h1>Project Grid 是桌面应用</h1><p>请在项目目录运行 npm start，或双击打包后的应用。</p></div>;
  if (!workspace) return <div className="startup-message"><SquaresFour size={34} /><p>{error || t('正在打开工作区…')}</p></div>;
  const { projects, settings } = workspace;
  // Set before the children render, so every t() in this render uses the chosen language.
  applyLanguage(settings.language);
  applyShortcuts(settings.shortcuts);
  const projectRecords = new Map(projects.map(project => [project.id, project]));
  const orderedProjects = reorder.order ? reorder.order.flatMap(id => projectRecords.get(id) || []) : projects;
  const unread = projects.filter(p => p.unread > 0).length;
  const completed = projects.filter(isRoundComplete).length;
  const normalizedQuery = query.toLowerCase();
  const visible = projects.filter(p => !normalizedQuery || `${p.name} ${p.path} ${p.ssh?.host || ''}`.toLowerCase().includes(normalizedQuery));
  const visibleIds = new Set(visible.map(p => p.id));
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(Math.max(visible.length, 1)))));
  const rows = Math.max(1, Math.ceil(visible.length / columns));
  const focus = projects.find(p => p.id === focusedId);
  navigation.current = (focusedId ? orderedProjects : orderedProjects.filter(project => visibleIds.has(project.id))).map(project => project.id);
  const switchProject = projectSwitch && projectRecords.get(projectSwitch.id);
  const switchPosition = projectSwitch ? navigation.current.indexOf(projectSwitch.id) + 1 : 0;
  const setPreference = (patch: Partial<Settings>) => { perform(api.settings(patch)); };

  return <div ref={focusMotionRoot} className={`app-shell ${focusedId ? 'focus-mode' : ''} ${fullScreen ? 'is-fullscreen' : ''} ${fullScreen && workspace.autoHideTitlebar ? 'titlebar-auto' : ''}`} style={{ '--terminal-font-size': `${settings.fontSize}px` } as CSSProperties}>
    {fullScreen && workspace.autoHideTitlebar && <div className="titlebar-reveal" aria-hidden="true" />}
    <div className="titlebar">
      <div className="titlebar-brand"><span className="brand-mark"><i /><i /><i /><i /></span><span>Project Grid</span></div>
      {!!projects.length && <div className="workspace-summary" role="status" aria-label={t('工作区概况')}>
        <span>{projects.length === 1 ? t('1 个项目') : t('{count} 个项目', { count: projects.length })}{projects.some(project => project.kind === 'ssh') ? t(' · 含 SSH') : ''}</span>
        {!!unread && <span className="summary-unread"><i className="legend-red" />{t('{count} 待查看', { count: unread })}</span>}
        {!!completed && <span className="summary-complete"><i className="legend-green" />{t('{count} 本轮完成', { count: completed })}</span>}
      </div>}
      <div className="titlebar-space" />
      <div className="titlebar-tools">
        {/* Search and add project open from their shortcuts (Ctrl+Shift+F and Ctrl+Shift+N by default, configurable);
            the search box shows while in use. */}
        {!focusedId && (searchOpen || query) && <div className="search-input"><MagnifyingGlass size={15} /><input ref={queryInput} placeholder={t('搜索项目或路径…')} aria-label={t('搜索项目')} value={query} onChange={e => setQuery(e.target.value)} onBlur={() => { if (!query) setSearchOpen(false); }} onKeyDown={event => { if (event.key === 'Escape') { setQuery(''); setSearchOpen(false); } }} />{query ? <IconButton label={t('清除搜索')} onClick={() => setQuery('')}><X size={13} /></IconButton> : <kbd>{shortcut('search')}</kbd>}</div>}
        <IconButton label={t('工作台设置')} className={updates?.status === 'ready' ? 'update-ready' : ''} onClick={() => setSettingsOpen(true)}><GearSix size={16} /></IconButton>
      </div>
      <div className="window-actions"><IconButton label={t('最小化')} onClick={() => api.minimize()}><Minus size={16} /></IconButton><IconButton label={t('最大化或还原')} onClick={() => api.maximize()}><Square size={12} /></IconButton><IconButton label={t('关闭窗口')} className="window-close" onClick={() => api.close()}><X size={17} /></IconButton></div>
    </div>
    <div className="workspace-layout">
      {focus && <ProjectExplorer key={focus.id} project={focus} collapsed={settings.explorerCollapsed}
        onFilesRemoved={paths => setPreviewFile(current => current?.projectId === focus.id && paths.some(path => current.path === path || current.path.startsWith(path + '/')) ? null : current)}
        onPathRenamed={(oldPath, newPath) => setPreviewFile(current => current?.projectId === focus.id && (current.path === oldPath || current.path.startsWith(oldPath + '/')) ? { projectId: focus.id, path: newPath + current.path.slice(oldPath.length) } : current)}
        expandedPaths={expandedByProject[focus.id] ?? ['']} selectedFile={previewFile?.projectId === focus.id ? previewFile.path : null} changeRevision={changeRevision}
        onOpenChange={async (path, mode) => { if (previewFile?.projectId === focus.id && previewFile.path === path && previewFile.diff === mode) return; if (await allowNavigation()) setPreviewFile({ projectId: focus.id, path, diff: mode === 'file' ? undefined : mode }); }}
        onCollapse={() => setPreference({ explorerCollapsed: !settings.explorerCollapsed })}
        onExpandedChange={paths => setExpandedByProject(value => ({ ...value, [focus.id]: paths }))}
        onSelectFile={async path => { if (previewFile?.projectId === focus.id && previewFile.path === path && !previewFile.diff) return; if (await allowNavigation()) setPreviewFile({ projectId: focus.id, path }); }} onReturn={returnToGrid} />}
      <main className="main-workspace">
        <ProjectSwitchHud target={projectSwitch && switchProject && switchPosition > 0 ? { name: switchProject.name, index: orderedProjects.indexOf(switchProject) + 1, position: switchPosition, total: navigation.current.length, sequence: projectSwitch.sequence } : null} />
        {agents && !agents.codex.installed && !agents.claude.installed && !agentsDismissed && <div className="workspace-warning agents-warning"><Info size={15} /><span>{t('未检测到 Codex 或 Claude Code。Project Grid 基于这两个命令行工具工作，安装其中一个后才能使用任务提醒和会话恢复。')}</span><button type="button" className="button secondary small" onClick={() => { setSettingsSection('agents'); setSettingsOpen(true); }}>{t('去安装')}</button><IconButton label={t('关闭提示')} onClick={() => setAgentsDismissed(true)}><X size={14} /></IconButton></div>}
        {workspace.warning && <div className="workspace-warning"><Info size={15} />{t(workspace.warning)}</div>}
        {focusedId && previewFile?.projectId === focusedId && previewFile.diff && <Suspense fallback={null}><GitDiffView key={`${focusedId}:${previewFile.path}:${previewFile.diff}`} projectId={focusedId} filePath={previewFile.path} mode={previewFile.diff} onClose={() => setPreviewFile(null)} onOpenFile={() => setPreviewFile({ projectId: focusedId, path: previewFile.path })} onError={reportError} onChanged={() => setChangeRevision(value => value + 1)} /></Suspense>}
        {focusedId && previewFile?.projectId === focusedId && !previewFile.diff && <Suspense fallback={null}><FilePreview key={`${focusedId}:${previewFile.path}`} projectId={focusedId} filePath={previewFile.path} onClose={async () => { if (await allowNavigation()) setPreviewFile(null); }} autoSave={settings.autoSave} onOpenLink={target => openTerminalLink(focusedId, target)} onError={reportError} registerGuard={registerEditorGuard} /></Suspense>}
        <div className={`grid-area ${!projects.length ? 'empty-area' : ''}`} style={{ visibility: focusedId && previewFile?.projectId === focusedId ? 'hidden' : undefined }}>
          {!projects.length ? <div className="empty-workspace">
            <div className="empty-illustration" aria-hidden="true"><div className="illustration-tile"><span /><i /><i /><i /></div><div className="illustration-tile red-tile"><span /><i /><i /><b /></div><div className="illustration-tile green-tile"><Check size={22} /></div><div className="illustration-tile"><span /><i /><i /></div></div>
            <span className="eyebrow">{t('你的多项目工作台')}</span><h2>{t('每个项目，一个方框。')}</h2><p>{t('添加项目目录，在独立终端里运行 Codex 或 Claude Code。')}<br />{t('方框亮起时，点击全屏查看，再继续下一轮。')}</p>
            <p className="agents-empty-note">{t('需要已安装 Codex CLI 或 Claude Code；可在设置的「编码助手」里一键安装。')}</p>
            <button className="button primary" onClick={() => setAddOpen(true)}><FolderSimplePlus size={18} />{t('添加第一个项目')}</button>
            <div className="empty-hints"><span><Circle weight="fill" size={7} />{t('粉色呼吸 · 等待查看')}</span><span><CheckCircle weight="fill" size={12} />{t('绿色常亮 · 本轮完成')}</span></div>
          </div> : <>
            {!focusedId && !visible.length && <div className="no-results"><MagnifyingGlass size={30} weight="light" /><h2>{t('没有找到匹配项目')}</h2><p>{t('试试其他项目名称或目录。')}</p><button className="button secondary small" onClick={() => setQuery('')}>{t('重置搜索')}</button></div>}
            <div className={`project-grid ${reorder.drag ? 'is-reordering' : ''}`} onPointerDown={reorder.onPointerDown} onClickCapture={reorder.onClickCapture} style={{ '--columns': columns, '--rows': rows, display: !focusedId && !visible.length ? 'none' : undefined } as CSSProperties}>
              {orderedProjects.map((project, index) => <div key={project.id} className={`project-slot ${reorder.drag?.id === project.id ? 'drag-placeholder' : ''}`} data-project-slot={project.id} style={{ display: focusedId ? focusedId !== project.id ? 'none' : undefined : !visibleIds.has(project.id) ? 'none' : undefined }}><ProjectPanel project={project} index={index}
                hidden={focusedId ? focusedId !== project.id : !visibleIds.has(project.id)} focused={focusedId === project.id && !previewFile}
                navTarget={projectSwitch?.id === project.id ? projectSwitch.sequence : undefined}
                navPosition={projectSwitch?.id === project.id && switchPosition > 0 ? t('{position} / {total}', { position: switchPosition, total: navigation.current.length }) : undefined}
                fontSize={settings.fontSize} now={now} activityOpen={settings.activityPane} onToggleActivity={() => setPreference({ activityPane: !settings.activityPane })} onFocus={focusProject} onAction={perform} onError={reportError} onOpenLink={openTerminalLink} onRevealProject={revealProject}
                dragging={reorder.drag?.id === project.id} /> </div>)}
              {reorder.drag && <div className="reorder-hint" role="status">{t('拖动项目排序 · 松开完成')}<span>{t('Esc 取消')}</span></div>}
            </div>
          </>}
        </div>
      </main>
    </div>
    {error && <div className="error-toast" role="alert"><Info size={18} /><span>{error}</span><IconButton label={t('关闭提示')} onClick={() => setError(null)}><X size={16} /></IconButton></div>}
    {guide === 'tour' && <GuideTour projects={projects} focusedId={focusedId} withAdd={tourWithAdd.current} onClose={() => { setGuide(null); if (settings.guideVersion !== workspace.version) setPreference({ guideVersion: workspace.version }); }} />}
    {guide && guide !== 'tour' && <UsageGuide version={workspace.version} start={guide} onTour={startTour} onClose={() => { setGuide(null); if (settings.guideVersion !== workspace.version) setPreference({ guideVersion: workspace.version }); }} />}
    {settingsOpen && <SettingsDialog settings={settings} localShell={workspace.localShell ?? null} agents={agents} onAgents={setAgents} initialSection={settingsSection} updates={updates} onGuide={() => { setSettingsOpen(false); setSettingsSection('appearance'); startTour(); }} onCheckUpdate={() => { perform(api.checkForUpdates()); }} onInstallUpdate={() => { perform(api.installUpdate()); }} onDownloadPage={() => { perform(api.openDownloadPage()); }} close={() => { setSettingsOpen(false); setSettingsSection('appearance'); }} update={setPreference} quit={() => perform(api.quit())} />}
    {addOpen && <AddProjectDialog onClose={() => setAddOpen(false)} onAdded={() => setQuery('')} onError={reportError} />}
    {sshAuth[0] && <SSHAuthDialog key={sshAuth[0].id} request={sshAuth[0]} />}
    <VoiceOverlay />
  </div>;
}
