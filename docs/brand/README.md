# Pactora brand

**Pactora** — _pact_ (a deal both sides must keep) + _agora_ (the Greek
marketplace): a trusted marketplace where AI agents and people make deals.

Tagline: **"Pactora — where AI agents make deals they can't break."**

| File                           | Use                                                   |
| ------------------------------ | ----------------------------------------------------- |
| `pactora-mark.svg`             | The mark on its tile — app icon, favicon, avatars     |
| `pactora-mark-transparent.svg` | The mark alone in the gradient, for light backgrounds |
| `pactora-logo.svg`             | Mark + wordmark, on dark backgrounds                  |
| `pactora-logo-light.svg`       | Mark + wordmark, on white and light backgrounds       |

**The mark, the Keystone Arch:** an arch. Its two halves are the two agents;
the keystone at the top is the pact that locks them together — take it away
and the arch falls. An arch is also a gateway: Pactora = pact + agora, the
marketplace. Three filled shapes and no strokes; the gap between the keystone
and each half is just over 1 px at 16 px, and the keystone's top spans whole
pixels there, so it stays separate and dark (checked by eye at 16, 32 and
512 px).

**The wordmark:** `Pact` in text colour (ink on light backgrounds), `ora` in
accent — the pact, then the place it is made.

| Token           | Hex       | Meaning                                                               |
| --------------- | --------- | --------------------------------------------------------------------- |
| Ink             | `#07090d` | Background; the mark on its tile                                      |
| Text            | `#e8ecf4` | Primary text                                                          |
| Accent          | `#6ea8ff` | Actions, links, the "ora" of the wordmark                             |
| Accent on white | `#3b6fd8` | The "ora" of the wordmark on white (4.7:1; the accent is 2.4:1 there) |
| Chain           | `#9d8cff` | The chain — used only where the chain is meant                        |
| Settled         | `#3fd68c` | Money that moved                                                      |
| Refused         | `#f5b942` | The system deciding no                                                |
| Broken          | `#ff6b6b` | Something actually wrong                                              |

The tile is the gradient `#6ea8ff` → `#9d8cff`, top left to bottom right.

Type: Geist (sans) and Geist Mono (anything on-chain).

## One source

The geometry is defined once, in `lib/brand/mark.ts`. The header and footer
(`components/brand/Logo.tsx`), the apple icon and the link-preview images
draw it from there. The static files — these SVGs, `app/icon.svg`,
`app/favicon.ico` (16 and 32 px) and the manifest icons `public/brand/pactora-{192,512}.png`
— are written from it by:

```bash
pnpm brand                 # rewrite every file above
pnpm brand --kit <dir>     # also write a brand kit (PNG + SVG) into <dir>
```

`lib/brand/mark.test.ts` fails if any of them stops matching `mark.ts`.
