// @vitest-environment happy-dom
import {cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {TourVideo} from './TourVideo';

afterEach(cleanup);

/**
 * Two narrated videos (2026-11-10), shipped later: the overview on the home
 * page, the demo walkthrough on /demo. Behind NEXT_PUBLIC_TOUR_VIDEO=1 so a
 * build without the files never shows a broken player.
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
    expect(video.getAttribute('poster')).toBe(`${base}-poster.png`);
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

  it('renders nothing when the flag is off', () => {
    const {container} = render(<TourVideo which="overview" enabled={false} />);
    expect(container.innerHTML).toBe('');
  });
});
