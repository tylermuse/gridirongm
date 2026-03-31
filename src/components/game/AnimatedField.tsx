'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import type { PlayEvent } from '@/lib/engine/playByPlay';
import { deriveFieldState, idleFieldState, type GameFieldState, type DotState } from '@/lib/game/fieldState';
import {
  buildPlayAnimation,
  interpolateDots,
  bezierArcPoint,
  spawnConfetti,
  updateConfetti,
  easeOutCubic,
  easeInOutQuad,
  type PlayAnimation,
  type BallArc,
  type ConfettiParticle,
  type EffectType,
} from '@/lib/game/animations';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_ASPECT = 2.25;
const FIELD_GREEN_DARK = '#1e6b38';
const FIELD_GREEN_LIGHT = '#238442';
const YARD_LINE_COLOR = 'rgba(255,255,255,0.35)';
const HASH_MARK_COLOR = 'rgba(255,255,255,0.2)';
const PLAYER_RADIUS = 7;
const BALL_RADIUS = 4;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  event: PlayEvent | null;
  prevEvent: PlayEvent | null;
  homeColor: string;
  awayColor: string;
  homeAbbr: string;
  awayAbbr: string;
  isPlaying: boolean;
  animationSpeed: number;
  onAnimationComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

function absYardToCanvasX(absYard: number, canvasW: number): number {
  const endzoneW = canvasW * (10 / 120);
  const fieldW = canvasW - 2 * endzoneW;
  return endzoneW + (absYard / 100) * fieldW;
}

function lateralToCanvasY(lateral: number, canvasH: number): number {
  const margin = canvasH * 0.08;
  const playableH = canvasH - 2 * margin;
  return margin + lateral * playableH;
}

// ---------------------------------------------------------------------------
// Canvas field renderer
// ---------------------------------------------------------------------------

