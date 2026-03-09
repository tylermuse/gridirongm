'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  w: number;
  h: number;
  rotation: number;
  spin: number;
  opacity: number;
  wobble: number;
  wobbleSpeed: number;
}

const COLORS = [
  '#FFD700', '#FF6B35', '#004E98', '#1A936F', '#E63946',
  '#457B9D', '#F4A261', '#2A9D8F', '#E9C46A', '#264653',
  '#FF4081', '#7C4DFF', '#00BCD4', '#8BC34A',
];

export function Confetti({ duration = 5000 }: { duration?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);

    // Create particles that burst from multiple points across the top
    const particles: Particle[] = [];
    const count = 200;
    for (let i = 0; i < count; i++) {
      // Spawn across the top third of the screen
      const spawnX = Math.random() * canvas.width;
      const spawnY = Math.random() * canvas.height * 0.3;
      particles.push({
        x: spawnX,
        y: spawnY,
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * 3 + 1, // gentle downward
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        w: 6 + Math.random() * 8,
        h: 4 + Math.random() * 4,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
        opacity: 1,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.03 + Math.random() * 0.05,
      });
    }

    const startTime = performance.now();
    let animId: number;

    function animate(now: number) {
      if (!ctx || !canvas) return;
      const elapsed = now - startTime;
      const fadeStart = duration * 0.65;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = 0;
      for (const p of particles) {
        // Physics
        p.vy += 0.05; // gentle gravity
        p.vx *= 0.99;
        p.x += p.vx + Math.sin(p.wobble) * 1.5; // side-to-side flutter
        p.y += p.vy;
        p.rotation += p.spin;
        p.wobble += p.wobbleSpeed;

        // Fade out towards end
        if (elapsed > fadeStart) {
          p.opacity = Math.max(0, 1 - (elapsed - fadeStart) / (duration - fadeStart));
        }

        if (p.opacity <= 0 || p.y > canvas.height + 50) continue;
        alive++;

        // Draw confetti piece
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        // 3D-ish effect: squish width based on rotation
        const squish = Math.abs(Math.cos(p.rotation * 2));
        ctx.fillRect(-p.w * squish / 2, -p.h / 2, p.w * squish, p.h);
        ctx.restore();
      }

      if (elapsed < duration && alive > 0) {
        animId = requestAnimationFrame(animate);
      }
    }

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [duration]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
    />
  );
}
