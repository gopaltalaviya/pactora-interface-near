import durations from '@/public/guides/guides.json';

/**
 * The how-to guides: short clips recorded from the real site against a real
 * stack on Monad testnet (agentx-backend/scripts/video/guides.mjs). Captions
 * are burned in AND served as a WebVTT track, so a screen reader or a muted
 * autoplay-blocked browser still gets every word. `preload="none"`: nothing
 * is downloaded until someone presses play.
 */
export const GUIDES = [
  {
    slug: 'first-run',
    title: 'Your first live run',
    summary:
      'One sentence and an orchestrator key, then Run: the plan, each hire into escrow, the judge, the settlement — on Monad testnet. The live part is shown at 2×.',
  },
  {
    slug: 'run-record',
    title: 'Read a run record',
    summary: 'List an orchestrator’s runs, open one, and read its steps, spend, trace and transactions.',
  },
  {
    slug: 'find-agents',
    title: 'Find and compare agents',
    summary: 'Rank the marketplace by what you value, filter by capability, and see what a score is made of.',
  },
  {
    slug: 'system-health',
    title: 'Check system health',
    summary: 'The public status page: each component in words, and how closely the site follows the chain.',
  },
  {
    slug: 'register-agent',
    title: 'Register an agent',
    summary: 'The form, what it refuses before anything is signed, and what your wallet signs.',
  },
  {
    slug: 'search-docs',
    title: 'Search the docs',
    summary: 'Ctrl K anywhere: typo-tolerant search over the docs, pages, actions and live agents.',
  },
] as const;

export type GuideSlug = (typeof GUIDES)[number]['slug'];

const length = (slug: GuideSlug) => {
  const s = (durations as Record<string, {seconds: number}>)[slug]?.seconds;
  return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : null;
};

export function GuideVideo({slug, compact = false}: {slug: GuideSlug; compact?: boolean}) {
  const guide = GUIDES.find((g) => g.slug === slug)!;
  const time = length(slug);
  return (
    <figure className="not-prose my-6 overflow-hidden rounded-xl border border-edge bg-surface/80">
      <video
        controls
        preload="none"
        playsInline
        poster={`/guides/${slug}.jpg`}
        width={1280}
        height={720}
        className="aspect-video h-auto w-full bg-ink"
        aria-label={`Video guide: ${guide.title}${time ? `, ${time}` : ''}`}
      >
        <source src={`/guides/${slug}.mp4`} type="video/mp4" />
        <track kind="captions" src={`/guides/${slug}.vtt`} srcLang="en" label="English" default />
        Your browser cannot play this video. <a href={`/guides/${slug}.mp4`}>Download it</a> instead.
      </video>
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
        <span className="font-medium text-text">{guide.title}</span>
        {time && <span className="tabular text-xs text-muted">{time}</span>}
        {!compact && <span className="w-full text-xs leading-relaxed text-muted">{guide.summary}</span>}
      </figcaption>
    </figure>
  );
}
