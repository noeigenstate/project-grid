// electron-builder afterPack hook: leave out what the packed app never loads.
// - Electron's demo app (default_app.asar); Agentrix starts from its own app.asar.
// - Windows: Chromium's DirectX shader compiler (about 26 MB). Only WebGPU on D3D12 loads it; Agentrix draws with
//   ANGLE/D3D11, which uses d3dcompiler_47.dll. Verified with identical app.getGPUFeatureStatus() and passing packaged
//   material and visual smoke tests.
// - macOS and Linux: the PowerShell and Command Prompt integration and the Windows helpers.
const fs = require('node:fs/promises');
const path = require('node:path');

exports.default = async context => {
  const platform = context.electronPlatformName;
  const resources = platform === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents/Resources')
    : path.join(context.appOutDir, 'resources');
  await fs.rm(path.join(resources, 'default_app.asar'), { force: true });
  if (platform === 'win32') {
    for (const name of ['dxcompiler.dll', 'dxil.dll']) await fs.rm(path.join(context.appOutDir, name), { force: true });
    return;
  }
  const integration = path.join(resources, 'integration');
  for (const name of await fs.readdir(integration)) if (/\.(ps1|cmd|exe|cs)$/i.test(name)) await fs.rm(path.join(integration, name), { force: true });
};
