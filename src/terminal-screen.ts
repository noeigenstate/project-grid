import { useEffect, useState } from 'react';
import type { Terminal } from '@xterm/xterm';

// What a terminal shows right now, as text rows: the agent's own screen (its welcome lines, footer, mode and the
// choices it is asking about) for the reading view to present without switching to the terminal. Each
// TerminalPane registers its xterm; readers subscribe and are told at most every 100 ms after output.
export type Screen = { rows: string[] };
type Entry = { terminal: Terminal; listeners: Set<(screen: Screen) => void>; timer: number; dispose: () => void };
const entries = new Map<string, Entry>();
const pending = new Map<string, Set<(screen: Screen) => void>>();

function read(terminal: Terminal): Screen {
  const buffer = terminal.buffer.active, rows: string[] = [];
  for (let index = 0; index < terminal.rows; index++) rows.push(buffer.getLine(buffer.viewportY + index)?.translateToString(true) ?? '');
  return { rows };
}

export function registerScreen(id: string, terminal: Terminal) {
  const listeners = pending.get(id) ?? new Set(); pending.delete(id);
  const entry: Entry = { terminal, listeners, timer: 0, dispose: () => {} };
  const notify = () => {
    if (entry.timer || !entry.listeners.size) return;
    entry.timer = window.setTimeout(() => { entry.timer = 0; if (!entry.listeners.size) return; const screen = read(terminal); entry.listeners.forEach(listener => listener(screen)); }, 100);
  };
  const written = terminal.onWriteParsed(notify), resized = terminal.onResize(notify);
  entry.dispose = () => { written.dispose(); resized.dispose(); clearTimeout(entry.timer); };
  entries.set(id, entry); notify();
  return () => {
    if (entries.get(id) !== entry) return;
    entry.dispose(); entries.delete(id);
    if (entry.listeners.size) pending.set(id, entry.listeners);
  };
}

export function readScreen(id: string): Screen | null {
  const entry = entries.get(id);
  return entry ? read(entry.terminal) : null;
}

// Subscribers stay attached across a terminal being remounted (its pane re-creates the xterm).
export function subscribeScreen(id: string, listener: (screen: Screen) => void) {
  const set = entries.get(id)?.listeners ?? pending.get(id) ?? new Set();
  if (!entries.has(id)) pending.set(id, set);
  set.add(listener);
  const current = readScreen(id); if (current) listener(current);
  return () => { set.delete(listener); if (!set.size && pending.get(id) === set) pending.delete(id); };
}

export function useScreen(id: string) {
  const [screen, setScreen] = useState<Screen | null>(() => readScreen(id));
  useEffect(() => subscribeScreen(id, setScreen), [id]);
  return screen;
}
