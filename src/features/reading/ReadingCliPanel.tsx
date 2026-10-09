import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { cliPanelKey } from './cli-panel';
import { CliBlocks } from './ReadingCommandOutput';
import { t } from '../../shared/i18n';
import './reading-cli.css';

// A slash command while it runs, as the last part of the conversation. Keys typed here go to the CLI, so its
// dialogs (tabs, lists, Esc to close) work as in the terminal. A Codex side conversation takes Escape as "edit the
// last message", so there Escape leaves it instead (onExit).
export function ReadingCliPanel({ command, rows, terminalId, exitOnEscape, onExit }: { command: string; rows: string[]; terminalId: string; exitOnEscape: boolean; onExit: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(false);
  useLayoutEffect(() => { card.current?.focus({ preventScroll: true }); }, []);
  const write = (key: string) => window.projectGrid.writeTerminal(terminalId, key);
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if ((event.target as Element).closest('button') && (event.key === 'Enter' || event.key === ' ')) return;
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && exitOnEscape) { event.preventDefault(); onExit(); return; }
    const key = cliPanelKey(event);
    if (key === null) return;
    event.preventDefault(); write(key);
  };
  return <div className="reading-cli-panel" data-terminal-id={terminalId} ref={card} tabIndex={-1} role="group" aria-label={command}
    onClick={event => { if (!(event.target as Element).closest('button')) card.current?.focus({ preventScroll: true }); }} onKeyDown={keys}
    onCompositionEnd={event => { if (event.data) write(event.data); }}
    onPaste={event => { const text = event.clipboardData.getData('text/plain'); if (text) { event.preventDefault(); write(text); } }}
    onFocus={() => window.projectGrid.terminalFocus(terminalId, false)}>
    <div className="reading-choice-head"><strong>{command}</strong>
      {rows.length > 0 && <button type="button" className="text-button" aria-expanded={!folded} onClick={() => setFolded(!folded)}>{folded ? t('展开') : t('收起')}</button>}
    </div>
    {!rows.length ? <p className="cli-waiting"><CircleNotch size={13} className="loading-spinner" />{t('正在等待 {command} 的结果…', { command })}</p>
      : !folded && <CliBlocks rows={rows} live />}
  </div>;
}
