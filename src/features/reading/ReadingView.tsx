import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import { ArrowDown, CaretDown, CaretRight, CircleNotch, Image as ImageIcon, PaperPlaneRight, Stop } from '@phosphor-icons/react';
import type { AgentCommand, ConversationEntry, ProjectTerminal } from '../../shared/types';
import { actionText, stepVerb } from '../agents/ActivityPane';
import { dictateInto } from '../voice/voice-input';
import { useScreen } from '../terminal/terminal-screen';
import { parseAgentScreen } from '../agents/agent-screen';
import { cliCloseKey, cliHistory, cliInputDraft, isAtPrompt, isSideConversation } from './cli-panel';
import { ReadingWelcome } from './ReadingWelcome';
import { ReadingChoice } from './ReadingChoice';
import { ReadingQuestion } from './ReadingQuestion';
import { ReadingSessions } from './ReadingSessions';
import { usesSessionPicker } from './reading-sessions';
import { useWelcomeStarting } from './reading-welcome';
import { ReadingCliPanel } from './ReadingCliPanel';
import { ReadingCommandOutput } from './ReadingCommandOutput';
import { useReadingCli } from './useReadingCli';
import type { CliOutputEntry } from './cli-panel';
import { choiceIdentity } from './choice-keys';
import { setChoiceVisible } from './reading-mode';
import { useStickToBottom } from './useStickToBottom';
import { conversationKey, useReadingConversation } from './useReadingConversation';
import { blocks, useVisibleTail } from './useVisibleTail';
import './reading.css';
import { currentLanguage, t } from '../../shared/i18n';
import { useMentions } from './useMentions';
import { MentionPalette } from './MentionPalette';
import { isTypedCommand } from './pending-prompts';
import { usePendingPrompts } from './usePendingPrompts';
import { PendingPromptEntries } from './PendingPromptEntries';

const purifier = createDOMPurify(window);
// Switching to the CLI unmounts the composer; sent messages still belong to that terminal.
const history = new Map<string, string[]>();
// The entries on screen when /clear (or Codex's /new) was sent from here, per conversation. The agent starts a new
// conversation at once, but its file only appears with the next message; until then these stay hidden.
const cleared = new Map<string, ReadonlySet<string>>();
const clears = (agent: ProjectTerminal['agent'], text: string) => (agent === 'claude' ? /^\/clear(?:\s|$)/ : /^\/(?:clear|new)(?:\s|$)/).test(text.trim());
// What the agent wrote, laid out as Markdown. Only plain structure survives: no raw HTML, no images (an
// answer has no business loading anything), and links open outside through the window's link handler.
function render(text: string) {
  const html = purifier.sanitize(marked.parse(text, { async: false, gfm: true, breaks: true }), {
    ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'hr', 'br', 'em', 'strong', 's', 'del', 'input', 'kbd'],
    ALLOWED_ATTR: ['href', 'class', 'type', 'checked', 'disabled', 'start', 'align'], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  });
  const root = document.createElement('div'); root.innerHTML = html;
  for (const box of root.querySelectorAll('input')) { box.type = 'checkbox'; box.disabled = true; }
  // Each code block gets a copy button over its top right corner.
  for (const pre of root.querySelectorAll('pre')) {
    const frame = document.createElement('div'); frame.className = 'reading-code';
    const language = pre.querySelector('code')?.className.match(/language-([\w+-]+)/)?.[1];
    const bar = document.createElement('div'); bar.className = 'reading-code-bar';
    bar.innerHTML = `<span></span><button type="button" data-copy-code>${t('复制')}</button>`;
    bar.querySelector('span')!.textContent = language || '';
    pre.replaceWith(frame); frame.append(bar, pre);
  }
  return root.innerHTML;
}

