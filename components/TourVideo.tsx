/**
 * The two captioned videos (2026-11-10; captions, no voice): `overview` on
 * the home page, `demo` on /demo. The files live in public/video/ and are
 * committed with the code, so every build has them and the player is on by
 * default. NEXT_PUBLIC_TOUR_VIDEO=0 turns it off (the pages then link to
 * /demo and the past runs instead).
 *
 * Each video is a VP9 WebM, an H.264 MP4 fallback, a JPEG poster and an
 * English WebVTT captions track, shown by default: the videos have no sound.
 */

export type TourVideoKind = 'overview' | 'demo';

/** Whether the videos are shown with this build: on unless NEXT_PUBLIC_TOUR_VIDEO=0. */
export const tourVideoEnabled = (): boolean => process.env['NEXT_PUBLIC_TOUR_VIDEO'] !== '0';

const TITLES: Record<TourVideoKind, string> = {
  overview: 'Pactora overview, captioned',
  demo: 'Pactora demo on a local NEAR chain, captioned',
};

export function TourVideo({
  which,
  enabled = tourVideoEnabled(),
  className,
}: {
  which: TourVideoKind;
  enabled?: boolean;
  className?: string;
}) {
  if (!enabled) return null;
  const base = `/video/${which}`;
  return (
    <video
      controls
      playsInline
      preload="metadata"
      poster={`${base}.jpg`}
      aria-label={TITLES[which]}
      data-testid={`tour-video-${which}`}
      className={className ?? 'aspect-video w-full rounded-2xl border border-edge bg-ink'}
    >
      <source src={`${base}.webm`} type="video/webm" />
      <source src={`${base}.mp4`} type="video/mp4" />
      <track kind="captions" src={`${base}.vtt`} srcLang="en" label="English" default />
    </video>
  );
}
