import {describe, expect, it} from 'vitest';
import {runningAverage} from './ScoreChart';

describe('the score chart’s running average', () => {
  it('averages each prefix, to one decimal', () => {
    const pts = [5, 4, 3].map((value, i) => ({value, at: `2026-11-0${i + 1}T00:00:00Z`, label: ''}));
    expect(runningAverage(pts)).toEqual([5, 4.5, 4]);
    expect(runningAverage([])).toEqual([]);
  });
});
