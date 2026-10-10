import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import type { ScreenChoice } from '../agents/agent-screen-types';
import { selectedChoiceIndex, writeChoiceKeys } from './choice-keys';
import { t } from '../../shared/i18n';

export function ReadingChoice({ choice, terminalId, onError }: { choice: ScreenChoice; terminalId: string; onError: (message: string) => void }) {
  const [highlight, setHighlight] = useState(() => selectedChoiceIndex(choice));
  const [pending, setPending] = useState<number | 'cancel' | null>(null);
  const sending = useRef(false), active = useRef(true), latest = useRef(choice), card = useRef<HTMLDivElement>(null);
  latest.current = choice;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { card.current?.querySelector<HTMLElement>('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' }); }, [highlight]);
  const choose = async (index: number) => {
    if (sending.current || !latest.current.options[index]) return;
    sending.current = true; card.current?.focus(); setHighlight(index); setPending(index);
    try {
      await writeChoiceKeys(selectedChoiceIndex(latest.current), index, key => window.agentrix.writeTerminal(terminalId, key), () => active.current);
    } catch (error) {
      if (active.current) { sending.current = false; setPending(null); onError(String(error)); }
    }
  };
  const cancel = () => {
    if (sending.current) return;
    sending.current = true; card.current?.focus(); setPending('cancel');
    window.agentrix.writeTerminal(terminalId, '\x1b');
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key) && !/^[1-9]$/.test(event.key)) return;
    event.preventDefault();
    if (sending.current) return;
    if (event.key === 'Escape') cancel();
    else if (event.key === 'Enter') void choose(highlight);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') setHighlight(index => Math.max(0, Math.min(choice.options.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1))));
    else {
      const index = choice.options.findIndex(option => option.number === Number(event.key));
      if (index >= 0) void choose(index);
    }
  };
  return <div ref={card} className={`reading-choice is-${choice.kind}`} role="group" aria-label={choice.title} aria-busy={pending !== null} tabIndex={-1} onKeyDown={keys}
    onFocus={() => window.agentrix.terminalFocus(terminalId, false)}>
    <div className="reading-choice-head"><strong>{choice.title}</strong><button type="button" className="text-button" disabled={pending !== null} onClick={cancel}>{pending === 'cancel' && <CircleNotch size={12} className="loading-spinner" />}{t('取消')}</button></div>
    {choice.context.length > 0 && <pre className="reading-choice-context">{choice.context.join('\n')}</pre>}
    <div className="reading-choice-options">{choice.options.map((option, index) => <button type="button" key={option.number}
      className={`reading-choice-option ${option.selected ? 'is-cli-selected' : ''}`} data-highlighted={index === highlight} disabled={pending !== null} onClick={() => void choose(index)}>
      <span className="reading-choice-number">{option.number}.</span><span className="reading-choice-label"><b>{option.label}</b>{option.detail && <small>{option.detail}</small>}</span>
      {option.hotkey && <kbd>{option.hotkey}</kbd>}{pending === index && <CircleNotch size={13} className="loading-spinner" />}
    </button>)}</div>
    {choice.hint && <small className="reading-choice-hint">{choice.hint}</small>}
  </div>;
}
