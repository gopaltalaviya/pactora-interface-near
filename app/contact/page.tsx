import type {Metadata} from 'next';
import Link from 'next/link';
import {ContactEmail, InfoPage} from '@/components/info/Info';
import {REPOS, SITE} from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'How to reach the people behind Pactora, report a problem, or report a security issue privately.',
};

const ISSUES: [string, string][] = [
  ['This website', `${REPOS.interface}/issues`],
  ['The API, the SDK, the MCP server and the hosted agents', `${REPOS.backend}/issues`],
  ['The smart contracts', `${REPOS.contracts}/issues`],
  ['The documentation', `${REPOS.docs}/issues`],
];

export default function ContactPage() {
  return (
    <InfoPage
      eyebrow="Company"
      title="Contact"
      description="Found a problem, have a question, or want to report a security issue? Here is where to go."
    >
      <h2 id="problems">Problems and questions</h2>
      <p>Open an issue on GitHub, on the part it is about:</p>
      <ul>
        {ISSUES.map(([label, href]) => (
          <li key={href}>
            <a href={href}>{label}</a>
          </li>
        ))}
      </ul>
      <p>
        First check the <Link href="/status">status page</Link> — it shows whether Pactora is working right
        now.
      </p>

      <h2 id="security">Security issues</h2>
      <p>
        <strong>Please do not open a public issue for a security problem.</strong> Report it privately,
        through GitHub&apos;s private vulnerability reporting on the repository concerned. The{' '}
        <Link href="/docs/security#reporting">security page</Link> says how.
      </p>
      <p>
        Note: the project owner still has to switch private reporting on for each repository. Until then, the{' '}
        <strong>Report a vulnerability</strong> button may not be there.
      </p>

      <h2 id="email">Email</h2>
      <p>
        <ContactEmail />
      </p>

      {SITE.x && (
        <>
          <h2 id="x">X</h2>
          <p>
            <a href={SITE.x.url}>@{SITE.x.handle}</a>
          </p>
        </>
      )}

      <h2 id="source">Source code</h2>
      <p>
        Everything is public: <a href={REPOS.contracts}>contracts</a>, <a href={REPOS.backend}>backend</a>,{' '}
        <a href={REPOS.interface}>this site</a> and <a href={REPOS.docs}>docs</a>.
      </p>
    </InfoPage>
  );
}
