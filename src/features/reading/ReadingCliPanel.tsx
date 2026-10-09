import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { cliPanelKey } from './cli-panel';
import { t } from '../../shared/i18n';
import './reading-cli.css';

export function ReadingCliPanel({ command, rows, terminalId, onShowTerminal }: { command: string; rows: string[]; terminalId: string; onShowTerminal: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { card.current?.focus(); }, []);
  const write = (key: string) => window.projectGrid.writeTerminal(terminalId, key);
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if ((event.target as Element).closest('button') && (event.key === 'Enter' || event.key === ' ')) return;
    if (event.nativeEvent.isComposing) return;
    const key = cliPanelKey(event);
    if (key === null) return;
    event.preventDefault(); write(key);
  };
  return <div className="reading-choice reading-cli-panel" data-terminal-id={terminalId} ref={card} tabIndex={-1} role="group" aria-label={command}
    onClick={event => { if (!(event.target as Element).closest('button')) card.current?.focus(); }} onKeyDown={keys}
    onCompositionEnd={event => { if (event.data) write(event.data); }}
    onPaste={event => { const text = event.clipboardData.getData('text/plain'); if (text) { event.preventDefault(); write(text); } }}
    onFocus={() => window.projectGrid.terminalFocus(terminalId, false)}>
    <div className="reading-choice-head"><strong>{command}</strong>
      <button type="button" className="text-button" onClick={() => { card.current?.focus(); write('\x1b'); }}>{t('关闭')}</button>
      <button type="button" className="text-button" onClick={onShowTerminal}>{t('在终端中打开')}</button>
    </div>
    <pre className="reading-cli-rows">{rows.join('\n')}</pre>
  </div>;
}
