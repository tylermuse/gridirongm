# Live Game Viewer — UI & Animation Bug Fixes

## Context

The live game viewer uses `AnimatedField.tsx` as its canvas-based field visualization. After watching multiple live games at various speeds, the field animation has severe visual issues that make the experience feel broken and hard to follow. This document covers **only the UI/animation/rendering bugs** — see `LIVE_SIM_IMPROVEMENTS.md` for the separate simulation engine logic bugs.

**Primary file to modify**: `src/components/game/AnimatedField.tsx`
**Supporting files**: `src/lib/game/fieldState.ts`, `src/lib/game/animations.ts`, `src/lib/game/formations.ts`

---

## CRITICAL Bug 0: `toAbsoluteYard()` Is Backwards — LOS, First-Down Line, and Ball All Mispositioned

**Severity**: CRITICAL — This is the root cause of the lines looking "off" as play progresses.

**What happens**: The line of scrimmage (blue), first-down marker (yellow dashed), ball position, and field position label are all placed at the WRONG yard line. They're mirrored relative to where they should be. For example, when the score bug says "3rd & 6 at DAL 42", the field label shows "NE 25" and the lines are in the wrong place. The error grows as field position moves further from the 50-yard line.

**Root cause**: `toAbsoluteYard()` in `src/lib/game/fieldState.ts` (line 46) has the home/away mapping **inverted** relative to how the endzones are drawn on the canvas.

The canvas layout is:
- LEFT endzone (absYard 0) = **away** team endzone (drawn with `awayColor`, labeled `awayAbbr`)
- RIGHT endzone (absYard 100) = **home** team endzone (drawn with `homeColor`, labeled `homeAbbr`)

So the away team's own goal line is at absYard 0 (left), and they attack LEFT→RIGHT toward absYard 100. The home team's own goal line is at absYard 100 (right), and they attack RIGHT→LEFT toward absYard 0.

But the current `toAbsoluteYard()` does the opposite:
```typescript
// CURRENT (WRONG):
if (possession === 'home') return fieldPos;      // home fieldPos 0 → absYard 0 (LEFT, away endzone) ← WRONG
return 100 - fieldPos;                             // away fieldPos 0 → absYard 100 (RIGHT, home endzone) ← WRONG
```

The correct mapping is:
```typescript
// CORRECT:
function toAbsoluteYard(fieldPos: number, possession: 'home' | 'away'): number {
  // Away team's endzone is on the LEFT (absYard 0). Away at fieldPos 0 = absYard 0.
  // Home team's endzone is on the RIGHT (absYard 100). Home at fieldPos 0 = absYard 100.
  if (possession === 'home') return 100 - fieldPos;
  return fieldPos;
}
```

**Additionally**, the `dir` variable (attack direction) must also be flipped in TWO places:

1. In `src/lib/game/fieldState.ts` `deriveFieldState()` (line 90):
```typescript
// CURRENT (WRONG): const dir = possession === 'home' ? 1 : -1;
// CORRECT:
const dir = possession === 'home' ? -1 : 1;
// Home attacks RIGHT→LEFT (decreasing absYard), Away attacks LEFT→RIGHT (increasing absYard)
```

2. In `src/lib/game/animations.ts` `buildPlayAnimation()` (line 86):
```typescript
// CURRENT (WRONG): const dir = possession === 'home' ? 1 : -1;
// CORRECT:
const dir = possession === 'home' ? -1 : 1;
```

3. In `src/lib/game/fieldState.ts` `placeDots()` (line 62), the same fix:
```typescript
// CURRENT (WRONG): const dir = possession === 'home' ? 1 : -1;
// CORRECT:
const dir = possession === 'home' ? -1 : 1;
```

**Also fix** the kickoff start position in `animations.ts` (currently line ~310):
```typescript
// CURRENT: startX: possession === 'home' ? 35 : 65,
// With the corrected coordinate system, home kicks from absYard 65 (their own 35), away kicks from absYard 35 (their own 35):
startX: possession === 'home' ? 65 : 35,
```

