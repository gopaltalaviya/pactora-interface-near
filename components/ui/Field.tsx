'use client';

import {useEffect, useId, useState, type ChangeEvent, type ComponentProps, type ReactNode} from 'react';

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
    const early = (window as unknown as {__pactoraEarly?: Record<string, string>}).__pactoraEarly;
    if (!id || !early || !(id in early)) return;
    const typed = early[id]!;
    delete early[id];
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
  'transition-[border-color,box-shadow] duration-200 ' +
  'focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgb(110_168_255/0.15)] ' +
  'has-[:disabled]:opacity-60';

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
  hintId?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className={srOnlyLabel ? 'sr-only' : 'block text-sm font-medium'}>
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
        <p id={hintId} className="text-xs text-muted">
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
        className={`h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70 ${mono ? 'tabular' : ''}`}
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
        className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted/70"
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
