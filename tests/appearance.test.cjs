const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recommendedAppearance } = require('../src/shared/theme-presets.ts');
const { terminalTheme, darkTerminalTheme, daylightTerminalTheme } = require('../src/features/terminal/terminal-theme.ts');
const { terminalFontFamily } = require('../src/features/terminal/terminal-font.ts');

test('original theme recommendations preserve upstream defaults and palette', () => {
  for (const theme of ['daylight', 'forest', 'mountain-blue', 'wild-red']) {
    const preset = recommendedAppearance(theme, true);
    assert.equal(preset.surface, 'glass'); assert.equal(preset.glassBackground, 'theme'); assert.equal(preset.glassTransparency, null);
    assert.equal(preset.fontSize, 12); assert.equal(preset.terminalFontWeight, 400); assert.equal(preset.terminalRenderer, 'gpu');
    assert.equal(preset.terminalFontFamily, ''); assert.equal(preset.terminalCjkFontFamily, '');
    assert.deepEqual(terminalTheme(theme), theme === 'daylight' ? daylightTerminalTheme : darkTerminalTheme);
  }
});

test('monochrome recommendations account for platform support and never include non-appearance settings', () => {
  for (const theme of ['mono-amber', 'mono-amber-dark']) {
    const native = recommendedAppearance(theme, true), unsupported = recommendedAppearance(theme, false);
    assert.equal(native.glassBackground, 'desktop'); assert.equal(unsupported.glassBackground, 'theme');
    assert.equal(native.glassTransparency, theme === 'mono-amber' ? 25 : 20); assert.equal(native.fontSize, 16);
    assert.equal(native.terminalRenderer, 'dom'); assert.equal(native.terminalCjkFontFamily, 'Noto Sans SC');
    assert.deepEqual(Object.keys(native).sort(), ['surface', 'glassBackground', 'glassTransparency', 'fontSize', 'terminalFontWeight', 'terminalFontFamily', 'terminalCjkFontFamily', 'terminalRenderer'].sort());
  }
  const mutable = recommendedAppearance('forest'); mutable.fontSize = 20; assert.equal(recommendedAppearance('forest').fontSize, 12);
});

test('both monochrome palettes preserve truecolor handling and use neutral extended ANSI', () => {
  for (const theme of ['mono-amber', 'mono-amber-dark']) {
    const palette = terminalTheme(theme); assert.equal(palette.background.length, 9); assert.ok(palette.background.endsWith('00'));
    assert.equal(palette.extendedAnsi.length, 240); assert.ok(palette.extendedAnsi.every(color => color.slice(1, 3) === color.slice(3, 5) && color.slice(3, 5) === color.slice(5, 7)));
  }
  assert.equal(terminalTheme('mono-amber').foreground, '#17191d'); assert.equal(terminalTheme('mono-amber-dark').foreground, '#f1f2f4');
});

test('font names remain single quoted families and missing choices retain original fallbacks', () => {
  const original = terminalFontFamily();
  assert.equal(original, "'Cascadia Mono', 'Cascadia Code', Consolas, 'SF Mono', Menlo, 'Microsoft YaHei UI', 'PingFang SC', monospace");
  assert.ok(original.startsWith("'Cascadia Mono'")); assert.ok(original.endsWith("'PingFang SC', monospace"));
  assert.ok(terminalFontFamily('Consolas', 'Noto Sans SC').startsWith("'Consolas'"));
  assert.ok(terminalFontFamily('Missing', 'Missing CJK').includes("'Cascadia Code'"));
  assert.ok(terminalFontFamily("Font'Name").startsWith("'Font\\'Name'"));
  const linuxFallback = terminalFontFamily('Missing', 'Noto Sans SC');
  assert.ok(linuxFallback.indexOf("'DejaVu Sans Mono'") < linuxFallback.indexOf("'Noto Sans SC'"));
  assert.ok(linuxFallback.indexOf("'Liberation Mono'") < linuxFallback.indexOf("'Noto Sans SC'"));
  assert.ok(terminalFontFamily('Font,Other').startsWith("'Font,Other',"));
});


test('recommended monochrome pane tints keep seven-to-one ink contrast over black or white backgrounds', () => {
  const luminance = rgb => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const contrast = (one, two) => (Math.max(luminance(one), luminance(two)) + .05) / (Math.min(luminance(one), luminance(two)) + .05);
  for (const theme of ['mono-amber', 'mono-amber-dark']) {
    const preset = recommendedAppearance(theme, true), palette = terminalTheme(theme), rgb = color => color.slice(1, 7).match(/../g).map(part => parseInt(part, 16));
    for (const base of [0, 255]) {
      const pane = rgb(palette.background).map(value => value * (1 - preset.glassTransparency / 100) + base * preset.glassTransparency / 100);
      assert.ok(contrast(rgb(palette.foreground), pane) >= 7, theme + ' recommended reading contrast');
    }
  }
});
