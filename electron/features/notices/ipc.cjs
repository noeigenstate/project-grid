function registerNoticesIpc({ handle, speechManager, summarySecrets, agents, getSettings, summaryDirectory, fetcher, summarizeRound, modelSummary, listModels, connection, SUMMARY_TARGETS }) {
  handle('speech:state', () => speechManager.getState());
  handle('speech:prepare', () => speechManager.prepare());
  handle('speech:speak', text => speechManager.speak(text));
  // Spoken summaries from a model: whether a key is saved (never the key), saving one, the server's models, a trial run.
  const summaryKeys = () => ({ keys: { cloud: summarySecrets.has('cloud'), local: summarySecrets.has('local') } });
  const summaryTarget = target => { if (!SUMMARY_TARGETS.includes(target)) throw new Error('无效的模型类型。'); return target; };
  handle('summary:state', summaryKeys);
  handle('summary:set-key', (target, key) => { summarySecrets.set(summaryTarget(target), key); return summaryKeys(); });
  handle('summary:models', target => listModels({ ...connection(summaryTarget(target), getSettings().summary[target], summarySecrets.get(target)), fetcher: fetcher }));
  handle('summary:test', async mode => {
    const english = getSettings().language === 'en', started = Date.now();
    const material = english
      ? { language: 'en', task: 'add a captcha to the login page', reply: 'I added a captcha component to src/login.tsx and three tests; npm test passes. One question: how long should a captcha stay valid?' }
      : { language: 'zh', task: '给登录页加上验证码', reply: '我在 src/login.tsx 加了图形验证码组件，补了 3 个测试，npm test 全部通过。还有一个问题：验证码过期时间要设成多久？' };
    let text;
    if (mode === 'agent') {
      const installed = agents.getState();
      text = await summarizeRound({ agent: installed.claude.installed ? 'claude' : 'codex', ...material, directory: summaryDirectory() });
      if (!text) throw new Error('编码助手没有给出总结：可能未安装、未登录，或超过了 30 秒。');
    } else text = await modelSummary({ target: summaryTarget(mode), entry: getSettings().summary[mode], apiKey: summarySecrets.get(mode), ...material, fetcher: fetcher });
    return { text, ms: Date.now() - started };
  });
}

module.exports = { registerNoticesIpc };
