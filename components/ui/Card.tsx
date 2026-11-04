import type {ReactNode} from 'react';

/** The one surface. `title` gives it a heading; `actions` sit opposite it. */
export function Card({
  title,
  description,
  actions,
  className = '',
  children,
  as: Tag = 'section',
  labelledBy,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
  as?: 'section' | 'div' | 'article';
  labelledBy?: string;
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={`rounded-xl border border-edge bg-surface/80 p-5 backdrop-blur-sm ${className}`}
    >
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            {title && (
              <h2 id={labelledBy} className="text-sm font-semibold tracking-tight">
                {title}
              </h2>
            )}
            {description && <p className="text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

/** A labelled figure: one number, what it is, and optionally what it means. */
export function Stat({
  label,
  value,
  hint,
  tone = '',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface/80 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular mt-1 text-xl font-semibold ${tone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
