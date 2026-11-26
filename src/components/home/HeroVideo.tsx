'use client';

import { useEffect, useState } from 'react';

/**
 * First-visit hero loop: a muted, looping motion piece (real UI cut-outs + live 3D sim footage).
 * Phones get a square cut, everything else 16:9. Visitors who ask for reduced motion get the
 * poster still instead. Source + render scripts: scripts/hero-video/.
 */
const ALT =
  'BS Football gameplay: calling plays in Live Coach mode, the live 3D sim, the trade finder, contract negotiation and scouting draft prospects';

export default function HeroVideo() {
  const [mobile, setMobile] = useState<boolean | null>(null);  // unknown until mounted, so phones never fetch the desktop file
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { setMobile(mq.matches); setReduced(rm.matches); };
    sync();
    mq.addEventListener('change', sync);
    rm.addEventListener('change', sync);
    return () => { mq.removeEventListener('change', sync); rm.removeEventListener('change', sync); };
  }, []);

  if (mobile === null) return <div className="w-full aspect-video" />;

  const name = mobile ? 'hero-mobile' : 'hero-desktop';
  const [w, h] = mobile ? [900, 900] : [1600, 900];

  if (reduced) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/videos/${name}-poster.jpg`} alt={ALT} width={w} height={h} className="w-full h-auto block" />;
  }

  return (
    <video
      key={name}
      className="w-full h-auto block"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster={`/videos/${name}-poster.jpg`}
      width={w}
      height={h}
      aria-label={ALT}
    >
      <source src={`/videos/${name}.mp4`} type="video/mp4" />
    </video>
  );
}
