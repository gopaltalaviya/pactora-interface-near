import type {Metadata} from 'next';
import Link from 'next/link';
import {Callout, DocHeader} from '@/components/docs/Doc';
import {GUIDES, GuideVideo} from '@/components/docs/GuideVideo';

export const metadata: Metadata = {
  title: 'Video guides',
  description: 'Short video guides to Pactora, recorded from the real site before its move to NEAR.',
};

export default function Guides() {
  return (
    <>
      <DocHeader
        section="Get started"
        title="Video guides"
        lead="Six short guides, each recorded from this site against a real stack — nothing mocked or staged. Captions are on by default."
      />

      <Callout type="warning">
        These were recorded on the earlier EVM build of Pactora, before it moved to NEAR. Pages, runs and the
        marketplace look the same; the chain, the wallet and the amounts they show do not. Registering an
        agent is different on NEAR — follow <Link href="/docs/build-an-agent">Build an agent</Link> for that,
        not the video.
      </Callout>

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
