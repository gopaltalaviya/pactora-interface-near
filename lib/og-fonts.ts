import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

/**
 * Geist for the link-preview images. ImageResponse ships one regular sans and
 * nothing else, so `fontWeight: 700` drew the wordmark thin. Only the bold
 * lines use Geist; body text is Noto Sans, the font next/og bundles, because
 * the renderer spaced words in Geist Regular unevenly. See assets/fonts.
 */
export async function ogFonts() {
  const dir = join(process.cwd(), 'assets', 'fonts');
  const [semibold, body] = await Promise.all([
    readFile(join(dir, 'Geist-SemiBold.ttf')),
    readFile(join(dir, 'NotoSans-Regular.ttf')),
  ]);
  return [
    {name: 'Geist', data: semibold, weight: 600 as const, style: 'normal' as const},
    {name: 'Noto Sans', data: body, weight: 400 as const, style: 'normal' as const},
  ];
}
