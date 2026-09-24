import type { ReactNode } from 'react';

interface Action {
  label: string;
  onClick?: () => void;
  href?: string;
  /** The one action the user most likely wants — filled, ink. */
  primary?: boolean;
}

interface Props {
  title: ReactNode;
  /** One sentence saying why there is nothing here, in plain language. */
  reason?: ReactNode;
  /** Provenance for an error: endpoint, status, timestamp. */
  detail?: ReactNode;
  actions?: Action[];
  /** Errors announce immediately; empty states do not. */
  tone?: 'empty' | 'error';
}

/**
 * The canvas's shared empty and error block: a 2px rule, a bold title, one line
 * of reason, and one or two actions. Deliberately no icon or illustration — and
 * no red, which is reserved for race control, so an error is distinguished by
 * weight and rule rather than colour.
 */
export default function StateBlock({ title, reason, detail, actions, tone = 'empty' }: Props) {
  return (
    <div className="state-block" role={tone === 'error' ? 'alert' : undefined}>
      <h3 className="state-block-title">{title}</h3>
      {reason && <p className="state-block-reason">{reason}</p>}
      {detail && <p className="state-block-detail">{detail}</p>}
      {actions && actions.length > 0 && (
        <div className="state-block-actions">
          {actions.map((a) =>
            a.href ? (
              <a key={a.label} className={a.primary ? 'btn-primary' : 'btn-secondary'} href={a.href}>
                {a.label}
              </a>
            ) : (
              <button
                key={a.label}
                type="button"
                className={a.primary ? 'btn-primary' : 'btn-secondary'}
                onClick={a.onClick}
              >
                {a.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
