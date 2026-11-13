'use client';

/**
 * The two captioned videos (2026-11-10; captions, no voice): `overview` on
 * the home page, `demo` on /demo. The files live in public/video/ and are
 * committed with the code, so every build has them and the player is on by
 * default. NEXT_PUBLIC_TOUR_VIDEO=0 turns it off (the pages then link to
 * /demo and the past runs instead).
 *
 * The demo is a VP9 WebM, an H.264 MP4 fallback, a JPEG poster and an
 * English WebVTT captions track, shown by default: the videos have no sound.
 *
 * The overview (UX audit 2026-11-13): the original cut opened on the old
 * slogan, so the home page plays the cut with the new opener,
 * hook-overview-x.mp4 (H.264, captions burned into the picture), with a
 * poster taken from that opener at 2 s. Its timing no longer matches
 * overview.vtt, so it has no track — wrong captions would be worse than
 * none — and its name says the captions are in the picture.
 *
 * Until a visitor presses play there is no <video> element, only the poster
 * and a play button; the click mounts the player and starts it. A page then
 * never waits on the media: WebKit held the load event on a <video> even with
 * preload="none" (the full e2e gate, 2026-11-10), and nobody downloads a
 * video they did not ask for. The play button sits in the poster's corner,
 * clear of the headline in the middle of the frame.
 */

import {useEffect, useRef, useState} from 'react';

export type TourVideoKind = 'overview' | 'demo';

/** Whether the videos are shown with this build: on unless NEXT_PUBLIC_TOUR_VIDEO=0. */
export const tourVideoEnabled = (): boolean => process.env['NEXT_PUBLIC_TOUR_VIDEO'] !== '0';

type Media = {
  title: string;
  poster: string;
  sources: {src: string; type: string}[];
  /** A WebVTT track that matches the sources' timing, or null when the captions are in the picture. */
  captions: string | null;
};

const MEDIA: Record<TourVideoKind, Media> = {
  overview: {
    title: 'Pactora overview, captioned: captions in the picture',
    poster: '/video/hook-overview.jpg',
    sources: [{src: '/video/hook-overview-x.mp4', type: 'video/mp4'}],
    captions: null,
  },
  demo: {
    title: 'Pactora demo on a local NEAR chain, captioned',
    poster: '/video/demo.jpg',
    sources: [
      {src: '/video/demo.webm', type: 'video/webm'},
      {src: '/video/demo.mp4', type: 'video/mp4'},
    ],
    captions: '/video/demo.vtt',
  },
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
  const media = MEDIA[which];
  const frame = className ?? 'aspect-video w-full rounded-2xl border border-edge bg-ink';
  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={`Play ${media.title}`}
        data-testid={`tour-poster-${which}`}
        className={`group relative block overflow-hidden ${frame}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a static poster, sized by its frame */}
        <img src={media.poster} alt="" className="size-full object-cover" />
        <span
          aria-hidden
          data-play-knob
          className="absolute bottom-2 right-2 flex size-10 items-center justify-center rounded-full bg-accent/90 text-ink shadow-xl transition group-hover:scale-105 group-focus-visible:scale-105 sm:bottom-4 sm:right-4 sm:size-14"
        >
          <svg viewBox="0 0 24 24" className="ml-0.5 size-5 sm:ml-1 sm:size-6" fill="currentColor">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
      </button>
    );
  }
  return (
    // The overview's captions are open captions, burned into the picture (a track would double them).
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={ref}
      controls
      autoPlay
      playsInline
      preload="auto"
      poster={media.poster}
      aria-label={media.title}
      data-testid={`tour-video-${which}`}
      className={frame}
    >
      {media.sources.map((s) => (
        <source key={s.src} src={s.src} type={s.type} />
      ))}
      {media.captions && <track kind="captions" src={media.captions} srcLang="en" label="English" default />}
    </video>
  );
}
