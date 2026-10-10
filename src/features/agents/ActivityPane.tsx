import { useEffect, useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import type { AgentAction, AgentActionPacket, AgentActionBrief, Project, ProjectTerminal } from '../../shared/types';
import { t } from '../../shared/i18n';

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

// The live feed names each step by what it really is: a tag for its kind, then the command itself, the skill, the
// MCP server's tool or the files it made or changed; a second line says what that is or did.
const KIND_TAGS: Record<AgentActionBrief['kind'], string> = { edit: '文件', command: '命令', read: '读取', search: '搜索', web: '网页', skill: '技能', mcp: 'MCP', agent: '子代理', other: '工具' };
const CHANGE_LABELS: Record<string, string> = { add: '新建', update: '修改', delete: '删除', write: '写入' };
function stepLines(action: AgentAction): { title: string; note: string; code: boolean } {
  const target = action.target, detail = action.detail;
  if (action.kind === 'edit') return action.files?.length
    ? { title: action.files.map(file => base(file.path)).join('、'), note: action.files.map(file => `${t(CHANGE_LABELS[file.change] || '修改')} ${file.path}`).join('、'), code: false }
    : { title: detail || t('通过命令修改文件'), note: t('通过命令修改文件'), code: !!detail };
  if (action.kind === 'command') return { title: target, note: [action.phrase ? `${t(action.phrase)} ${action.object || ''}`.trim() : '', detail].filter(Boolean).join(' · '), code: true };
  if (action.kind === 'read') return { title: base(target), note: target, code: false };
  if (action.kind === 'search') return { title: target, note: detail ? t('在 {path} 中搜索', { path: detail }) : t('搜索代码'), code: true };
  if (action.kind === 'web') return { title: target, note: /^https?:/i.test(target) ? t('访问网页') : t('搜索网页'), code: false };
  if (action.kind === 'skill') return { title: target, note: action.description || detail, code: false };
  if (action.kind === 'mcp') { const [server, tool] = target.split(' · '); return { title: tool || target, note: t('MCP 服务 {server}', { server: action.server || server }), code: false }; }
  if (action.kind === 'agent') return { title: target, note: [t('子代理'), detail].filter(Boolean).join(' · '), code: false };
  return { title: target || action.tool, note: t('调用工具'), code: false };
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
    const off = window.agentrix.onTerminalAction(packet => {
      if (packet.id !== terminal.id) return;
      if (waiting) queued.push(packet);
      else setActions(current => apply(current, packet));
    });
    void window.agentrix.terminalActions(terminal.id).then(
      result => snapshot(result.ok ? result.value : []), () => snapshot([]),
    );
    return () => { active = false; off(); };
  }, [terminal.id, terminal.sessionId]);
  const working = terminal.codexActive && terminal.codexActivity === 'working';
  const running = working ? [...actions].reverse().find(action => !action.done) : undefined;
  const agent = terminal.agent === 'claude' ? 'Claude Code' : 'Codex';
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!working) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [working]);
  const done = actions.filter(action => action.done).length, failed = actions.filter(action => action.failed).length;
  const started = actions[0]?.at, ended = working ? now : actions.at(-1)?.at;
  const status = !terminal.codexActive ? t('没有运行中的 Codex 或 Claude Code')
    : running ? t('正在{step}', { step: actionText(running) })
    : working ? t('{agent} 正在思考', { agent })
    : terminal.codexActivity === 'complete' ? t('本轮已完成') : t('等待指令');
  return <aside className="activity-pane" aria-label={t('活动')}>
    <header className="activity-header"><b>{t('活动')}</b><span>{terminal.codexActive ? agent : ''}{actions.length ? ` · ${t('{count} 步', { count: actions.length })}` : ''}</span></header>
    <div className={`activity-now ${running?.kind === 'edit' ? 'is-editing' : ''} ${working ? 'is-working' : ''}`} role="status" title={status}>
      {working && <CircleNotch size={14} className="loading-spinner" />}<span>{status}</span>
    </div>
    <div className="overview-stats" aria-label={t('本轮概览')}>
      <div><b>{actions.length}</b><span>{t('工具调用')}</span></div>
      <div><b>{done}</b><span>{t('已完成')}</span></div>
      <div className={failed ? 'is-failed' : ''}><b>{failed}</b><span>{t('失败')}</span></div>
      <div><b>{started && ended ? seconds(ended - started) : '—'}</b><span>{working ? t('已进行') : t('用时')}</span></div>
    </div>
    <div className="activity-split">
    <section className="activity-live" aria-label={t('实时动态')}>
    <h4 className="activity-section-title">{t('实时动态')}</h4>
    <div className="activity-list" role="list">
      {!actions.length && <p className="activity-empty">{!terminal.codexActive
        ? project.kind === 'ssh' ? t('远程项目暂不显示活动。') : t('在终端里启动 Codex 或 Claude Code 后，这里显示它每一步在做什么：改了哪些文件、运行了什么命令、调用了哪些技能和 MCP 工具。')
        : t('这一轮还没有调用工具。')}</p>}
      {[...actions].reverse().map(action => {
        const { title, note, code } = stepLines(action);
        return <div key={action.id} role="listitem" title={[title, note].filter(Boolean).join('\n')} className={`activity-item activity-${action.kind} ${action.done ? '' : 'is-running'} ${action.failed ? 'is-failed' : ''}`}>
          <time>{clock(action.at)}</time><span className="activity-tag">{t(KIND_TAGS[action.kind])}</span>
          <span className={`activity-title ${code ? 'is-code' : ''}`}>{title}</span>{action.failed && <em>{t('失败')}</em>}
          {note && <p>{note}</p>}
        </div>;
      })}
    </div>
    </section>
    <section className="activity-overview" aria-label={t('正在处理的任务')}>
      <h4 className="activity-section-title">{t('正在处理的任务')}</h4>
      <div className="overview-body"><PromptList terminal={terminal} /></div>
    </section>
    </div>
  </aside>;
}

const seconds = (ms: number) => { const total = Math.max(0, Math.round(ms / 1000)), m = Math.floor(total / 60); return m ? t('{m} 分 {s} 秒', { m, s: total % 60 }) : t('{s} 秒', { s: total }); };

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
