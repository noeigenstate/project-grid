function registerWorkspaceIpc({ handle, publicState, dialog, getWindow, t, addProject, getRecentProjects, existsSync, getRecentEntry, forgetRecent, clearHistory, getEditorFile, allowEditorClose, confirmTerminalClose, disposeProjectTerminals, findProject, closeProjectPreviews, removeProject, forgetBranch, broadcast, acknowledgeProject, reorderProjects, getSettings, updateStoreSettings, rebuildMenus, clearRestorePlans, chooseVoiceModel }) {
  // Adds a local folder as a project; an already open folder just returns its id. Its card then offers Claude Code
  // and Codex (new or continuing), so no terminal is opened before one is chosen.
  function addLocalProject(folder, name) {
    return addProject(folder, name).project.id;
  }

  handle('workspace:state', publicState);
  handle('workspace:add', async () => {
    const result = await dialog.showOpenDialog(getWindow(), { title: t('添加项目文件夹（可多选）'), properties: ['openDirectory', 'multiSelections'] });
    if (result.canceled) return [];
    const ids = result.filePaths.map(folder => addLocalProject(folder));
    broadcast();
    return ids;
  });
  const recentProjects = () => getRecentProjects().map(item => ({ ...item, exists: existsSync(item.path) }));
  handle('workspace:recent', recentProjects);
  // Only folders already in the history can be reopened this way; anything else goes through the folder picker.
  handle('workspace:add-recent', folder => {
    const entry = getRecentEntry(folder);
    if (!entry) throw new Error('这个项目不在最近列表里，请重新选择文件夹。');
    if (!existsSync(entry.path)) throw new Error('文件夹已不存在，可以把它从最近列表中删除。');
    const id = addLocalProject(entry.path, entry.name); broadcast(); return id;
  });
  handle('workspace:forget-recent', folder => { forgetRecent(folder); return recentProjects(); });
  handle('workspace:clear-recent', () => { clearHistory(); return recentProjects(); });
  handle('workspace:remove', async id => {
    if (getEditorFile()?.id === id && !await allowEditorClose()) return false;
    if (!await confirmTerminalClose(id, '移除', true)) return false;
    disposeProjectTerminals(findProject(id)); closeProjectPreviews(id); removeProject(id); forgetBranch(id); broadcast(); return true;
  });
  handle('workspace:acknowledge', id => { findProject(id); acknowledgeProject(id); broadcast(); });
  handle('workspace:reorder', ids => { reorderProjects(ids); broadcast(); });
  function updateSettings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('无效的设置。');
    const language = getSettings().language;
    updateStoreSettings(patch); broadcast();
    if (getSettings().language !== language) rebuildMenus();
    if (patch.restoreSessions === false) clearRestorePlans();
    chooseVoiceModel(getSettings().voiceModel);
  }
  handle('workspace:settings', updateSettings);
}

module.exports = { registerWorkspaceIpc };
