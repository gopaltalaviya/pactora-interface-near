import Link from 'next/link';
import {Icon, type IconName} from './Icon';
import type {ComponentProps, ReactNode} from 'react';

/**
 * One button, everywhere.
 *
 * Every page used to spell its own buttons out in class strings, and they had
 * drifted: two heights, three disabled opacities, one without a hover. The
 * variants are the only choices a page makes now.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const BASE =
  'relative inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,border-color,color,transform,box-shadow,opacity] duration-200 ease-out ' +
  'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50 ' +
  'aria-busy:cursor-progress focus-visible:outline-offset-2';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-accent text-ink bg-[linear-gradient(180deg,rgb(255_255_255/0.16),rgb(255_255_255/0)_60%)] ' +
    'shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_0_0_1px_rgb(110_168_255/0.5),0_8px_24px_-12px_rgb(110_168_255/0.75)] ' +
    'hover:bg-[#8cbaff] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_0_0_1px_rgb(140_186_255/0.7),0_12px_30px_-10px_rgb(110_168_255/0.85)]',
  secondary:
    'border border-edge bg-raised text-text shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] ' +
    'hover:border-edge-strong hover:bg-overlay',
  ghost: 'text-muted hover:bg-raised hover:text-text',
  danger:
    'border border-broken/40 bg-broken/10 text-broken shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] ' +
    'hover:border-broken/60 hover:bg-broken/[0.16]',
};

// Phones get 44px targets: md grows to 44px, sm to 40px with an invisible
// hit area that reaches 44px.
const SIZE: Record<Size, string> = {
  sm:
    'h-8 px-3 text-xs max-sm:h-10 max-sm:px-3.5 max-sm:text-[0.8125rem] ' +
    "max-sm:before:absolute max-sm:before:inset-x-0 max-sm:before:-inset-y-0.5 max-sm:before:content-['']",
  md: 'h-10 px-4 text-[0.875rem] max-sm:h-11',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  icon,
  ...rest
}: ComponentProps<'button'> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: IconName | undefined;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} className="size-4" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  icon,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  /** A leading icon (decorative: the text names the link). */
  icon?: IconName | undefined;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon && <Icon name={icon} className="size-4" />}
      {children}
    </Link>
  );
}

export function Spinner({className = 'size-3.5'}: {className?: string}) {
  return (
    <span
      aria-hidden
      className={`${className} inline-block animate-spin rounded-full border-2 border-current border-r-transparent`}
    />
  );
}
