import { type ReactNode } from 'react';

export function IconButton({ label, children, onClick, className = '', disabled = false }: {
  label: string; children: ReactNode; onClick: () => void; className?: string; disabled?: boolean;
}) {
  return <button className={`icon-button ${className}`} type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>;
}
