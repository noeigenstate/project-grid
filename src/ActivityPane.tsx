import { useEffect, useMemo, useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import type { AgentAction, AgentActionPacket, AgentActionBrief, Project, ProjectTerminal } from './types';
import { t } from './i18n';

// What each kind of step is called, in the card's one-line status and in the activity pane.
const KIND_LABELS: Record<AgentActionBrief['kind'], string> = { edit: '修改', command: '运行', read: '读取', search: '搜索', web: '访问', skill: '技能', mcp: 'MCP', agent: '子代理', other: '调用' };

const base = (file: string) => file.split(/[\\/]/).pop() || file;
// What kind of step it is, in a word or two: a command says what it does ("运行测试"), others their kind.
export function stepVerb(action: AgentActionBrief) {
  return action.kind === 'command' && action.phrase ? t(action.phrase) : t(KIND_LABELS[action.kind]);
}
// "运行测试", "修改 App.tsx": what a step does, in a few words a person reads at a glance. The full command
// or path is left for the tooltip. An edit made through a shell script names no file.
export function actionText(action: AgentActionBrief) {
  const target = action.target;
  if (action.kind === 'edit') return target ? `${t('修改')} ${target.split('、').map(base).join('、')}` : t('通过命令修改文件');
  if (action.kind === 'read') return `${t('读取')} ${base(target)}`.trim();
  if (action.kind === 'search') return target ? t('搜索“{text}”', { text: target }) : t('搜索');
  if (action.kind === 'web') { let host = ''; try { host = new URL(target).host; } catch { } return host ? `${t('访问')} ${host}` : t('搜索网页“{text}”', { text: target }); }
  if (action.kind === 'skill') return `${t('使用技能')} ${target}`.trim();
  if (action.kind === 'mcp') { const [server, tool] = target.split(' · '); return t('调用 {server} 的 {tool}', { server, tool: tool || t('工具') }); }
  if (action.kind === 'agent') return `${t('派出子代理')} ${target}`.trim();
  if (action.kind === 'command') return action.phrase ? `${t(action.phrase)} ${action.object || ''}`.trim() : `${t('运行')} ${target}`.trim();
  return `${t('调用工具')} ${target}`.trim();
}
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour12: false });

function explanation(action: AgentAction) {
  if (action.kind === 'skill') return action.description || t('没有找到这个技能的说明（SKILL.md）');
  if (action.kind === 'mcp') return t('由 MCP 服务 {server} 提供的工具', { server: action.server || action.target.split(' · ')[0] });
  if (action.kind === 'edit' && !action.target) return action.detail;
  return action.detail;
}

// The steps of the current round for one terminal, newest first: which files the agent edits, which commands
// it runs, which skills and MCP tools it calls and what those are for. The main process reads them from the
// agent's own transcript and sends changes as they happen.
export function ActivityPane({ project, terminal }: { project: Project; terminal: ProjectTerminal }) {
  const [actions, setActions] = useState<AgentAction[]>([]);
  useEffect(() => {
    let active = true; setActions([]);
    let waiting = true;
    let queued: AgentActionPacket[] = [];
    const apply = (current: AgentAction[], packet: AgentActionPacket) => {
      if (packet.list) return packet.list.slice(-200);
      const next = [...current], positions = new Map(next.map((action, index) => [action.id, index]));
      for (const action of packet.changes || []) {
        const at = positions.get(action.id);
        if (at === undefined) { positions.set(action.id, next.length); next.push(action); }
        else next[at] = action;
      }
      return next.slice(-200);
    };
    const snapshot = (initial: AgentAction[]) => {
      if (!active) return;
      const next = queued.reduce(apply, initial.slice(-200));
      queued = []; waiting = false; setActions(next);
    };
    const off = window.projectGrid.onTerminalAction(packet => {
      if (packet.id !== terminal.id) return;
      if (waiting) queued.push(packet);
      else setActions(current => apply(current, packet));
    });
    void window.projectGrid.terminalActions(terminal.id).then(
      result => snapshot(result.ok ? result.value : []), () => snapshot([]),
    );
    return () => { active = false; off(); };
  }, [terminal.id, terminal.sessionId]);
  const working = terminal.codexActive && terminal.codexActivity === 'working';
  const running = working ? [...actions].reverse().find(action => !action.done) : undefined;
  const agent = terminal.agent === 'claude' ? 'Claude Code' : 'Codex';
  const status = !terminal.codexActive ? t('没有运行中的 Codex 或 Claude Code')
    : running ? t('正在{step}', { step: actionText(running) })
    : working ? t('{agent} 正在思考', { agent })
    : terminal.codexActivity === 'complete' ? t('本轮已完成') : t('等待指令');
  return <aside className="activity-pane" aria-label={t('活动')}>
    <header className="activity-header"><b>{t('活动')}</b><span>{terminal.codexActive ? agent : ''}{actions.length ? ` · ${t('{count} 步', { count: actions.length })}` : ''}</span></header>
    <div className={`activity-now ${running?.kind === 'edit' ? 'is-editing' : ''} ${working ? 'is-working' : ''}`} role="status" title={status}>
      {working && <CircleNotch size={14} className="loading-spinner" />}<span>{status}</span>
    </div>
    <div className="activity-split">
    <section className="activity-live" aria-label={t('实时动态')}>
    <h4 className="activity-section-title">{t('实时动态')}</h4>
    <div className="activity-list" role="list">
      {!actions.length && <p className="activity-empty">{!terminal.codexActive
        ? project.kind === 'ssh' ? t('远程项目暂不显示活动。') : t('在终端里启动 Codex 或 Claude Code 后，这里显示它每一步在做什么：改了哪些文件、运行了什么命令、调用了哪些技能和 MCP 工具。')
        : t('这一轮还没有调用工具。')}</p>}
      {/* One line a step: "14:03:22：正在运行测试". The command, path or what a skill is for shows on hover. */}
      {[...actions].reverse().map(action => {
        const step = actionText(action), hover = [action.target, action.detail, explanation(action)].filter((text, index, all) => text && all.indexOf(text) === index).join('\n');
        return <div key={action.id} role="listitem" title={hover} className={`activity-item activity-${action.kind} ${action.done ? '' : 'is-running'} ${action.failed ? 'is-failed' : ''}`}>
          <time>{clock(action.at)}</time><span className="activity-step">{t('：')}{action.done ? step : t('正在{step}', { step })}{action.failed && <em>{t('（失败）')}</em>}</span>
        </div>;
      })}
    </div>
    </section>
    <RoundOverview terminal={terminal} actions={actions} working={working} />
    </div>
  </aside>;
}

