import Link from 'next/link';
import type {ReactNode} from 'react';
import {Icon} from './Icon';

/**
 * The top of every page answers "where am I, and what is this for?" the same
 * way: an optional way back, an eyebrow naming the section, the title, one
 * sentence of purpose, and the page's main actions.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  back,
  actions,
  titleClassName = 'text-3xl sm:text-4xl',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  back?: {href: string; label: string};
  actions?: ReactNode;
  titleClassName?: string;
}) {
  return (
    <header className="animate-enter space-y-4">
      {back && (
        <Link
          href={back.href}
          className="group -ml-1 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1 text-sm text-muted transition-colors hover:text-text"
        >
          <Icon name="arrowLeft" className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2.5">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
          )}
          <h1 className={`font-semibold tracking-[-0.03em] text-balance ${titleClassName}`}>{title}</h1>
          {description && (
            <div className="max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{description}</div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
