import defaults from '../../../electron/shortcuts.json';
import type { Settings } from '../../shared/types';

// Keyboard shortcuts for app actions. Defaults are shared with the main process (electron/shortcuts.json),
// which must let them through; settings keep only what the user changed.
// A shortcut is written as "Ctrl+Shift+F": modifiers in the order Ctrl, Alt, Shift, then one key.
export type ShortcutAction = 'search' | 'addProject' | 'voice' | 'overview' | 'explorer' | 'settings' | 'nextProject' | 'previousProject' | 'maximize' | 'fullscreen' | 'newTerminal' | 'removeProject';
export const SHORTCUT_ACTIONS: { id: ShortcutAction; label: string }[] = [
  { id: 'search', label: '搜索项目' },
  { id: 'addProject', label: '添加项目' },
  { id: 'voice', label: '语音输入' },
  { id: 'overview', label: '返回总览' },
  { id: 'explorer', label: '展开或收起目录栏' },
  { id: 'nextProject', label: '下一个项目' },
  { id: 'previousProject', label: '上一个项目' },
  { id: 'maximize', label: '放大或还原当前项目' },
  { id: 'fullscreen', label: '窗口全屏或还原' },
  { id: 'newTerminal', label: '新建终端并分屏' },
  { id: 'removeProject', label: '移除当前项目' },
  { id: 'settings', label: '打开设置' },
];
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = defaults;

const KEYS: Record<string, string> = { Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Space: 'Space', Tab: 'Tab', Enter: 'Enter', NumpadEnter: 'Enter' };
function keyName(code: string) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return KEYS[code] || null;
}

// The shortcut an event would record, or null for a bare key, a lone modifier, or a key without a name.
export function shortcutFromEvent(event: KeyboardEvent) {
  const key = keyName(event.code);
  if (!key || event.metaKey) return null;
  const function_key = /^F\d+$/.test(key);
  if (!event.ctrlKey && !event.altKey && !function_key) return null;
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', key].filter(Boolean).join('+');
}

let current: Record<ShortcutAction, string> = { ...DEFAULT_SHORTCUTS };
// Set while App renders, like the language, so every hint in that render shows the chosen keys.
export function applyShortcuts(settings: Settings['shortcuts']) { current = { ...DEFAULT_SHORTCUTS, ...settings }; }
export function shortcut(action: ShortcutAction) { return current[action]; }
export function actionFor(event: KeyboardEvent): ShortcutAction | null {
  const pressed = shortcutFromEvent(event);
  if (!pressed) return null;
  return (Object.keys(current) as ShortcutAction[]).find(action => current[action] === pressed) || null;
}

// Inside text boxes and the editor (not terminals), standard editing keys keep their usual meaning.
const EDITING = new Set(['Ctrl+A', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y']);
export function editingKeyInField(event: KeyboardEvent) {
  const target = event.target as Element | null;
  const field = target?.closest?.('input, textarea, select, [contenteditable="true"]');
  return !!field && !field.classList.contains('xterm-helper-textarea') && EDITING.has(shortcutFromEvent(event) || '');
}
