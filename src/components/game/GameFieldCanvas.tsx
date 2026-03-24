'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayEvent } from '@/lib/engine/playByPlay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlayerSprite {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  color: string;
  label: string;       // position label (QB, RB, WR1, etc.)
  radius: number;
  isBallCarrier: boolean;
  isHighlighted: boolean;
  team: 'home' | 'away';
  role: 'offense' | 'defense';
}

interface BallState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  visible: boolean;
  isAirborne: boolean;  // for passes/kicks
}

interface AnimationState {
  players: PlayerSprite[];
  ball: BallState;
  phase: 'pre-snap' | 'animating' | 'post-play' | 'idle';
  progress: number;     // 0-1 animation progress
  flashField: string | null;  // flash color for scoring/turnover
}

interface Props {
  event: PlayEvent | null;
  prevEvent: PlayEvent | null;
  homeColor: string;
  awayColor: string;
  homeAbbr: string;
  awayAbbr: string;
  isPlaying: boolean;
  animationSpeed: number;  // ms per play
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_ASPECT = 2.25;  // width:height ratio (NFL field is ~2.25:1)
const YARD_LINE_COLOR = 'rgba(255,255,255,0.35)';
const HASH_MARK_COLOR = 'rgba(255,255,255,0.2)';
const FIELD_GREEN_DARK = '#1e6b38';
const FIELD_GREEN_LIGHT = '#238442';
const ENDZONE_ALPHA = 0.85;

// Player sprite sizing
const PLAYER_RADIUS = 8;
const BALL_RADIUS = 4;

// Animation
const ANIMATION_FRAMES = 45;  // frames per play animation
const FRAME_INTERVAL = 22;    // ms between frames (~45fps)

// ---------------------------------------------------------------------------
// Coordinate system helpers
// ---------------------------------------------------------------------------

// Convert field position (1-99, yards from own endzone) and lateral offset
// to canvas pixel coordinates.
// Canvas layout: left endzone | 100 yards of field | right endzone
// Home team attacks RIGHT, Away team attacks LEFT by convention.

function fieldToCanvas(
  fieldPos: number,   // 1-99 (yards from possessing team's own endzone)
  lateralPct: number, // 0-1 (0 = top sideline, 1 = bottom sideline)
  possession: 'home' | 'away',
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  const endzoneW = canvasW * (10 / 120);
  const fieldW = canvasW - 2 * endzoneW;
  const margin = canvasH * 0.08;
  const playableH = canvasH - 2 * margin;

  // Convert to absolute yard position (0=left endzone, 100=right endzone)
  // Home offense goes left-to-right, Away offense goes right-to-left
  let absYard: number;
  if (possession === 'home') {
    absYard = fieldPos;
  } else {
    absYard = 100 - fieldPos;
  }

  const x = endzoneW + (absYard / 100) * fieldW;
  const y = margin + lateralPct * playableH;

  return { x, y };
}

// ---------------------------------------------------------------------------
// Formation generators
// ---------------------------------------------------------------------------

function generateOffenseFormation(
  fieldPos: number,
  possession: 'home' | 'away',
  teamColor: string,
  canvasW: number,
  canvasH: number,
): PlayerSprite[] {
  const los = fieldPos; // line of scrimmage
  // Backfield is always at LOWER fieldPos (toward own endzone).
  // fieldToCanvas already handles the screen flip for away vs home,
  // so dir is always -1 in fieldPos space.
  const dir = -1;

  const positions: { label: string; yardOffset: number; lateral: number }[] = [
    // Offensive Line (5)
    { label: 'C',   yardOffset: 0,          lateral: 0.50 },
    { label: 'LG',  yardOffset: 0,          lateral: 0.42 },
    { label: 'RG',  yardOffset: 0,          lateral: 0.58 },
    { label: 'LT',  yardOffset: 0,          lateral: 0.34 },
    { label: 'RT',  yardOffset: 0,          lateral: 0.66 },
    // QB
    { label: 'QB',  yardOffset: dir * 4,    lateral: 0.50 },
    // RB
    { label: 'RB',  yardOffset: dir * 7,    lateral: 0.48 },
    // WR
    { label: 'WR',  yardOffset: 1,          lateral: 0.10 },
    { label: 'WR',  yardOffset: 1,          lateral: 0.90 },
    // TE
    { label: 'TE',  yardOffset: 0,          lateral: 0.75 },
    // Slot WR
    { label: 'WR',  yardOffset: 1,          lateral: 0.22 },
  ];

  return positions.map(p => {
    const pos = fieldToCanvas(los + p.yardOffset, p.lateral, possession, canvasW, canvasH);
    return {
      x: pos.x,
      y: pos.y,
      targetX: pos.x,
      targetY: pos.y,
      color: teamColor,
      label: p.label,
      radius: PLAYER_RADIUS,
      isBallCarrier: p.label === 'QB',
      isHighlighted: false,
      team: possession,
      role: 'offense' as const,
    };
  });
}

function generateDefenseFormation(
  fieldPos: number,
  possession: 'home' | 'away',
  teamColor: string,
  canvasW: number,
  canvasH: number,
): PlayerSprite[] {
  const los = fieldPos;
  // Defense is always at HIGHER fieldPos (ahead of LOS, toward opponent's endzone).
  // fieldToCanvas handles screen direction, so defSide is always +1.
  const defSide = 1;

  const positions: { label: string; yardOffset: number; lateral: number }[] = [
    // DL (4)
    { label: 'DE',  yardOffset: defSide * 1, lateral: 0.35 },
    { label: 'DT',  yardOffset: defSide * 1, lateral: 0.45 },
    { label: 'DT',  yardOffset: defSide * 1, lateral: 0.55 },
    { label: 'DE',  yardOffset: defSide * 1, lateral: 0.65 },
    // LB (3)
    { label: 'LB',  yardOffset: defSide * 4, lateral: 0.35 },
    { label: 'LB',  yardOffset: defSide * 4, lateral: 0.50 },
    { label: 'LB',  yardOffset: defSide * 4, lateral: 0.65 },
    // CB (2)
    { label: 'CB',  yardOffset: defSide * 2, lateral: 0.10 },
    { label: 'CB',  yardOffset: defSide * 2, lateral: 0.90 },
    // S (2)
    { label: 'S',   yardOffset: defSide * 10, lateral: 0.35 },
    { label: 'S',   yardOffset: defSide * 10, lateral: 0.65 },
  ];

  const defTeam: 'home' | 'away' = possession === 'home' ? 'away' : 'home';

  return positions.map(p => {
    const pos = fieldToCanvas(los + p.yardOffset, p.lateral, possession, canvasW, canvasH);
    return {
      x: pos.x,
      y: pos.y,
      targetX: pos.x,
      targetY: pos.y,
      color: teamColor,
      label: p.label,
      radius: PLAYER_RADIUS,
      isBallCarrier: false,
      isHighlighted: false,
      team: defTeam,
      role: 'defense' as const,
    };
  });
}

// ---------------------------------------------------------------------------
// Animation logic per play type
// ---------------------------------------------------------------------------

function animatePlay(
  event: PlayEvent,
  offense: PlayerSprite[],
  defense: PlayerSprite[],
  ball: BallState,
  possession: 'home' | 'away',
  canvasW: number,
  canvasH: number,
): { offense: PlayerSprite[]; defense: PlayerSprite[]; ball: BallState } {
  // In fieldPos space, positive = toward opponent's endzone (forward).
  // fieldToCanvas handles all screen direction mapping, so we work purely
  // in fieldPos offsets: negative = backward (toward own endzone).
  const yardsGained = event.yardsGained;
  const newFieldPos = Math.max(1, Math.min(99, event.fieldPos + yardsGained));

  // Helper to move a player by yards
  const moveByYards = (sprite: PlayerSprite, yards: number, lateralShift = 0) => {
    const newPos = fieldToCanvas(
      event.fieldPos + yards,
      0.5 + lateralShift,
      possession,
      canvasW,
      canvasH,
    );
    sprite.targetX = newPos.x;
    sprite.targetY = newPos.y + (lateralShift * canvasH * 0.3);
  };

  const qb = offense.find(p => p.label === 'QB');
  const rb = offense.find(p => p.label === 'RB');
  const wrs = offense.filter(p => p.label === 'WR');
  const te = offense.find(p => p.label === 'TE');
  const oline = offense.filter(p => ['C', 'LG', 'RG', 'LT', 'RT'].includes(p.label));
  const dline = defense.filter(p => p.label === 'DE' || p.label === 'DT');
  const lbs = defense.filter(p => p.label === 'LB');
  const cbs = defense.filter(p => p.label === 'CB');
  const safeties = defense.filter(p => p.label === 'S');

  switch (event.type) {
    case 'run': {
      // RB runs through the line
      if (rb) {
        rb.isBallCarrier = true;
        rb.isHighlighted = true;
        if (qb) qb.isBallCarrier = false;
        const lateralJuke = (Math.random() - 0.5) * 0.15;
        moveByYards(rb, yardsGained, lateralJuke);

        // Ball follows RB
        const rbTarget = fieldToCanvas(event.fieldPos + yardsGained, 0.48 + lateralJuke, possession, canvasW, canvasH);
        ball.targetX = rbTarget.x;
        ball.targetY = rbTarget.y;
        ball.isAirborne = false;
      }
      // QB hands off and steps back
      if (qb) {
        const qbBack = fieldToCanvas(event.fieldPos - 2, 0.50, possession, canvasW, canvasH);
        qb.targetX = qbBack.x;
        qb.targetY = qbBack.y;
      }
      // OL push forward
      oline.forEach(ol => {
        const push = fieldToCanvas(event.fieldPos + 2, 0, possession, canvasW, canvasH);
        ol.targetX = ol.x + (push.x - ol.x) * 0.5;
      });
      // DL engage
      dline.forEach(dl => {
        dl.targetX = dl.x + (ball.targetX - dl.x) * 0.3;
      });
      // LBs pursue
      lbs.forEach(lb => {
        lb.targetX = lb.x + (ball.targetX - lb.x) * 0.4;
        lb.targetY = lb.y + (ball.targetY - lb.y) * 0.3;
      });
      break;
    }

    case 'pass_complete': {
      // QB drops back, throws to receiver
      if (qb) {
        qb.isHighlighted = true;
        const dropback = fieldToCanvas(event.fieldPos - 5, 0.50, possession, canvasW, canvasH);
        qb.targetX = dropback.x;
        qb.targetY = dropback.y;
      }
      // Pick a receiver to be the target
      const target = wrs[0] || te;
      if (target) {
        target.isBallCarrier = true;
        target.isHighlighted = true;
        if (qb) qb.isBallCarrier = false;
        const recPos = fieldToCanvas(event.fieldPos + yardsGained, target.y > canvasH / 2 ? 0.8 : 0.2, possession, canvasW, canvasH);
        target.targetX = recPos.x;
        target.targetY = recPos.y;

        ball.targetX = recPos.x;
        ball.targetY = recPos.y;
        ball.isAirborne = true;
      }
      // WRs run routes
      wrs.forEach((wr, i) => {
        if (wr !== target) {
          const routeDepth = 5 + Math.random() * 10;
          const routeLateral = wr.y > canvasH / 2 ? 0.75 : 0.25;
          const wrPos = fieldToCanvas(event.fieldPos + routeDepth, routeLateral, possession, canvasW, canvasH);
          wr.targetX = wrPos.x;
          wr.targetY = wrPos.y;
        }
      });
      // CBs follow WRs
      cbs.forEach((cb, i) => {
        const matchedWr = wrs[i];
        if (matchedWr) {
          cb.targetX = matchedWr.targetX;
          cb.targetY = matchedWr.targetY;
        }
      });
      // Safeties drift back
      safeties.forEach(s => {
        const sPos = fieldToCanvas(event.fieldPos + 15, s.y > canvasH / 2 ? 0.65 : 0.35, possession, canvasW, canvasH);
        s.targetX = sPos.x;
        s.targetY = sPos.y;
      });
      break;
    }

    case 'pass_incomplete': {
      // QB drops back, throws incomplete
      if (qb) {
        qb.isHighlighted = true;
        const dropback = fieldToCanvas(event.fieldPos - 5, 0.50, possession, canvasW, canvasH);
        qb.targetX = dropback.x;
        qb.targetY = dropback.y;
      }
      const target = wrs[0] || te;
      if (target) {
        const recPos = fieldToCanvas(event.fieldPos + 8, target.y > canvasH / 2 ? 0.8 : 0.2, possession, canvasW, canvasH);
        target.targetX = recPos.x;
        target.targetY = recPos.y;
        target.isHighlighted = true;
        ball.targetX = recPos.x + (Math.random() - 0.5) * 30;
        ball.targetY = recPos.y + (Math.random() - 0.5) * 30;
        ball.isAirborne = true;
      }
      // CBs break on ball
      cbs.forEach((cb, i) => {
        if (target) {
          cb.targetX = target.targetX;
          cb.targetY = target.targetY;
          if (i === 0) cb.isHighlighted = true;
        }
      });
      break;
    }

    case 'sack': {
      // DL rushes, sacks QB
      if (qb) {
        qb.isHighlighted = true;
        const sackPos = fieldToCanvas(event.fieldPos + yardsGained, 0.50, possession, canvasW, canvasH);
        qb.targetX = sackPos.x;
        qb.targetY = sackPos.y;
        ball.targetX = sackPos.x;
        ball.targetY = sackPos.y;
      }
      // DE/DT rush to QB
      dline.forEach((dl, i) => {
        if (qb) {
          dl.targetX = qb.targetX;
          dl.targetY = qb.targetY + (i % 2 === 0 ? -8 : 8);
          if (i === 0) dl.isHighlighted = true;
        }
      });
      break;
    }

    case 'interception': {
      // QB throws, defender intercepts
      if (qb) {
        qb.isHighlighted = true;
        const dropback = fieldToCanvas(event.fieldPos - 5, 0.50, possession, canvasW, canvasH);
        qb.targetX = dropback.x;
        qb.targetY = dropback.y;
      }
      const interceptor = cbs[0] || safeties[0];
      if (interceptor) {
        interceptor.isHighlighted = true;
        interceptor.isBallCarrier = true;
        const intPos = fieldToCanvas(event.fieldPos + 5, 0.4, possession, canvasW, canvasH);
        interceptor.targetX = intPos.x;
        interceptor.targetY = intPos.y;
        ball.targetX = intPos.x;
        ball.targetY = intPos.y;
        ball.isAirborne = true;
      }
      break;
    }

    case 'fumble': {
      if (rb) {
        rb.isHighlighted = true;
        moveByYards(rb, Math.max(0, yardsGained));
      }
      const fumbleRecoverer = lbs[0] || dline[0];
      if (fumbleRecoverer) {
        fumbleRecoverer.isHighlighted = true;
        fumbleRecoverer.isBallCarrier = true;
        const fPos = fieldToCanvas(event.fieldPos + Math.max(0, yardsGained), 0.5, possession, canvasW, canvasH);
        fumbleRecoverer.targetX = fPos.x;
        fumbleRecoverer.targetY = fPos.y;
        ball.targetX = fPos.x + (Math.random() - 0.5) * 20;
        ball.targetY = fPos.y + (Math.random() - 0.5) * 20;
      }
      break;
    }

    case 'punt': {
      // Punt animation
      const puntDist = yardsGained;
      const targetPos = fieldToCanvas(event.fieldPos + puntDist, 0.5, possession, canvasW, canvasH);
      ball.targetX = targetPos.x;
      ball.targetY = targetPos.y;
      ball.isAirborne = true;
      break;
    }

    case 'field_goal_good':
    case 'field_goal_miss': {
      // Kicker kicks
      const fgDist = 100 - event.fieldPos + 17;
      const goalPos = fieldToCanvas(100, 0.5, possession, canvasW, canvasH);
      ball.targetX = goalPos.x;
      ball.targetY = goalPos.y;
      ball.isAirborne = true;
      break;
    }

    case 'touchdown': {
      // Ball carrier runs to endzone
      const scorer = rb || wrs[0] || qb;
      if (scorer) {
        scorer.isBallCarrier = true;
        scorer.isHighlighted = true;
        const ezPos = fieldToCanvas(99, 0.5, possession, canvasW, canvasH);
        scorer.targetX = ezPos.x;
        scorer.targetY = ezPos.y;
        ball.targetX = ezPos.x;
        ball.targetY = ezPos.y;
      }
      break;
    }

    case 'kickoff': {
      // Simple kickoff — ball goes downfield
      const kickTarget = fieldToCanvas(75, 0.5, possession, canvasW, canvasH);
      ball.targetX = kickTarget.x;
      ball.targetY = kickTarget.y;
      ball.isAirborne = true;
      break;
    }

    default:
      break;
  }

  return { offense, defense, ball };
}

// ---------------------------------------------------------------------------
// Canvas drawing
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
  const dpr = window.devicePixelRatio || 1;
  const endzoneW = w * (10 / 120);
  const fieldW = w - 2 * endzoneW;

