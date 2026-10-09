import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import type { ConversationEntry } from './types';
import type { ScreenAgent } from './agent-screen-types';
import { parseAgentScreen } from './agent-screen';
import { readScreen, subscribeScreen } from './terminal-screen';
import { advanceCliCommand, extractCliPanelRows, isCliIdle, mergeCliResults, type CliCommand, type CliResult } from './cli-panel';

type Snapshot = { pending: CliCommand | null; panel: { command: string; rows: string[] } | null; results: CliResult[] };
type Session = { terminalId: string; snapshot: Snapshot; listeners: Set<() => void>; stop: (() => void) | null };
// Renderer-only state survives switching views; each PTY session owns its results.
const sessions = new Map<string, Session>();
const CLI_RESULT_LIMIT = 100;
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
  if (!session) { session = { terminalId: id, snapshot: { pending: null, panel: null, results: [] }, listeners: new Set(), stop: null }; sessions.set(key, session); }
  return session;
}
function publish(session: Session, snapshot: Snapshot) {
  session.snapshot = snapshot;
  session.listeners.forEach(listener => listener());
}
function begin(session: Session, terminalId: string, agent: ScreenAgent, command: string, anchor: string | null) {
  session.stop?.();
  const pending: CliCommand = { id: `cli-output-${++sequence}`, command, anchor, at: Date.now(), observed: false, idleSince: null, output: [] };
  publish(session, { ...session.snapshot, pending, panel: null });
  let latest = readScreen(terminalId), subscribing = true;
  const update = (observation: boolean) => {
    const current = session.snapshot.pending;
    if (!current || !latest) return;
    if (!observation && (current.idleSince === null || Date.now() - current.idleSince < 400)) return;
    const screen = parseAgentScreen(agent, latest.rows);
    const next = advanceCliCommand(current, agent, latest.rows, screen, Date.now(), observation);
    if (next.done) {
      session.stop?.(); session.stop = null;
      const results = next.command.output.length ? [...session.snapshot.results, { ...next.command, rows: next.command.output }].slice(-CLI_RESULT_LIMIT) : session.snapshot.results;
      publish(session, { pending: null, panel: null, results });
    } else if (observation || next.command.idleSince !== current.idleSince) {
      const panel = screen.choice ? null : isCliIdle(agent, latest.rows, screen)
        ? session.snapshot.panel
        : next.command.observed ? { command, rows: extractCliPanelRows(agent, latest.rows, screen, command) } : null;
      publish(session, { ...session.snapshot, pending: next.command, panel });
    }
  };
  const unsubscribe = subscribeScreen(terminalId, screen => { latest = screen; if (!subscribing) update(true); });
  subscribing = false;
  const timer = window.setInterval(() => update(false), 100);
  session.stop = () => { unsubscribe(); clearInterval(timer); };
}

export function useReadingCli(terminalId: string, sessionId: string | null, agent: ScreenAgent, entries: ConversationEntry[], input: RefObject<HTMLTextAreaElement | null>, autoFocus: boolean) {
  const session = useMemo(() => sessionFor(terminalId, sessionId), [terminalId, sessionId]);
  const snapshot = useSyncExternalStore(listener => { session.listeners.add(listener); return () => { session.listeners.delete(listener); }; }, () => session.snapshot);
  const previous = useRef(snapshot.pending);
  useLayoutEffect(() => {
    if (previous.current && !snapshot.pending && autoFocus) input.current?.focus();
    previous.current = snapshot.pending;
  }, [snapshot.pending, autoFocus, input]);
  return {
    panel: snapshot.panel,
    busy: snapshot.pending !== null,
    entries: useMemo(() => mergeCliResults(entries, snapshot.results), [entries, snapshot.results]),
    begin: (command: string) => begin(session, terminalId, agent, command, entries.at(-1)?.id ?? null),
  };
}
