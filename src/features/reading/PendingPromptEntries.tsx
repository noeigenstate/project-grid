import type { PendingPrompt } from './pending-prompts';
import { t } from '../../shared/i18n';
import './pending-prompts.css';

// The pictures a message carried, small, under its text.
export function UserImages({ images }: { images: readonly string[] }) {
  return <div className="reading-user-images">{images.map((src, index) => <img key={index} src={src} alt={t('附加的图片 {n}', { n: index + 1 })} loading="lazy" decoding="async" />)}</div>;
}

// Messages sent from here that no record has shown yet. One the agent never took, even after it was sent again,
// says so and offers to send it once more or drop it.
export function PendingPromptEntries({ prompts, undelivered = () => false, onResend, onDiscard }: {
  prompts: readonly PendingPrompt[]; undelivered?: (prompt: PendingPrompt) => boolean; onResend?: (prompt: PendingPrompt) => void; onDiscard?: (prompt: PendingPrompt) => void;
}) {
  return prompts.map(prompt => {
    const lost = undelivered(prompt);
    return <div key={prompt.id} className={`reading-user reading-pending${prompt.sending ? ' is-sending' : ''}${lost ? ' is-undelivered' : ''}`}>
      <span>{t('你')}</span><p>{prompt.text}</p>{prompt.images && <UserImages images={prompt.images} />}{prompt.sending && <small role="status">{t('发送中')}</small>}
      {lost && <div className="reading-undelivered" role="alert"><small>{t('未送达：助手没有收到这条消息')}</small>
        <button type="button" className="text-button" onClick={() => onResend?.(prompt)}>{t('重新发送')}</button>
        <button type="button" className="text-button" onClick={() => onDiscard?.(prompt)}>{t('移除')}</button></div>}
    </div>;
  });
}
