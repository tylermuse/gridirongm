// ---------------------------------------------------------------------------
// Animation system for the animated field view
// ---------------------------------------------------------------------------

import type { PlayEvent } from '@/lib/engine/playByPlay';
import type { GameFieldState, DotState } from './fieldState';

// ---------------------------------------------------------------------------
// Easing functions
// ---------------------------------------------------------------------------

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ---------------------------------------------------------------------------
// Play animation type
// ---------------------------------------------------------------------------

export type EffectType =
  | 'touchdown'
  | 'turnover'
  | 'sack'
  | 'flag'
  | 'field_goal_good'
  | 'field_goal_miss'
  | 'confetti'
  | 'incomplete';

export interface BallArc {
  startX: number;  // absolute yard
  startY: number;  // lateral 0-1
  peakHeight: number; // pixels above midpoint for arc
  endX: number;
  endY: number;
}

export interface PlayAnimation {
  type: string;
  ballArc: BallArc | null;
  /** Where the ball should rest after the animation completes (absolute yard).
   *  For incomplete passes this is the LOS (ball returns to scrimmage). */
  ballRestX: number;
  movingDots: Array<{
    team: 'offense' | 'defense';
    index: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }>;
  effects: EffectType[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Build a PlayAnimation from pre/post field states + event
// ---------------------------------------------------------------------------

export function buildPlayAnimation(
  prevState: GameFieldState,
  nextState: GameFieldState,
  event: PlayEvent,
  speedMs: number,
): PlayAnimation {
  // Distance-based duration: short plays animate quickly, long plays take longer.
  // The base scales with the speed setting so 1x actually feels slow and watchable.
  const absYards = Math.abs(event.yardsGained);
  const baseDuration = speedMs * 0.35 + absYards * 12;
  const cappedDuration = Math.min(baseDuration, speedMs * 0.75);

  const effects: EffectType[] = [];
  let ballArc: BallArc | null = null;
  const movingDots: PlayAnimation['movingDots'] = [];

  const type = event.type;
  const possession = prevState.possession;
  const dir = possession === 'home' ? -1 : 1;

  // Find QB and key dots in offense
  const qbIndex = prevState.offenseDots.findIndex(d => d.label === 'QB');
  const rbIndex = prevState.offenseDots.findIndex(d => d.label === 'RB');
  const wrIndices = prevState.offenseDots
    .map((d, i) => d.label === 'WR' ? i : -1)
    .filter(i => i >= 0);

  // Pre-play LOS position (ball starts here)
  const preBallX = prevState.scrimmageYard;
  // Post-play ball position from the next state
  const postBallX = nextState.ballYard;

  switch (type) {
    case 'pass_complete': {
      // Ball arc from QB to a WR position, then WR moves to new field pos
      const targetWr = wrIndices[Math.floor(Math.random() * wrIndices.length)] ?? 0;
      const wrDot = prevState.offenseDots[targetWr];
      if (wrDot && qbIndex >= 0) {
        const qb = prevState.offenseDots[qbIndex];
        ballArc = {
          startX: qb.x,
          startY: qb.y,
          peakHeight: 30 + Math.abs(event.yardsGained) * 0.8,
          endX: postBallX,
          endY: wrDot.y,
        };
        movingDots.push({
          team: 'offense',
          index: targetWr,
          fromX: wrDot.x,
          fromY: wrDot.y,
          toX: postBallX,
          toY: wrDot.y,
        });
      }
      break;
    }

    case 'pass_incomplete': {
      const targetWr = wrIndices[Math.floor(Math.random() * wrIndices.length)] ?? 0;
      const wrDot = prevState.offenseDots[targetWr];
      if (wrDot && qbIndex >= 0) {
        const qb = prevState.offenseDots[qbIndex];
        const dropX = qb.x + (wrDot.x - qb.x) * 0.7;
        ballArc = {
          startX: qb.x,
          startY: qb.y,
          peakHeight: 25,
          endX: dropX,
          endY: wrDot.y + 0.05,
        };
      }
      effects.push('incomplete');
      break;
    }

    case 'run': {
      if (rbIndex >= 0) {
        const rb = prevState.offenseDots[rbIndex];
        const lateralShift = (Math.random() - 0.5) * 0.15;
        movingDots.push({
          team: 'offense',
          index: rbIndex,
          fromX: rb.x,
          fromY: rb.y,
          toX: postBallX,
          toY: Math.max(0.1, Math.min(0.9, rb.y + lateralShift)),
        });
      }
      break;
    }

    case 'sack': {
      // DE rushes QB, QB moves backward (toward own endzone)
      const deIndex = prevState.defenseDots.findIndex(d => d.label === 'DE');
      if (deIndex >= 0 && qbIndex >= 0) {
        const de = prevState.defenseDots[deIndex];
        const qb = prevState.offenseDots[qbIndex];
        // Sack moves QB backward: yardsGained is negative, so move in -dir
        const sackYard = clampYard(preBallX + event.yardsGained * dir);
        movingDots.push({
          team: 'defense',
          index: deIndex,
          fromX: de.x,
          fromY: de.y,
          toX: qb.x,
          toY: qb.y,
        });
        movingDots.push({
          team: 'offense',
          index: qbIndex,
          fromX: qb.x,
          fromY: qb.y,
          toX: sackYard,
          toY: qb.y,
        });
      }
      effects.push('sack');
      break;
    }

    case 'interception': {
      const targetWr = wrIndices[0] ?? 0;
      const wrDot = prevState.offenseDots[targetWr];
      // Ball arc from QB, defensive DB catches
      const dbIndex = prevState.defenseDots.findIndex(d =>
        d.label === 'CB' || d.label === 'FS' || d.label === 'SS'
      );
      if (qbIndex >= 0 && dbIndex >= 0) {
        const qb = prevState.offenseDots[qbIndex];
        const db = prevState.defenseDots[dbIndex];
        ballArc = {
          startX: qb.x,
          startY: qb.y,
          peakHeight: 35,
          endX: db.x + dir * 3,
          endY: db.y,
        };
        movingDots.push({
          team: 'defense',
          index: dbIndex,
          fromX: db.x,
          fromY: db.y,
          toX: db.x + dir * 3,
          toY: db.y,
        });
      }
      effects.push('turnover');
      break;
    }

    case 'fumble': {
      if (rbIndex >= 0) {
        const rb = prevState.offenseDots[rbIndex];
        movingDots.push({
          team: 'offense',
          index: rbIndex,
          fromX: rb.x,
          fromY: rb.y,
          toX: rb.x + dir * (event.yardsGained > 0 ? event.yardsGained * 0.5 : 2),
          toY: rb.y,
        });
      }
      effects.push('turnover');
      break;
    }

    case 'touchdown': {
      // Scoring player enters endzone
      const scorerIndex = rbIndex >= 0 ? rbIndex : (wrIndices[0] ?? 0);
      if (scorerIndex >= 0 && scorerIndex < prevState.offenseDots.length) {
        const scorer = prevState.offenseDots[scorerIndex];
        const ezYard = possession === 'home' ? 100 : 0;
        movingDots.push({
          team: 'offense',
          index: scorerIndex,
          fromX: scorer.x,
          fromY: scorer.y,
          toX: ezYard,
          toY: 0.5,
        });
      }
      effects.push('touchdown', 'confetti');
      break;
    }

    case 'field_goal_good': {
      const kickerIndex = prevState.offenseDots.findIndex(d => d.label === 'K');
      if (kickerIndex >= 0) {
        const kicker = prevState.offenseDots[kickerIndex];
        const targetX = possession === 'home' ? 100 : 0;
        ballArc = {
          startX: kicker.x,
          startY: 0.5,
          peakHeight: 50,
          endX: targetX,
          endY: 0.5,
        };
      }
      effects.push('field_goal_good');
      break;
    }

    case 'field_goal_miss': {
      const kickerIndex = prevState.offenseDots.findIndex(d => d.label === 'K');
      if (kickerIndex >= 0) {
        const kicker = prevState.offenseDots[kickerIndex];
        const targetX = possession === 'home' ? 100 : 0;
        ballArc = {
          startX: kicker.x,
          startY: 0.5,
          peakHeight: 45,
          endX: targetX,
          endY: 0.3,
        };
      }
      effects.push('field_goal_miss');
      break;
    }

    case 'punt': {
      const punterIndex = prevState.offenseDots.findIndex(d => d.label === 'P');
      if (punterIndex >= 0) {
        const punter = prevState.offenseDots[punterIndex];
        ballArc = {
          startX: punter.x,
          startY: 0.5,
          peakHeight: 55, // higher arc for punts (was 40)
          endX: postBallX,
          endY: 0.5,
        };
      }
      break;
    }

    case 'penalty': {
      // No ball movement — flag thrown, field position shifts after
      effects.push('flag');
      break;
    }

    case 'kickoff': {
      ballArc = {
        startX: possession === 'home' ? 65 : 35,
        startY: 0.5,
        peakHeight: 65, // higher arc for kickoffs (was 45)
        endX: postBallX,
        endY: 0.5,
      };
      break;
    }
  }

  // For incomplete passes, ball rests back at LOS (pre-play position).
  // For penalties, ball rests at LOS. For everything else, use the post-play position.
  let ballRestX = postBallX;
  if (type === 'pass_incomplete') {
    ballRestX = preBallX;
  } else if (type === 'penalty') {
    ballRestX = postBallX; // penalty shifts field pos, show the result
  }

  // Bug 7 fix: enforce minimum duration for big plays so text overlays are readable at fast speeds
  let finalDuration = Math.max(cappedDuration, 200);
  if (effects.includes('touchdown') || effects.includes('confetti')) {
    finalDuration = Math.max(finalDuration, 1200);
  } else if (effects.includes('turnover')) {
    finalDuration = Math.max(finalDuration, 1000);
  } else if (effects.includes('flag')) {
    finalDuration = Math.max(finalDuration, 800);
  }

  return {
    type,
    ballArc,
    ballRestX,
    movingDots,
    effects,
    durationMs: finalDuration,
  };
}

function clampYard(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ---------------------------------------------------------------------------
// Confetti particle system (simple)
// ---------------------------------------------------------------------------

export interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;  // 0-1
}

export function spawnConfetti(centerX: number, centerY: number, teamColor: string, count: number = 30): ConfettiParticle[] {
  const colors = [teamColor, '#FFD700', '#FFFFFF', '#FF4444', '#44FF44'];
  return Array.from({ length: count }, () => ({
    x: centerX + (Math.random() - 0.5) * 40,
    y: centerY - Math.random() * 20,
    vx: (Math.random() - 0.5) * 6,
    vy: -Math.random() * 4 - 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 3 + Math.random() * 4,
    life: 1,
  }));
}

export function updateConfetti(particles: ConfettiParticle[], dt: number): ConfettiParticle[] {
  return particles
    .map(p => ({
      ...p,
      x: p.x + p.vx * dt * 60,
      y: p.y + p.vy * dt * 60,
      vy: p.vy + 0.15 * dt * 60, // gravity
      life: p.life - dt * 1.5,
    }))
    .filter(p => p.life > 0);
}

// ---------------------------------------------------------------------------
// Interpolation helper for dot movement
// ---------------------------------------------------------------------------

export function interpolateDots(
  fromDots: DotState[],
  toDots: DotState[],
  progress: number,
  easing: (t: number) => number = easeOutCubic,
): DotState[] {
  const t = easing(progress);
  return fromDots.map((from, i) => {
    const to = toDots[i] ?? from;
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      label: to.label,
      role: from.role,
    };
  });
}

// ---------------------------------------------------------------------------
// Quadratic bezier for ball arcs
// ---------------------------------------------------------------------------

export function bezierArcPoint(
  arc: BallArc,
  t: number,
  canvasW: number,
  canvasH: number,
  endzoneW: number,
): { x: number; y: number } {
  const fieldW = canvasW - 2 * endzoneW;
  const margin = canvasH * 0.08;
  const playableH = canvasH - 2 * margin;

  const startPx = endzoneW + (arc.startX / 100) * fieldW;
  const startPy = margin + arc.startY * playableH;
  const endPx = endzoneW + (arc.endX / 100) * fieldW;
  const endPy = margin + arc.endY * playableH;

  const midPx = (startPx + endPx) / 2;
  const midPy = Math.min(startPy, endPy) - arc.peakHeight;

  // Quadratic bezier: B(t) = (1-t)^2*P0 + 2*(1-t)*t*P1 + t^2*P2
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * startPx + 2 * oneMinusT * t * midPx + t * t * endPx,
    y: oneMinusT * oneMinusT * startPy + 2 * oneMinusT * t * midPy + t * t * endPy,
  };
}
