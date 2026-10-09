import { useState } from 'react';
import { t } from '../../shared/i18n';
import './reading-cli.css';

export function ReadingCommandOutput({ rows }: { rows: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const folded = rows.length > 12 && !expanded;
  return <div className="reading-command-output">
    <div className="reading-choice-head"><strong>{t('命令输出')}</strong>
      {rows.length > 12 && <button type="button" className="text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? t('收起') : t('展开')}</button>}
    </div>
    <pre className="reading-cli-rows">{(folded ? rows.slice(0, 12) : rows).join('\n')}</pre>
  </div>;
}
