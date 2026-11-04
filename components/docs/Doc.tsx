import type {ReactNode} from 'react';
import {Icon, type IconName} from '@/components/ui/Icon';

/** The top of a docs page: section, title, one-line purpose. */
export function DocHeader({section, title, lead}: {section: string; title: string; lead: ReactNode}) {
  return (
    <header className="animate-enter mb-10 space-y-3 border-b border-edge pb-8">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">{section}</p>
      <h1 className="display text-4xl sm:text-5xl">{title}</h1>
      <p className="max-w-2xl text-base leading-relaxed text-muted">{lead}</p>
    </header>
  );
}

const CALLOUT: Record<'note' | 'warning' | 'tip', {icon: IconName; cls: string; label: string}> = {
  note: {icon: 'sparkle', cls: 'border-accent/30 bg-accent/[0.06] text-accent', label: 'Note'},
  tip: {icon: 'check', cls: 'border-settled/30 bg-settled/[0.06] text-settled', label: 'Tip'},
  warning: {icon: 'alert', cls: 'border-refused/30 bg-refused/[0.07] text-refused', label: 'Important'},
};

export function Callout({type = 'note', children}: {type?: 'note' | 'warning' | 'tip'; children: ReactNode}) {
  const c = CALLOUT[type];
  return (
    <aside className={`my-6 flex gap-3 rounded-xl border px-4 py-3.5 ${c.cls}`}>
      <Icon name={c.icon} className="mt-1 size-4" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-text/90 [&>p]:mb-0">
        <span className="sr-only">{c.label}: </span>
        {children}
      </div>
    </aside>
  );
}

/** Numbered steps with a rail, for anything done in order. */
export function Steps({children}: {children: ReactNode}) {
  return <ol className="my-6 space-y-0 [counter-reset:step]">{children}</ol>;
}

export function Step({title, children}: {title: string; children: ReactNode}) {
  return (
    <li className="relative pb-8 pl-12 [counter-increment:step] last:pb-0 before:absolute before:left-0 before:top-0 before:grid before:size-8 before:place-items-center before:rounded-full before:border before:border-edge-strong before:bg-raised before:text-xs before:font-semibold before:text-accent before:content-[counter(step)] after:absolute after:bottom-0 after:left-4 after:top-9 after:w-px after:bg-edge last:after:hidden">
      <h3 className="!mt-1 !mb-2 text-base font-semibold text-text">{title}</h3>
      <div className="text-sm">{children}</div>
    </li>
  );
}

/** A grid of links to other pages — for "where to go next". */
export function CardLinks({items}: {items: {href: string; title: string; body: string; icon: IconName}[]}) {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {items.map((i) => (
        <a
          key={i.href}
          href={i.href}
          className="card-interactive group flex gap-3 rounded-xl border border-edge bg-surface/70 p-4 !no-underline"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-edge bg-raised text-accent">
            <Icon name={i.icon} />
          </span>
          <span>
            <span className="block font-medium text-text">{i.title}</span>
            <span className="mt-0.5 block text-sm leading-relaxed text-muted">{i.body}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
