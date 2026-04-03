'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import type { PlayEvent } from '@/lib/engine/playByPlay';
import { deriveFieldState, idleFieldState, type GameFieldState } from '@/lib/game/fieldState';
import {
  buildPlayAnimation,
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

const FIELD_ASPECT = 2.8;
const FIELD_GREEN_DARK = '#1e6b38';
const FIELD_GREEN_LIGHT = '#238442';
const YARD_LINE_COLOR = 'rgba(255,255,255,0.35)';
const HASH_MARK_COLOR = 'rgba(255,255,255,0.2)';
const BALL_RADIUS = 8;

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
  /** Current drive info for drive progress indicator */
  driveYards?: number;
  drivePossession?: 'home' | 'away';
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

  // First down line (yellow, dashed — distinct from solid blue LOS)
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 4]);
  ctx.shadowColor = 'rgba(251, 191, 36, 0.6)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(fdX, 0);
  ctx.lineTo(fdX, h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// Draw ball (prominent — the main visual element on the field)
// ---------------------------------------------------------------------------

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isAirborne: boolean,
  possessionColor?: string,
) {
  ctx.save();

  // Outer glow to make ball highly visible
  ctx.shadowColor = isAirborne
    ? 'rgba(255, 255, 255, 0.7)'
    : (possessionColor ?? 'rgba(139, 90, 43, 0.6)');
  ctx.shadowBlur = isAirborne ? 20 : 14;

  const r = BALL_RADIUS;

  // Brown oval
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8B5A2B';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Laces
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 1.5);
  ctx.lineTo(x + 3, y - 1.5);
  ctx.stroke();

  // Small ticks on laces
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 1.5, y - 2.5);
    ctx.lineTo(x + i * 1.5, y - 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Draw yard-gain indicator (green/red zone between old and new ball position)
// ---------------------------------------------------------------------------

function drawYardGainIndicator(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fromYard: number,
  toYard: number,
  fadeProgress: number,
) {
  if (fadeProgress <= 0 || fadeProgress > 1) return;
  const fromX = absYardToCanvasX(fromYard, w);
  const toX = absYardToCanvasX(toYard, w);
  if (Math.abs(fromX - toX) < 2) return;

  const alpha = 0.25 * (1 - fadeProgress);
  const isPositive = toX > fromX; // right = positive yards (toward home endzone)
  ctx.save();
  ctx.fillStyle = isPositive
    ? `rgba(34, 197, 94, ${alpha})`
    : `rgba(239, 68, 68, ${alpha})`;
  const x = Math.min(fromX, toX);
  const width = Math.abs(toX - fromX);
  ctx.fillRect(x, 0, width, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Draw field position label near the ball
// ---------------------------------------------------------------------------

function drawFieldPositionLabel(
  ctx: CanvasRenderingContext2D,
  ballX: number,
  ballY: number,
  event: PlayEvent | null,
  homeAbbr: string,
  awayAbbr: string,
) {
  if (!event || !event.fieldPos) return;
  const fp = event.fieldPos;
  const possAbbr = event.possession === 'home' ? homeAbbr : awayAbbr;
  const oppAbbr = event.possession === 'home' ? awayAbbr : homeAbbr;
  const label = fp <= 50 ? `${possAbbr} ${fp}` : `${oppAbbr} ${100 - fp}`;

  ctx.save();
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 3;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(label, ballX, ballY - 12);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Draw pass arc trail (dotted line along the bezier path)
// ---------------------------------------------------------------------------

function drawPassArcTrail(
  ctx: CanvasRenderingContext2D,
  arc: BallArc,
  w: number,
  h: number,
  color: string,
  isComplete: boolean,
  fadeProgress: number,
) {
  if (fadeProgress <= 0) return;
  const endzoneW = w * (10 / 120);
  const alpha = (isComplete ? 0.4 : 0.25) * (1 - fadeProgress);
  const dotColor = isComplete ? color : 'rgba(156,163,175,1)';
  const steps = 16;

  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = bezierArcPoint(arc, t, w, h, endzoneW);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Draw quarter transition overlay
// ---------------------------------------------------------------------------

function drawQuarterOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  label: string,
  progress: number,
) {
  // Fade in for first 30%, hold, fade out for last 30%
  let alpha: number;
  if (progress < 0.3) alpha = progress / 0.3;
  else if (progress > 0.7) alpha = (1 - progress) / 0.3;
  else alpha = 1;

  // Dark overlay
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${0.6 * alpha})`;
  ctx.fillRect(0, 0, w, h);

  // Centered text
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.fillText(label, w / 2, h / 2);
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

        // TURNOVER text with outline
        if (progress < 0.7) {
          const tAlpha = Math.max(0, 1 - progress * 1.5);
          ctx.save();
          ctx.font = 'bold 26px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = `rgba(0, 0, 0, ${tAlpha * 0.8})`;
          ctx.lineWidth = 4;
          ctx.strokeText('TURNOVER', w / 2, h / 2);
          ctx.fillStyle = `rgba(239, 68, 68, ${tAlpha})`;
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
        const tdAlpha = Math.max(0, 0.5 * (1 - progress));
        const ezX = possession === 'home' ? w - endzoneW : 0;
        ctx.fillStyle = `rgba(255, 215, 0, ${tdAlpha})`;
        ctx.fillRect(ezX, 0, endzoneW, h);

        // TD text with outline
        if (progress < 0.8) {
          const tAlpha = Math.max(0, 1 - progress * 1.3);
          ctx.save();
          ctx.font = 'bold 32px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = `rgba(0, 0, 0, ${tAlpha * 0.8})`;
          ctx.lineWidth = 5;
          ctx.strokeText('TOUCHDOWN!', w / 2, h / 2);
          ctx.fillStyle = `rgba(255, 215, 0, ${tAlpha})`;
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

        // PENALTY text with outline
        if (progress < 0.6) {
          const pAlpha = Math.max(0, 1 - progress * 2);
          ctx.save();
          ctx.font = 'bold 22px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = `rgba(0, 0, 0, ${pAlpha * 0.8})`;
          ctx.lineWidth = 4;
          ctx.strokeText('PENALTY', w / 2, h * 0.35);
          ctx.fillStyle = `rgba(251, 191, 36, ${pAlpha})`;
          ctx.fillText('PENALTY', w / 2, h * 0.35);
          ctx.restore();
        }
        break;
      }

      case 'field_goal_good': {
        if (progress < 0.7) {
          const fgAlpha = Math.max(0, 1 - progress * 1.5);
          ctx.save();
          ctx.font = 'bold 24px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = `rgba(0, 0, 0, ${fgAlpha * 0.8})`;
          ctx.lineWidth = 4;
          ctx.strokeText('FIELD GOAL!', w / 2, h / 2);
          ctx.fillStyle = `rgba(34, 197, 94, ${fgAlpha})`;
          ctx.fillText('FIELD GOAL!', w / 2, h / 2);
          ctx.restore();
        }
        break;
      }

      case 'field_goal_miss': {
        if (progress < 0.7) {
          const ngAlpha = Math.max(0, 1 - progress * 1.5);
          ctx.save();
          ctx.font = 'bold 24px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = `rgba(0, 0, 0, ${ngAlpha * 0.8})`;
          ctx.lineWidth = 4;
          ctx.strokeText('NO GOOD', w / 2, h / 2);
          ctx.fillStyle = `rgba(239, 68, 68, ${ngAlpha})`;
          ctx.fillText('NO GOOD', w / 2, h / 2);
          ctx.restore();
        }
        break;
      }

      case 'incomplete': {
        // Bug 2 fix: wider display window, larger font, outlined text
        if (progress < 0.85) {
          const iAlpha = progress < 0.15 ? progress / 0.15 : Math.max(0, 1 - (progress - 0.3) * 1.8);
          ctx.save();
          ctx.font = 'bold 22px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = `rgba(0, 0, 0, ${iAlpha * 0.8})`;
          ctx.lineWidth = 4;
          ctx.strokeText('INCOMPLETE', w / 2, h / 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${iAlpha})`;
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
// Draw drive progress zone (translucent team-colored strip showing drive yards)
// ---------------------------------------------------------------------------

function drawDriveZone(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fromYard: number,
  toYard: number,
  color: string,
) {
  const fromX = absYardToCanvasX(fromYard, w);
  const toX = absYardToCanvasX(toYard, w);
  if (Math.abs(fromX - toX) < 2) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.12;
  const x = Math.min(fromX, toX);
  const width = Math.abs(toX - fromX);
  ctx.fillRect(x, 0, width, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Draw score flash on end zone (Enhancement 3)
// ---------------------------------------------------------------------------

function drawScoreFlash(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  possession: 'home' | 'away',
  progress: number,
  color: string,
) {
  if (progress >= 1) return;
  const endzoneW = w * (10 / 120);
  // Scoring team's TARGET endzone (opposite of their own)
  const ezX = possession === 'home' ? 0 : w - endzoneW;

  // Pulsing alpha — two pulses
  const pulse = Math.sin(progress * Math.PI * 3) * 0.5 + 0.5;
  const fadeOut = 1 - progress;
  const alpha = pulse * fadeOut * 0.5;

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(ezX, 0, endzoneW, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Separator label helper
// ---------------------------------------------------------------------------

function separatorLabel(type: string): string {
  switch (type) {
    case 'quarter_end': return 'END OF QUARTER';
    case 'halftime': return 'HALFTIME';
    case 'two_minute_warning': return 'TWO-MINUTE WARNING';
    case 'overtime': return 'OVERTIME';
    case 'final': return 'FINAL';
    default: return '';
  }
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
  driveYards = 0,
  drivePossession,
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
    completeFired: boolean;
    // Yard-gain indicator fade
    gainFadeProgress: number;
    gainFromYard: number;
    gainToYard: number;
    // Pass arc trail fade
    arcTrailFadeProgress: number;
    arcTrailArc: BallArc | null;
    arcTrailComplete: boolean;
    // Quarter overlay
    quarterOverlayProgress: number;
    quarterOverlayLabel: string;
    quarterOverlayActive: boolean;
    // Bug 5: smooth reset between plays
    resetPhase: boolean;
    resetProgress: number;
    resetFromYard: number;
    resetToYard: number;
    // Enhancement 3: score confirmed flash
    scoreFlashProgress: number;
    scoreFlashPossession: 'home' | 'away';
    scoreFlashActive: boolean;
  }>({
    prevState: idleFieldState(),
    nextState: idleFieldState(),
    animation: null,
    progress: 1,
    confetti: [],
    lastTimestamp: 0,
    isAnimating: false,
    completeFired: true,
    gainFadeProgress: 1,
    gainFromYard: 50,
    gainToYard: 50,
    arcTrailFadeProgress: 1,
    arcTrailArc: null,
    arcTrailComplete: false,
    quarterOverlayProgress: 1,
    quarterOverlayLabel: '',
    quarterOverlayActive: false,
    resetPhase: false,
    resetProgress: 0,
    resetFromYard: 50,
    resetToYard: 50,
    scoreFlashProgress: 1,
    scoreFlashPossession: 'home',
    scoreFlashActive: false,
  });

  const rafRef = useRef<number>(0);
  const dprRef = useRef(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: Math.round(800 / FIELD_ASPECT) });

  // Resize observer — DPR-aware canvas sizing
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      const h = Math.round(w / FIELD_ASPECT);
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
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

    if (event && isSeparator(event.type)) {
      // Quarter transition overlay
      ref.animation = null;
      ref.progress = 0;
      ref.isAnimating = true;
      ref.completeFired = false;
      ref.quarterOverlayProgress = 0;
      ref.quarterOverlayLabel = separatorLabel(event.type);
      ref.quarterOverlayActive = true;
    } else if (event) {
      // Bug 5: start with a brief reset phase if the ball needs to move to new LOS
      const prevBallYard = ref.animation ? ref.animation.ballRestX : ref.prevState.ballYard;
      const newScrimmage = prevState.scrimmageYard;
      const needsReset = Math.abs(absYardToCanvasX(prevBallYard, canvasSize.w) - absYardToCanvasX(newScrimmage, canvasSize.w)) > 3;

      ref.animation = buildPlayAnimation(prevState, nextState, event, animationSpeed);
      ref.completeFired = false;
      ref.quarterOverlayActive = false;

      if (needsReset) {
        ref.resetPhase = true;
        ref.resetProgress = 0;
        ref.resetFromYard = prevBallYard;
        ref.resetToYard = newScrimmage;
        ref.progress = 0;
        ref.isAnimating = true;
      } else {
        ref.resetPhase = false;
        ref.progress = 0;
        ref.isAnimating = true;
      }

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
      ref.quarterOverlayActive = false;
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

    // DPR scaling — render at physical resolution
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Delta time
    const dt = ref.lastTimestamp > 0 ? Math.min((timestamp - ref.lastTimestamp) / 1000, 0.05) : 0.016;
    ref.lastTimestamp = timestamp;

    // Update quarter overlay
    if (ref.quarterOverlayActive) {
      const overlayDuration = 1.2; // seconds
      ref.quarterOverlayProgress = Math.min(1, ref.quarterOverlayProgress + dt / overlayDuration);
      if (ref.quarterOverlayProgress >= 1) {
        ref.quarterOverlayActive = false;
        ref.isAnimating = false;
        if (!ref.completeFired) {
          ref.completeFired = true;
          onAnimCompleteRef.current?.();
        }
      }
    }

    // Bug 5: smooth reset phase — ball glides to new LOS before play animation
    if (ref.resetPhase) {
      const resetDuration = 0.2; // 200ms
      ref.resetProgress = Math.min(1, ref.resetProgress + dt / resetDuration);
      if (ref.resetProgress >= 1) {
        ref.resetPhase = false;
        // Now start the actual play animation
      }
    }

    // Update animation progress (only after reset phase completes)
    if (ref.isAnimating && ref.animation && !ref.quarterOverlayActive && !ref.resetPhase) {
      const duration = ref.animation.durationMs / 1000;
      ref.progress = Math.min(1, ref.progress + dt / duration);
      if (ref.progress >= 1) {
        ref.isAnimating = false;
        if (!ref.completeFired) {
          ref.completeFired = true;

          // Start yard-gain indicator fade
          const prevYard = ref.prevState.ballYard;
          const nextYard = ref.nextState.ballYard;
          if (Math.abs(prevYard - nextYard) >= 1) {
            ref.gainFromYard = prevYard;
            ref.gainToYard = nextYard;
            ref.gainFadeProgress = 0;
          }

          // Start pass arc trail fade
          if (ref.animation && ref.animation.ballArc) {
            ref.arcTrailArc = ref.animation.ballArc;
            ref.arcTrailComplete = !ref.animation.effects.includes('incomplete');
            ref.arcTrailFadeProgress = 0;
          }

          // Enhancement 3: trigger score flash on scoring plays
          if (ref.animation.effects.includes('touchdown') || ref.animation.effects.includes('field_goal_good')) {
            ref.scoreFlashProgress = 0;
            ref.scoreFlashPossession = ref.nextState.possession;
            ref.scoreFlashActive = true;
          }

          onAnimCompleteRef.current?.();
        }
      }
    }

    // Update score flash
    if (ref.scoreFlashActive) {
      ref.scoreFlashProgress = Math.min(1, ref.scoreFlashProgress + dt * 0.8);
      if (ref.scoreFlashProgress >= 1) ref.scoreFlashActive = false;
    }

    // Update fading effects
    if (ref.gainFadeProgress < 1) {
      ref.gainFadeProgress = Math.min(1, ref.gainFadeProgress + dt);
    }
    if (ref.arcTrailFadeProgress < 1) {
      ref.arcTrailFadeProgress = Math.min(1, ref.arcTrailFadeProgress + dt * 0.8);
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

    // Draw yard-gain indicator (fading zone between old and new ball position)
    if (ref.gainFadeProgress < 1) {
      drawYardGainIndicator(ctx, w, h, ref.gainFromYard, ref.gainToYard, ref.gainFadeProgress);
    }

    // Draw pass arc trail (fading dotted line)
    if (ref.arcTrailFadeProgress < 1 && ref.arcTrailArc) {
      const possColor = state.possession === 'home' ? homeColor : awayColor;
      drawPassArcTrail(ctx, ref.arcTrailArc, w, h, possColor, ref.arcTrailComplete, ref.arcTrailFadeProgress);
    }

    // Determine possession color for ball glow
    const possColor = state.possession === 'home' ? homeColor : awayColor;

    // Real-time pass arc trail during animation (Bug 8)
    if (anim && anim.ballArc && progress < 1 && progress > 0.05) {
      const steps = Math.floor(progress * 20);
      const endzoneW = w * (10 / 120);
      ctx.save();
      ctx.globalAlpha = 0.35;
      for (let i = 0; i <= steps; i++) {
        const t = i / 20;
        const pt = bezierArcPoint(anim.ballArc, t, w, h, endzoneW);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = possColor;
        ctx.fill();
      }
      ctx.restore();
    }

    // Draw ball trail for run plays (ball moves along the ground)
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
          possColor,
        );
      }
    }

    // Enhancement 2: draw drive progress zone
    if (driveYards !== 0 && drivePossession && !ref.isAnimating) {
      const dir = drivePossession === 'home' ? -1 : 1;
      const currentLOS = state.scrimmageYard;
      const driveStartYard = currentLOS - driveYards * dir;
      drawDriveZone(ctx, w, h, driveStartYard, currentLOS, drivePossession === 'home' ? homeColor : awayColor);
    }

    // Draw ball — the single focal element on the field
    let ballScreenX = 0;
    let ballScreenY = 0;

    // Bug 5: during reset phase, smoothly glide ball from old position to new LOS
    if (ref.resetPhase) {
      const t = easeOutCubic(ref.resetProgress);
      const fromX = absYardToCanvasX(ref.resetFromYard, w);
      const toX = absYardToCanvasX(ref.resetToYard, w);
      ballScreenX = fromX + (toX - fromX) * t;
      ballScreenY = lateralToCanvasY(0.5, h);
      drawBall(ctx, ballScreenX, ballScreenY, false, possColor);
    } else if (anim && anim.ballArc && progress < 1) {
      // Airborne ball following arc (passes, punts, kicks)
      const endzoneW = w * (10 / 120);
      const ballPos = bezierArcPoint(anim.ballArc, easeInOutQuad(progress), w, h, endzoneW);
      ballScreenX = ballPos.x;
      ballScreenY = ballPos.y;
      drawBall(ctx, ballScreenX, ballScreenY, true, possColor);
    } else if (anim && anim.type === 'run' && progress < 1) {
      // Run play: ball follows the rush path
      const rushDot = anim.movingDots.find(m => m.team === 'offense');
      if (rushDot) {
        const t = easeOutCubic(progress);
        ballScreenX = absYardToCanvasX(rushDot.fromX + (rushDot.toX - rushDot.fromX) * t, w);
        ballScreenY = lateralToCanvasY(rushDot.fromY + (rushDot.toY - rushDot.fromY) * t, h);
        drawBall(ctx, ballScreenX, ballScreenY, false, possColor);
      } else {
        const restYard = anim ? anim.ballRestX : state.ballYard;
        ballScreenX = absYardToCanvasX(restYard, w);
        ballScreenY = lateralToCanvasY(0.5, h);
        drawBall(ctx, ballScreenX, ballScreenY, false, possColor);
      }
    } else if (anim && anim.type === 'sack' && progress < 1) {
      // Sack: ball moves backward with QB
      const qbMove = anim.movingDots.find(m => m.team === 'offense');
      if (qbMove) {
        const t = easeOutCubic(progress);
        ballScreenX = absYardToCanvasX(qbMove.fromX + (qbMove.toX - qbMove.fromX) * t, w);
        ballScreenY = lateralToCanvasY(qbMove.fromY + (qbMove.toY - qbMove.fromY) * t, h);
        drawBall(ctx, ballScreenX, ballScreenY, false, possColor);
      }
    } else if (anim && anim.type === 'touchdown' && progress < 1) {
      // Touchdown: ball moves into endzone
      const scorer = anim.movingDots.find(m => m.team === 'offense');
      if (scorer) {
        const t = easeOutCubic(progress);
        ballScreenX = absYardToCanvasX(scorer.fromX + (scorer.toX - scorer.fromX) * t, w);
        ballScreenY = lateralToCanvasY(scorer.fromY + (scorer.toY - scorer.fromY) * t, h);
        drawBall(ctx, ballScreenX, ballScreenY, false, possColor);
      }
    } else {
      // Ball at rest position
      const restYard = anim ? anim.ballRestX : state.ballYard;
      ballScreenX = absYardToCanvasX(restYard, w);
      ballScreenY = lateralToCanvasY(0.5, h);
      drawBall(ctx, ballScreenX, ballScreenY, false, possColor);
    }

    // Field position label and down & distance near the ball (only when ball at rest)
    if (!ref.isAnimating && event && !isSeparator(event.type)) {
      drawFieldPositionLabel(ctx, ballScreenX, ballScreenY, event, homeAbbr, awayAbbr);
      // Down & distance pill at LOS
      const losX = absYardToCanvasX(state.scrimmageYard, w);
      if (event.down >= 1 && event.down <= 4) {
        const ordinals = ['1st', '2nd', '3rd', '4th'];
        const ddLabel = `${ordinals[event.down - 1]} & ${event.yardsToGo <= 0 ? 'Goal' : event.yardsToGo}`;
        ctx.save();
        ctx.font = 'bold 9px system-ui, sans-serif';
        const textW = ctx.measureText(ddLabel).width;
        const pillW = textW + 10;
        const pillH = 16;
        const pillX = losX - pillW / 2;
        const pillY = h - pillH - 4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 4);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ddLabel, losX, pillY + pillH / 2);
        ctx.restore();
      }
    }

    // Draw effects
    if (anim && anim.effects.length > 0) {
      drawEffects(ctx, w, h, anim.effects, progress, homeColor, state.possession);
    }

    // Draw quarter transition overlay
    if (ref.quarterOverlayActive) {
      drawQuarterOverlay(ctx, w, h, ref.quarterOverlayLabel, ref.quarterOverlayProgress);
    }

    // Enhancement 3: score confirmed end zone pulse
    if (ref.scoreFlashActive) {
      const flashColor = ref.scoreFlashPossession === 'home' ? homeColor : awayColor;
      drawScoreFlash(ctx, w, h, ref.scoreFlashPossession, ref.scoreFlashProgress, flashColor);
    }

    // Draw confetti
    if (ref.confetti.length > 0) {
      drawConfetti(ctx, ref.confetti);
    }

    // Continue loop if animating, fading effects active, or confetti active
    const hasFadingEffects = ref.gainFadeProgress < 1 || ref.arcTrailFadeProgress < 1;
    if (ref.isAnimating || ref.confetti.length > 0 || hasFadingEffects || ref.quarterOverlayActive || ref.scoreFlashActive) {
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
