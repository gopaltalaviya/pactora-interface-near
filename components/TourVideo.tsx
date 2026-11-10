/**
 * The narrated videos (2026-11-10): `overview` on the home page, `demo` on
 * /demo. The files land in public/video/ in a later step, so the player is
 * behind NEXT_PUBLIC_TOUR_VIDEO=1: a build without them shows no broken
 * player, and the pages say plainly what is there instead.
 */

export type TourVideoKind = 'overview' | 'demo';

/** Whether the videos are published with this build. */
export const tourVideoEnabled = (): boolean => process.env['NEXT_PUBLIC_TOUR_VIDEO'] === '1';

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
      preload="metadata"
      poster={`${base}-poster.png`}
      className={className ?? 'aspect-video w-full rounded-2xl border border-edge bg-ink'}
    >
      <source src={`${base}.webm`} type="video/webm" />
      <source src={`${base}.mp4`} type="video/mp4" />
      <track kind="captions" src={`${base}.vtt`} srcLang="en" label="English" default />
    </video>
  );
}
