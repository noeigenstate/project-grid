import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { MentionFile } from '../../shared/types';
import { insertMention, mentionToken } from './mention-tokens';

export function useMentions({ projectId, draft, input, disabled, edit, onError }: {
  projectId: string; draft: string; input: RefObject<HTMLTextAreaElement | null>; disabled: boolean;
  edit: (draft: string) => void; onError: (message: string) => void;
}) {
  const [position, setPosition] = useState({ start: 0, end: 0 });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [results, setResults] = useState<{ key: string; files: MentionFile[]; loading: boolean }>({ key: '', files: [], loading: false });
  const [selection, setSelection] = useState(0);
  const [folder, setFolder] = useState<{ projectId: string; start: number; prefix: string } | null>(null);
  const instance = useId();
  const pendingCaret = useRef<number | null>(null), reportError = useRef(onError);
  reportError.current = onError;
  const trackCaret = () => {
    const node = input.current;
    if (node) setPosition(current => current.start === node.selectionStart && current.end === node.selectionEnd ? current : { start: node.selectionStart, end: node.selectionEnd });
  };
  useLayoutEffect(() => {
    if (pendingCaret.current !== null) { input.current?.setSelectionRange(pendingCaret.current, pendingCaret.current); pendingCaret.current = null; }
    trackCaret();
  });
  const token = disabled ? null : mentionToken(draft, position.start, position.end);
  const key = token ? JSON.stringify([projectId, token.start, token.end, token.query]) : '';
  const open = !!key && dismissed !== key;
  const query = token?.query ?? '';
  useEffect(() => { if (dismissed !== key) setDismissed(null); }, [key, dismissed]);
  useEffect(() => {
    setSelection(0);
    if (!open) return;
    let active = true;
    setResults({ key, files: [], loading: true });
    const timer = setTimeout(() => {
      void window.projectGrid.findFiles(projectId, query).then(result => {
        if (!active) return;
        setResults({ key, files: result.ok ? result.value : [], loading: false });
        if (!result.ok) reportError.current(result.error);
      }).catch(error => {
        if (!active) return;
        setResults({ key, files: [], loading: false });
        reportError.current(String(error?.message || error));
      });
    }, 80);
    return () => { active = false; clearTimeout(timer); };
  }, [key, open, projectId, query]);
  const prefix = folder?.projectId === projectId && folder.start === token?.start && query.startsWith(folder.prefix) ? folder.prefix.toLowerCase() : '';
  const files = useMemo(() => results.key === key ? results.files.filter(file => !prefix || file.path.toLowerCase().startsWith(prefix)) : [], [results, key, prefix]);
  const loading = open && (results.key !== key || results.loading);
  const listId = `reading-mentions-${instance}`;
  const optionId = (index: number) => `${listId}-${index}`;
  useEffect(() => { if (open) input.current?.parentElement?.querySelector(`[id="${optionId(selection)}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, selection, files]);
  const complete = (file: MentionFile) => {
    if (!token) return;
    const next = insertMention(draft, token, file);
    setFolder(file.kind === 'dir' ? { projectId, start: token.start, prefix: file.path + '/' } : null);
    pendingCaret.current = next.caret; setDismissed(null); edit(next.draft); input.current?.focus();
  };
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || event.nativeEvent.isComposing) return false;
    if (event.key === 'Escape') { event.preventDefault(); setDismissed(key); return true; }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (files.length) setSelection(index => (index + (event.key === 'ArrowUp' ? -1 : 1) + files.length) % files.length);
      return true;
    }
    if ((event.key === 'Tab' || event.key === 'Enter') && !event.shiftKey) {
      event.preventDefault(); if (files[selection]) complete(files[selection]); return true;
    }
    return false;
  };
  return { open, files, loading, query, selection, listId, optionId, complete, keys, trackCaret };
}
