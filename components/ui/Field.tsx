'use client';

import {useEffect, useId, useState, type ChangeEvent, type ComponentProps, type ReactNode} from 'react';

type EarlyWindow = Window & {__pactoraEarly?: Record<string, string>; __pactoraEarlyStop?: () => void};

/**
 * The inline script's job ends at hydration. The first field to mount
 * schedules the stop for right after this commit's effects have run (so every
 * field mounting now still reads its own entry); from then on the listener is
 * gone and so is the record, and nothing typed later is kept anywhere but in
 * React's state.
 */
let stopScheduled = false;
function stopEarlyInputSoon() {
  if (stopScheduled) return;
  stopScheduled = true;
  setTimeout(() => (window as EarlyWindow).__pactoraEarlyStop?.(), 0);
}

/**
 * Adopt what was typed into this field before the page hydrated (recorded by
 * the inline script in app/layout.tsx), then forget it. Only when the field is
 * still empty: a value the page set itself always wins.
 */
function useEarlyInput<E extends HTMLInputElement | HTMLTextAreaElement>(
  id: string | undefined,
  value: unknown,
  onChange: ((e: ChangeEvent<E>) => void) | undefined,
) {
  useEffect(() => {
    stopEarlyInputSoon();
    if (!id) return;
    const early = (window as EarlyWindow).__pactoraEarly;
    let typed = early?.[id];
    if (early) delete early[id];
    // A password field is never recorded. React keeps what was typed in the
    // DOM through hydration, so the field itself is the record: read it once.
    if (typed === undefined) {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el && typeof el.value === 'string' && el.value !== '') typed = el.value;
    }
    if (typed && (value === '' || value === undefined) && onChange) {
      onChange({target: {value: typed}, currentTarget: {value: typed}} as unknown as ChangeEvent<E>);
    }
    // Once, on mount: later typing goes through React as normal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
import {Icon, type IconName} from './Icon';

/**
 * A labelled input with its hint, its error, and any actions that belong to
 * it — clear, paste, reveal — inside the same frame.
 *
 * The label is a real <label> tied to the control by id, so a screen reader
 * and a test both find the field by what it is called. The hint and the
 * error are tied by aria-describedby, and an error sets aria-invalid.
 */

const FRAME =
  'group flex w-full items-center gap-2 rounded-lg border bg-ink/70 px-3 ' +
  'shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] ' +
  'transition-[border-color,box-shadow,background-color] duration-200 ' +
  'focus-within:border-accent/80 focus-within:bg-ink ' +
  'focus-within:shadow-[inset_0_1px_2px_rgb(0_0_0/0.35),0_0_0_4px_rgb(110_168_255/0.16)] ' +
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60';

// 16px text on phones: iOS zooms the page into any smaller field on focus.
const CONTROL_TEXT = 'text-base sm:text-[0.875rem]';

export function Field({
  label,
  hint,
  error,
  warning,
  srOnlyLabel = false,
  children,
  htmlFor,
  hintId,
  className = '',
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  warning?: ReactNode;
  srOnlyLabel?: boolean;
  children: ReactNode;
  htmlFor: string;
  hintId?: string | undefined;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className={srOnlyLabel ? 'sr-only' : 'block text-[0.875rem] font-medium'}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={hintId} role="alert" className="flex items-start gap-1.5 text-xs text-broken">
          <Icon name="alert" className="mt-px size-3.5" />
          {error}
        </p>
      ) : warning ? (
        <p id={hintId} role="alert" className="flex items-start gap-1.5 text-xs text-refused">
          <Icon name="alert" className="mt-px size-3.5" />
          {warning}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  icon,
  actions,
  invalid,
  mono = false,
  className = '',
  ...rest
}: ComponentProps<'input'> & {icon?: IconName; actions?: ReactNode; invalid?: boolean; mono?: boolean}) {
  useEarlyInput(rest.id, rest.value, rest.onChange);
  return (
    <div
      className={`${FRAME} ${invalid ? 'border-broken/60' : 'border-edge hover:border-edge-strong'} ${className}`}
    >
      {icon && <Icon name={icon} className="size-4 text-muted" />}
      <input
        {...rest}
        aria-invalid={invalid || undefined}
        className={`h-11 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/70 sm:h-10 ${CONTROL_TEXT} ${mono ? 'tabular' : ''}`}
      />
      {actions && <div className="-mr-1.5 flex items-center gap-0.5">{actions}</div>}
    </div>
  );
}

export function TextArea({className = '', ...rest}: ComponentProps<'textarea'>) {
  useEarlyInput(rest.id, rest.value, rest.onChange);
  return (
    <div className={`${FRAME} border-edge py-2 hover:border-edge-strong ${className}`}>
      <textarea
        {...rest}
        className={`w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-muted/70 ${CONTROL_TEXT}`}
      />
    </div>
  );
}

/** A native select in the same frame as the text inputs. */
export function Select({
  className = '',
  icon,
  ...rest
}: ComponentProps<'select'> & {icon?: IconName | undefined}) {
  return (
    <div className={`${FRAME} border-edge hover:border-edge-strong ${className}`}>
      {/* A short menu says what it does at a glance: sort, filter (owner's request, 2026-11-13). */}
      {icon && <Icon name={icon} className="size-4 shrink-0 text-muted" />}
      <select
        {...rest}
        className={`select-native h-11 w-full bg-transparent outline-none sm:h-10 ${CONTROL_TEXT}`}
      />
    </div>
  );
}

/** A small icon action inside a field: clear, paste, reveal. */
export function FieldAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

/**
 * A secret input: masked, with reveal and paste. For API keys, which are
 * pasted far more often than typed, and checked by eye before a run.
 */
export function SecretInput({
  value,
  onChange,
  disabled,
  ...rest
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (v: string) => void;
}) {
  const [shown, setShown] = useState(false);
  const [pasteFailed, setPasteFailed] = useState(false);
  // After mount: the server has no clipboard, and deciding in render made the
  // first client render disagree with the server's HTML.
  const [canPaste, setCanPaste] = useState(false);
  useEffect(() => setCanPaste(Boolean(navigator.clipboard?.readText)), []);

  async function paste() {
    try {
      onChange((await navigator.clipboard.readText()).trim());
      setPasteFailed(false);
    } catch {
      setPasteFailed(true);
    }
  }

  return (
    <TextInput
      {...rest}
      icon="key"
      mono
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      type={shown ? 'text' : 'password'}
      autoComplete="off"
      spellCheck={false}
      actions={
        <>
          {value && (
            <FieldAction icon="x" label="Clear the key" onClick={() => onChange('')} disabled={disabled} />
          )}
          <FieldAction
            icon={shown ? 'eyeOff' : 'eye'}
            label={shown ? 'Hide the key' : 'Show the key'}
            onClick={() => setShown((s) => !s)}
            disabled={disabled}
          />
          {canPaste && (
            <FieldAction
              icon="paste"
              label={pasteFailed ? 'Paste was blocked — use Ctrl+V' : 'Paste the key'}
              onClick={() => void paste()}
              disabled={disabled}
            />
          )}
        </>
      }
    />
  );
}

export function useFieldIds(prefix: string) {
  const id = useId();
  return {input: `${prefix}-${id}`, hint: `${prefix}-${id}-hint`};
}
