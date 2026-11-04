# Fonts for the link-preview images

Read at build time by `lib/og-fonts.ts` for `app/opengraph-image.tsx` and
`app/twitter-image.tsx`.

| File                   | Font                                                                      | Licence                |
| ---------------------- | ------------------------------------------------------------------------- | ---------------------- |
| `Geist-SemiBold.ttf`   | Geist 1.9.0 (Vercel), the site's own typeface — the wordmark and headline | SIL OFL 1.1, `OFL.txt` |
| `NotoSans-Regular.ttf` | Noto Sans (Google), the body text — the same file `next/og` bundles       | SIL OFL 1.1            |

Geist Regular is not used: the image renderer spaced its words unevenly.
