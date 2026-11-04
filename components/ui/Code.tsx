'use client';

import {useId, useState, type ReactNode} from 'react';
import {CopyButton} from './CopyButton';

/**
 * Code, readable at a glance and copyable in one click.
 *
 * The highlighter is deliberately small: comments, strings, numbers and a
 * handful of keywords. It exists so a snippet on the landing page reads like
 * code rather than a grey block — not to be a general-purpose lexer.
 */

const KEYWORDS =
  /^(?:import|from|export|const|let|await|async|new|return|function|if|else|true|false|null|undefined|type|interface)$/;

type Token = {kind: 'comment' | 'string' | 'number' | 'keyword' | 'key' | 'plain'; text: string};

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const re =
    /(\/\/[^\n]*|#[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)(?=\s*:)|([A-Za-z_$][\w$]*)|(\s+|.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1]) out.push({kind: 'comment', text: m[1]});
    else if (m[2]) out.push({kind: 'string', text: m[2]});
    else if (m[3]) out.push({kind: 'number', text: m[3]});
    else if (m[4]) out.push({kind: 'key', text: m[4]});
    else if (m[5]) out.push({kind: KEYWORDS.test(m[5]) ? 'keyword' : 'plain', text: m[5]});
    else out.push({kind: 'plain', text: m[6] ?? ''});
  }
  return out;
}

const COLOR: Record<Token['kind'], string> = {
  comment: 'text-muted/80 italic',
  string: 'text-[#9fe0b7]',
  number: 'text-[#f5c97a]',
  keyword: 'text-[#b3a7ff]',
  key: 'text-[#8cbaff]',
  plain: '',
};

export function Highlighted({code}: {code: string}) {
  return (
    <>
      {tokenize(code).map((t, i) =>
        t.kind === 'plain' ? (
          t.text
        ) : (
          <span key={i} className={COLOR[t.kind]}>
            {t.text}
          </span>
        ),
      )}
    </>
  );
}

export function CodeBlock({
  code,
  title,
  className = '',
}: {
  code: string;
  title?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`glow-border overflow-hidden rounded-xl bg-[#090c12] ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-edge/70 px-4 py-2">
        <span className="tabular truncate text-[11px] text-muted">{title ?? ''}</span>
        <CopyButton value={code} label="Copy code" />
      </div>
      {/* Focusable, so a keyboard user can scroll a long line sideways (WCAG 2.1.1). */}
      <pre
        tabIndex={0}
        role="region"
        aria-label={typeof title === 'string' && title ? `Code: ${title}` : 'Code'}
        className="tabular overflow-x-auto p-4 text-[12.5px] leading-relaxed text-text/90"
      >
        <code>
          <Highlighted code={code} />
        </code>
      </pre>
    </div>
  );
}

/** Several snippets, one visible at a time — a real tablist, arrow keys included. */
export function CodeTabs({tabs}: {tabs: {label: string; file: string; code: string}[]}) {
  const [active, setActive] = useState(0);
  const base = useId();
  const tab = tabs[active]!;

  // Arrow keys move between tabs, as in the WAI-ARIA tabs pattern.
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = (active + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    setActive(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  };

  return (
    <div className="glow-border overflow-hidden rounded-2xl bg-[#090c12] shadow-[0_30px_80px_-40px_rgb(110_168_255/0.45)]">
      <div className="flex items-center gap-3 border-b border-edge/70 px-3">
        <span aria-hidden className="flex gap-1.5 py-3 pl-1 pr-2">
          <span className="size-2.5 rounded-full bg-broken/60" />
          <span className="size-2.5 rounded-full bg-refused/60" />
          <span className="size-2.5 rounded-full bg-settled/60" />
        </span>
        <div role="tablist" aria-label="Code examples" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              id={`${base}-tab-${i}`}
              role="tab"
              type="button"
              aria-selected={i === active}
              aria-controls={`${base}-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={onTabKey}
              className={
                'relative whitespace-nowrap px-3 py-3 text-xs transition-colors ' +
                (i === active ? 'text-text' : 'text-muted hover:text-text')
              }
            >
              {t.label}
              {i === active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-px bg-accent" />}
            </button>
          ))}
        </div>
        <CopyButton value={tab.code} label={`Copy ${tab.label} example`} />
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${active}`}>
        <div className="tabular border-b border-edge/40 px-4 py-1.5 text-[11px] text-muted">{tab.file}</div>
        <pre
          key={active}
          tabIndex={0}
          role="region"
          aria-label={`Code: ${tab.file}`}
          className="tabular animate-enter overflow-x-auto p-5 text-[12.5px] leading-relaxed text-text/90"
        >
          <code>
            <Highlighted code={tab.code} />
          </code>
        </pre>
      </div>
    </div>
  );
}
