import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import type { DirectCard } from '../../shared/types';
import { t } from '../../shared/i18n';

type Answer = { decision?: string; answers?: Record<string, string | string[]> };

// What Codex, connected directly, waits on: a command or a file change to approve, or questions to answer. The
// answer goes back over its protocol, so nothing is typed anywhere. Number keys pick, arrows move, Enter takes the
// highlighted option and Escape cancels, as on Codex's own screen.
export function ReadingDirectCard({ card, terminalId, onError }: { card: DirectCard; terminalId: string; onError: (message: string) => void }) {
  const [highlight, setHighlight] = useState(0), [pending, setPending] = useState(false);
  const [step, setStep] = useState(0), [answers, setAnswers] = useState<Record<string, string>>({}), [own, setOwn] = useState('');
  const root = useRef<HTMLDivElement>(null), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const reply = async (answer: Answer) => {
    if (pending) return;
    setPending(true);
    try {
      const result = await window.agentrix.agentAnswer(terminalId, answer);
      if (!result.ok) throw new Error(result.error);
    } catch (error) { if (active.current) { setPending(false); onError(error instanceof Error ? error.message : String(error)); } }
  };
  const question = card.kind === 'question' ? card.questions[step] : null;
  const options: { label: string; detail?: string; pick: () => void }[] = card.kind === 'approval'
    ? card.options.map(option => ({ label: option === 'accept' ? t('允许') : option === 'acceptForSession' ? t('本次会话都允许') : t('拒绝'), pick: () => void reply({ decision: option }) }))
    : (question?.options ?? []).map(option => ({ label: option.label, detail: option.description, pick: () => answer(option.label) }));
  // Each question in turn; the last answer sends them all.
  function answer(value: string) {
    if (!question || card.kind !== 'question') return;
    const next = { ...answers, [question.id]: value };
    if (step + 1 < card.questions.length) { setAnswers(next); setStep(step + 1); setHighlight(0); setOwn(''); root.current?.focus(); return; }
    void reply({ answers: next });
  }
  const cancel = () => void reply(card.kind === 'approval' ? { decision: 'cancel' } : { answers: {} });
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || (event.target as Element).tagName === 'INPUT') return;
    if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key) && !/^[1-9]$/.test(event.key)) return;
    event.preventDefault();
    if (pending) return;
    if (event.key === 'Escape') cancel();
    else if (event.key === 'Enter') options[highlight]?.pick();
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') setHighlight(index => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1))));
    else options[Number(event.key) - 1]?.pick();
  };
  const title = card.kind === 'approval' ? card.subject === 'command' ? t('Codex 想运行这条命令') : t('Codex 想修改文件')
    : question?.header || t('Codex 有问题要问你');
  return <div ref={root} className={`reading-choice is-${card.kind === 'approval' ? 'permission' : 'question'}`} role="group" aria-label={title} aria-busy={pending} tabIndex={-1} onKeyDown={keys}>
    <div className="reading-choice-head"><strong>{title}</strong>
      {card.kind === 'question' && card.questions.length > 1 && <small>{t('问题 {index}/{count}', { index: step + 1, count: card.questions.length })}</small>}
      <button type="button" className="text-button" disabled={pending} onClick={cancel}>{t('取消')}</button></div>
    {card.kind === 'approval' && card.title && <p className="reading-direct-reason">{card.title}</p>}
    {card.kind === 'approval' && card.detail && <pre className="reading-choice-context">{card.detail}</pre>}
    {question?.question && <p className="reading-direct-reason">{question.question}</p>}
    <div className="reading-choice-options">{options.map((option, index) => <button type="button" key={`${step}-${index}`} className="reading-choice-option" data-highlighted={index === highlight} disabled={pending} onClick={option.pick}>
      <span className="reading-choice-number">{index + 1}.</span><span className="reading-choice-label"><b>{option.label}</b>{option.detail && <small>{option.detail}</small>}</span>
      {pending && index === highlight && <CircleNotch size={13} className="loading-spinner" />}
    </button>)}</div>
    {question && (question.other || !question.options.length) && <form className="reading-direct-own" onSubmit={event => { event.preventDefault(); if (own.trim()) answer(own.trim()); }}>
      <input type={question.secret ? 'password' : 'text'} value={own} disabled={pending} placeholder={t('自己填写')} aria-label={t('自己填写')} onChange={event => setOwn(event.target.value)}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } }} />
      <button type="submit" className="button secondary small" disabled={pending || !own.trim()}>{t('提交')}</button>
    </form>}
  </div>;
}
