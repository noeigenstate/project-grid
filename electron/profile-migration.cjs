const fs = require('node:fs');
const path = require('node:path');

// What a profile holds that is worth keeping: the projects and settings, round summaries, downloaded voice models and
// the icons Windows shows. Caches are rebuilt.
const KEPT = ['workspace.json', 'summaries', 'voice', 'shell-icons'];

// Moves a profile from its old folder to its new one the first time the new one is needed. The whole folder is
// renamed when it can be (instantly, voice models and all); while something still holds it open (the old app is
// running), what matters is copied instead and the old folder is left as it was.
function adoptProfile(from, to, files = fs) {
  if (files.existsSync(to) || !files.existsSync(from)) return 'none';
  try { files.renameSync(from, to); return 'moved'; }
  catch {
    files.mkdirSync(to, { recursive: true });
    for (const name of KEPT) {
      try { if (files.existsSync(path.join(from, name))) files.cpSync(path.join(from, name), path.join(to, name), { recursive: true }); } catch { }
    }
    return 'copied';
  }
}

module.exports = { adoptProfile, KEPT };
