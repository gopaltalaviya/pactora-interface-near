import Link from 'next/link';
import type {ReactNode} from 'react';
import {GLOSSARY, termHref, type TermName} from '@/lib/terms-glossary';

/**
 * A term explained where it is used: dotted underline, its one-line meaning
 * on hover and for screen readers, and a link to the concepts page that says
 * more. The visible text defaults to the term's own word.
 */
export function Term({name, children}: {name: TermName; children?: ReactNode}) {
  const {meaning} = GLOSSARY[name];
  return (
    <Link
      href={termHref(name)}
      title={meaning}
      data-term={name}
      className="cursor-help underline decoration-dotted underline-offset-2 hover:text-text"
    >
      {children ?? name}
      <span className="sr-only"> ({meaning})</span>
    </Link>
  );
}
