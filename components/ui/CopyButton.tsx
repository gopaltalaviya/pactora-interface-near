'use client';

import {useEffect, useState} from 'react';
import {Icon} from './Icon';

/**
 * Copy a value, and say that it happened.
 *
 * The confirmation is on the button itself and announced to screen readers,
 * because a copy with no feedback gets pressed three times. A refused
 * clipboard (insecure origin, permissions) is said, not swallowed.
 */
export function CopyButton({
  value,
  label = 'Copy',
  showLabel = false,
  className = '',
  onCopied,
}: {
  value: string;
  /** What is being copied — read out to screen readers, e.g. "Copy wallet address". */
  label?: string;
  showLabel?: boolean;
  className?: string;
  onCopied?: () => void;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 1800);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
      onCopied?.();
    } catch {
      setState('failed');
    }
  }

  const text = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy blocked' : label;

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={showLabel ? undefined : text}
      title={state === 'failed' ? 'The browser refused clipboard access — select and copy by hand' : label}
      className={
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors duration-200 ' +
        (state === 'copied'
          ? 'text-settled'
          : state === 'failed'
            ? 'text-refused'
            : 'text-muted hover:bg-raised hover:text-text') +
        ` ${className}`
      }
    >
      <Icon name={state === 'copied' ? 'check' : 'copy'} className="size-3.5" />
      {showLabel && <span>{text}</span>}
      <span role="status" className="sr-only">
        {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Copy was blocked' : ''}
      </span>
    </button>
  );
}
