/**
 * dropConfetti — fire-and-forget celebration burst. No dependencies.
 *
 * Appends a fixed-position overlay of colored circles that fall + rotate down
 * the viewport using the Web Animations API, then removes itself after ~1.5s.
 * Used when the user's team wins a game.
 */

const COLORS = ['#E66B00', '#1D428A', '#FFC72C', '#10b981', '#ffffff'];

export function dropConfetti(count = 30): void {
  if (typeof document === 'undefined') return;
  // Respect reduced-motion preference.
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden';

  const fallHeight = (typeof window !== 'undefined' ? window.innerHeight : 800) + 40;

  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    const size = 6 + Math.random() * 8;
    dot.style.cssText =
      `position:absolute;top:-20px;left:${Math.random() * 100}%;` +
      `width:${size}px;height:${size}px;border-radius:50%;` +
      `background:${COLORS[i % COLORS.length]};opacity:0.9`;

    const drift = (Math.random() * 2 - 1) * 80;
    const duration = 1000 + Math.random() * 700;
    dot.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${drift}px, ${fallHeight}px) rotate(${Math.random() * 720}deg)`, opacity: 0.9 },
      ],
      { duration, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' },
    );
    container.appendChild(dot);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 1500);
}
