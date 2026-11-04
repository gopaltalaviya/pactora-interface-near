import Link from 'next/link';
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
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,border-color,color,transform,box-shadow] duration-200 ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-accent text-ink shadow-[0_0_0_1px_rgb(110_168_255/0.4),0_8px_24px_-10px_rgb(110_168_255/0.7)] ' +
    'hover:bg-[#8cbaff] hover:shadow-[0_0_0_1px_rgb(140_186_255/0.6),0_10px_30px_-8px_rgb(110_168_255/0.8)]',
  secondary: 'border border-edge bg-raised text-text hover:border-edge-strong hover:bg-edge/60',
  ghost: 'text-muted hover:bg-raised hover:text-text',
  danger: 'border border-broken/40 bg-broken/10 text-broken hover:bg-broken/20',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
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
  ...rest
}: ComponentProps<'button'> & {variant?: Variant; size?: Size; loading?: boolean}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
    >
      {loading && <Spinner />}
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
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
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
