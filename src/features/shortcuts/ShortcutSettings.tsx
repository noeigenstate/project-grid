import { useEffect, useState } from 'react';
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, shortcutFromEvent, type ShortcutAction } from './shortcuts';
import { t } from '../../shared/i18n';
import type { Settings } from '../../shared/types';

// Every app action with its key. Click a key, then press the new combination; Esc cancels.
// Only changed keys are saved, so a later release can improve a default the user never touched.
export function ShortcutSettings({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [message, setMessage] = useState('');
  const keys = { ...DEFAULT_SHORTCUTS, ...settings.shortcuts };
  useEffect(() => {
    if (!recording) return;
    const record = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { setRecording(null); setMessage(''); return; }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
      const value = shortcutFromEvent(event);
      if (!value) { setMessage(t('请按包含 Ctrl 或 Alt 的组合键，或 F1–F12。')); return; }
      const owner = SHORTCUT_ACTIONS.find(action => action.id !== recording && keys[action.id] === value);
      if (owner) { setMessage(t('{key} 已用于「{action}」', { key: value, action: t(owner.label) })); return; }
      const next = { ...settings.shortcuts, [recording]: value };
      if (value === DEFAULT_SHORTCUTS[recording]) delete next[recording];
      update({ shortcuts: next }); setRecording(null); setMessage('');
    };
    window.addEventListener('keydown', record, true);
    return () => window.removeEventListener('keydown', record, true);
  }, [recording, settings.shortcuts]);
  return <section className="settings-section" id="settings-shortcuts" aria-label={t('键盘快捷键')}><div className="shortcut-settings">
    <div className="update-heading"><span className="shortcut-note">{t('点击按键后按下新的组合；Esc 取消。')}</span><button type="button" className="text-button" disabled={!Object.keys(settings.shortcuts).length} onClick={() => { setRecording(null); setMessage(''); update({ shortcuts: {} }); }}>{t('恢复默认')}</button></div>
    <div className="shortcut-list">{SHORTCUT_ACTIONS.map(action => <div className="shortcut-row" key={action.id}>
      <span>{t(action.label)}</span>
      <button type="button" className={`shortcut-key ${recording === action.id ? 'is-recording' : ''}`} aria-label={t('{action}的快捷键', { action: t(action.label) })} aria-pressed={recording === action.id}
        onClick={() => { setRecording(recording === action.id ? null : action.id); setMessage(''); }}>{recording === action.id ? t('按下新的组合键…') : keys[action.id]}</button>
    </div>)}</div>
    {message && <p className="form-error" role="alert">{message}</p>}
    <p className="shortcut-note">{t('在文本框和编辑器里，Ctrl+A、Ctrl+C 等编辑键保持原有作用。')}</p>
  </div></section>;
}
