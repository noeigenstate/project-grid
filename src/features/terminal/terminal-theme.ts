import type { ITheme } from '@xterm/xterm';

// Keep the established dark palette identical for Forest, Mountain Blue and Wild Red.
export const darkTerminalTheme: ITheme = {
  background: '#00000000', foreground: '#ffffff', cursor: '#ffffff',
  selectionBackground: '#405770', black: '#252a34', red: '#ff969e',
  green: '#a2ddb8', yellow: '#f2d596', blue: '#a1caff', magenta: '#d0b6f7',
  cyan: '#a0e0e8', white: '#e7eff9', brightBlack: '#b2c2d5', brightRed: '#ffacb2',
  brightGreen: '#a1d8b7', brightYellow: '#f0d297', brightBlue: '#a0caff',
  brightMagenta: '#d0baf2', brightCyan: '#a2e1e7', brightWhite: '#f2f5fa',
  scrollbarSliderBackground: '#46536455', scrollbarSliderHoverBackground: '#64768c88', scrollbarSliderActiveBackground: '#7b8ea599',
};

// Daylight's ink is white at 92% with teal green and bright blue for accents, over the dark frosted pane every theme
// uses (clarity.css). A transparent black base tells xterm's contrast correction that the ink sits on dark, so it
// keeps these colours as they are.
export const daylightTerminalTheme: ITheme = {
  background: '#00000000', foreground: '#ebebeb', cursor: '#4aa8ff', cursorAccent: '#10141c',
  selectionBackground: '#2a5d8f', selectionInactiveBackground: '#244b70',
  black: '#a3acb9', red: '#ff7a7a', green: '#3ddc97', yellow: '#fbbf24',
  blue: '#4aa8ff', magenta: '#e599f7', cyan: '#5eead4', white: '#ffffff',
  brightBlack: '#c0c7d1', brightRed: '#ff9a9a', brightGreen: '#6ee7b7', brightYellow: '#fcd34d',
  brightBlue: '#7cc0ff', brightMagenta: '#f0b8fb', brightCyan: '#99f6e4', brightWhite: '#ffffff',
  scrollbarSliderBackground: '#ffffff26', scrollbarSliderHoverBackground: '#ffffff40', scrollbarSliderActiveBackground: '#ffffff59',
};

// Terminal text is regular (400) and bold is 700: the frosted pane gives the contrast, and a heavier body weight made
// every line look bold. The contrast floor is 4.5:1, the same for every theme, so switching themes never resets the
// terminal's options.
export const terminalOptions = { fontWeight: '400', fontWeightBold: '700', minimumContrastRatio: 4.5 } as const;

export function terminalTheme(theme: string | undefined): ITheme {
  return { ...(theme === 'daylight' ? daylightTerminalTheme : darkTerminalTheme) };
}

export function terminalDecorationColors(theme: string | undefined) {
  return theme === 'daylight'
    ? { bullet: '#ff8fb1', heading: '#fcd34d' }
    : { bullet: '#ff6b9a', heading: '#ff9fd5' };
}
