import { ImageResponse } from 'next/og';

/**
 * App-wide Open Graph image (Tier 3.8).
 *
 * Rendered server-side by next/og, so it can't read the user's save (that lives
 * in IndexedDB on the client) — this is the branded BS Hoops card every shared
 * link gets. Pure shapes + text, no external fonts, so it never depends on a
 * network fetch at render time.
 */

export const alt = 'BS Hoops — Build your dynasty. Run the franchise.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const NAVY = '#1D428A';
const ORANGE = '#E66B00';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          color: '#ffffff',
          backgroundColor: '#0b1220',
          backgroundImage: `linear-gradient(135deg, #0b1220 0%, ${NAVY} 100%)`,
          fontFamily: 'sans-serif',
        }}
      >
        {/* Ball + kicker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              width: 132,
              height: 132,
              borderRadius: 132,
              backgroundColor: ORANGE,
              border: '6px solid rgba(0,0,0,0.35)',
              position: 'relative',
            }}
          >
            {/* seams */}
            <div style={{ position: 'absolute', top: 6, left: 60, width: 6, height: 114, backgroundColor: 'rgba(0,0,0,0.35)' }} />
            <div style={{ position: 'absolute', top: 60, left: 6, width: 114, height: 6, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          </div>
          <div
            style={{
              fontSize: 30,
              letterSpacing: 8,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.65)',
              fontWeight: 700,
            }}
          >
            Basketball GM
          </div>
        </div>

        {/* Wordmark + tagline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 168, fontWeight: 800, letterSpacing: -4, lineHeight: 1, color: ORANGE }}>
            BS HOOPS
          </div>
          <div style={{ display: 'flex', fontSize: 44, marginTop: 18, color: 'rgba(255,255,255,0.88)' }}>
            Build your dynasty. Run the franchise.
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 26, color: 'rgba(255,255,255,0.5)' }}>
          <div style={{ display: 'flex' }}>30 teams · 82 games · one chair</div>
          <div style={{ display: 'flex' }}>parody · not affiliated with the NBA</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
