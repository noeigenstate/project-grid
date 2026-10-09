const { test } = require('node:test');
const assert = require('node:assert/strict');
const { desktopGlassKind, desktopGlassOptions, applyDesktopGlass } = require('../electron/desktop-glass.cjs');

test('desktop glass uses native backends where available and leaves ordinary window options untouched', () => {
  assert.equal(desktopGlassKind('darwin', '24.0.0'), 'macos');
  assert.equal(desktopGlassKind('win32', '10.0.22621'), 'windows');
  assert.equal(desktopGlassKind('win32', '10.0.19045'), 'windows-compat');
  for (const [platform, release] of [['linux', '6.0.0'], ['win32', '6.1.7601'], ['win32', 'bad.0.19045'], ['win32', 'unknown']]) assert.equal(desktopGlassKind(platform, release), null);
  assert.deepEqual(desktopGlassOptions(null), {});
  assert.equal(desktopGlassOptions('windows').backgroundMaterial, 'acrylic');
  assert.equal(desktopGlassOptions('windows').transparent, undefined);
  assert.equal(desktopGlassOptions('macos').vibrancy, 'under-window');
  assert.equal(desktopGlassOptions('windows-compat').transparent, true);
});

test('native backdrop calls the platform material API, without changing window opacity', async () => {
  const calls = [], window = { setBackgroundMaterial: value => calls.push(['windows', value]), setVibrancy: value => calls.push(['macos', value]) };
  await applyDesktopGlass(window, '', 'windows'); await applyDesktopGlass(window, '', 'macos');
  assert.deepEqual(calls, [['windows', 'acrylic'], ['macos', 'under-window']]);
  await assert.rejects(applyDesktopGlass(window, '', null), /not supported/);
});
