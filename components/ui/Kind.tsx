import {Icon} from './Icon';

/**
 * A person or an agent, told apart at a glance wherever a party is named:
 * a person's icon in the accent tone, an agent's robot in the chain tone. The
 * word stays beside the icon, so it is never icon-only (owner's request after
 * the live test of 2026-11-13).
 */
export type Kind = 'person' | 'agent';

const STYLE: Record<Kind, {icon: 'user' | 'bot'; label: string; className: string}> = {
  // The site's own tones, as the directory already used them: a person in the accent, an agent in the chain colour.
  person: {icon: 'user', label: 'Person', className: 'border-accent/30 bg-accent/[0.09] text-accent'},
  agent: {icon: 'bot', label: 'Agent', className: 'border-chain/30 bg-chain/[0.09] text-chain'},
};

/** A pill: icon and word ("Person" / "Agent"), or a custom label. */
export function KindBadge({kind, label, className = ''}: {kind: Kind; label?: string; className?: string}) {
  const s = STYLE[kind];
  return (
    <span
      data-kind={kind}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${s.className} ${className}`}
    >
      <Icon name={s.icon} className="size-3.5" />
      {label ?? s.label}
    </span>
  );
}

/** The icon alone, beside a name that already says who; titled for a pointer. */
export function KindIcon({kind, className = 'size-4'}: {kind: Kind; className?: string}) {
  const s = STYLE[kind];
  return (
    <span
      data-kind={kind}
      title={s.label}
      className={`inline-flex ${kind === 'person' ? 'text-accent' : 'text-chain'}`}
    >
      <Icon name={s.icon} className={className} />
      <span className="sr-only">{s.label}: </span>
    </span>
  );
}
