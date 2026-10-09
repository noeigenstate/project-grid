function createGitRuntime({ getProjects, execFile, broadcast }) {
  const branches = new Map();
  // Same label as project:git-status ("HEAD 1a2b3c4d" when detached), so the two sources never flip
  // the header back and forth; broadcast only when the label actually changes.
  function setBranch(id, branch) {
    if (!getProjects().some(item => item.id === id) || branches.get(id) === branch) return;
    branches.set(id, branch); broadcast();
  }
  function captureBranch(project) {
    if (project.kind === 'ssh') return;
    const git = (args, done) => execFile('git', ['-C', project.path, ...args], { windowsHide: true, timeout: 3000 }, (error, stdout) => done(error ? '' : stdout.trim()));
    git(['symbolic-ref', '--short', '-q', 'HEAD'], branch => {
      if (branch) setBranch(project.id, branch);
      else git(['rev-parse', 'HEAD'], head => setBranch(project.id, head ? `HEAD ${head.slice(0, 8)}` : ''));
    });
  }
  function remoteBranch(id, branch) { branches.set(id, String(branch || '').slice(0, 120)); broadcast(); }
  return { setBranch, captureBranch, getBranch: id => branches.get(id), forgetBranch: id => branches.delete(id), remoteBranch };
}

module.exports = { createGitRuntime };
