import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Sparkle } from '@phosphor-icons/react';
import { SHORTCUT_ACTIONS, shortcut } from '../shortcuts/shortcuts';
import { WHATS_NEW } from './guide';
import { t } from '../../shared/i18n';

type Page = { id: string; icon: ReactNode; title: string; body: ReactNode };

// Reference pages: the shortcuts in use and what changed in this version. It opens after each update on
// the "what's new" page. How to use the app is taught in the window itself (GuideTour), reachable from here.
export function UsageGuide({ version, start, onClose, onTour }: { version: string; start: 'keys' | 'news'; onClose: () => void; onTour: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pages: Page[] = [
    { id: 'keys', icon: <Keyboard size={26} />, title: t('常用快捷键'), body: <>
      <dl className="guide-keys">{SHORTCUT_ACTIONS.map(action => <div key={action.id}><dt>{t(action.label)}</dt><dd><kbd>{shortcut(action.id)}</kbd></dd></div>)}</dl>
      <p className="guide-note">{t('这些快捷键都可以在设置的「键盘快捷键」里修改。')}</p></> },
    { id: 'news', icon: <Sparkle size={26} />, title: t('本次更新 v{version}', { version }), body: <ul>{WHATS_NEW.map(item => <li key={item}>{t(item)}</li>)}</ul> },
  ];
  const [index, setIndex] = useState(() => Math.max(0, pages.findIndex(page => page.id === start)));
  const page = pages[index], last = index === pages.length - 1;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' && !last) setIndex(index + 1);
      if (event.key === 'ArrowLeft' && index) setIndex(index - 1);
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [index, last]);
  return <dialog className="settings-dialog guide-dialog" ref={dialog} aria-label={t('使用指南')} onCancel={onClose}>
    <div className="dialog-content">
      <div className="guide-head"><span className="guide-icon" aria-hidden="true">{page.icon}</span><div><span className="eyebrow">{t('使用指南')} · {index + 1} / {pages.length}</span><h2>{page.title}</h2></div></div>
      <div className="guide-body">{page.body}</div>
      <div className="guide-dots" aria-hidden="true">{pages.map((item, position) => <i key={item.id} className={position === index ? 'is-current' : ''} />)}</div>
      <div className="dialog-footer">
        <span className="guide-actions"><button type="button" className="text-button" onClick={onClose}>{t('跳过')}</button><button type="button" className="text-button" onClick={onTour}>{t('操作教程')}</button></span>
        <span className="guide-actions">
          {index > 0 && <button type="button" className="button secondary" onClick={() => setIndex(index - 1)}>{t('上一步')}</button>}
          <button type="button" className="button primary" autoFocus onClick={() => (last ? onClose() : setIndex(index + 1))}>{last ? t('开始使用') : t('下一步')}</button>
        </span>
      </div>
    </div>
  </dialog>;
}
