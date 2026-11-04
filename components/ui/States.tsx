import type {ReactNode} from 'react';
import {Icon, type IconName} from './Icon';

/**
 * The three states every data view has besides "loaded": loading, empty, and
 * failed. Each says what is happening and what to do next — a bare "Loading…"
 * or an unexplained blank is how a working page looks broken.
 */

export function Skeleton({className = 'h-4 w-full'}: {className?: string}) {
  return <span aria-hidden className={`skeleton block ${className}`} />;
}

/** Announced once to screen readers; shows shimmer shapes to everyone else. */
export function Loading({label, children}: {label: string; children: ReactNode}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function EmptyState({
  icon = 'sparkle',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-edge px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full border border-edge bg-raised text-muted">
        <Icon name={icon} className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-broken/30 bg-broken/[0.06] p-4 sm:flex-row sm:items-center"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-broken/15 text-broken">
        <Icon name="alert" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-broken">{title}</p>
        {children && <div className="mt-0.5 break-words text-sm text-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Notice for a decision or a warning that is not an error. */
export function Notice({tone = 'refused', children}: {tone?: 'refused' | 'live'; children: ReactNode}) {
  return (
    <div
      className={
        'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ' +
        (tone === 'refused'
          ? 'border-refused/30 bg-refused/[0.07] text-refused'
          : 'border-accent/30 bg-accent/[0.07] text-accent')
      }
    >
      <Icon name={tone === 'refused' ? 'alert' : 'sparkle'} className="mt-0.5 size-4" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
