import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import type { ScreenAgent } from '../agents/agent-screen-types';
import { parseAgentScreen } from '../agents/agent-screen';
import { readScreen, subscribeScreen } from '../terminal/terminal-screen';
import { advanceCliCommand, cliHistory, cliResultRows, extractCliPanelRows, hasCliInput, isSideConversation, isCliIdle, type CliCommand } from './cli-panel';

// The command shown in the popup: while it runs (pending), and once it has finished (done) until the reader closes it.
type Panel = { command: string; rows: string[]; done?: boolean };
type Snapshot = { pending: CliCommand | null; panel: Panel | null };
// What the view shows (the popup, whether a command runs) changes far less often than the tracking behind it: the
// screen redraws many times a second while the agent works, and only a visible change re-renders the reading view.
type View = { panel: Panel | null; busy: boolean };
type Session = { terminalId: string; snapshot: Snapshot; view: View; listeners: Set<() => void>; stop: (() => void) | null };
// Renderer-only state survives switching views; each PTY session owns its popup.
const sessions = new Map<string, Session>();
export function pruneReadingCli(liveKeys: ReadonlySet<string>) {
  for (const [key, session] of sessions) {
    if (liveKeys.has(key)) continue;
    session.stop?.(); sessions.delete(key);
  }
}
let sequence = 0;
function sessionFor(id: string, sessionId: string | null) {
  const key = JSON.stringify([id, sessionId]);
  for (const [otherKey, other] of sessions) {
    if (otherKey !== key && other.terminalId === id && other.stop) { other.stop(); other.stop = null; }
  }
  let session = sessions.get(key);
  if (!session) { session = { terminalId: id, snapshot: { pending: null, panel: null }, view: { panel: null, busy: false }, listeners: new Set(), stop: null }; sessions.set(key, session); }
  return session;
}
const samePanel = (a: Panel | null, b: Panel | null) => a === b || (!!a && !!b && a.command === b.command && a.done === b.done
  && a.rows.length === b.rows.length && a.rows.every((row, index) => row === b.rows[index]));
function publish(session: Session, snapshot: Snapshot) {
  session.snapshot = snapshot;
  const busy = snapshot.pending !== null;
  if (busy === session.view.busy && samePanel(snapshot.panel, session.view.panel)) return;
  session.view = { panel: snapshot.panel, busy };
  session.listeners.forEach(listener => listener());
}
function begin(session: Session, terminalId: string, agent: ScreenAgent, command: string, history?: string[]) {
  session.stop?.();
  let latest = readScreen(terminalId), subscribing = true;
  const before = history ?? (latest ? cliHistory(agent, latest.rows, parseAgentScreen(agent, latest.rows)) : undefined);
  const pending: CliCommand = { id: `cli-output-${++sequence}`, command, at: Date.now(), observed: false, idleSince: null, output: [], dialog: [], before };
  publish(session, { pending, panel: null });
  const update = (observation: boolean) => {
    const current = session.snapshot.pending;
    if (!current || !latest) return;
    // A Codex side conversation idles at its own input between messages; it lasts until its popup is closed.
    const side = isSideConversation(agent, command, [...session.snapshot.panel?.rows ?? [], ...latest.rows]);
    if (!observation && (current.idleSince === null || Date.now() - current.idleSince < 400)) return;
    const screen = parseAgentScreen(agent, latest.rows);
    const next = advanceCliCommand(current, agent, latest.rows, screen, Date.now(), observation);
    if (side) next.done = false;
    if (next.done) {
      session.stop?.(); session.stop = null;
      const rows = cliResultRows(next.command);
      publish(session, { pending: null, panel: rows.length ? { command, rows, done: true } : null });
    } else if (observation || next.command.idleSince !== current.idleSince) {
      const panel = screen.choice ? null : isCliIdle(agent, latest.rows, screen) && !side
        ? agent === 'codex' && next.command.observed && !next.command.chose ? { command, rows: next.command.output } : session.snapshot.panel
        : next.command.observed ? { command, rows: extractCliPanelRows(agent, latest.rows, screen, command, next.command.before) } : null;
      // A dialog the CLI is still redrawing (or just closed) leaves nothing for a moment: keep showing it.
      const shown = panel && !panel.rows.length && session.snapshot.panel?.rows.length ? session.snapshot.panel : panel;
      if (panel?.rows.length && (side || !hasCliInput(agent, latest.rows, screen))) next.command.dialog = panel.rows;
      publish(session, { pending: next.command, panel: shown });
    }
  };
  const unsubscribe = subscribeScreen(terminalId, screen => { latest = screen; if (!subscribing) update(true); });
  subscribing = false;
  const timer = window.setInterval(() => update(false), 100);
  session.stop = () => { unsubscribe(); clearInterval(timer); };
}

// Stop following the command and close its popup.
function close(session: Session) {
  if (!session.snapshot.pending && !session.snapshot.panel) return;
  session.stop?.(); session.stop = null;
  publish(session, { pending: null, panel: null });
}

export function useReadingCli(terminalId: string, sessionId: string | null, agent: ScreenAgent, input: RefObject<HTMLTextAreaElement | null>, autoFocus: boolean) {
  const session = useMemo(() => sessionFor(terminalId, sessionId), [terminalId, sessionId]);
  const snapshot = useSyncExternalStore(listener => { session.listeners.add(listener); return () => { session.listeners.delete(listener); }; }, () => session.view);
  const previous = useRef(snapshot.panel);
  useLayoutEffect(() => {
    if (previous.current && !snapshot.panel && autoFocus) input.current?.focus();
    previous.current = snapshot.panel;
  }, [snapshot.panel, autoFocus, input]);
  return {
    panel: snapshot.panel,
    busy: snapshot.busy,
    begin: (command: string, history?: string[]) => begin(session, terminalId, agent, command, history),
    close: () => close(session),
  };
}
