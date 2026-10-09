function registerSshIpc({ handle, getSSHInfo, sshAuth, addSSH, hasSession, getSession, startTerminal, setStartupError, broadcast }) {
  handle('ssh:info', () => getSSHInfo());
  handle('ssh:auth-pending', () => sshAuth.getPending());
  handle('ssh:auth-answer', (id, answer) => sshAuth.answer(id, answer));
  handle('workspace:add-ssh', input => {
    const configuration = getSSHInfo();
    const { project, added } = addSSH({ ...input, configFile: configuration.configExists ? configuration.configFile : null });
    if (added || !hasSession(project.id) || getSession(project.id).status === 'exited') {
      try { startTerminal(project.id); } catch (error) { setStartupError(project.id, error.message); }
    }
    broadcast(); return project.id;
  });
}

module.exports = { registerSshIpc };
