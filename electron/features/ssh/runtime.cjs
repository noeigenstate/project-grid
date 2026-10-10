const path = require('node:path');

function createSshRuntime({ fs, execFileSync, tempDirectory, integrationDir, platform = process.platform }) {
  let sshAskpassPath, sshAskpassDir;
  function prepareAskpass() {
    if (!sshAskpassPath && platform === 'win32') {
      // Windows OpenSSH 8.1 cannot spawn an askpass executable under a Unicode
      // directory. The system temp volume provides an ASCII/short-path location
      // even when the workspace volume has 8.3 names disabled.
      sshAskpassDir = fs.mkdtempSync(path.join(tempDirectory(), 'agentrix-ssh-'));
      const helper = path.join(sshAskpassDir, 'ssh-askpass.exe');
      fs.copyFileSync(path.join(integrationDir, 'ssh-askpass.exe'), helper);
      try { sshAskpassPath = execFileSync(helper, ['--short-path', helper], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).trim(); }
      catch { sshAskpassPath = helper; }
    }
    return sshAskpassPath;
  }
  function cleanupAskpass() {
    if (sshAskpassDir) {
      try { fs.rmSync(path.join(sshAskpassDir, 'ssh-askpass.exe'), { force: true }); fs.rmdirSync(sshAskpassDir); } catch { }
    }
  }
  return { prepareAskpass, cleanupAskpass };
}

module.exports = { createSshRuntime };