  // Field background with alternating stripes
  for (let i = 0; i < 20; i++) {
    const stripeX = endzoneW + (i / 20) * fieldW;
    const stripeW = fieldW / 20;
    ctx.fillStyle = i % 2 === 0 ? FIELD_GREEN_DARK : FIELD_GREEN_LIGHT;
    ctx.fillRect(stripeX, 0, stripeW, h);
  }

  // End zones
  ctx.fillStyle = awayColor;
  ctx.globalAlpha = ENDZONE_ALPHA;
  ctx.fillRect(0, 0, endzoneW, h);
  ctx.globalAlpha = 1;

  ctx.fillStyle = homeColor;
  ctx.globalAlpha = ENDZONE_ALPHA;
  ctx.fillRect(w - endzoneW, 0, endzoneW, h);
  ctx.globalAlpha = 1;

  // End zone text
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `bold ${Math.round(h * 0.18)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Away endzone (left) - rotated
  ctx.save();
  ctx.translate(endzoneW / 2, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(awayAbbr, 0, 0);
  ctx.restore();

  // Home endzone (right) - rotated
  ctx.save();
  ctx.translate(w - endzoneW / 2, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(homeAbbr, 0, 0);
  ctx.restore();
  ctx.restore();

  // Yard lines
  ctx.strokeStyle = YARD_LINE_COLOR;
  ctx.lineWidth = 1;
  for (let yd = 10; yd <= 90; yd += 10) {
    const x = endzoneW + (yd / 100) * fieldW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // 5-yard lines (thinner)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.5;
  for (let yd = 5; yd <= 95; yd += 5) {
    if (yd % 10 === 0) continue;
    const x = endzoneW + (yd / 100) * fieldW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Hash marks
  const hashY1 = h * 0.33;
  const hashY2 = h * 0.67;
  ctx.strokeStyle = HASH_MARK_COLOR;
  ctx.lineWidth = 1;
  for (let yd = 1; yd <= 99; yd++) {
    const x = endzoneW + (yd / 100) * fieldW;
    ctx.beginPath();
    ctx.moveTo(x, hashY1 - 3);
    ctx.lineTo(x, hashY1 + 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, hashY2 - 3);
    ctx.lineTo(x, hashY2 + 3);
    ctx.stroke();
  }

  // Yard numbers
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = `bold ${Math.round(h * 0.10)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const yardNumbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];
  yardNumbers.forEach((num, i) => {
    const yd = (i + 1) * 10;
    const x = endzoneW + (yd / 100) * fieldW;
    ctx.fillText(String(num), x, h * 0.12);
    ctx.fillText(String(num), x, h * 0.88);
  });

