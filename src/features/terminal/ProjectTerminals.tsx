import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowCounterClockwise, Lightning, Play, Terminal as TerminalIcon, X } from '@phosphor-icons/react';
import { TerminalPane } from './TerminalPane';
import { ReadingView } from '../reading/ReadingView';
import { readingShown, setReading, syncReading, useTerminalChoice } from '../reading/reading-mode';
import { VoiceButton } from '../voice/VoiceButton';
import type { Project, ProjectTerminal, Result } from '../../shared/types';
import { t } from '../../shared/i18n';

function label(terminal: ProjectTerminal) {
  if (terminal.error) return t('需要检查');
  if (terminal.codexActive) return terminal.codexActivity === 'working' ? t('正在处理') : terminal.codexActivity === 'complete' ? t('本轮已完成') : terminal.codexActivity === 'interrupted' ? t('已中断') : t('{agent} 会话中', { agent: terminal.agent === 'claude' ? 'Claude' : 'Codex' });
  return terminal.status === 'starting' ? t('正在启动') : terminal.status === 'shell' ? t('终端就绪') : terminal.status === 'exited' ? t('已退出') : t('尚未启动');
}

export function ProjectTerminals({ project, focused, fontSize, codexDirect, activeId, setActiveId, onAction, onError, onOpenLink }: {
  project: Project; focused: boolean; fontSize: number; codexDirect: boolean; activeId: string | null; setActiveId: (id: string) => void;
  onAction: <T,>(promise: Promise<Result<T>>) => Promise<T | undefined>;
  onError: (message: string) => void; onOpenLink: (projectId: string, target: string) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const terminals = project.terminals;
  const multiple = terminals.length > 1;
  const columns = Math.min(Math.ceil(Math.sqrt(terminals.length)), width < 600 ? 1 : width < 1150 ? 2 : 3);
  const rows = Math.ceil(terminals.length / columns);
  const selected = terminals.some(item => item.id === activeId) ? activeId : terminals[0]?.id;
  const raw = useTerminalChoice();
  useEffect(() => { terminals.forEach(syncReading); }, [terminals, raw]);
  useEffect(() => {
    const node = area.current; if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  return <div ref={area} className={`panel-terminal-area terminal-grid ${multiple ? 'has-splits' : ''}`} style={{ '--terminal-columns': columns, '--terminal-rows': rows } as CSSProperties}>
    {terminals.map(terminal => {
      const stopped = terminal.status === 'stopped' || terminal.status === 'exited';
      const name = `${project.name} ${terminal.title}`;
      return <section key={terminal.id} className={`terminal-split ${selected === terminal.id ? 'is-active-terminal' : ''}`} data-terminal-id={terminal.id} data-session-id={terminal.sessionId || ''} data-codex-active={terminal.codexActive} aria-label={name} onPointerDownCapture={() => setActiveId(terminal.id)}>
        {multiple && <header className="terminal-split-header"><span>{terminal.title}</span><span className={`split-status ${terminal.codexActivity === 'working' ? 'working' : terminal.codexActivity === 'complete' ? 'complete' : ''}`}>{label(terminal)}</span>
          <button className="icon-button" title={t('重启此终端')} aria-label={t('重启 {name}', { name })} onClick={() => void onAction(window.projectGrid.restartTerminal(terminal.id))}><ArrowCounterClockwise size={13} /></button>
          <button className="icon-button" title={t('关闭此终端')} aria-label={t('关闭 {name}', { name })} onClick={() => void onAction(window.projectGrid.closeTerminal(terminal.id))}><X size={13} /></button>
        </header>}
        <div className="terminal-split-body">
          {/* Codex connected directly has no terminal: the reading view is all there is, also after it exits. */}
          {(terminal.direct || readingShown(terminal, raw)) && <ReadingView projectId={project.id} terminal={terminal} autoFocus={focused && selected === terminal.id} onShowTerminal={() => setReading(terminal.id, false)} onError={onError} onOpenLink={target => onOpenLink(project.id, target)} />}
          {terminal.direct ? null : terminal.sessionId ? <TerminalPane id={terminal.id} sessionId={terminal.sessionId} fontSize={fontSize} focused={focused && selected === terminal.id && !readingShown(terminal, raw)} onError={onError} onOpenLink={(_id, target) => onOpenLink(project.id, target)} remote={project.kind === 'ssh'} />
            : <div className="terminal-empty"><TerminalIcon size={28} weight="light" /><p>{t('项目已就位')}</p><span>{t('启动终端，在这里开始开发')}</span><button className="button secondary small" onClick={() => void onAction(window.projectGrid.startTerminal(terminal.id))}><Play size={13} weight="fill" />{t('启动终端')}</button>
              {codexDirect && project.kind !== 'ssh' && <button className="button secondary small" title={t('不经过终端，阅读视图直接与 Codex 对话')} onClick={() => void onAction(window.projectGrid.agentStart(terminal.id))}><Lightning size={13} weight="fill" />{t('直连 Codex')}</button>}</div>}
        </div>
        {multiple && <footer className="terminal-split-footer"><span>{terminal.error ? t(terminal.error) : project.kind === 'ssh' ? 'SSH' : terminal.shell === 'cmd' ? t('命令提示符') : terminal.shell === 'zsh' ? 'zsh' : terminal.shell === 'bash' ? 'Bash' : 'PowerShell'}</span><div>
          <VoiceButton terminalId={terminal.id} sessionId={terminal.sessionId} name={name} size={13} onError={onError} />
          {stopped && terminal.sessionId && <button className="text-button" onClick={() => void onAction(window.projectGrid.startTerminal(terminal.id))}>{t('重新启动')}</button>}
          {terminal.codexActive && <span className="session-label">{terminal.agent === 'claude' ? 'CLAUDE' : 'CODEX'}</span>}
        </div></footer>}
      </section>;
    })}
  </div>;
}
