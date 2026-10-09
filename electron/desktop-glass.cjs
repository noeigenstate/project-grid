const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

// Desktop backdrop is optional. Only its Windows 10 compatibility path needs
// a transparent window; the established wallpaper/solid windows stay unchanged.
function desktopGlassKind(platform = process.platform, release = os.release()) {
  if (platform === 'darwin') return 'macos';
  if (platform !== 'win32') return null;
  const [major, , build] = release.split('.').map(Number);
  if (!Number.isInteger(major) || major < 10 || !Number.isInteger(build) || build < 10240) return null;
  return build >= 22621 ? 'windows' : 'windows-compat';
}
function desktopGlassOptions(kind) {
  if (kind === 'windows') return { backgroundColor: '#00000000', backgroundMaterial: 'acrylic' };
  if (kind === 'macos') return { backgroundColor: '#00000000', vibrancy: 'under-window', visualEffectState: 'active' };
  if (kind === 'windows-compat') return { backgroundColor: '#00000000', transparent: true };
  return {};
}
async function applyDesktopGlass(window, directory, kind) {
  if (kind === 'windows') window.setBackgroundMaterial('acrylic');
  else if (kind === 'macos') window.setVibrancy('under-window');
  else if (kind === 'windows-compat') {
    // PowerShell's built-in .NET interop avoids another native addon/ABI dependency.
    // A real file is needed outside app.asar, in the app's existing private runtime.
    const helper = path.join(directory, 'desktop-glass.ps1');
    fs.writeFileSync(helper, fs.readFileSync(path.join(__dirname, 'desktop-glass.ps1')));
    const handle = window.getNativeWindowHandle();
    const value = handle.length >= 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    await run(powershell, ['-NoProfile', '-NonInteractive', '-File', helper, value], { windowsHide: true, timeout: 8000, maxBuffer: 16384 });
  } else throw new Error('Desktop glass is not supported');
}
module.exports = { desktopGlassKind, desktopGlassOptions, applyDesktopGlass };
