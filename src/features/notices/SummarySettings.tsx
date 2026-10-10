import { useEffect, useState } from 'react';
import presets from '../../../electron/summary-presets.json';
import type { Settings, SummaryEndpoint } from '../../shared/types';
import { t } from '../../shared/i18n';

const api = window.agentrix;
type Mode = Settings['summary']['mode'];
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'fast', label: '快速播报', hint: '一轮结束立即播报「项目名 + 这一轮指令的第一句」，不调用任何模型。' },
  { id: 'agent', label: '编码助手总结（Codex / Claude Code）', hint: '让完成这一轮的 Codex 或 Claude Code 自己用一句话说明结果，用现有登录，无需密钥；播报会晚约 10 秒，每轮多一次模型调用。' },
  { id: 'cloud', label: '云端模型', hint: '把这一轮的最终回复发给云端模型，总结成一句话再播报，通常只需几秒；需要 API 密钥，内容会发送给所选服务商。' },
  { id: 'local', label: '本地模型', hint: '用本机或局域网里部署的小模型总结（Ollama、vLLM、LM Studio、llama.cpp 等），内容不离开你的设备；模型首次加载时可能较慢。' },
];

// What the spoken notice says, and who writes it: nothing (the prompt's first sentence, at once), the
// agent's own CLI, a cloud API, or a model served locally. Addresses and model names are settings; an API
// key is handed to the main process, which encrypts it and never gives it back.
export function SummarySettings({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const summary = settings.summary, mode = summary.mode;
  const target = mode === 'cloud' || mode === 'local' ? mode : null;
  const entry: SummaryEndpoint | null = target ? summary[target] : null;
  const list = target ? presets[target] : [];
  const preset = list.find(item => item.id === entry?.provider) || list[0];
  // How to start the chosen local server, when the preset knows.
  const hint = preset && 'hint' in preset ? String(preset.hint || '') : '';
  const [keys, setKeys] = useState({ cloud: false, local: false });
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: 'busy' | 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => { void api.summaryState().then(result => { if (result.ok) setKeys(result.value.keys); }); }, []);
  useEffect(() => { setKey(''); setModels([]); setStatus(null); }, [mode, entry?.provider]);
  const setEntry = (patch: Partial<SummaryEndpoint>) => { if (target && entry) update({ summary: { ...summary, [target]: { ...entry, ...patch } } }); };
  const run = async <T,>(busy: string, action: () => Promise<{ ok: true; value: T } | { ok: false; error: string }>, done: (value: T) => string) => {
    setStatus({ kind: 'busy', text: busy });
    try { const result = await action(); setStatus(result.ok ? { kind: 'ok', text: done(result.value) } : { kind: 'error', text: result.error }); }
    catch (error) { setStatus({ kind: 'error', text: String(error) }); }
  };
  const saveKey = (value: string) => target && run(t('正在保存…'), () => api.setSummaryKey(target, value), state => { setKeys(state.keys); setKey(''); return value ? t('密钥已加密保存在本机。') : t('密钥已清除。'); });
  return <div className="summary-settings">
    <label className="setting-row"><span><span><b>{t('播报内容')}</b><small>{t(MODES.find(item => item.id === mode)!.hint)}</small></span></span>
      <select aria-label={t('播报内容')} value={mode} onChange={event => update({ summary: { ...summary, mode: event.target.value as Mode } })}>{MODES.map(item => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select></label>
    {target && entry && <div className="summary-fields" key={`${target}:${entry.provider}`}>
      <label><span>{target === 'cloud' ? t('服务商') : t('部署方式')}</span>
        <select aria-label={target === 'cloud' ? t('服务商') : t('部署方式')} value={entry.provider} onChange={event => { const next = list.find(item => item.id === event.target.value)!; setEntry({ provider: next.id, baseUrl: next.baseUrl, model: next.model, protocol: 'openai' }); }}>{list.map(item => <option key={item.id} value={item.id}>{t(item.name)}</option>)}</select></label>
      {target === 'cloud' && entry.provider === 'custom' && <label><span>{t('接口协议')}</span>
        <select aria-label={t('接口协议')} value={entry.protocol} onChange={event => setEntry({ protocol: event.target.value as SummaryEndpoint['protocol'] })}><option value="openai">{t('OpenAI 兼容（/chat/completions）')}</option><option value="anthropic">{t('Anthropic（/v1/messages）')}</option></select></label>}
      <label><span>{t('接口地址')}</span><input aria-label={t('接口地址')} defaultValue={entry.baseUrl} placeholder={target === 'cloud' ? 'https://api.example.com/v1' : 'http://localhost:11434/v1'} spellCheck={false} onBlur={event => { if (event.target.value.trim() !== entry.baseUrl) setEntry({ baseUrl: event.target.value.trim() }); }} /></label>
      <label><span>{t('模型')}</span><span className="summary-inline"><input aria-label={t('模型')} list="summary-models" defaultValue={entry.model} placeholder={preset.model || t('模型名称，可点右侧获取')} spellCheck={false} onBlur={event => { if (event.target.value.trim() !== entry.model) setEntry({ model: event.target.value.trim() }); }} />
        <datalist id="summary-models">{models.map(name => <option key={name} value={name} />)}</datalist>
        <button type="button" className="button secondary small" disabled={status?.kind === 'busy'} onClick={() => void run(t('正在获取模型列表…'), () => api.summaryModels(target), names => { setModels(names); return names.length ? t('找到 {count} 个模型，可在模型框里选择。', { count: names.length }) : t('接口没有返回模型列表，请手动填写模型名称。'); })}>{t('获取模型列表')}</button></span></label>
      <label><span>{target === 'cloud' ? t('API 密钥') : t('API 密钥（可选）')}</span><span className="summary-inline"><input aria-label={t('API 密钥')} type="password" autoComplete="off" value={key} placeholder={keys[target] ? t('已保存，输入新密钥可替换') : target === 'cloud' ? t('粘贴 API 密钥') : t('本地服务一般不需要')} onChange={event => setKey(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && key.trim()) void saveKey(key.trim()); }} />
        <button type="button" className="button secondary small" disabled={!key.trim() || status?.kind === 'busy'} onClick={() => void saveKey(key.trim())}>{t('保存密钥')}</button>
        {keys[target] && <button type="button" className="text-button" onClick={() => void saveKey('')}>{t('清除')}</button>}</span></label>
      {hint && <p className="summary-hint">{t('启动示例：')}<code>{hint}</code></p>}
      {target === 'local' && <p className="summary-hint">{t('一句话总结用 1–3B 的小模型就够，例如 qwen2.5:1.5b、qwen2.5:3b、gemma2:2b、phi3:mini。')}</p>}
    </div>}
    {mode !== 'fast' && <div className="summary-test">
      <button type="button" className="button secondary small" disabled={status?.kind === 'busy'} onClick={() => void run(t('正在测试，请稍候…'), () => api.testSummary(mode), result => t('{text}（用时 {seconds} 秒）', { text: result.text, seconds: (result.ms / 1000).toFixed(1) }))}>{t('测试总结')}</button>
      {status && <span className={`summary-status is-${status.kind}`} role="status">{status.text}</span>}
    </div>}
  </div>;
}
