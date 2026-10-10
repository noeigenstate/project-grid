import { useEffect, useState } from 'react';
import { CircleNotch, Lightning, Terminal as TerminalIcon } from '@phosphor-icons/react';
import type { Result } from '../../shared/types';
import { relativeTime } from '../../shared/time';
import { t } from '../../shared/i18n';
import './agent-launcher.css';

type Agent = 'claude' | 'codex';
type History = Record<Agent, { id: string; at: number } | null>;
const AGENTS: { agent: Agent; name: string; mark: string }[] = [{ agent: 'claude', name: 'Claude Code', mark: '✻' }, { agent: 'codex', name: 'Codex', mark: '>_' }];

// A project with no terminal yet: pick the agent to work with, fresh or continuing this folder's latest conversation
// with it. A plain terminal (for other CLIs) and, when enabled, Codex without a terminal stay one click away.
export function AgentLauncher({ terminalId, codexDirect, onAction }: {
  terminalId: string; codexDirect: boolean; onAction: <T,>(promise: Promise<Result<T>>) => Promise<T | undefined>;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [mode, setMode] = useState<'new' | 'continue' | null>(null);
  const [starting, setStarting] = useState<Agent | 'terminal' | 'direct' | null>(null);
  useEffect(() => {
    let active = true;
    void window.agentrix.agentHistory(terminalId).then(result => {
      if (!active) return;
      const found = result.ok ? result.value : { claude: null, codex: null };
      setHistory(found); setMode(current => current ?? (found.claude || found.codex ? 'continue' : 'new'));
    });
    return () => { active = false; };
  }, [terminalId]);
  const known = !!history && !!(history.claude || history.codex), chosen = mode ?? 'new';
  const start = async (what: Agent | 'terminal' | 'direct') => {
    if (starting) return;
    setStarting(what);
    // Once started, the terminal (or the reading view) takes this card's place; a failure leaves it to try again.
    if (what === 'terminal') await onAction(window.agentrix.startTerminal(terminalId));
    else await onAction(what === 'direct' ? window.agentrix.agentStart(terminalId) : window.agentrix.agentLaunch(terminalId, what, chosen));
    setStarting(null);
  };
  const note = (agent: Agent) => {
    if (chosen === 'new') return t('开始新的对话');
    if (!history) return t('正在查找开发记录…');
    const last = history[agent];
    return last ? t('接着上次的对话 · {time}', { time: relativeTime(last.at, Date.now()) }) : t('没有它的开发记录，将重新开始');
  };
  return <div className="agent-launcher">
    <p className="agent-launcher-title">{t('选择助手，开始开发')}</p>
    <div className="agent-launcher-mode" role="radiogroup" aria-label={t('开发方式')}>
      <button type="button" role="radio" aria-checked={chosen === 'new'} onClick={() => setMode('new')}>{t('开始新开发')}</button>
      <button type="button" role="radio" aria-checked={chosen === 'continue'} disabled={!known} title={history && !known ? t('这个文件夹还没有开发记录') : undefined} onClick={() => setMode('continue')}>{t('继承开发历史')}</button>
    </div>
    <div className="agent-launcher-agents">{AGENTS.map(({ agent, name, mark }) => <button type="button" key={agent} className={`agent-launcher-agent is-${agent}`} disabled={!!starting} onClick={() => void start(agent)}>
      <span className="agent-launcher-mark" aria-hidden="true">{starting === agent ? <CircleNotch size={16} className="loading-spinner" /> : mark}</span>
      <b>{name}</b><small>{note(agent)}</small>
    </button>)}</div>
    <div className="agent-launcher-more">
      <button type="button" className="text-button" disabled={!!starting} onClick={() => void start('terminal')}><TerminalIcon size={13} />{t('只打开终端')}</button>
      {codexDirect && <button type="button" className="text-button" disabled={!!starting} title={t('不经过终端，阅读视图直接与 Codex 对话')} onClick={() => void start('direct')}><Lightning size={13} weight="fill" />{t('直连 Codex')}</button>}
    </div>
  </div>;
}
