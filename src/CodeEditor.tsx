import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
import type { GitDiff } from './types';
import { findConflicts, lineMarks, type Conflict } from './editor-git';
export { findConflicts, resolveConflict, type Conflict } from './editor-git';
import { t } from './i18n';

// The editor is a plain textarea that never wraps, so every text line is one row of fixed height. The gutter
// (line numbers and Git change bars) and the conflict layer are drawn beside and behind it from the
// textarea's own scroll position, so they stay level with the text; only rows in view are drawn.
type EditorView = { top: number; height: number; line: number; padding: number; caret: number };

function useEditorView(editor: RefObject<HTMLTextAreaElement | null>): EditorView {
  const [view, setView] = useState({ top: 0, height: 0, line: 24, padding: 0 });
  const [caret, setCaret] = useState(0);
  useEffect(() => {
    const node = editor.current; if (!node) return;
    const measure = () => { const style = getComputedStyle(node); setView({ top: node.scrollTop, height: node.clientHeight, line: parseFloat(style.lineHeight) || 24, padding: parseFloat(style.paddingTop) || 0 }); };
    const scroll = () => setView(value => ({ ...value, top: node.scrollTop }));
    const select = () => { if (document.activeElement === node) setCaret(node.value.slice(0, node.selectionStart).split('\n').length - 1); };
    measure(); select();
    const resize = new ResizeObserver(measure); resize.observe(node);
    node.addEventListener('scroll', scroll); node.addEventListener('focus', select); document.addEventListener('selectionchange', select);
    return () => { resize.disconnect(); node.removeEventListener('scroll', scroll); node.removeEventListener('focus', select); document.removeEventListener('selectionchange', select); };
  }, [editor]);
  return { ...view, caret };
}

const visibleRows = (view: EditorView, count: number) => {
  const first = Math.max(0, Math.floor((view.top - view.padding) / view.line) - 2);
  return { first, last: Math.min(count, first + Math.ceil(view.height / view.line) + 4) };
};

function EditorGutter({ view, text, diff }: { view: EditorView; text: string; diff: GitDiff | null }) {
  const count = useMemo(() => { let lines = 1; for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) lines++; return lines; }, [text]);
  const marks = useMemo(() => lineMarks(diff, count), [diff, count]);
  const { first, last } = visibleRows(view, count);
  return <div className="editor-gutter" aria-hidden="true" style={{ width: `calc(${Math.max(2, String(count).length)}ch + 30px)` }}>
    <div style={{ transform: `translateY(${view.padding + first * view.line - view.top}px)` }}>
      {Array.from({ length: Math.max(0, last - first) }, (_, index) => first + index).map(line => <span key={line} className={`${line === view.caret ? 'is-current' : ''} ${marks.get(line) || ''}`} style={{ height: view.line }}>{line + 1}</span>)}
    </div>
  </div>;
}

// The editor shell: gutter, conflict layer and the textarea (children) mount together, so the view
// hook attaches to the textarea as soon as it exists.
export function CodeEditor({ editor, text, diff, onResolve, children }: { editor: RefObject<HTMLTextAreaElement | null>; text: string; diff: GitDiff | null; onResolve: (conflict: Conflict, choice: 'current' | 'incoming' | 'both') => void; children: ReactNode }) {
  const view = useEditorView(editor);
  const conflicts = useMemo(() => findConflicts(text), [text]);
  return <div className="file-editor">
    <EditorGutter view={view} text={text} diff={diff} />
    <div className="editor-surface">{conflicts.length > 0 && <ConflictLayer view={view} conflicts={conflicts} onResolve={onResolve} />}{children}</div>
  </div>;
}

function ConflictLayer({ view, conflicts, onResolve }: { view: EditorView; conflicts: Conflict[]; onResolve: (conflict: Conflict, choice: 'current' | 'incoming' | 'both') => void }) {
  const top = (line: number) => view.padding + line * view.line - view.top;
  const shown = conflicts.filter(conflict => top(conflict.end + 1) > -view.line && top(conflict.start) < view.height + view.line);
  const band = (from: number, to: number, className: string) => <i className={className} style={{ top: top(from), height: Math.max(0, to - from) * view.line }} />;
  return <>
    <div className="conflict-bands" aria-hidden="true">{shown.map(conflict => <span key={conflict.start}>
      {band(conflict.start, conflict.start + 1, 'conflict-marker current')}
      {band(conflict.start + 1, conflict.base ?? conflict.middle, 'conflict-current')}
      {conflict.base !== null && band(conflict.base, conflict.middle, 'conflict-base')}
      {band(conflict.middle, conflict.middle + 1, 'conflict-marker')}
      {band(conflict.middle + 1, conflict.end, 'conflict-incoming')}
      {band(conflict.end, conflict.end + 1, 'conflict-marker incoming')}
    </span>)}</div>
    <div className="conflict-actions">{shown.map(conflict => <div key={conflict.start} role="group" aria-label={t('合并冲突（第 {line} 行）', { line: conflict.start + 1 })} style={{ top: top(conflict.start), height: view.line }}>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => onResolve(conflict, 'current')}>{t('保留当前更改')}</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => onResolve(conflict, 'incoming')}>{t('保留传入的更改')}</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => onResolve(conflict, 'both')}>{t('保留双方')}</button>
    </div>)}</div>
  </>;
}
