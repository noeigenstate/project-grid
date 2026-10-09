const { isLocalCommand, isTerminalResponse } = require('../../terminal-input.cjs');

function registerTerminalIpc({ handle, listen, findProject, getSession, hasSession, startTerminal, addTerminal, removeTerminal, confirmTerminalClose, forgetRestorePlan, disposeTerminal, clearStartupError, broadcast, getProjectById, acknowledgeProject, expectCompletion, scheduleState, warmSpeech, applyActivity, pollAfterSubmission, send, getActiveTerminal, setActiveTerminal, setActiveFileTree, now = () => Date.now() }) {
  handle('terminal:start', startTerminal);
  handle('terminal:add', id => {
    const project = findProject(id);
    if (!hasSession(project.id) && !project.terminals?.length) { startTerminal(project.id); return project.id; }
    const terminalId = addTerminal(project.id);
    try { startTerminal(terminalId); return terminalId; }
    catch (error) { removeTerminal(terminalId); throw error; }
  });
  handle('terminal:close', async id => {
    if (!await confirmTerminalClose(id, '关闭')) return false;
    forgetRestorePlan(id); disposeTerminal(id); removeTerminal(id); clearStartupError(id); broadcast(); return true;
  });
  handle('terminal:restart', async id => {
    if (!await confirmTerminalClose(id, '重启')) return false;
    forgetRestorePlan(id);
    disposeTerminal(id); startTerminal(id); return true;
  });
  handle('terminal:attach', id => {
    findProject(id);
    const s = getSession(id);
    if (!s) return { sessionId: null, seq: 0, data: '' };
    s.flush();
    return { sessionId: s.sessionId, seq: s.seq, data: s.chunks.join('') };
  });
  function writeTerminal(id, data) {
    if (typeof data !== 'string' || data.length > 1024 * 1024) return;
    const s = getSession(id);
    if (s && s.status !== 'exited') {
      const submitted = s.submissions.write(data);
      const prompts = s.submissions.sent.filter(text => !isLocalCommand(text));
      if (submitted && s.codexActive) for (const text of prompts) s.promptQueue.submit(text, s.codexActivity === 'working');
      // Sending a new prompt means the last result has been read: clear the unviewed state before the next round.
      if (submitted && getProjectById(s.projectId)?.unread) { acknowledgeProject(s.projectId); scheduleState(); }
      if (prompts.length && s.codexActive) {
        expectCompletion(s.projectId);
        s.codexActivity = 'working'; s.activityInputAt = now();
        scheduleState(); warmSpeech();
      }
      // Escape on its own interrupts a working Claude Code turn. It runs no hook then, writes nothing to its transcript
      // and only puts the prompt back in its input, so this key is the only sign the round has ended. While Claude asks
      // something (a permission or a question), Escape only answers it and the round may go on.
      if (data === '\x1b' && s.codexActive && s.agent === 'claude' && s.codexActivity === 'working' && !s.needsInput) {
        const project = getProjectById(s.projectId);
        if (project) applyActivity(project, s, { threadId: s.claudeSessionId, turnId: null, state: 'interrupted', updatedAt: now() });
      }
      if (!s.codexActive && !isTerminalResponse(data)) {
        const wasReady = s.ready && !s.inputDirty;
        s.inputDirty = true; if (data.includes('\r') || data.includes('\n')) s.ready = false;
        if (wasReady) scheduleState();
      }
      s.gate.input(data);
      if (submitted && s.codexActive) pollAfterSubmission(s, () => getSession(id) === s);
    }
  }
  listen('terminal:write', writeTerminal);
  listen('terminal:resize', (id, cols, rows) => {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2 || cols > 500 || rows > 250) return;
    const s = getSession(id);
    if (s && s.status !== 'exited') s.terminal.resize(cols, rows);
  });
  handle('terminal:paste', (id, text, sessionId) => {
    const session = getSession(id);
    if (!session || session.sessionId !== sessionId || ['starting', 'exited'].includes(session.status)) throw new Error('终端已变化或尚未就绪，请复制文字后手动粘贴。');
    if (typeof text !== 'string' || text.length > 1024 * 1024) throw new Error('无效的文字。');
    send('terminal:paste', { id, sessionId, text });
  });
  listen('terminal:focus', (id, focused) => { if (hasSession(id) && focused) { setActiveTerminal(id); setActiveFileTree(null); } else if (getActiveTerminal() === id) setActiveTerminal(null); });
}

module.exports = { registerTerminalIpc };
