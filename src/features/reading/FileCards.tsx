import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileHtml, FileText, FilmStrip } from '@phosphor-icons/react';
import type { FileCard as Card } from '../../shared/types';
import { t } from '../../shared/i18n';
import './file-cards.css';

const PREVIEWED = /\.(?:md|markdown|mdx|html?|mp4|m4v|webm|ogv|ogg|mov|mkv|avi)$/i;
export const previewable = (file: string) => PREVIEWED.test(file);
const SHOWN = 4;

// The documents, pages and videos a group of steps wrote, as small cards under it: a Markdown file laid out, a picture
// of an HTML page, a video that plays where it is. Nothing is read until a card scrolls into view; a click opens the
// file in the full preview.
export function FileCards({ projectId, files, renderMarkdown, onOpen, onError }: {
  projectId: string; files: string[]; renderMarkdown: (text: string) => ReactNode; onOpen: (file: string) => void; onError: (message: string) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? files : files.slice(0, SHOWN);
  return <div className="file-cards">
    {shown.map(file => <FileCard key={file} projectId={projectId} file={file} renderMarkdown={renderMarkdown} onOpen={onOpen} onError={onError} />)}
    {files.length > SHOWN && !all && <button type="button" className="text-button file-cards-more" onClick={() => setAll(true)}>{t('还有 {count} 个文件', { count: files.length - SHOWN })}</button>}
  </div>;
}

function FileCard({ projectId, file, renderMarkdown, onOpen, onError }: { projectId: string; file: string; renderMarkdown: (text: string) => ReactNode; onOpen: (file: string) => void; onError: (message: string) => void }) {
  const root = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null);
  // failed: why the card could not be made, shown again when it is clicked.
  const [card, setCard] = useState<Card | null>(null), [failed, setFailed] = useState<string | null>(null), [seen, setSeen] = useState(false);
  // Asked for once it is near the view; a video that leaves the view stops playing.
  useEffect(() => {
    const node = root.current; if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setSeen(true);
      else video.current?.pause();
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!seen) return;
    let live = true;
    setCard(null); setFailed(null);
    void window.agentrix.fileCard(projectId, file).then(result => { if (!live) return; if (result.ok) setCard(result.value); else setFailed(result.error); }).catch(() => { if (live) setFailed('无法预览此文件。'); });
    return () => { live = false; };
  }, [seen, projectId, file]);
  const name = file.split(/[\\/]/).pop() || file;
  const kind = card?.kind ?? (/\.html?$/i.test(file) ? 'html' : /\.(?:md|markdown|mdx)$/i.test(file) ? 'markdown' : 'video');
  const Icon = kind === 'html' ? FileHtml : kind === 'video' ? FilmStrip : FileText;
  // A click before the card loaded still resolves through the main process, never the raw agent path.
  const open = async () => {
    if (card) { onOpen(card.path); return; }
    if (failed) { onError(t(failed)); return; }
    try {
      const result = await window.agentrix.fileCard(projectId, file);
      if (result.ok) { setCard(result.value); onOpen(result.value.path); }
      else onError(t(result.error));
    } catch { onError(t('无法预览此文件。')); }
  };
  return <div ref={root} className={`file-card is-${kind}`}>
    {card?.kind === 'video'
      ? <video ref={video} src={card.url} preload="metadata" controls playsInline />
      : <button type="button" className="file-card-view" title={t('打开 {name}', { name })} aria-label={t('打开 {name}', { name })} onClick={open}>
        {card?.kind === 'markdown' ? <div className="file-card-doc" aria-hidden="true">{renderMarkdown(card.excerpt)}</div>
          : card?.kind === 'html' && card.picture ? <img src={card.picture} alt="" />
          : <span className="file-card-empty"><Icon size={26} weight="light" />{failed ? t('无法预览') : card ? t('没有可显示的画面') : null}</span>}
      </button>}
    <button type="button" className="file-card-name" title={file} onClick={open}><Icon size={13} />{name}</button>
  </div>;
}