const seconds = (ms: number) => { const total = Math.max(0, Math.round(ms / 1000)), m = Math.floor(total / 60); return m ? t('{m} 分 {s} 秒', { m, s: total % 60 }) : t('{s} 秒', { s: total }); };

// The round at a glance: what it was asked to do, how many tools it called and how long it has taken, which
// files it touched, and the skills and MCP tools it used with what they are for.
function RoundOverview({ terminal, actions, working }: { terminal: ProjectTerminal; actions: AgentAction[]; working: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!working) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [working]);
  const summary = useMemo(() => {
    const files = new Set<string>(), skills = new Map<string, string>(), servers = new Map<string, Set<string>>();
    for (const action of actions) {
      if (action.kind === 'edit' && action.target) for (const file of action.target.replace(/\s\+\d+$/, '').split('、')) if (file.trim()) files.add(file.trim());
      if (action.kind === 'skill' && action.target) skills.set(action.target, action.description || skills.get(action.target) || '');
      if (action.kind === 'mcp') { const [server, tool] = action.target.split(' · '); if (!servers.has(server)) servers.set(server, new Set()); if (tool) servers.get(server)!.add(tool); }
    }
    return { files: [...files], skills: [...skills], servers: [...servers], done: actions.filter(a => a.done).length, failed: actions.filter(a => a.failed).length };
  }, [actions]);
  const started = actions[0]?.at, ended = working ? now : actions.at(-1)?.at;
  return <section className="activity-overview" aria-label={t('本轮概览')}>
    <h4 className="activity-section-title">{t('本轮概览')}</h4>
    <div className="overview-body">
      <PromptList terminal={terminal} />
      <div className="overview-stats">
        <div><b>{actions.length}</b><span>{t('工具调用')}</span></div>
        <div><b>{summary.done}</b><span>{t('已完成')}</span></div>
        <div className={summary.failed ? 'is-failed' : ''}><b>{summary.failed}</b><span>{t('失败')}</span></div>
        <div><b>{started && ended ? seconds(ended - started) : '—'}</b><span>{working ? t('已进行') : t('用时')}</span></div>
      </div>
      {summary.files.length > 0 && <div className="overview-group"><h5>{t('修改的文件')}<span>{summary.files.length}</span></h5>{summary.files.slice(-6).reverse().map(file => <code key={file} title={file}>{file}</code>)}{summary.files.length > 6 && <small>{t('还有 {count} 个', { count: summary.files.length - 6 })}</small>}</div>}
      {summary.skills.length > 0 && <div className="overview-group"><h5>{t('技能')}<span>{summary.skills.length}</span></h5>{summary.skills.map(([name, description]) => <div key={name} className="overview-named"><b>{name}</b>{description && <p title={description}>{description}</p>}</div>)}</div>}
      {summary.servers.length > 0 && <div className="overview-group"><h5>MCP<span>{summary.servers.length}</span></h5>{summary.servers.map(([server, tools]) => <div key={server} className="overview-named"><b>{server}</b><p>{[...tools].join('、') || t('工具')}</p></div>)}</div>}
    </div>
  </section>;
}

// The prompts sent and not finished: the one being worked on first, then those waiting their turn. A prompt
// leaves the list when the round that worked on it ends.
function PromptList({ terminal }: { terminal: ProjectTerminal }) {
  const prompts = terminal.prompts || [];
  if (!prompts.length) {
    const text = !terminal.codexActive ? t('还没有开始任务') : terminal.codexActivity === 'complete' && terminal.task ? t('已完成：{task}', { task: terminal.task }) : t('没有待处理的提示');
    return <p className="overview-task is-quiet" title={text}>{text}</p>;
  }
  return <ol className="overview-prompts" aria-label={t('提示')}>
    {prompts.map(prompt => <li key={prompt.id} className={prompt.state === 'working' ? 'is-working' : ''} title={prompt.text}>
      <span>{prompt.state === 'working' ? t('正在处理') : t('排队中')}</span><p>{prompt.text}</p>
    </li>)}
  </ol>;
}