function Markdown({ text }: { text: string }) {
  const language = currentLanguage();
  const html = useMemo(() => { try { return render(text); } catch { return null; } }, [text, language]);
  if (html === null) return <p className="reading-plain">{text}</p>;
  return <div className="reading-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

function ToolGroup({ entries, live }: { entries: ConversationEntry[]; live: boolean }) {
  const running = entries.some(entry => !entry.tool?.done);
  const [open, setOpen] = useState(false);
  const failed = entries.filter(entry => entry.tool?.failed).length;
  const shown = open || (live && running);
  return <div className={`reading-tools ${running ? 'is-running' : ''}`}>
    <button type="button" className="reading-tools-head" aria-expanded={shown} onClick={() => setOpen(!open)}>
      {running ? <CircleNotch size={13} className="loading-spinner" /> : shown ? <CaretDown size={12} /> : <CaretRight size={12} />}
      <span>{entries.length === 1 ? actionText(entries[0].tool!) : t('调用了 {count} 个工具', { count: entries.length })}</span>
      {failed > 0 && <em>{t('{count} 个失败', { count: failed })}</em>}
    </button>
    {shown && <ul>{entries.map(entry => <li key={entry.id} className={`${entry.tool!.done ? '' : 'is-running'} ${entry.tool!.failed ? 'is-failed' : ''} reading-tool-${entry.tool!.kind}`}>
      <b>{stepVerb(entry.tool!)}</b><code title={entry.tool!.target}>{entry.tool!.target}</code>{entry.tool!.detail && <small>{entry.tool!.detail}</small>}
    </li>)}</ul>}
  </div>;
}

// The agent's conversation laid out for reading: your prompts, its answers as Markdown with copyable code,
// and its tool calls folded between them. The real terminal stays underneath; what is written here goes to
// it, and the toggle in the card header switches back to it at any time. autoFocus: the card is expanded and
// this is its terminal in use, so the message box takes the keyboard (never a small card's).
// The agent at work, as its CLI shows it: a live mark, what it is doing, how long the round has run and how to stop it.
function WorkingLine({ agent, label }: { agent: 'claude' | 'codex'; label: string }) {
  const [started] = useState(() => Date.now()), [now, setNow] = useState(started);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <div className={`reading-status is-working is-${agent}`} role="status">
    <i className="reading-status-mark" aria-hidden="true">{agent === 'claude' ? '✻' : '•'}</i>
    <span>{label}…</span><small>{t('（{seconds} 秒 · Esc 中断）', { seconds: Math.floor((now - started) / 1000) })}</small>
  </div>;
}

export function ReadingView({ projectId, terminal, autoFocus, onShowTerminal, onError, onOpenLink }: { projectId: string; terminal: ProjectTerminal; autoFocus: boolean; onShowTerminal: () => void; onError: (message: string) => void; onOpenLink: (target: string) => void }) {
  const conversationEntries = useReadingConversation(terminal.id, terminal.sessionId);
  const [hidden, setHidden] = useState(() => cleared.get(conversationKey(terminal.id, terminal.sessionId)));
  useEffect(() => { setHidden(cleared.get(conversationKey(terminal.id, terminal.sessionId))); }, [terminal.id, terminal.sessionId]);
  const entries = useMemo(() => hidden ? conversationEntries.filter(entry => !hidden.has(entry.id)) : conversationEntries, [conversationEntries, hidden]);
  const { pending, echo, cancelEcho } = usePendingPrompts(terminal.id, terminal.sessionId, entries);
  const visibleEntries = useMemo(() => [...entries, ...pending], [entries, pending]);
  const sendSession = useRef(terminal.sessionId); sendSession.current = terminal.sessionId;
  const visibleScreen = useScreen(terminal.id);
  const screen = useMemo(() => parseAgentScreen(terminal.agent === 'claude' ? 'claude' : 'codex', visibleScreen?.rows ?? []), [terminal.agent, visibleScreen]);
  const choiceKey = screen.choice ? choiceIdentity(screen.choice) : null;
  const [sessionsOpen, setSessionsOpen] = useState(false);
  useEffect(() => { setSessionsOpen(false); }, [terminal.id, terminal.sessionId, terminal.agent]);
  const welcomeIsStarting = useWelcomeStarting(terminal.agentStartedAt, screen);
  const hasChoice = screen.choice !== null || sessionsOpen, choiceVisible = useRef(hasChoice); choiceVisible.current = hasChoice;
  const mounted = useRef(true);
  const choiceHost = useRef<HTMLDivElement>(null), restoreComposer = useRef(false), wasChoice = useRef(false);
  const [draft, setDraft] = useState('');
  const [commands, setCommands] = useState<AgentCommand[]>([]), [requested, setRequested] = useState(false);
  const [dismissed, setDismissed] = useState(false), [selection, setSelection] = useState(0);
  const historyAt = useRef<number | null>(null), unsent = useRef(''), caret = useRef<number | null>(null), sending = useRef(false);
  // Images pasted for the next message. The agent holds them itself; this only counts them.
  const [images, setImages] = useState(0);
  const scroller = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const cli = useReadingCli(terminal.id, terminal.sessionId, terminal.agent === 'claude' ? 'claude' : 'codex', entries, input, autoFocus);
  // A question's own key hint with no card read from it (the question is taller than the view, or its hint wrapped):
  // a message typed here would land in the question, so the box waits and the terminal shows the question instead.
  const unreadQuestion = !screen.choice && !!visibleScreen?.rows.some(row => /\benter to submit (?:answer|all)\b/i.test(row) || /^\s*Enter to select\b.*\bEsc to cancel\b/i.test(row));
  useEffect(() => { if (unreadQuestion && !cli.busy) onShowTerminal(); }, [unreadQuestion, cli.busy]);
  // A slash command never holds the message box; only a question or permission on screen does.
  const inputBlocked = hasChoice || unreadQuestion;
  const conversation = conversationKey(terminal.id, terminal.sessionId);
  const { stuck, unseen, toBottom, ready, holdPosition } = useStickToBottom(scroller, content, visibleEntries, conversation);
  useLayoutEffect(() => { if (caret.current !== null) { input.current?.setSelectionRange(caret.current, caret.current); caret.current = null; } });
  useEffect(() => { if (draft.startsWith('/') || !entries.length) setRequested(true); }, [draft, entries.length]);
  // Capture composer ownership before disabling it; another card's focus must stay where it is.
  if (hasChoice && !wasChoice.current) restoreComposer.current = document.activeElement === input.current || sessionsOpen || document.activeElement?.closest('.reading-cli-panel')?.getAttribute('data-terminal-id') === terminal.id || (cli.busy && autoFocus && document.activeElement === document.body);
  useLayoutEffect(() => {
    setChoiceVisible(terminal.id, hasChoice);
    if (hasChoice) {
      if (restoreComposer.current && (!wasChoice.current || document.activeElement === document.body)) (choiceHost.current?.firstElementChild as HTMLElement | null)?.focus();
    } else if (wasChoice.current) {
      if (restoreComposer.current && document.activeElement === document.body) input.current?.focus();
      restoreComposer.current = false;
    }
    wasChoice.current = hasChoice;
  }, [terminal.id, hasChoice, choiceKey]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; setChoiceVisible(terminal.id, false);
    };
  }, [terminal.id]);
  useEffect(() => {
    setCommands([]);
    if (!requested) return;
    let active = true;
    void window.projectGrid.terminalCommands(terminal.id).then(result => {
      if (active) { setCommands(result.ok ? result.value : []); if (!result.ok) onError(result.error); }
    }).catch(error => { if (active) onError(String(error)); });
    return () => { active = false; };
  }, [terminal.id, terminal.agent, requested]);
  const matches = useMemo(() => {
    const query = draft.slice(1).toLowerCase(), name = (command: AgentCommand) => command.name.slice(1).toLowerCase();
    return commands.filter(command => name(command).includes(query)).sort((a, b) => Number(!name(a).startsWith(query)) - Number(!name(b).startsWith(query)));
  }, [commands, draft]);
  const palette = !inputBlocked && !dismissed && /^\/[^\s]*$/.test(draft), selected = matches[selection];
  const listId = `reading-commands-${terminal.id}`, optionId = (index: number) => `${listId}-${index}`;
  useEffect(() => { setSelection(0); }, [draft, commands]);
  useEffect(() => { if (palette) document.getElementById(optionId(selection))?.scrollIntoView({ block: 'nearest' }); }, [palette, selection]);
  const edit = (value: string) => { setDraft(value); setDismissed(false); historyAt.current = null; };
  const complete = (command: AgentCommand) => {
    caret.current = command.name.length + 1; edit(command.name + ' '); input.current?.focus();
  };
  const mentions = useMentions({ projectId, draft, input, disabled: inputBlocked || /^\/[^\s]*$/.test(draft), edit, onError });
  useEffect(() => {
    if (!autoFocus) return;
    if (choiceVisible.current) { restoreComposer.current = true; (choiceHost.current?.firstElementChild as HTMLElement | null)?.focus(); }
    else if (!cli.busy) input.current?.focus();
  }, [terminal.id, autoFocus]);
  // Claude's own screen has the last word: a round its hooks opened without closing (a local slash command) must not
  // keep "thinking" on screen while Claude sits idle at its prompt.
  // It is at its prompt even with an interrupted prompt put back in its input.
  const claudeIdle = terminal.agent === 'claude' && !!visibleScreen && isAtPrompt('claude', visibleScreen.rows, screen);
  const working = terminal.codexActive && terminal.codexActivity === 'working' && !claudeIdle;
  const agent = terminal.agent === 'claude' ? 'Claude Code' : 'Codex';
  const grouped = useMemo(() => blocks(cli.entries), [cli.entries]);
  const tail = useVisibleTail(grouped, conversation, scroller, stuck, holdPosition);
  // One message at a time: a second Enter while the first is still being pasted waits for nothing and sends nothing.
  const send = async (text = draft.trim()) => {
    if (sending.current) return;
    sending.current = true;
    try { await deliver(text); } catch (error) { if (mounted.current) onError(String(error)); } finally { sending.current = false; }
  };
  // The CLI recognises slash commands and shell mode from typed keys, not bracketed paste.
  const deliver = async (text: string) => {
    if (inputBlocked || (!text && !images) || !terminal.sessionId) return;
    if (usesSessionPicker(terminal, text)) { choiceVisible.current = true; restoreComposer.current = document.activeElement === input.current; edit(''); setSessionsOpen(true); return; }
    const typed = isTypedCommand(text), sessionId = terminal.sessionId, agentKind = terminal.agent === 'claude' ? 'claude' : 'codex';
    // What the CLI shows above its input before the command is typed, to tell its output from what was there.
    const shown = typed && visibleScreen ? cliHistory(agentKind, visibleScreen.rows, screen) : undefined;
    // A command's dialog still open (Claude's /usage, /config) would take this message's keys and Enter: close it first.
    // In a Codex side conversation a message is part of it: the card stays and nothing is closed. Its messages never
    // reach the main conversation's records, so they get no echo there either.
    const side = !!cli.panel && isSideConversation(agentKind, cli.panel.command);
    if (cli.busy && !side) {
      const key = visibleScreen ? cliCloseKey(agentKind, visibleScreen.rows, screen, cli.panel?.command) : null;
      cli.cancel();
      if (key) { window.projectGrid.writeTerminal(terminal.id, key); await new Promise(resolve => setTimeout(resolve, 150)); }
    }
    if (!mounted.current || choiceVisible.current || sendSession.current !== sessionId) return;
    const pendingId = text && !typed && !side ? echo(text) : null;
    if (pendingId) toBottom();
    // Text left in the CLI's own input (Claude puts an interrupted prompt back there) would be sent along with this
    // message; Ctrl+U clears it first. Pasted images also live there, so it is kept while images are attached.
    if (text && !images && visibleScreen && cliInputDraft(terminal.agent === 'claude' ? 'claude' : 'codex', visibleScreen.rows, screen)) {
      window.projectGrid.writeTerminal(terminal.id, '\x15');
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    if (text) {
      if (typed) window.projectGrid.writeTerminal(terminal.id, text);
      else {
        const pasted = await window.projectGrid.pasteTerminal(terminal.id, text, terminal.sessionId);
        if (!pasted.ok) { if (pendingId) cancelEcho(pendingId); onError(pasted.error); return; }
        if (!mounted.current || choiceVisible.current || sendSession.current !== sessionId) return;
      }
      history.set(terminal.id, [...(history.get(terminal.id) || []), text].slice(-50));
    }
    edit(''); setImages(0); toBottom();
    if (text) await new Promise(resolve => setTimeout(resolve, typed ? 150 : 400));
    if (!mounted.current || choiceVisible.current || sendSession.current !== sessionId) return;
    if (typed) cli.begin(text, shown);
    if (clears(terminal.agent, text)) { const ids = new Set(conversationEntries.map(entry => entry.id)); cleared.set(conversation, ids); setHidden(ids); }
    window.projectGrid.writeTerminal(terminal.id, '\r');
  };
  const sendRef = useRef(send); sendRef.current = send;
  // Dictation into this terminal lands here while the reading view shows: the words appear at the cursor as
  // soon as they are recognised, and Enter (or the shortcut again) sends the whole message.
  useEffect(() => dictateInto(terminal.id, (text, submit) => {
    if (choiceVisible.current) return;
    const node = input.current, value = node?.value ?? '', here = !!node && document.activeElement === node;
    const at = here ? node.selectionStart : value.length, end = here ? node.selectionEnd : value.length;
    const next = value.slice(0, at) + text + value.slice(end);
    if (submit) { void sendRef.current(next.trim()); return; }
    caret.current = at + text.length; edit(next); node?.focus();
  }), [terminal.id]);
  // An image pasted here goes to the agent the way it takes one in its own input: it reads the clipboard on its
  // paste key (Ctrl+V in Codex, Alt+V in Claude Code on Windows) and attaches the image to the next message.
  const pasteImage = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const data = event.clipboardData;
    if (data.getData('text/plain') || ![...data.items].some(item => item.kind === 'file' && item.type.startsWith('image/'))) return;
    event.preventDefault();
    if (!terminal.codexActive || !terminal.sessionId) { onError(t('启动 Codex 或 Claude Code 后才能粘贴图片。')); return; }
    window.projectGrid.writeTerminal(terminal.id, terminal.agent === 'claude' ? '\x1bv' : '\x16');
    setImages(count => count + 1);
  };
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Tab' && event.shiftKey) { event.preventDefault(); window.projectGrid.writeTerminal(terminal.id, '\x1b[Z'); return; }
    if (mentions.keys(event)) return;
    if (palette) {
      if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); return; }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); if (matches.length) setSelection(index => (index + (event.key === 'ArrowUp' ? -1 : 1) + matches.length) % matches.length); return; }
      if (selected && (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey))) {
        event.preventDefault(); if (event.key === 'Enter' && draft === selected.name) void send(); else complete(selected); return;
      }
    } else {
      if (event.key === 'Escape') { if (working) { event.preventDefault(); window.projectGrid.writeTerminal(terminal.id, '\x1b'); } return; }
      const node = event.currentTarget, sent = history.get(terminal.id) || [];
      if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && node.selectionStart === node.selectionEnd && ((event.key === 'ArrowUp' && node.selectionStart === 0) || (event.key === 'ArrowDown' && node.selectionEnd === draft.length))) {
        if (event.key === 'ArrowUp' && sent.length) {
          event.preventDefault(); if (historyAt.current === null) { unsent.current = draft; historyAt.current = sent.length; }
          historyAt.current = Math.max(0, historyAt.current - 1); caret.current = 0; setDraft(sent[historyAt.current]);
        } else if (event.key === 'ArrowDown' && historyAt.current !== null) {
          event.preventDefault(); historyAt.current++;
          const next = historyAt.current >= sent.length ? unsent.current : sent[historyAt.current];
          if (historyAt.current >= sent.length) historyAt.current = null;
          caret.current = next.length; setDraft(next);
        } else return;
        node.setSelectionRange(caret.current!, caret.current!);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
  };
  // What the agent is doing, written at the end of the conversation the way its CLI writes it, never in a corner.
  const status = screen.choice?.kind === 'question' ? <div className="reading-status" role="status">{t('等待你回答问题')}</div>
    : terminal.needsInput !== null ? <div className="reading-status" role="status">{t('等待你确认：{message}', { message: terminal.needsInput })}</div>
    : working || pending.some(prompt => prompt.sending) ? <WorkingLine key={terminal.sessionId} agent={terminal.agent === 'claude' ? 'claude' : 'codex'} label={terminal.action ? t('正在{step}', { step: actionText(terminal.action) }) : t('{agent} 正在思考', { agent })} />
    : null;
  let body: ReactNode;
  if (!cli.entries.length && !pending.length) body = <ReadingWelcome agent={terminal.agent === 'claude' ? 'claude' : 'codex'} screen={screen} commands={commands} complete={complete} disabled={inputBlocked} starting={welcomeIsStarting} />;
  else body = <>
    {tail.earlier > 0 && <button type="button" className="text-button reading-earlier" onClick={tail.showEarlier}>{t('显示更早的对话（{count}）', { count: tail.earlier })}</button>}
    {tail.visible.map((block, index) => block.kind === 'tools'
    ? <ToolGroup key={block.id} entries={block.entries} live={index === tail.visible.length - 1} />
    : (block.entry as CliOutputEntry).cliOutput
      ? <ReadingCommandOutput key={block.entry.id} rows={(block.entry as CliOutputEntry).cliOutput!} />
    : block.entry.role === 'user'
      ? <div key={block.entry.id} className="reading-user"><span>{t('你')}</span><p>{block.entry.text}</p></div>
      : <div key={block.entry.id} className="reading-assistant"><Markdown text={block.entry.text || ''} /></div>)}
  </>;
  return <div className="reading-view" onClick={event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-copy-code]');
    if (button) { const code = button.closest('.reading-code')?.querySelector('pre')?.textContent || ''; void window.projectGrid.copy(code).then(result => { if (result.ok) { button.textContent = t('已复制'); setTimeout(() => { button.textContent = t('复制'); }, 1400); } else onError(result.error); }); return; }
    const link = (event.target as Element).closest<HTMLAnchorElement>('.reading-markdown a');
    if (link) { event.preventDefault(); const href = link.getAttribute('href') || ''; if (href) onOpenLink(href); }
  }}>
    <div className="reading-scroll-area">
      <div className="reading-scroll" ref={scroller} tabIndex={0}><div className="reading-content" ref={content} style={{ visibility: entries.length && !ready ? 'hidden' : undefined }}>{body}<PendingPromptEntries prompts={pending} />
        {!screen.choice && !sessionsOpen && cli.panel && <ReadingCliPanel command={cli.panel.command} rows={cli.panel.rows} terminalId={terminal.id} onShowTerminal={onShowTerminal} onClose={() => {
          const key = visibleScreen && cliCloseKey(terminal.agent === 'claude' ? 'claude' : 'codex', visibleScreen.rows, screen, cli.panel?.command);
          if (key) window.projectGrid.writeTerminal(terminal.id, key);
          cli.cancel(); input.current?.focus();
        }} />}
        {status}</div></div>
      {!stuck && <div className="reading-latest">
        {unseen > 0 && <span className="reading-unseen" role="status">{t('{count} 条新消息', { count: unseen })}</span>}
        <button type="button" className="icon-button reading-jump" title={t('跳到最新消息')} aria-label={t('跳到最新消息')} onClick={() => toBottom('smooth')}><ArrowDown size={18} /></button>
      </div>}
    </div>
    {images > 0 && <div className="reading-attachments" role="status"><ImageIcon size={14} />{t('已附加 {count} 张图片，随下一条消息发送', { count: images })}</div>}
    {screen.choice && !sessionsOpen && <div className="reading-choice-host" ref={choiceHost} onFocusCapture={() => { restoreComposer.current = true; }} onBlurCapture={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) restoreComposer.current = false;
    }}>{screen.choice.kind === 'question'
      ? <ReadingQuestion key={choiceKey} choice={screen.choice} terminalId={terminal.id} onError={onError} />
      : <ReadingChoice key={choiceKey} choice={screen.choice} terminalId={terminal.id} onError={onError} />}</div>}
    {sessionsOpen && <div className="reading-choice-host" ref={choiceHost} onFocusCapture={() => { restoreComposer.current = true; }} onBlurCapture={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) restoreComposer.current = false;
    }}><ReadingSessions key={`${terminal.id}-${terminal.sessionId}`} terminalId={terminal.id} onError={onError} onClose={() => setSessionsOpen(false)} onSent={text => {
      history.set(terminal.id, [...(history.get(terminal.id) || []), text].slice(-50)); setImages(0); toBottom();
    }} /></div>}
    {/* The command list is part of the page, above the message box, not a popup over the conversation. */}
    {palette && <div className="reading-commands is-inline" id={listId} role="listbox" aria-label={t('命令')}>{matches.map((command, index) => <div key={command.name} id={optionId(index)} role="option" aria-selected={selection === index} className="reading-command" onMouseDown={event => event.preventDefault()} onClick={() => complete(command)}>
        <code>{command.name}</code><span>{command.source === 'builtin' ? t(command.description) : command.description}</span>{command.source !== 'builtin' && <small>{command.source === 'project' ? t('项目') : command.source === 'user' ? t('用户') : t('技能')}</small>}
    </div>)}</div>}
    <div className="reading-composer">
      <MentionPalette mentions={mentions} />
      <textarea ref={input} rows={1} disabled={inputBlocked} onPaste={pasteImage} onSelect={mentions.trackCaret} aria-label={t('给 {agent} 的消息', { agent })} aria-expanded={palette || mentions.open} aria-controls={palette ? listId : mentions.open ? mentions.listId : undefined} aria-activedescendant={palette && selected ? optionId(selection) : mentions.open && mentions.files[mentions.selection] ? mentions.optionId(mentions.selection) : undefined} placeholder={terminal.codexActive ? t('给 {agent} 发消息，/ 查看命令，@ 提及文件，Enter 发送，Shift+Enter 换行', { agent }) : t('输入命令，Enter 发送')} value={draft} onChange={event => edit(event.target.value)} onKeyDown={keys}
        onFocus={() => window.projectGrid.terminalFocus(terminal.id, false)} />
      {working && <button type="button" className="icon-button" disabled={inputBlocked} title={t('中断（Esc）')} aria-label={t('中断（Esc）')} onClick={() => window.projectGrid.writeTerminal(terminal.id, '\x1b')}><Stop size={15} weight="fill" /></button>}
      <button type="button" className="icon-button reading-send" title={t('发送')} aria-label={t('发送')} disabled={inputBlocked || (!draft.trim() && !images) || !terminal.sessionId} onClick={() => void send()}><PaperPlaneRight size={15} weight="fill" /></button>
    </div>
  </div>;
}
