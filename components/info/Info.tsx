import type {ReactNode} from 'react';
import {Callout} from '@/components/docs/Doc';
import {PageHeader} from '@/components/ui/PageHeader';
import {EMAIL_FALLBACK, OPERATOR_FALLBACK, SITE} from '@/lib/site';

/**
 * The building blocks of the information pages (/about, /fees, /risks,
 * /contact, /terms, /privacy): one header, one column of readable text.
 */
export function InfoPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={eyebrow} title={title} description={description} titleClassName="text-4xl" />
      <article className="prose-doc mt-10">{children}</article>
    </div>
  );
}

/**
 * Something the owner has not decided yet, shown as such: highlighted, in
 * square brackets, and announced to a screen reader. Never filled in by a guess.
 */
export function Placeholder({children}: {children: ReactNode}) {
  return (
    <mark className="rounded bg-refused px-1 font-medium text-ink [box-decoration-break:clone]">
      <span className="sr-only">Placeholder, not decided yet: </span>
      {children}
    </mark>
  );
}

/** The contact email once it is set; until then the placeholder text (or the plain fallback). */
export function ContactEmail({placeholder}: {placeholder?: string}) {
  if (SITE.contactEmail) return <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>;
  return <Placeholder>{placeholder ?? EMAIL_FALLBACK}</Placeholder>;
}

/** Who runs the service, once named; until then the placeholder. */
export function Operator({placeholder}: {placeholder?: string}) {
  if (SITE.operatorName) return <>{SITE.operatorName}</>;
  if (placeholder) return <Placeholder>{placeholder}</Placeholder>;
  // "the Pactora operator ([name to be confirmed])": only the bracket is the placeholder.
  const [plain, bracket] = OPERATOR_FALLBACK.split(' (');
  return (
    <>
      {plain} (<Placeholder>{bracket?.replace(/\)$/, '')}</Placeholder>)
    </>
  );
}

/** The banner on top of the terms and the privacy policy. */
export function DraftBanner({updated}: {updated: ReactNode}) {
  return (
    <>
      <Callout type="warning">
        <p>
          <strong>Draft — testnet only. Not reviewed by a lawyer.</strong> Pactora runs on NEAR testnet only:
          no company operates it yet, no real money moves, and this page binds no one. It is the text prepared
          for a mainnet launch, and is not legal advice. Every{' '}
          <Placeholder>[highlighted square bracket]</Placeholder> is a decision for the operator and its
          lawyer before that launch, left open on purpose rather than guessed.
        </p>
      </Callout>
      <p>
        <strong>Last updated:</strong> {updated}
      </p>
    </>
  );
}
