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

const monochrome: ITheme = {
  background: '#f4f5f600', foreground: '#17191d', cursor: '#17191d', cursorAccent: '#f4f5f6',
  selectionBackground: '#cdd1d6', selectionForeground: '#17191d',
  black: '#17191d', red: '#a33d00', green: '#34383e', yellow: '#34383e',
  blue: '#34383e', magenta: '#34383e', cyan: '#454a51', white: '#f2f3f5',
  brightBlack: '#5a6069', brightRed: '#a33d00', brightGreen: '#34383e', brightYellow: '#34383e',
  brightBlue: '#34383e', brightMagenta: '#34383e', brightCyan: '#454a51', brightWhite: '#ffffff',
  scrollbarSliderBackground: '#35394033', scrollbarSliderHoverBackground: '#35394055', scrollbarSliderActiveBackground: '#35394077',
  extendedAnsi: Array.from({ length: 240 }, (_, index) => {
    const value = index + 16;
    let gray;
    if (value >= 232) gray = 8 + (value - 232) * 10;
    else {
      const n = value - 16, steps = [0, 95, 135, 175, 215, 255];
      gray = Math.round(steps[Math.floor(n / 36)] * .2126 + steps[Math.floor(n / 6) % 6] * .7152 + steps[n % 6] * .0722);
    }
    return '#' + gray.toString(16).padStart(2, '0').repeat(3);
  }),
};

const monochromeDark: ITheme = {
  ...monochrome, background: '#15171a00', foreground: '#f1f2f4', cursor: '#f1f2f4', cursorAccent: '#15171a',
  selectionBackground: '#444a54', selectionForeground: '#f1f2f4',
  black: '#15171a', red: '#ffad70', green: '#d0d3d9', yellow: '#d0d3d9', blue: '#d0d3d9', magenta: '#d0d3d9', cyan: '#bfc4ce', white: '#f1f2f4',
  brightBlack: '#bcc0c7', brightRed: '#ffad70', brightGreen: '#d0d3d9', brightYellow: '#d0d3d9', brightBlue: '#d0d3d9', brightMagenta: '#d0d3d9', brightCyan: '#bfc4ce', brightWhite: '#ffffff',
  scrollbarSliderBackground: '#ffffff33', scrollbarSliderHoverBackground: '#ffffff55', scrollbarSliderActiveBackground: '#ffffff77',
};

export function terminalTheme(theme: string | undefined): ITheme {
  return { ...(theme === 'mono-amber-dark' ? monochromeDark : theme === 'mono-amber' ? monochrome : theme === 'daylight' ? daylightTerminalTheme : darkTerminalTheme) };
}

export function terminalDecorationColors(theme: string | undefined) {
  return theme === 'daylight'
    ? { bullet: '#ff8fb1', heading: '#fcd34d' }
    : { bullet: '#ff6b9a', heading: '#ff9fd5' };
}
