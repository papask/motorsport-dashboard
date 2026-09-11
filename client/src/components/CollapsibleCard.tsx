import { useState, type ReactNode, type CSSProperties } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import { useT } from '../i18n';

interface Props {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

// A card whose body collapses behind a clickable title. Defaults to open on
// desktop and collapsed on mobile (where vertical space is scarce).
export default function CollapsibleCard({ title, children, className = '', style }: Props) {
  const t = useT();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(!isMobile);

  return (
    <div className={`card ${open ? '' : 'card-collapsed'} ${className}`} style={style}>
      <div
        className="card-title collapsible-title"
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="collapse-toggle">{open ? t('collapse') : t('expand')}</span>
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