function drawField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  homeColor: string,
  awayColor: string,
  homeAbbr: string,
  awayAbbr: string,
) {
  const endzoneW = w * (10 / 120);
  const fieldW = w - 2 * endzoneW;

  // Turf — alternating 10-yard strips
  for (let i = 0; i < 10; i++) {
    const stripW = fieldW / 10;
    ctx.fillStyle = i % 2 === 0 ? FIELD_GREEN_DARK : FIELD_GREEN_LIGHT;
    ctx.fillRect(endzoneW + i * stripW, 0, stripW, h);
  }

  // End zones
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = awayColor;
  ctx.fillRect(0, 0, endzoneW, h);
  ctx.fillStyle = homeColor;
  ctx.fillRect(w - endzoneW, 0, endzoneW, h);
  ctx.globalAlpha = 1;

  // End zone text
  ctx.save();
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Away endzone text (rotated)
  ctx.save();
  ctx.translate(endzoneW / 2, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(awayAbbr, 0, 0);
  ctx.restore();

  // Home endzone text (rotated)
  ctx.save();
  ctx.translate(w - endzoneW / 2, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(homeAbbr, 0, 0);
  ctx.restore();
  ctx.restore();

  // Yard lines every 10 yards
  ctx.strokeStyle = YARD_LINE_COLOR;
  ctx.lineWidth = 1;
  for (let yd = 10; yd <= 90; yd += 10) {
    const x = endzoneW + (yd / 100) * fieldW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Yard numbers
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let yd = 10; yd <= 90; yd += 10) {
    const x = endzoneW + (yd / 100) * fieldW;
    const label = yd <= 50 ? yd : 100 - yd;
    ctx.fillText(String(label), x, h - 4);
  }

  // Hash marks every 1 yard (short tick marks)
  ctx.strokeStyle = HASH_MARK_COLOR;
  ctx.lineWidth = 0.5;
  for (let yd = 1; yd <= 99; yd++) {
    if (yd % 10 === 0) continue;
    const x = endzoneW + (yd / 100) * fieldW;
    // Top hash
    ctx.beginPath();
    ctx.moveTo(x, h * 0.28);
    ctx.lineTo(x, h * 0.32);
    ctx.stroke();
    // Bottom hash
    ctx.beginPath();
    ctx.moveTo(x, h * 0.68);
    ctx.lineTo(x, h * 0.72);
    ctx.stroke();
  }

  // Field border
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Draw LOS, first down marker
// ---------------------------------------------------------------------------

function drawLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scrimmageYard: number,
  firstDownYard: number,
) {
  const losX = absYardToCanvasX(scrimmageYard, w);
  const fdX = absYardToCanvasX(firstDownYard, w);

  // Line of scrimmage (blue)
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(losX, 0);
  ctx.lineTo(losX, h);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // First down line (yellow)
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(251, 191, 36, 0.5)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(fdX, 0);
  ctx.lineTo(fdX, h);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// Draw player dots
// ---------------------------------------------------------------------------

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  radius: number,
  isHighlighted: boolean,
) {
  // Glow for highlighted dot
  if (isHighlighted) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }

  // Dot fill
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.shadowBlur = 0;
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  dots: DotState[],
  color: string,
  w: number,
  h: number,
  highlightIndex: number = -1,
) {
  dots.forEach((dot, i) => {
    const px = absYardToCanvasX(dot.x, w);
    const py = lateralToCanvasY(dot.y, h);
    drawDot(ctx, px, py, color, PLAYER_RADIUS, i === highlightIndex);
  });
}

// ---------------------------------------------------------------------------
// Draw ball
// ---------------------------------------------------------------------------

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isAirborne: boolean,
) {
  ctx.save();
  if (isAirborne) {
    ctx.shadowColor = 'rgba(139, 90, 43, 0.6)';
    ctx.shadowBlur = 8;
  }

  // Brown oval
  ctx.beginPath();
  ctx.ellipse(x, y, BALL_RADIUS * 1.4, BALL_RADIUS, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8B5A2B';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Laces
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 2, y - 1);
  ctx.lineTo(x + 2, y - 1);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Effect overlays
// ---------------------------------------------------------------------------

function drawEffects(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  effects: EffectType[],
  progress: number,
  homeColor: string,
  possession: 'home' | 'away',
) {
  for (const effect of effects) {
    switch (effect) {
      case 'turnover': {
        // Red flash border
        const alpha = Math.max(0, 0.6 * (1 - progress));
        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.lineWidth = 6;
        ctx.strokeRect(0, 0, w, h);

        // TURNOVER text
        if (progress < 0.7) {
          ctx.save();
          ctx.font = 'bold 24px system-ui, sans-serif';
          ctx.fillStyle = `rgba(239, 68, 68, ${Math.max(0, 1 - progress * 1.5)})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('TURNOVER', w / 2, h / 2);
          ctx.restore();
        }
        break;
      }

      case 'sack': {
        // Red flash on QB area
        const alpha = Math.max(0, 0.4 * (1 - progress));
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.fillRect(0, 0, w, h);
        break;
      }

      case 'touchdown': {
        // End zone pulse
        const endzoneW = w * (10 / 120);
        const alpha = Math.max(0, 0.5 * (1 - progress));
        const ezX = possession === 'home' ? w - endzoneW : 0;
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
        ctx.fillRect(ezX, 0, endzoneW, h);

        // TD text
        if (progress < 0.8) {
          ctx.save();
          ctx.font = 'bold 32px system-ui, sans-serif';
          ctx.fillStyle = `rgba(255, 215, 0, ${Math.max(0, 1 - progress * 1.3)})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 4;
          ctx.fillText('TOUCHDOWN!', w / 2, h / 2);
          ctx.restore();
        }
        break;
      }

      case 'flag': {
        // Yellow flag icon
        if (progress < 0.8) {
          const flagX = w * 0.3 + (w * 0.4) * progress;
          const flagY = h * 0.2 + (h * 0.5) * progress;
          ctx.save();
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(flagX, flagY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = 'bold 10px system-ui, sans-serif';
          ctx.fillStyle = '#92400e';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('F', flagX, flagY);
          ctx.restore();
        }

        // PENALTY text
        if (progress < 0.6) {
          ctx.save();
          ctx.font = 'bold 18px system-ui, sans-serif';
          ctx.fillStyle = `rgba(251, 191, 36, ${Math.max(0, 1 - progress * 2)})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('PENALTY', w / 2, h * 0.35);
          ctx.restore();
        }
        break;
      }

      case 'field_goal_good': {
        if (progress < 0.7) {
          ctx.save();
          ctx.font = 'bold 20px system-ui, sans-serif';
          ctx.fillStyle = `rgba(34, 197, 94, ${Math.max(0, 1 - progress * 1.5)})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('FIELD GOAL!', w / 2, h / 2);
          ctx.restore();
        }
        break;
      }

      case 'field_goal_miss': {
        if (progress < 0.7) {
          ctx.save();
          ctx.font = 'bold 20px system-ui, sans-serif';
          ctx.fillStyle = `rgba(239, 68, 68, ${Math.max(0, 1 - progress * 1.5)})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('NO GOOD', w / 2, h / 2);
          ctx.restore();
        }
        break;
      }

      case 'incomplete': {
        if (progress > 0.5 && progress < 0.9) {
          ctx.save();
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.fillStyle = `rgba(156, 163, 175, ${Math.max(0, 1 - (progress - 0.5) * 3)})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('INCOMPLETE', w / 2, h / 2);
          ctx.restore();
        }
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Draw confetti particles
// ---------------------------------------------------------------------------

function drawConfetti(ctx: CanvasRenderingContext2D, particles: ConfettiParticle[]) {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Draw rush trail
// ---------------------------------------------------------------------------

function drawRushTrail(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  progress: number,
  color: string,
) {
  if (progress <= 0) return;
  const currentX = fromX + (toX - fromX) * easeOutCubic(progress);
  const currentY = fromY + (toY - fromY) * easeOutCubic(progress);

  ctx.save();
  const gradient = ctx.createLinearGradient(fromX, fromY, currentX, currentY);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(1, color + '88');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(currentX, currentY);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Main AnimatedField component
// ---------------------------------------------------------------------------

export function AnimatedField({
  event,
  prevEvent,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  isPlaying,
  animationSpeed,
  onAnimationComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onAnimCompleteRef = useRef(onAnimationComplete);
  onAnimCompleteRef.current = onAnimationComplete;

  // Animation state refs (avoid re-renders during animation loop)
  const animRef = useRef<{
    prevState: GameFieldState;
    nextState: GameFieldState;
    animation: PlayAnimation | null;
    progress: number;       // 0-1
    confetti: ConfettiParticle[];
    lastTimestamp: number;
    isAnimating: boolean;
    completeFired: boolean;  // ensure onAnimationComplete fires only once per play
  }>({
    prevState: idleFieldState(),
    nextState: idleFieldState(),
    animation: null,
    progress: 1,
    confetti: [],
    lastTimestamp: 0,
    isAnimating: false,
    completeFired: true,
  });

  const rafRef = useRef<number>(0);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 356 });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      const h = Math.round(w / FIELD_ASPECT);
      setCanvasSize({ w, h });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // When event changes, derive new state and build animation
  useEffect(() => {
    const ref = animRef.current;
    const prevState = prevEvent ? deriveFieldState(prevEvent) : ref.nextState;
    const nextState = event ? deriveFieldState(event) : idleFieldState();

    ref.prevState = prevState;
    ref.nextState = nextState;

    if (event && !isSeparator(event.type)) {
      ref.animation = buildPlayAnimation(prevState, nextState, event, animationSpeed);
      ref.progress = 0;
      ref.isAnimating = true;
      ref.completeFired = false;

      // Spawn confetti on TD
      if (ref.animation.effects.includes('confetti')) {
        const possession = event.possession;
        const ezX = possession === 'home'
          ? absYardToCanvasX(100, canvasSize.w)
          : absYardToCanvasX(0, canvasSize.w);
        const teamColor = possession === 'home' ? homeColor : awayColor;
        ref.confetti = spawnConfetti(ezX, canvasSize.h / 2, teamColor, 40);
      }
    } else {
      ref.animation = null;
      ref.progress = 1;
      ref.isAnimating = false;
      ref.completeFired = true;
      // Separator events (quarter_end, halftime, etc.) complete immediately
      onAnimCompleteRef.current?.();
    }
  }, [event, prevEvent, animationSpeed, canvasSize.w, canvasSize.h, homeColor, awayColor]);

  // Main render loop
  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ref = animRef.current;
    const { w, h } = canvasSize;

    // Delta time
    const dt = ref.lastTimestamp > 0 ? Math.min((timestamp - ref.lastTimestamp) / 1000, 0.05) : 0.016;
    ref.lastTimestamp = timestamp;

    // Update animation progress
    if (ref.isAnimating && ref.animation) {
      const duration = ref.animation.durationMs / 1000;
      ref.progress = Math.min(1, ref.progress + dt / duration);
      if (ref.progress >= 1) {
        ref.isAnimating = false;
        if (!ref.completeFired) {
          ref.completeFired = true;
          onAnimCompleteRef.current?.();
        }
      }
    }

    // Update confetti
    if (ref.confetti.length > 0) {
      ref.confetti = updateConfetti(ref.confetti, dt);
    }

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw field background
    drawField(ctx, w, h, homeColor, awayColor, homeAbbr, awayAbbr);

    // Determine current visual state
    const anim = ref.animation;
    const progress = ref.progress;
    const state = ref.nextState;

    // During animation, show pre-play LOS/first-down. After animation, show post-play.
    const showPrev = anim && progress < 1;
    const losYard = showPrev ? ref.prevState.scrimmageYard : state.scrimmageYard;
    const fdYard = showPrev ? ref.prevState.firstDownYard : state.firstDownYard;

    // Draw LOS and first down marker
    drawLines(ctx, w, h, losYard, fdYard);

    // Interpolate dots
    let offDots = state.offenseDots;
    let defDots = state.defenseDots;

    if (anim && progress < 1) {
      offDots = interpolateDots(ref.prevState.offenseDots, state.offenseDots, progress);
      defDots = interpolateDots(ref.prevState.defenseDots, state.defenseDots, progress);

      // Apply moving dots overrides
      for (const md of anim.movingDots) {
        const dots = md.team === 'offense' ? offDots : defDots;
        if (md.index < dots.length) {
          const t = easeOutCubic(progress);
          dots[md.index] = {
            ...dots[md.index],
            x: md.fromX + (md.toX - md.fromX) * t,
            y: md.fromY + (md.toY - md.fromY) * t,
          };
        }
      }
    }

    // Determine colors: offense = possessing team, defense = other
    const offColor = state.possession === 'home' ? homeColor : awayColor;
    const defColor = state.possession === 'home' ? awayColor : homeColor;

    // Draw rush trail for run plays
    if (anim && anim.type === 'run' && progress < 1) {
      const rushDot = anim.movingDots.find(m => m.team === 'offense');
      if (rushDot) {
        drawRushTrail(
          ctx,
          absYardToCanvasX(rushDot.fromX, w),
          lateralToCanvasY(rushDot.fromY, h),
          absYardToCanvasX(rushDot.toX, w),
          lateralToCanvasY(rushDot.toY, h),
          progress,
          offColor,
        );
      }
    }

    // Draw defense dots (behind offense visually)
    drawDots(ctx, defDots, defColor, w, h);

    // Draw offense dots
    drawDots(ctx, offDots, offColor, w, h);

    // Draw ball
    if (anim && anim.ballArc && progress < 1) {
      // Airborne ball following arc
      const endzoneW = w * (10 / 120);
      const ballPos = bezierArcPoint(anim.ballArc, easeInOutQuad(progress), w, h, endzoneW);
      drawBall(ctx, ballPos.x, ballPos.y, true);
    } else {
      // Ball at rest position — use ballRestX from animation if available
      // (e.g., incomplete pass snaps ball back to LOS)
      const restYard = anim ? anim.ballRestX : state.ballYard;
      const ballX = absYardToCanvasX(restYard, w);
      const ballY = lateralToCanvasY(0.5, h);
      drawBall(ctx, ballX, ballY, false);
    }

    // Draw effects
    if (anim && anim.effects.length > 0) {
      drawEffects(ctx, w, h, anim.effects, progress, homeColor, state.possession);
    }

    // Draw confetti
    if (ref.confetti.length > 0) {
      drawConfetti(ctx, ref.confetti);
    }

    // Continue loop if animating or confetti active
    if (ref.isAnimating || ref.confetti.length > 0) {
      rafRef.current = requestAnimationFrame(render);
    }
  }, [canvasSize, homeColor, awayColor, homeAbbr, awayAbbr]);

  // Start animation loop when state changes
  useEffect(() => {
    const ref = animRef.current;
    ref.lastTimestamp = 0;

    // Always do at least one render to show current state
    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [event, render]);

  // Kick off loop when confetti/animation active
  useEffect(() => {
    const ref = animRef.current;
    if (ref.isAnimating || ref.confetti.length > 0) {
      rafRef.current = requestAnimationFrame(render);
    }
  }, [render]);

  return (
    <div ref={containerRef} className="w-full rounded-lg overflow-hidden shadow-md">
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper (duplicated to avoid circular import)
// ---------------------------------------------------------------------------

function isSeparator(type: string): boolean {
  return ['quarter_end', 'halftime', 'two_minute_warning', 'overtime', 'final'].includes(type);
}
