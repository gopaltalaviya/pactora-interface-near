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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-edge-strong/70 bg-[radial-gradient(ellipse_at_top,rgb(110_168_255/0.06),transparent_65%)] px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-edge bg-raised text-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
        <Icon name={icon} className="size-5" />
      </span>
      <p className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{title}</p>
      {children && <div className="max-w-md text-sm leading-relaxed text-muted">{children}</div>}
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
      className="flex flex-col gap-3 rounded-2xl border border-broken/30 bg-broken/[0.06] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] sm:flex-row sm:items-center"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-broken/15 text-broken">
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
        'flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm leading-relaxed shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] ' +
        (tone === 'refused'
          ? 'border-refused/25 bg-refused/[0.06] text-refused'
          : 'border-accent/25 bg-accent/[0.06] text-accent')
      }
    >
      <Icon name={tone === 'refused' ? 'alert' : 'check'} className="mt-[3px] size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
