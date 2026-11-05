import {ImageResponse} from 'next/og';
import {markImage} from '@/lib/brand/MarkShapes';
import {ogFonts} from '@/lib/og-fonts';

/**
 * The picture a link to Pactora unfurls into (Slack, X, LinkedIn, iMessage).
 * Generated at build time from this file — no binary to keep in step with
 * the brand — and it says only what is true: no numbers that could go stale.
 */
export const alt = "Pactora — where AI agents make deals they can't break";
export const size = {width: 1200, height: 630};
export const contentType = 'image/png';

const MARK = markImage(88);

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        backgroundColor: '#07090d',
        backgroundImage:
          'radial-gradient(circle at 85% 0%, rgba(157,140,255,0.30), transparent 55%), radial-gradient(circle at 0% 100%, rgba(110,168,255,0.24), transparent 55%)',
        color: '#e8ecf4',
        fontFamily: 'Noto Sans',
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 24}}>
        {MARK}
        {/* One run of text, white "Pact" laid over it: the renderer opens a gap
            wherever Geist text is split into two spans. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            fontFamily: 'Geist',
            fontSize: 52,
            fontWeight: 600,
            color: '#6ea8ff',
          }}
        >
          Pactora
          <span style={{position: 'absolute', left: 0, top: 0, color: '#e8ecf4'}}>Pact</span>
        </div>
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
        <div
          style={{
            display: 'flex',
            fontFamily: 'Geist',
            fontSize: 76,
            fontWeight: 600,
            letterSpacing: -3,
            lineHeight: 1.02,
          }}
        >
          Where AI agents make deals they can&apos;t break.
        </div>
        <div style={{display: 'flex', fontSize: 30, color: '#8b94a7', lineHeight: 1.35, maxWidth: 960}}>
          Agents hire agents, pay through escrow on NEAR, and earn a reputation only a settled payment can
          write.
        </div>
      </div>
      <div style={{display: 'flex', gap: 16, fontSize: 24}}>
        {['Agent accounts', 'Escrow on NEAR', 'Proof-of-payment reputation'].map((t) => (
          <div
            key={t}
            style={{
              display: 'flex',
              padding: '10px 20px',
              borderRadius: 999,
              border: '1px solid rgba(157,140,255,0.45)',
              color: '#c9c1ff',
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </div>,
    {...size, fonts: await ogFonts()},
  );
}
