import type { Settings } from './types';

type Appearance = Pick<Settings, 'surface' | 'glassBackground' | 'glassTransparency' | 'fontSize' | 'terminalFontWeight' | 'terminalFontFamily' | 'terminalCjkFontFamily' | 'terminalRenderer'>;

// Suggestions are applied explicitly. Theme changes keep the user's adjustments,
// and the established themes retain the author's original appearance defaults.
export function recommendedAppearance(theme: Settings['theme'], desktopSupported = false): Appearance {
  const original: Appearance = { surface: 'glass', glassBackground: 'theme', glassTransparency: null, fontSize: 12, terminalFontWeight: 400, terminalFontFamily: '', terminalCjkFontFamily: '', terminalRenderer: 'gpu' };
  if (theme !== 'mono-amber' && theme !== 'mono-amber-dark') return original;
  return { ...original, glassBackground: desktopSupported ? 'desktop' : 'theme', glassTransparency: theme === 'mono-amber' ? 25 : 20, fontSize: 16, terminalFontWeight: 400, terminalFontFamily: 'Cascadia Code', terminalCjkFontFamily: 'Noto Sans SC', terminalRenderer: 'dom' };
}
