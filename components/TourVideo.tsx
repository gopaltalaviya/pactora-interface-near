'use client';

/**
 * The two captioned videos (2026-11-10; captions, no voice): `overview` on
 * the home page, `demo` on /demo. The files live in public/video/ and are
 * committed with the code, so every build has them and the player is on by
 * default. NEXT_PUBLIC_TOUR_VIDEO=0 turns it off (the pages then link to
 * /demo and the past runs instead).
 *
 * Each video is a VP9 WebM, an H.264 MP4 fallback, a JPEG poster and an
 * English WebVTT captions track, shown by default: the videos have no sound.
 *
 * Until a visitor presses play there is no <video> element, only the poster
 * and a play button; the click mounts the player and starts it. A page then
 * never waits on the media: WebKit held the load event on a <video> even with
 * preload="none" (the full e2e gate, 2026-11-10), and nobody downloads a
 * video they did not ask for.
 */

import {useEffect, useRef, useState} from 'react';

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
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  // The videos are silent, so the captions are the narration: show them. `default`
  // alone is not enough, as WebKit leaves the track disabled (its caption setting).
  useEffect(() => {
    const tracks = ref.current?.textTracks;
    if (!tracks) return;
    const show = () => {
      for (const t of Array.from(tracks)) if (t.kind === 'captions') t.mode = 'showing';
    };
    show();
    tracks.addEventListener('addtrack', show);
    return () => tracks.removeEventListener('addtrack', show);
  }, [playing]);
  if (!enabled) return null;
  const base = `/video/${which}`;
  const frame = className ?? 'aspect-video w-full rounded-2xl border border-edge bg-ink';
  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={`Play ${TITLES[which]}`}
        data-testid={`tour-poster-${which}`}
        className={`group relative block overflow-hidden ${frame}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a static poster, sized by its frame */}
        <img src={`${base}.jpg`} alt="" className="size-full object-cover" />
        <span
          aria-hidden
          className="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-accent/90 text-ink shadow-xl transition group-hover:scale-105 group-focus-visible:scale-105"
        >
          <svg viewBox="0 0 24 24" className="ml-1 size-7" fill="currentColor">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
      </button>
    );
  }
  return (
    <video
      ref={ref}
      controls
      autoPlay
      playsInline
      preload="auto"
      poster={`${base}.jpg`}
      aria-label={TITLES[which]}
      data-testid={`tour-video-${which}`}
      className={frame}
    >
      <source src={`${base}.webm`} type="video/webm" />
      <source src={`${base}.mp4`} type="video/mp4" />
      <track kind="captions" src={`${base}.vtt`} srcLang="en" label="English" default />
    </video>
  );
}
