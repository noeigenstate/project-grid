import type { MentionFile } from '../../shared/types';

type MentionToken = { start: number; end: number; query: string };

export function mentionToken(draft: string, caret: number, selectionEnd = caret): MentionToken | null {
  if (caret !== selectionEnd || caret < 0 || caret > draft.length) return null;
  const before = draft.slice(0, caret);
  // Quoted tokens allow continuing into a folder whose name contains spaces.
  const match = /(?:^|\s)@(?:"([^"\r\n]*)|([^\s"]*))$/.exec(before);
  if (!match) return null;
  const start = match.index + (match[0].startsWith('@') ? 0 : 1);
  const quoted = match[1] !== undefined;
  return { start, end: caret + (quoted && draft[caret] === '"' ? 1 : 0), query: match[1] ?? match[2] };
}

export function insertMention(draft: string, token: MentionToken, file: MentionFile) {
  const directory = file.kind === 'dir';
  const path = file.path + (directory ? '/' : '');
  const quoted = /\s/.test(path);
  const text = '@' + (quoted ? `"${path}"` : path) + (directory ? '' : ' ');
  // Keep the cursor inside the quotes when browsing a directory with spaces.
  const caret = token.start + text.length - (directory && quoted ? 1 : 0);
  return { draft: draft.slice(0, token.start) + text + draft.slice(token.end), caret };
}

export function mentionHighlights(path: string, query: string): number[] {
  const lower = path.toLowerCase(), needle = query.toLowerCase();
  if (!needle) return [];
  const basenameAt = lower.lastIndexOf('/') + 1;
  const basenameMatch = lower.indexOf(needle, basenameAt);
  const contiguous = basenameMatch >= 0 ? basenameMatch : lower.indexOf(needle);
  if (contiguous >= 0) return Array.from({ length: needle.length }, (_, index) => contiguous + index);
  const indices: number[] = [];
  let at = 0;
  for (let index = 0; index < lower.length && at < needle.length; index++) {
    if (lower[index] === needle[at]) { indices.push(index); at++; }
  }
  return at === needle.length ? indices : [];
}
