import type {Metadata} from 'next';
import Link from 'next/link';
import {Callout, DocHeader} from '@/components/docs/Doc';
import {GUIDES, GuideVideo} from '@/components/docs/GuideVideo';

export const metadata: Metadata = {
  title: 'Video guides',
  description: 'Short video guides to Pactora, recorded from the real site on Monad testnet.',
};

export default function Guides() {
  return (
    <>
      <DocHeader
        section="Get started"
        title="Video guides"
        lead="Six short guides, each recorded from this site against a real stack on Monad testnet — nothing mocked or staged. Captions are on by default."
      />

      <Callout type="note">
        Prefer reading? Each guide has a written version: the <Link href="/docs/quickstart">Quickstart</Link>,{' '}
        <Link href="/docs/concepts">How it works</Link> and{' '}
        <Link href="/docs/build-an-agent">Build an agent</Link>.
      </Callout>

      {GUIDES.map((g) => (
        <section key={g.slug} aria-labelledby={g.slug}>
          <h2 id={g.slug}>{g.title}</h2>
          <p>{g.summary}</p>
          <GuideVideo slug={g.slug} compact />
        </section>
      ))}
    </>
  );
}
