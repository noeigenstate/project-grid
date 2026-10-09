import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import type { AgentSession } from '../../shared/types';
import { resumeReadingSession, sessionAge } from './reading-sessions';
import { t } from '../../shared/i18n';

function relativeTime(updatedAt: number, now: number) {
  const age = sessionAge(updatedAt, now);
  switch (age.unit) {
    case 'now': return t('刚刚');
    case 'minutes': return t('{count} 分钟前', { count: age.count });
    case 'hours': return t('{count} 小时前', { count: age.count });
    case 'days': return t('{count} 天前', { count: age.count });
  }
}

export function ReadingSessions({ terminalId, onClose, onSent, onError }: {
  terminalId: string; onClose: () => void; onSent: (text: string) => void; onError: (message: string) => void;
}) {
  const [sessions, setSessions] = useState<AgentSession[] | null>(null), [failed, setFailed] = useState(false);
  const [highlight, setHighlight] = useState(0), [pending, setPending] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const card = useRef<HTMLDivElement>(null), active = useRef(true), sending = useRef(false);
  useEffect(() => {
    active.current = true;
    card.current?.focus();
    void window.projectGrid.agentSessions(terminalId).then(result => {
      if (!active.current) return;
      if (result.ok) setSessions(result.value);
      else { setFailed(true); setSessions([]); onError(result.error); }
    }).catch(error => { if (active.current) { setFailed(true); setSessions([]); onError(String(error)); } });
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => { active.current = false; clearInterval(timer); };
  }, [terminalId]);
  useEffect(() => { card.current?.querySelector<HTMLElement>('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' }); }, [highlight]);
  const choose = async (session: AgentSession | undefined) => {
    if (!session || sending.current) return;
    sending.current = true; setPending(session.id); card.current?.focus();
    try {
      const followed = await resumeReadingSession(session.id,
        text => window.projectGrid.writeTerminal(terminalId, text),
        id => window.projectGrid.followAgentSession(terminalId, id), () => active.current);
      if (!active.current) return;
      onSent(`/resume ${session.id}`);
      if (!followed) onError(t('无法读取这个 Claude 会话的历史。'));
      onClose();
    } catch (error) {
      if (active.current) { sending.current = false; setPending(null); onError(String(error)); }
    }
  };
  const close = () => { if (!sending.current) onClose(); };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (sending.current) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'Enter') void choose(sessions?.[highlight]);
    else setHighlight(index => Math.max(0, Math.min((sessions?.length || 1) - 1, index + (event.key === 'ArrowUp' ? -1 : 1))));
  };
  return <div ref={card} className="reading-choice reading-sessions" role="group" aria-label={t('恢复会话')} aria-busy={sessions === null || pending !== null} tabIndex={-1} onKeyDown={keys}
    onFocus={() => window.projectGrid.terminalFocus(terminalId, false)}>
    <div className="reading-choice-head"><strong>{t('恢复会话')}</strong><button type="button" className="text-button" disabled={pending !== null} onClick={close}>{t('取消')}</button></div>
    {sessions === null ? <p className="reading-sessions-empty"><CircleNotch size={13} className="loading-spinner" />{t('正在加载会话…')}</p>
      : !sessions.length ? <p className="reading-sessions-empty">{failed ? t('无法加载 Claude 会话。') : t('这个项目还没有其他 Claude 会话')}</p>
      : <div className="reading-choice-options">{sessions.map((session, index) => <button type="button" key={session.id} className="reading-choice-option" data-highlighted={index === highlight} disabled={pending !== null} onClick={() => { setHighlight(index); void choose(session); }}>
        <span className="reading-choice-label"><b>{session.title || t('未命名会话')}</b><small>{relativeTime(session.updatedAt, now)} · {t('约 {count} 条消息', { count: session.messages })}</small></span>
        {pending === session.id && <CircleNotch size={13} className="loading-spinner" />}
      </button>)}</div>}
    <small className="reading-choice-hint">{t('↑/↓ 选择 · Enter 恢复 · Esc 取消')}</small>
  </div>;
}
