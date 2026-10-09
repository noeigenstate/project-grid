import type { PendingPrompt } from './pending-prompts';
import { t } from '../../shared/i18n';
import './pending-prompts.css';

export function PendingPromptEntries({ prompts }: { prompts: readonly PendingPrompt[] }) {
  return prompts.map(prompt => <div key={prompt.id} className={`reading-user reading-pending${prompt.sending ? ' is-sending' : ''}`}>
    <span>{t('你')}</span><p>{prompt.text}</p>{prompt.sending && <small role="status">{t('发送中')}</small>}
  </div>);
}
