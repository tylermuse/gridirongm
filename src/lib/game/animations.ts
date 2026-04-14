// ---------------------------------------------------------------------------
// Animation system for the animated field view
// ---------------------------------------------------------------------------

import type { PlayEvent } from '@/lib/engine/playByPlay';
import type { GameFieldState, DotState } from './fieldState';

// Import the user-side setting so animation directions match the user-anchored field
let _animUserSide: 'home' | 'away' = 'home';
export function setAnimUserSide(side: 'home' | 'away') { _animUserSide = side; }

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
  // The base scales with the speed setting so 1x feels slow and watchable.
  const absYards = Math.abs(event.yardsGained);
  const baseDuration = speedMs * 0.35 + absYards * 12;
  const cappedDuration = Math.min(baseDuration, speedMs * 0.65);

  const effects: EffectType[] = [];
  let ballArc: BallArc | null = null;
  const movingDots: PlayAnimation['movingDots'] = [];

  const type = event.type;
  const possession = nextState.possession;
  // User-anchored: user drives left→right (+1), opponent right→left (-1)
  const dir = possession === _animUserSide ? 1 : -1;

  // Use nextState dots — they are placed at the CURRENT event's pre-snap LOS
  // (deriveFieldState uses event.fieldPos which is the pre-snap field position).
  // prevState dots are from the PREVIOUS play's LOS and cause animation mismatch
  // (e.g. a 10-yard run looks like 80 yards because the dots start far from the actual LOS).
  const qbIndex = nextState.offenseDots.findIndex(d => d.label === 'QB');
  const rbIndex = nextState.offenseDots.findIndex(d => d.label === 'RB');
  const wrIndices = nextState.offenseDots
    .map((d, i) => d.label === 'WR' ? i : -1)
    .filter(i => i >= 0);

  // Pre-play LOS position (ball starts here) — use current event's scrimmage
  const preBallX = nextState.scrimmageYard;
  // Post-play ball position from the next state
  const postBallX = nextState.ballYard;

  switch (type) {
    case 'pass_complete': {
      // Ball arc from QB to a WR position, then WR moves to new field pos
      const targetWr = wrIndices[Math.floor(Math.random() * wrIndices.length)] ?? 0;
      const wrDot = nextState.offenseDots[targetWr];
      if (wrDot && qbIndex >= 0) {
        const qb = nextState.offenseDots[qbIndex];
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
      const wrDot = nextState.offenseDots[targetWr];
      if (wrDot && qbIndex >= 0) {
        const qb = nextState.offenseDots[qbIndex];
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
        const rb = nextState.offenseDots[rbIndex];
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
      const deIndex = nextState.defenseDots.findIndex(d => d.label === 'DE');
      if (deIndex >= 0 && qbIndex >= 0) {
        const de = nextState.defenseDots[deIndex];
        const qb = nextState.offenseDots[qbIndex];
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
      const wrDot = nextState.offenseDots[targetWr];
      // Ball arc from QB, defensive DB catches
      const dbIndex = nextState.defenseDots.findIndex(d =>
        d.label === 'CB' || d.label === 'FS' || d.label === 'SS'
      );
      if (qbIndex >= 0 && dbIndex >= 0) {
        const qb = nextState.offenseDots[qbIndex];
        const db = nextState.defenseDots[dbIndex];
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
        const rb = nextState.offenseDots[rbIndex];
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
      if (scorerIndex >= 0 && scorerIndex < nextState.offenseDots.length) {
        const scorer = nextState.offenseDots[scorerIndex];
        // User-anchored: user scores at 100 (right), opponent scores at 0 (left)
        const ezYard = possession === _animUserSide ? 100 : 0;
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
      const kickerIndex = nextState.offenseDots.findIndex(d => d.label === 'K');
      if (kickerIndex >= 0) {
        const kicker = nextState.offenseDots[kickerIndex];
        // User-anchored: user kicks toward 100 (right), opponent toward 0 (left)
        const targetX = possession === _animUserSide ? 100 : 0;
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
      const kickerIndex = nextState.offenseDots.findIndex(d => d.label === 'K');
      if (kickerIndex >= 0) {
        const kicker = nextState.offenseDots[kickerIndex];
        // User-anchored: user kicks toward 100 (right), opponent toward 0 (left)
        const targetX = possession === _animUserSide ? 100 : 0;
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
      const punterIndex = nextState.offenseDots.findIndex(d => d.label === 'P');
      if (punterIndex >= 0) {
        const punter = nextState.offenseDots[punterIndex];
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
        // User-anchored: user kickoff from 35 (left→right), opponent from 65 (right→left)
        startX: possession === _animUserSide ? 35 : 65,
        startY: 0.5,
        peakHeight: 65, // higher arc for kickoffs (was 45)
        endX: postBallX,
        endY: 0.5,
      };
      break;
    }
  }

  // If the event is a scoring play (isScoring=true) but wasn't caught by the
  // 'touchdown' case above (e.g., live engine generates 'run' or 'pass_complete'
  // with isScoring=true), add the TD effects so the animation fires.
  if (event.isScoring && !effects.includes('touchdown') && type !== 'field_goal_good' && type !== 'field_goal_miss') {
    effects.push('touchdown', 'confetti');
  }

  // Instant transitions for non-play events (extra point, two-minute warning, etc.)
  if (type === 'extra_point' || type === 'two_minute_warning') {
    return {
      type,
      ballArc: null,
      ballRestX: postBallX,
      movingDots: [],
      effects: [],
      durationMs: 50, // near-instant
    };
  }

  // For incomplete passes, ball rests back at LOS (pre-play position).
  // For penalties, ball rests at LOS. For everything else, use the post-play position.
  let ballRestX = postBallX;
  if (type === 'pass_incomplete') {
    ballRestX = preBallX;
  } else if (type === 'penalty') {
    ballRestX = postBallX; // penalty shifts field pos, show the result
  }

  // Minimum durations for big plays — scale with speed so 5x still feels fast.
  // At 1x (4800ms), big plays get full dramatic pause. At 5x (800ms), minimums shrink.
  const speedScale = Math.max(0.25, speedMs / 4800); // 1.0 at 1x, ~0.17 at 5x
  let finalDuration = Math.max(cappedDuration, 150);
  if (effects.includes('touchdown') || effects.includes('confetti')) {
    finalDuration = Math.max(finalDuration, Math.round(1200 * speedScale));
  } else if (effects.includes('turnover')) {
    finalDuration = Math.max(finalDuration, Math.round(1000 * speedScale));
  } else if (effects.includes('flag')) {
    finalDuration = Math.max(finalDuration, Math.round(800 * speedScale));
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
