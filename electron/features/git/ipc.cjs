function registerGitIpc({ handle, findProject, projectGit, setBranch, affectsEditor, allowEditorClose, getWindow, dialog, t }) {
  handle('project:git-status', async id => {
    const project = findProject(id), status = await projectGit.read(project, 'status');
    const branch = status.repository ? status.detached ? `HEAD ${status.head.slice(0, 8)}` : status.branch : '';
    setBranch(id, branch);
    return status;
  });
  handle('project:git-history', (id, offset = 0) => projectGit.read(findProject(id), 'history', offset));
  handle('project:git-files', (id, hash) => projectGit.read(findProject(id), 'files', hash));
  // The changes of one file as hunks; staged compares the index with HEAD, otherwise the working tree with the index.
  handle('project:git-diff', (id, relative, options = {}) => projectGit.read(findProject(id), 'diff', { path: relative, staged: options?.staged === true, untracked: options?.untracked === true }));
  // Keeps (stages) or undoes (reverse) a hunk's patch; an editor holding the file must agree first.
  handle('project:git-apply', async (id, patch, options = {}) => {
    const relative = typeof options?.path === 'string' ? options.path : '';
    if (relative && affectsEditor(id, [relative]) && !await allowEditorClose()) return { applied: false };
    return projectGit.read(findProject(id), 'apply', { patch, reverse: options?.reverse === true, cached: options?.cached === true });
  });
  handle('project:git-confirm-revert', async (id, relative, count) => {
    findProject(id);
    const name = String(relative).slice(0, 500);
    const result = await dialog.showMessageBox(getWindow(), { type: 'question', title: t('还原更改'), message: count > 1 ? t('还原“{name}”的 {count} 处更改？', { name, count }) : t('还原“{name}”的这处更改？', { name }),
      detail: t('工作区里的这些修改会被丢弃，无法撤销。'), buttons: [t('取消'), t('还原')], defaultId: 0, cancelId: 0 });
    return result.response === 1;
  });
}

module.exports = { registerGitIpc };
