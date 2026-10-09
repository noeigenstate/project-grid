import { useMemo, useState } from 'react';
import { t } from '../../shared/i18n';
import { renderCliRows } from './cli-render';
import './reading-cli.css';

// A slash command's screen laid out as part of the document: tabs, headings, label/value tables, meters, hints, text.
// Key hints only mean something while the command still listens; a finished result leaves them out.
export function CliBlocks({ rows, live = false }: { rows: readonly string[]; live?: boolean }) {
  const blocks = useMemo(() => renderCliRows(rows).filter(block => live || block.kind !== 'hint'), [rows, live]);
  return <div className="cli-blocks">{blocks.map((block, index) => {
    if (block.kind === 'tabs') return <div key={index} className="cli-tabs">{block.items.map(item => <span key={item}>{item}</span>)}</div>;
    if (block.kind === 'heading') return <h5 key={index}>{block.text}</h5>;
    if (block.kind === 'pairs') return <dl key={index} className="cli-pairs">{block.pairs.map(([label, value], at) => <div key={at}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
    if (block.kind === 'meter') return <div key={index} className="cli-meter" role="meter" aria-valuenow={block.percent} aria-valuemin={0} aria-valuemax={100}><span><i style={{ width: `${block.percent}%` }} /></span><b>{block.percent}%</b>{block.label && <small>{block.label}</small>}</div>;
    if (block.kind === 'hint') return <p key={index} className="cli-hint">{block.text}</p>;
    return <p key={index} className="cli-text">{block.lines.join('\n')}</p>;
  })}</div>;
}

// A finished slash command, kept in the conversation where it was sent.
export function ReadingCommandOutput({ rows }: { rows: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const folded = rows.length > 16 && !expanded;
  return <div className="reading-command-output">
    <div className="reading-choice-head"><strong>{t('命令输出')}</strong>
      {rows.length > 16 && <button type="button" className="text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? t('收起') : t('展开')}</button>}
    </div>
    <CliBlocks rows={folded ? rows.slice(0, 16) : rows} />
  </div>;
}
