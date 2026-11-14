// @vitest-environment happy-dom
import {act, cleanup, fireEvent, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {TourVideo, tourVideoEnabled} from './TourVideo';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

/**
 * Two captioned videos (2026-11-10): the overview on the home page, the demo
 * walkthrough on /demo. The files are committed in public/video/, so the
 * player is on unless NEXT_PUBLIC_TOUR_VIDEO=0.
 */
describe('TourVideo', () => {
  it.each([['demo', '/video/demo']] as const)(
    'renders the %s video with webm, then mp4, and English captions',
    (which, base) => {
      const {container, getByRole} = render(<TourVideo which={which} enabled />);
      // Until it is asked for there is no <video>: only the poster and a play button,
      // so the page never waits on the media (WebKit held the load event on it).
      expect(container.querySelector('video')).toBeNull();
      const play = getByRole('button', {name: /^Play/});
      expect(play.getAttribute('aria-label')).toMatch(/captioned/);
      expect(container.querySelector('img')!.getAttribute('src')).toBe(`${base}.jpg`);
      fireEvent.click(play);
      const video = container.querySelector('video')!;
      expect(video).not.toBeNull();
      expect(video.hasAttribute('controls')).toBe(true);
      expect(video.hasAttribute('autoplay')).toBe(true);
      expect(video.getAttribute('poster')).toBe(`${base}.jpg`);
      expect(video.getAttribute('aria-label')).toMatch(/captioned/);
      const sources = [...video.querySelectorAll('source')].map((s) => [
        s.getAttribute('src'),
        s.getAttribute('type'),
      ]);
      expect(sources).toEqual([
        [`${base}.webm`, 'video/webm'],
        [`${base}.mp4`, 'video/mp4'],
      ]);
      const track = video.querySelector('track')!;
      expect(track.getAttribute('kind')).toBe('captions');
      expect(track.getAttribute('src')).toBe(`${base}.vtt`);
      expect(track.getAttribute('srclang')).toBe('en');
      expect(track.getAttribute('label')).toBe('English');
      expect(track.hasAttribute('default')).toBe(true);
    },
  );

  /**
   * UX audit 2026-11-13: the overview's poster and first seconds showed the old
   * slogan. The home page now plays the cut with the new opener
   * (hook-overview-x.mp4, captions burned into the picture), with a poster from
   * that opener. Its timing no longer matches overview.vtt, so it has no track
   * rather than wrong captions, and says the captions are in the picture.
   */
  it('plays the overview with the new opener, its captions burned in and no stale track', () => {
    const {container, getByRole} = render(<TourVideo which="overview" enabled />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/video/hook-overview.jpg');
    const play = getByRole('button', {name: /^Play/});
    expect(play.getAttribute('aria-label')).toMatch(/captions in the picture/);
    fireEvent.click(play);
    const video = container.querySelector('video')!;
    expect(video.getAttribute('poster')).toBe('/video/hook-overview.jpg');
    expect(
      [...video.querySelectorAll('source')].map((s) => [s.getAttribute('src'), s.getAttribute('type')]),
    ).toEqual([['/video/hook-overview-x.mp4', 'video/mp4']]);
    expect(video.querySelector('track')).toBeNull();
    expect(video.getAttribute('aria-label')).toMatch(/captions in the picture/);
  });

  it('puts the play button in a corner, off the poster’s headline', () => {
    const {getByRole} = render(<TourVideo which="overview" enabled />);
    const knob = getByRole('button', {name: /^Play/}).querySelector('[data-play-knob]')!;
    expect(knob.className).not.toMatch(/\binset-0\b/);
    expect(knob.className).toMatch(/\bbottom-\d/);
    expect(knob.className).toMatch(/\bright-\d/);
  });

  it('is on by default and off only with NEXT_PUBLIC_TOUR_VIDEO=0', () => {
    vi.stubEnv('NEXT_PUBLIC_TOUR_VIDEO', '');
    expect(tourVideoEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_TOUR_VIDEO', '1');
    expect(tourVideoEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_TOUR_VIDEO', '0');
    expect(tourVideoEnabled()).toBe(false);
  });

  /** Owner's request, 2026-11-13: once the page has loaded and the poster is in view, play by itself, muted and looping. */
  it('starts by itself, muted and looping, when the poster comes into view', () => {
    let fire: ((entries: {isIntersecting: boolean}[]) => void) | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: {isIntersecting: boolean}[]) => void) {
          fire ??= cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      const {container} = render(<TourVideo which="overview" enabled />);
      expect(container.querySelector('video')).toBeNull();
      act(() => fire!([{isIntersecting: true}]));
      const video = container.querySelector('video')!;
      expect(video).not.toBeNull();
      expect(video.muted).toBe(true);
      expect(video.hasAttribute('loop')).toBe(true);
      expect(video.getAttribute('data-autoplay')).toBe('view');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a click still plays it, without looping', () => {
    const {container, getByRole} = render(<TourVideo which="demo" enabled />);
    fireEvent.click(getByRole('button', {name: /^Play/}));
    const video = container.querySelector('video')!;
    expect(video.hasAttribute('loop')).toBe(false);
    expect(video.getAttribute('data-autoplay')).toBe('click');
  });

  it('renders nothing when the flag is off', () => {
    const {container} = render(<TourVideo which="overview" enabled={false} />);
    expect(container.innerHTML).toBe('');
  });
});
