import { File, Folder } from '@phosphor-icons/react';
import { mentionHighlights } from './mention-tokens';
import type { useMentions } from './useMentions';
import { t } from '../../shared/i18n';

export function MentionPalette({ mentions }: { mentions: ReturnType<typeof useMentions> }) {
  if (!mentions.open) return null;
  return <div className="dropdown reading-commands" id={mentions.listId} role="listbox" aria-label={t('提及文件')}>
    {mentions.files.map((file, index) => {
      const matched = new Set(mentionHighlights(file.path, mentions.query));
      const Icon = file.kind === 'dir' ? Folder : File;
      let offset = 0;
      return <div key={file.path} id={mentions.optionId(index)} role="option" aria-selected={mentions.selection === index} className="reading-command" onMouseDown={event => event.preventDefault()} onClick={() => mentions.complete(file)}>
        <Icon size={15} aria-hidden="true" /><span title={file.path}>{Array.from(file.path, letter => { const at = offset; offset += letter.length; return matched.has(at) ? <b key={at}>{letter}</b> : letter; })}{file.kind === 'dir' ? '/' : ''}</span>
      </div>;
    })}
    {!mentions.files.length && <div className="reading-command" role="status"><span>{mentions.loading ? t('正在搜索文件…') : t('没有匹配的文件')}</span></div>}
  </div>;
}