  // Sidelines
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(endzoneW, 1, fieldW, h - 2);

  // Goal lines
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(endzoneW, 0);
  ctx.lineTo(endzoneW, h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w - endzoneW, 0);
  ctx.lineTo(w - endzoneW, h);
  ctx.stroke();
}

function drawLOS(
  ctx: CanvasRenderingContext2D,
  fieldPos: number,
  possession: 'home' | 'away',
  firstDownYards: number,
  w: number,
  h: number,
) {
  const endzoneW = w * (10 / 120);
  const fieldW = w - 2 * endzoneW;

  // Line of scrimmage (blue)
  const absYard = possession === 'home' ? fieldPos : 100 - fieldPos;
  const losX = endzoneW + (absYard / 100) * fieldW;
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(losX, 0);
  ctx.lineTo(losX, h);
  ctx.stroke();

  // First down marker (yellow)
  const fdYard = possession === 'home'
    ? Math.min(100, fieldPos + firstDownYards)
    : Math.max(0, 100 - fieldPos - firstDownYards);
  const fdX = endzoneW + (fdYard / 100) * fieldW;
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(fdX, 0);
  ctx.lineTo(fdX, h);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  sprite: PlayerSprite,
  dpr: number,
) {
  const { x, y, radius, color, label, isBallCarrier, isHighlighted, role } = sprite;

  // Glow effect for highlighted players
  if (isHighlighted) {
    ctx.shadowColor = isBallCarrier ? '#fbbf24' : color;
    ctx.shadowBlur = 12;
  }

  // Player circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Border
  ctx.strokeStyle = isHighlighted
    ? (isBallCarrier ? '#fbbf24' : '#ffffff')
    : 'rgba(255,255,255,0.4)';
  ctx.lineWidth = isHighlighted ? 2.5 : 1;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Ball carrier ring
  if (isBallCarrier) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Position label
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(7, radius * 0.85)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Only show first 2 chars for position
  const shortLabel = label.length > 2 ? label.slice(0, 2) : label;
  ctx.fillText(shortLabel, x, y);
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  ball: BallState,
) {
  if (!ball.visible) return;

  ctx.save();

  // Football shape (oval)
  const { x, y } = ball;

  if (ball.isAirborne) {
    // Draw shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 6, BALL_RADIUS + 1, BALL_RADIUS * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Airborne ball — slightly larger with glow
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 8;
  }

  // Brown football
  ctx.fillStyle = '#8B4513';
  ctx.beginPath();
  ctx.ellipse(x, y, BALL_RADIUS + 1, BALL_RADIUS * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Laces
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 2, y);
  ctx.lineTo(x + 2, y);
  ctx.stroke();

  ctx.restore();
}

function drawFlashOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  alpha: number,
) {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function GameFieldCanvas({
  event,
  prevEvent,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  isPlaying,
  animationSpeed,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const animProgressRef = useRef(0);
  const flashRef = useRef<{ color: string; alpha: number } | null>(null);

  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 356 });

  // Track previous players state for interpolation
  const stateRef = useRef<AnimationState>({
    players: [],
    ball: { x: 0, y: 0, targetX: 0, targetY: 0, visible: false, isAirborne: false },
    phase: 'idle',
    progress: 0,
    flashField: null,
  });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = Math.round(w / FIELD_ASPECT);
        setCanvasSize({ w, h });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Set up animation when event changes
  useEffect(() => {
    if (!event) return;
    const { w, h } = canvasSize;
    if (w < 100) return;

    const possession = event.possession;
    const offColor = possession === 'home' ? homeColor : awayColor;
    const defColor = possession === 'home' ? awayColor : homeColor;

    // Generate formations
    let offense = generateOffenseFormation(event.fieldPos, possession, offColor, w, h);
    let defense = generateDefenseFormation(event.fieldPos, possession, defColor, w, h);
    let ball: BallState = {
      x: offense.find(p => p.label === 'QB')?.x ?? w / 2,
      y: offense.find(p => p.label === 'QB')?.y ?? h / 2,
      targetX: offense.find(p => p.label === 'QB')?.x ?? w / 2,
      targetY: offense.find(p => p.label === 'QB')?.y ?? h / 2,
      visible: true,
      isAirborne: false,
    };

    // Animate the play
    const result = animatePlay(event, offense, defense, ball, possession, w, h);

    // Flash effect for scoring/turnovers
    if (event.type === 'touchdown' || event.type === 'field_goal_good') {
      flashRef.current = { color: 'rgba(34, 197, 94, 0.3)', alpha: 0.3 };
    } else if (event.type === 'interception' || event.type === 'fumble') {
      flashRef.current = { color: 'rgba(239, 68, 68, 0.3)', alpha: 0.3 };
    } else {
      flashRef.current = null;
    }

    stateRef.current = {
      players: [...result.offense, ...result.defense],
      ball: result.ball,
      phase: 'animating',
      progress: 0,
      flashField: null,
    };
    animProgressRef.current = 0;
  }, [event, canvasSize, homeColor, awayColor]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;

      const { w, h } = canvasSize;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      // Clear
      ctx.clearRect(0, 0, w, h);

      // Draw field
      drawField(ctx, w, h, homeColor, awayColor, homeAbbr, awayAbbr);

      // Draw LOS and first down marker
      if (event) {
        drawLOS(ctx, event.fieldPos, event.possession, event.yardsToGo, w, h);
      }

      // Advance animation progress
      const state = stateRef.current;
      if (state.phase === 'animating') {
        animProgressRef.current = Math.min(1, animProgressRef.current + (1 / ANIMATION_FRAMES));
        if (animProgressRef.current >= 1) {
          state.phase = 'post-play';
        }
      }

      const t = easeInOut(animProgressRef.current);

      // Draw and interpolate players
      for (const sprite of state.players) {
        const drawX = sprite.x + (sprite.targetX - sprite.x) * t;
        const drawY = sprite.y + (sprite.targetY - sprite.y) * t;
        drawPlayer(ctx, { ...sprite, x: drawX, y: drawY }, dpr);
      }

      // Draw ball
      if (state.ball.visible) {
        const ballDrawX = state.ball.x + (state.ball.targetX - state.ball.x) * t;
        const ballDrawY = state.ball.y + (state.ball.targetY - state.ball.y) * t;
        // For airborne balls, add arc
        const arcOffset = state.ball.isAirborne ? Math.sin(t * Math.PI) * -25 : 0;
        drawBall(ctx, {
          ...state.ball,
          x: ballDrawX,
          y: ballDrawY + arcOffset,
        });
      }

      // Flash overlay
      if (flashRef.current && flashRef.current.alpha > 0) {
        drawFlashOverlay(ctx, w, h, flashRef.current.color, flashRef.current.alpha);
        flashRef.current.alpha -= 0.008;
        if (flashRef.current.alpha <= 0) flashRef.current = null;
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [canvasSize, event, homeColor, awayColor, homeAbbr, awayAbbr]);

  return (
    <div ref={containerRef} className="w-full relative">
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl"
        style={{
          height: canvasSize.h,
          imageRendering: 'auto',
        }}
      />
      {/* Play type badge overlay */}
      {event && !isSeparatorType(event.type) && (
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-lg ${getPlayBadgeClass(event.type)}`}>
            {getPlayLabel(event.type)}
          </span>
          {event.yardsGained !== 0 && event.type !== 'punt' && (
            <span className={`px-2 py-1 rounded-md text-[10px] font-bold shadow-lg ${
              event.yardsGained > 0
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}>
              {event.yardsGained > 0 ? '+' : ''}{event.yardsGained} YDS
            </span>
          )}
        </div>
      )}
      {/* Possession indicator */}
      {event && (
        <div className="absolute top-3 right-3">
          <span
            className="px-2.5 py-1 rounded-md text-[10px] font-bold text-white shadow-lg"
            style={{ backgroundColor: event.possession === 'home' ? homeColor : awayColor }}
          >
            {event.possession === 'home' ? homeAbbr : awayAbbr} BALL
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function easeInOut(t: number): number {
  return t < 0.5
    ? 2 * t * t
    : -1 + (4 - 2 * t) * t;
}

function isSeparatorType(type: string): boolean {
  return ['quarter_end', 'halftime', 'two_minute_warning', 'overtime', 'final'].includes(type);
}

function getPlayLabel(type: string): string {
  switch (type) {
    case 'run': return 'Rush';
    case 'pass_complete': return 'Complete';
    case 'pass_incomplete': return 'Incomplete';
    case 'sack': return 'Sack';
    case 'interception': return 'INT!';
    case 'fumble': return 'Fumble!';
    case 'punt': return 'Punt';
    case 'field_goal_good': return 'FG Good!';
    case 'field_goal_miss': return 'FG Miss';
    case 'touchdown': return 'Touchdown!';
    case 'extra_point': return 'XP';
    case 'kickoff': return 'Kickoff';
    case 'penalty': return 'Penalty';
    default: return type;
  }
}

function getPlayBadgeClass(type: string): string {
  switch (type) {
    case 'touchdown': return 'bg-green-600 text-white';
    case 'field_goal_good': return 'bg-green-500 text-white';
    case 'interception':
    case 'fumble': return 'bg-red-600 text-white';
    case 'sack': return 'bg-red-500 text-white';
    case 'penalty': return 'bg-amber-500 text-white';
    case 'pass_complete': return 'bg-blue-600 text-white';
    case 'pass_incomplete': return 'bg-gray-600 text-white';
    case 'run': return 'bg-blue-500 text-white';
    case 'punt': return 'bg-gray-500 text-white';
    case 'kickoff': return 'bg-gray-500 text-white';
    case 'extra_point': return 'bg-green-400 text-white';
    default: return 'bg-gray-700 text-white';
  }
}
