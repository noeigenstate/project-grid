const test = require('node:test');
const assert = require('node:assert/strict');
const { terminalTheme, darkTerminalTheme, daylightTerminalTheme, terminalDecorationColors } = require('../src/features/terminal/terminal-theme.ts');

const luminance = hex => {
  const channels = hex.slice(1, 7).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
};
// Daylight's ink is read against its frosted pane over an average part of the darkened wallpaper (clarity.css).
const frost = luminance('#2e3238');
const contrastOnFrost = hex => (luminance(hex) + .05) / (frost + .05);
const contrastOnBlack = hex => (luminance(hex) + .05) / .05;

test('Daylight selects white ink on a transparent dark contrast base; other themes retain the dark palette', () => {
  assert.deepEqual(terminalTheme('daylight'), daylightTerminalTheme);
  assert.equal(daylightTerminalTheme.background, '#00000000');
  assert.equal(daylightTerminalTheme.foreground, '#ebebeb');
  for (const theme of ['forest', 'mountain-blue', 'wild-red', undefined]) {
    assert.deepEqual(terminalTheme(theme), darkTerminalTheme);
    assert.deepEqual(terminalDecorationColors(theme), { bullet: '#ff6b9a', heading: '#ff9fd5' });
  }
  // xterm may normalize options; callers must not share a mutable palette.
  const first = terminalTheme('daylight'); first.foreground = '#ffffff';
  assert.equal(terminalTheme('daylight').foreground, '#ebebeb');
});

// Readable on the frost (4.5:1), and at 4.5:1 against black, the contrast floor, so xterm keeps each colour.
test('every Daylight ANSI color, default foreground, cursor and decoration reads on its frosted pane and stays as chosen', () => {
  const keys = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite', 'foreground', 'cursor'];
  for (const key of keys) {
    const color = daylightTerminalTheme[key];
    assert.ok(contrastOnFrost(color) >= 4.5 && contrastOnBlack(color) >= 4.5, `${key}: ${contrastOnFrost(color).toFixed(2)}:1 on the frost, ${contrastOnBlack(color).toFixed(2)}:1 on black`);
  }
  for (const [key, color] of Object.entries(terminalDecorationColors('daylight'))) assert.ok(contrastOnFrost(color) >= 4.5, key);
});