**How to verify the fix**: Run a live game and check that:
- When DAL (away) is at "DAL 25" (own 25), the ball is near the LEFT side of the field (25 yards from left goal line)
- When DAL is at "NE 25" (opponent's 25), the ball is near the RIGHT side
- The first-down line is always AHEAD of the LOS in the direction of attack
- The field position label matches the score bug text

**This fix touches**: `src/lib/game/fieldState.ts` (3 changes), `src/lib/game/animations.ts` (2 changes)

---

## Critical Bug 1: Ball Is Too Small to Track

**Severity**: HIGH

**What happens**: The football icon is tiny (BALL_RADIUS = 5, making the ellipse about 16px × 10px on an 800px canvas). When the field is the only visual element (no players), the ball is the ONLY thing moving, and it's nearly invisible — especially against the dark green field.

**Fix**: Increase `BALL_RADIUS` from 5 to 8 at the top of `AnimatedField.tsx`:

```typescript
const BALL_RADIUS = 8;
```

Also increase the glow/shadow blur values in `drawBall()` to make it more prominent:

```typescript
ctx.shadowBlur = isAirborne ? 20 : 14;
```

---

## Critical Bug 2: "INCOMPLETE" Text Is Nearly Invisible

**Severity**: HIGH

**What happens**: When a pass is incomplete, the word "INCOMPLETE" appears very faintly on the field for a split second. It uses gray text (`rgba(156, 163, 175, ...)`) on a green field, only 14px font, and only renders between animation progress 0.5–0.9 — a very narrow window. At faster speeds this is completely invisible.

**Root cause**: In `drawEffects()`, the `incomplete` case (line ~491):
```typescript
case 'incomplete': {
  if (progress > 0.5 && progress < 0.9) {
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = `rgba(156, 163, 175, ${Math.max(0, 1 - (progress - 0.5) * 3)})`;
```

The visibility window is too narrow, the font is too small, and gray on green has poor contrast.

**Fix**: Make it more visible — larger font, white text with dark outline, wider display window:

```typescript
case 'incomplete': {
  if (progress < 0.85) {
    const alpha = progress < 0.15 ? progress / 0.15 : Math.max(0, 1 - (progress - 0.3) * 1.8);
    ctx.save();
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Dark outline for contrast on green field
    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
    ctx.lineWidth = 4;
    ctx.strokeText('INCOMPLETE', w / 2, h / 2);
    // White fill
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillText('INCOMPLETE', w / 2, h / 2);
    ctx.restore();
  }
  break;
}
```

Apply the same dark-outline-for-contrast treatment to ALL text overlays (TURNOVER, TOUCHDOWN!, PENALTY, FIELD GOAL!, NO GOOD) — they all suffer from the same readability issue on the green field.

---

## Bug 3: Field Position Label Shows Raw fieldPos Instead of Matching Score Bug

**Severity**: MEDIUM

**What happens**: The field shows "OWN 25" or "OPP 26" near the ball, but the score bug above the field says "1st & 10 at MIA 26" or "1st & 10 at DAL 30". These use completely different labeling conventions, which is confusing. Sometimes the "OWN/OPP" label appears on the wrong side of the field because the coordinate mapping is inconsistent.

**Root cause**: In `drawFieldPositionLabel()` (line ~280), the label is derived from `event.fieldPos` using the `OWN`/`OPP` convention:
```typescript
const label = fp <= 50 ? `OWN ${fp}` : `OPP ${100 - fp}`;
```

But the score bug in `ScoreBug.tsx` shows the actual team abbreviation (e.g., "at MIA 26").

**Fix**: Pass team abbreviations into the field label renderer and use the same format as the score bug. The `AnimatedField` component already receives `homeAbbr` and `awayAbbr` as props — thread those through to `drawFieldPositionLabel()`:

```typescript
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
  // fieldPos <= 50 = own territory, > 50 = opponent territory
  const label = fp <= 50 ? `${possAbbr} ${fp}` : `${oppAbbr} ${100 - fp}`;
  // ... rest of drawing code
}
```

Also consider removing this label entirely — with player dots visible and the score bug already showing field position, it's redundant visual clutter on a small canvas.

---

## Bug 4: First-Down Line Not Visually Distinct Enough

**Severity**: MEDIUM

**What happens**: The first-down marker line (yellow) is drawn but is barely distinguishable from the LOS (blue) on the field, especially at a glance. The yellow line has a subtle glow (`shadowBlur: 6`) but both lines are only 2px wide and the same opacity.

**Fix**: Make the first-down line more visually distinct:

```typescript
// First down line (yellow) — make it dashed and slightly thicker
ctx.strokeStyle = '#fbbf24';
ctx.lineWidth = 2.5;
ctx.setLineDash([8, 4]); // dashed pattern
ctx.shadowColor = 'rgba(251, 191, 36, 0.6)';
ctx.shadowBlur = 8;
ctx.beginPath();
ctx.moveTo(fdX, 0);
ctx.lineTo(fdX, h);
ctx.stroke();
ctx.setLineDash([]); // reset
ctx.shadowBlur = 0;
```

A dashed yellow line vs. solid blue line makes it instantly clear which is which, matching real NFL broadcast conventions.

---

## Bug 5: Animations Don't Flow Between Plays (Jerky Transitions)

**Severity**: MEDIUM

**What happens**: Between plays, the field "jumps" — formations snap instantly to new positions rather than smoothly transitioning. The ball teleports to the new LOS after each play instead of smoothly resetting.

**Root cause**: When a new event arrives, the `useEffect` at line ~649 immediately sets `ref.prevState` and `ref.nextState` and starts a new animation. But between the end of one animation and the start of the next, there's a hard cut. The ball's rest position after play N and the starting position of play N+1's animation may not match because formations recalculate from scratch each time.

**Fix**: Add a brief "reset to LOS" transition between plays. When `ref.progress >= 1` (animation complete), smoothly move the ball from its current resting position to the new LOS over ~200ms before the next play's animation begins. This can be done by adding a `phase` to the animation state: `'playing' | 'resetting' | 'idle'`.

During the `resetting` phase:
- Ball smoothly moves from previous rest position to new scrimmage position
- Player dots smoothly transition from previous formation to new formation
- Duration: 150-250ms regardless of speed setting

This creates a continuous visual flow rather than jarring position jumps.

---

## Bug 6: Canvas Not DPR-Aware (Blurry on Retina Displays)

**Severity**: MEDIUM

**What happens**: On high-DPI (Retina) displays, the canvas appears blurry because the canvas pixel dimensions match CSS pixels rather than physical pixels.

**Root cause**: `AnimatedField.tsx` sets `canvas.width = canvasSize.w` and renders at 1:1. Compare to `GameFieldCanvas.tsx` which properly handles DPR:
```typescript
const dpr = window.devicePixelRatio || 1;
canvas.width = w * dpr;
canvas.height = h * dpr;
ctx.scale(dpr, dpr);
```

**Fix**: Apply the same DPR scaling in `AnimatedField.tsx`. In the render loop, before drawing:

```typescript
const dpr = window.devicePixelRatio || 1;
canvas.width = w * dpr;
canvas.height = h * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
```

And ensure the CSS sizing (`style={{ width: '100%', height: 'auto' }}`) stays the same so it renders at physical resolution but displays at logical size.

**Important**: Only set `canvas.width` and `canvas.height` once per resize, not every frame — doing it every frame causes flickering. Move the DPR setup into the resize observer callback or a separate effect, and skip it in the render loop if dimensions haven't changed.

---

## Bug 7: Play Outcome Text Overlaps on Fast Speeds

**Severity**: LOW-MEDIUM

**What happens**: At 2x and 5x speeds, text overlays (TOUCHDOWN!, TURNOVER, PENALTY, etc.) barely appear before the next play starts animating. The effects fade at the same rate regardless of speed, so at fast speeds they're clipped by the next play's animation beginning.

**Fix**: Scale effect durations with the animation speed. Currently effects use hardcoded progress thresholds (e.g., `progress < 0.7`). Instead, add a minimum display time for important effects:

```typescript
// In buildPlayAnimation, for scoring/turnover events, enforce a minimum duration
if (effects.includes('touchdown') || effects.includes('turnover')) {
  return {
    ...result,
    durationMs: Math.max(result.durationMs, 1200), // at least 1.2s for big plays
  };
}
```

This ensures big moments get enough screen time even at fast speeds.

---

## Bug 8: Pass Arc Trail Doesn't Show Pass Direction Clearly

**Severity**: LOW

**What happens**: The dotted pass arc trail is drawn after the animation completes and fades quickly. During the actual pass animation, there's no visible trajectory — the ball just moves along the arc with no trail behind it.

**Fix**: Draw a real-time trail during the pass animation (not just the post-play fade). In the render loop, when `anim.ballArc` exists and `progress < 1`, draw the portion of the arc that's already been traversed:

```typescript
if (anim && anim.ballArc && progress < 1) {
  // Draw already-traversed portion of arc as a trail
  const steps = Math.floor(progress * 20);
  const endzoneW = w * (10 / 120);
  ctx.save();
  ctx.globalAlpha = 0.4;
  for (let i = 0; i <= steps; i++) {
    const t = (i / 20);
    const pt = bezierArcPoint(anim.ballArc, t, w, h, endzoneW);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = possColor;
    ctx.fill();
  }
  ctx.restore();
}
```

---

## Bug 9: No Visual Distinction for Kickoffs and Punts

**Severity**: LOW

**What happens**: Kickoffs and punts look identical to passes — just a ball arc. There's no visual indication that it's a special teams play. The formations should look completely different (punt formation, kick return formation) and the arc should be higher/longer.

**Root cause**: `fieldState.ts`'s `selectFormation()` correctly selects punt/kickoff formations, and the formations exist in `formations.ts`. But since player dots aren't rendered (Bug 1), the formation difference is invisible. Once Bug 1 is fixed, this should mostly resolve itself.

**Additional fix**: For kickoffs specifically, `buildPlayAnimation()` in `animations.ts` hardcodes `startX: possession === 'home' ? 35 : 65` and uses a `peakHeight` of 45. Increase the peak height for punts and kickoffs to make them visually distinct from pass arcs:

```typescript
case 'kickoff': {
  ballArc = {
    startX: possession === 'home' ? 35 : 65,
    startY: 0.5,
    peakHeight: 65, // was 45 — kicks go higher than passes
    endX: postBallX,
    endY: 0.5,
  };
  break;
}

case 'punt': {
  // ...existing punter lookup...
  ballArc = {
    startX: punter.x,
    startY: 0.5,
    peakHeight: 55, // was 40 — punts have higher trajectory
    endX: postBallX,
    endY: 0.5,
  };
  break;
}
```

---

## Improvement 1: Add Down & Distance Display on the Canvas

**Severity**: ENHANCEMENT

The score bug above the field shows down and distance, but when watching the field animation, your eyes are on the canvas. Add a small down-and-distance indicator directly on the canvas, near the LOS:

```typescript
function drawDownAndDistance(
  ctx: CanvasRenderingContext2D,
  losX: number,
  h: number,
  down: number,
  yardsToGo: number,
) {
  if (down < 1 || down > 4) return;
  const ordinals = ['1st', '2nd', '3rd', '4th'];
  const label = `${ordinals[down - 1]} & ${yardsToGo <= 0 ? 'Goal' : yardsToGo}`;

  ctx.save();
  // Small pill background
  ctx.font = 'bold 9px system-ui, sans-serif';
  const textW = ctx.measureText(label).width;
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
  ctx.fillText(label, losX, pillY + pillH / 2);
  ctx.restore();
}
```

Call this after `drawLines()` when the ball is at rest (not during animation).

---

## Improvement 2: Add Drive Progress Indicator

**Severity**: ENHANCEMENT

Show a subtle trail or highlight of yards gained on the current drive. The score bug shows "Drive: X plays, Y yards" but there's no visual representation on the field. Draw a semi-transparent colored zone from the drive start position to the current LOS:

```typescript
// In the render loop, if drive info is available:
if (currentDrive && currentDrive.yards > 0) {
  const startYard = state.scrimmageYard - currentDrive.yards * dir;
  const endYard = state.scrimmageYard;
  drawDriveZone(ctx, w, h, startYard, endYard, possColor);
}
```

This requires passing drive info through as a prop — the page component already computes `currentDrive.yards`.

---

## Improvement 3: Animate the Score Bug Connection

**Severity**: ENHANCEMENT

When a score changes (TD, FG), briefly flash the scoring team's color on the corresponding end zone with a pulsing animation that's more dramatic than the current subtle gold overlay. The current touchdown effect is decent but ends abruptly. Add a "score confirmed" pulse that triggers after the animation completes — a brief brightening of the end zone that coincides with the score updating in the bug above.

---

## Bug 10: LOS/First-Down Lines Show WRONG Position During Animation — FIXED

**Severity**: HIGH

**What happened**: During a play animation, the LOS and first-down lines showed the PREVIOUS play's positions instead of the current play's pre-snap positions. This caused the lines to visually "lag" one play behind, then snap to the correct position when the animation completed.

**Root cause**: Lines 926-928 in the render loop used `ref.prevState.scrimmageYard` (derived from `prevEvent` — the play BEFORE the current one) during animation. But the LOS for the current play is `ref.nextState.scrimmageYard` (derived from `event` — the current play). `deriveFieldState(event)` computes `scrimmageYard` from `event.fieldPos` which is the pre-snap position.

**Fix**: Always use `state.scrimmageYard` (= `ref.nextState.scrimmageYard`) for the LOS. During the reset phase, interpolate from the old positions to the new using `resetFromLOS`/`resetFromFD` fields.

---

## Bug 11: Lines Snap During Reset Phase While Ball Glides — FIXED

**Severity**: MEDIUM

**What happened**: The reset phase (Bug 5 fix) smoothly glided the ball from its old position to the new LOS over 200ms. But the LOS and first-down lines would snap instantly to their new positions, creating a visual disconnect.

**Fix**: Added `resetFromLOS` and `resetFromFD` fields to the animation ref. During reset phase, the lines now interpolate in sync with the ball glide using the same easing function.

---

## Bug 12: No Possession Change Indicator — FIXED

**Severity**: MEDIUM

**What happened**: When possession changed (after turnovers, punts, kickoffs), the ball would move to a new position and the field would update, but nothing visually told the viewer that possession had switched. This made kickoffs and turnovers confusing.

**Fix**: Added a "→ DAL BALL →" overlay banner that appears for ~800ms when possession changes. The banner has team-colored accent lines and appears during the reset phase. Also increased reset duration to 600ms on possession changes (from 250ms) to give the viewer time to register the change.

---

## Recommended Implementation Order

1. **Bug 0** (toAbsoluteYard backwards) — **DONE.** Fixed `fieldState.ts` (3 spots) and `animations.ts` (2 spots).
2. **Bug 1** (Ball too small) — **DONE** by Claude Code.
3. **Bug 2** (INCOMPLETE text invisible) — **DONE** by Claude Code.
4. **Bug 6** (DPR/Retina blurriness) — **DONE** by Claude Code.
5. **Bug 4** (First-down line) — **DONE** by Claude Code.
6. **Bug 3** (Field position label) — **DONE** by Claude Code.
7. **Bug 5** (Jerky transitions) — **DONE** by Claude Code.
8. **Bug 7** (Fast speed text overlap) — **DONE** by Claude Code.
9. **Bug 8** (Pass trail) — **DONE** by Claude Code.
10. **Bug 9** (Kick/punt arcs) — **DONE** by Claude Code.
11. **Bug 10** (LOS wrong state during animation) — **DONE.**
12. **Bug 11** (Lines snap during reset) — **DONE.**
13. **Bug 12** (No possession change indicator) — **DONE.**
14. Enhancements as desired.

**Note**: Do NOT add player dots/sprites to the field. The field intentionally shows just the ball, lines, and overlays — keeping it clean and focused on ball movement rather than cluttering it with 22 player markers. The unused `GameFieldCanvas.tsx` has player rendering code but it was removed from the active component for this reason.

## Files to Modify

- `src/components/game/AnimatedField.tsx` — Bugs 1-9, all enhancements (this is the primary file)
- `src/lib/game/animations.ts` — Bug 8 (minimum durations), Bug 10 (arc heights)
- `src/lib/game/fieldState.ts` — No changes needed (already computes dots correctly)
- `src/lib/game/formations.ts` — No changes needed (formations are well-defined)
- `src/app/game/[id]/page.tsx` — Only if adding new props for drive info (Enhancement 2)

## Reference: GameFieldCanvas.tsx

`GameFieldCanvas.tsx` is an unused alternative field renderer. It can serve as reference code for:
- DPR-aware canvas rendering (Bug 6 fix)
- Flash overlays for scoring/turnovers
- Play type badge overlays (though these might be better as HTML overlays)

Do NOT switch to using `GameFieldCanvas.tsx` instead of `AnimatedField.tsx` — the animated field has the better architecture (requestAnimationFrame loop, bezier arcs, confetti, effect system). Do NOT add player dots/sprites from GameFieldCanvas — the clean ball-only field is intentional.
