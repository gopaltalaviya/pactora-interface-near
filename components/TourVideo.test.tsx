// @vitest-environment happy-dom
import {cleanup, render} from '@testing-library/react';
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
  it.each([
    ['overview', '/video/overview'],
    ['demo', '/video/demo'],
  ] as const)('renders the %s video with webm, then mp4, and English captions', (which, base) => {
    const {container} = render(<TourVideo which={which} enabled />);
    const video = container.querySelector('video')!;
    expect(video).not.toBeNull();
    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.getAttribute('preload')).toBe('metadata');
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
  });

  it('is on by default and off only with NEXT_PUBLIC_TOUR_VIDEO=0', () => {
    vi.stubEnv('NEXT_PUBLIC_TOUR_VIDEO', '');
    expect(tourVideoEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_TOUR_VIDEO', '1');
    expect(tourVideoEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_TOUR_VIDEO', '0');
    expect(tourVideoEnabled()).toBe(false);
  });

  it('renders nothing when the flag is off', () => {
    const {container} = render(<TourVideo which="overview" enabled={false} />);
    expect(container.innerHTML).toBe('');
  });
});
