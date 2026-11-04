import {ImageResponse} from 'next/og';
import {GRID, TILE} from '@/lib/brand/mark';
import {markShapes} from '@/lib/brand/MarkShapes';

/** The home-screen icon on iOS: the mark, full bleed, generated at build. iOS rounds the corners itself. */
export const size = {width: 180, height: 180};
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: `linear-gradient(135deg, ${TILE.from}, ${TILE.to})`,
      }}
    >
      <svg viewBox={`0 0 ${GRID} ${GRID}`} width="180" height="180">
        {markShapes()}
      </svg>
    </div>,
    size,
  );
}
