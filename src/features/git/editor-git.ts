// What the editor marks in its text: Git changes per line, merge-conflict regions and the edit each conflict
// choice makes. Only a type import, so tests load it directly.
import type { GitDiff } from '../../shared/types';

// Git marks per 0-based line, read from the diff's hunks: lines that came in where none went away are added,
// lines that replaced others are modified, and lines that went away leave a mark at the edge where they were.
export function lineMarks(diff: GitDiff | null, count: number) {
  const marks = new Map<number, string>();
  for (const hunk of diff?.hunks || []) {
    // A hunk with no new lines starts after the line it names; every other hunk starts on it.
    let line = (hunk.newLines ? hunk.newStart : hunk.newStart + 1) - 1, added = 0, removed = 0;
    const flush = () => {
      if (added) for (let at = line - added; at < Math.min(line, count); at++) marks.set(at, removed ? 'git-modified' : 'git-added');
      else if (removed) { const at = Math.max(0, line - 1); marks.set(at, (marks.get(at) || '') + (line ? ' git-deleted-after' : ' git-deleted-before')); }
      added = removed = 0;
    };
    for (const { type } of hunk.lines) {
      if (type === '+') { added++; line++; }
      else if (type === '-') { if (added) flush(); removed++; }
      else if (type === ' ') { flush(); line++; }
    }
    flush();
  }
  return marks;
}

// Merge conflicts in the text: <<<<<<< current, optional ||||||| base, ======= , incoming >>>>>>>.
export type Conflict = { start: number; base: number | null; middle: number; end: number; current: string; incoming: string };
export function findConflicts(text: string): Conflict[] {
  const lines = text.split('\n'), found: Conflict[] = [];
  let open: Partial<Conflict> | null = null;
  lines.forEach((line, index) => {
    if (/^<{7}(\s|$)/.test(line)) open = { start: index, base: null, current: line.slice(7).trim() };
    else if (open && open.middle === undefined && /^\|{7}(\s|$)/.test(line)) open.base = index;
    else if (open && open.middle === undefined && /^={7}\s*$/.test(line)) open.middle = index;
    else if (open && open.middle !== undefined && /^>{7}(\s|$)/.test(line)) { found.push({ ...open, end: index, incoming: line.slice(7).trim() } as Conflict); open = null; }
  });
  return found;
}

// The text that replaces a conflict for each choice; the user decides, nothing is chosen automatically.
export function resolveConflict(text: string, conflict: Conflict, choice: 'current' | 'incoming' | 'both') {
  const lines = text.split('\n');
  const current = lines.slice(conflict.start + 1, conflict.base ?? conflict.middle), incoming = lines.slice(conflict.middle + 1, conflict.end);
  const kept = choice === 'current' ? current : choice === 'incoming' ? incoming : [...current, ...incoming];
  let from = 0; for (let line = 0; line < conflict.start; line++) from += lines[line].length + 1;
  let to = from; for (let line = conflict.start; line <= conflict.end; line++) to += lines[line].length + 1;
  const atEnd = to > text.length;
  return { from, to: Math.min(to, text.length), replacement: kept.map(line => line + '\n').join('').slice(0, atEnd && kept.length ? -1 : undefined) };
}
