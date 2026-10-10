import { useLayoutEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { cliPanelKey } from './cli-panel';
import { renderCliRows } from './cli-render';
import { t } from '../../shared/i18n';
import './reading-cli.css';

// A slash command's screen laid out for reading: tabs, headings, label/value tables, meters, hints, text. Key hints
// only mean something while the command still listens; a finished result leaves them out.
function CliBlocks({ rows, live = false }: { rows: readonly string[]; live?: boolean }) {
  const blocks = useMemo(() => renderCliRows(rows).filter(block => live || block.kind !== 'hint'), [rows, live]);
  return <div className="cli-blocks">{blocks.map((block, index) => {
    if (block.kind === 'tabs') return <div key={index} className="cli-tabs">{block.items.map(item => <span key={item}>{item}</span>)}</div>;
    if (block.kind === 'heading') return <h5 key={index}>{block.text}</h5>;
    if (block.kind === 'pairs') return <dl key={index} className="cli-pairs">{block.pairs.map(([label, value, percent], at) => <div key={at}><dt>{label}</dt>
      <dd>{percent === undefined ? value : <span className="cli-meter" role="meter" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span><i style={{ width: `${percent}%` }} /></span><small>{value}</small></span>}</dd></div>)}</dl>;
    if (block.kind === 'meter') return <div key={index} className="cli-meter" role="meter" aria-valuenow={block.percent} aria-valuemin={0} aria-valuemax={100}><span><i style={{ width: `${block.percent}%` }} /></span><b>{block.percent}%</b>{block.label && <small>{block.label}</small>}</div>;
    if (block.kind === 'hint') return <p key={index} className="cli-hint">{block.text}</p>;
    return <p key={index} className="cli-text">{block.lines.join('\n')}</p>;
  })}</div>;
}

// A slash command in a popup over the conversation, never in it. While the command runs, keys typed here go to the
// CLI, so its dialogs (tabs, lists) work as in the terminal; once it has finished the popup shows what it showed.
// Escape or a click outside closes it (onClose closes what the command opened in the CLI as well).
export function ReadingCliPanel({ command, rows, done, terminalId, onClose }: { command: string; rows: string[]; done: boolean; terminalId: string; onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { card.current?.focus({ preventScroll: true }); }, []);
  const write = (key: string) => window.agentrix.writeTerminal(terminalId, key);
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (done) return;
    const key = cliPanelKey(event);
    if (key === null) return;
    event.preventDefault(); write(key);
  };
  const outside = (event: MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose(); };
  return <div className="reading-cli-overlay" onMouseDown={outside}>
    <div className="reading-cli-panel" data-terminal-id={terminalId} ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-label={command} onKeyDown={keys}
      onCompositionEnd={event => { if (event.data && !done) write(event.data); }}
      onPaste={event => { const text = event.clipboardData.getData('text/plain'); if (text && !done) { event.preventDefault(); write(text); } }}
      onFocus={() => window.agentrix.terminalFocus(terminalId, false)}>
      <div className="reading-cli-head"><strong>{command}</strong><small>{t('Esc 关闭')}</small></div>
      <div className="reading-cli-body">{!rows.length ? <p className="cli-waiting"><CircleNotch size={13} className="loading-spinner" />{t('正在等待 {command} 的结果…', { command })}</p>
        : <CliBlocks rows={rows} live={!done} />}</div>
    </div>
  </div>;
}
