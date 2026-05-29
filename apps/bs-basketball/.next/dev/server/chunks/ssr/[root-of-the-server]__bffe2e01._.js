module.exports = [
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/apps/bs-basketball/src/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/apps/bs-basketball/src/app/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/packages/sport-basketball/src/types/index.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Basketball-specific types.
 *
 * Promoted from packages/core/src/adapter/sketches/basketball.adapter.sketch.ts
 * during Phase 2A. The sketch was types-only; this is the real implementation
 * that other modules in @bs/sport-basketball consume.
 */ __turbopack_context__.s([
    "BASKETBALL_POSITIONS",
    ()=>BASKETBALL_POSITIONS,
    "addBasketballStats",
    ()=>addBasketballStats,
    "effectiveFieldGoalPct",
    ()=>effectiveFieldGoalPct,
    "emptyBasketballStats",
    ()=>emptyBasketballStats,
    "perGame",
    ()=>perGame,
    "trueShootingPct",
    ()=>trueShootingPct
]);
const BASKETBALL_POSITIONS = [
    'PG',
    'SG',
    'SF',
    'PF',
    'C'
];
function emptyBasketballStats() {
    return {
        gamesPlayed: 0,
        gamesStarted: 0,
        minutes: 0,
        points: 0,
        fieldGoalsMade: 0,
        fieldGoalsAttempted: 0,
        threePointsMade: 0,
        threePointsAttempted: 0,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
        assists: 0,
        turnovers: 0,
        offensiveRebounds: 0,
        defensiveRebounds: 0,
        totalRebounds: 0,
        steals: 0,
        blocks: 0,
        personalFouls: 0,
        plusMinus: 0,
        trueShootingAttempts: 0
    };
}
function addBasketballStats(target, source) {
    return {
        gamesPlayed: target.gamesPlayed + (source.gamesPlayed ?? 0),
        gamesStarted: target.gamesStarted + (source.gamesStarted ?? 0),
        minutes: target.minutes + (source.minutes ?? 0),
        points: target.points + (source.points ?? 0),
        fieldGoalsMade: target.fieldGoalsMade + (source.fieldGoalsMade ?? 0),
        fieldGoalsAttempted: target.fieldGoalsAttempted + (source.fieldGoalsAttempted ?? 0),
        threePointsMade: target.threePointsMade + (source.threePointsMade ?? 0),
        threePointsAttempted: target.threePointsAttempted + (source.threePointsAttempted ?? 0),
        freeThrowsMade: target.freeThrowsMade + (source.freeThrowsMade ?? 0),
        freeThrowsAttempted: target.freeThrowsAttempted + (source.freeThrowsAttempted ?? 0),
        assists: target.assists + (source.assists ?? 0),
        turnovers: target.turnovers + (source.turnovers ?? 0),
        offensiveRebounds: target.offensiveRebounds + (source.offensiveRebounds ?? 0),
        defensiveRebounds: target.defensiveRebounds + (source.defensiveRebounds ?? 0),
        totalRebounds: target.totalRebounds + (source.totalRebounds ?? 0),
        steals: target.steals + (source.steals ?? 0),
        blocks: target.blocks + (source.blocks ?? 0),
        personalFouls: target.personalFouls + (source.personalFouls ?? 0),
        plusMinus: target.plusMinus + (source.plusMinus ?? 0),
        trueShootingAttempts: target.trueShootingAttempts + (source.trueShootingAttempts ?? 0)
    };
}
function trueShootingPct(stats) {
    const tsa = stats.fieldGoalsAttempted + 0.44 * stats.freeThrowsAttempted;
    if (tsa === 0) return 0;
    return stats.points / (2 * tsa);
}
function effectiveFieldGoalPct(stats) {
    if (stats.fieldGoalsAttempted === 0) return 0;
    return (stats.fieldGoalsMade + 0.5 * stats.threePointsMade) / stats.fieldGoalsAttempted;
}
function perGame(stats) {
    if (stats.gamesPlayed === 0) return {};
    const g = stats.gamesPlayed;
    return {
        minutes: stats.minutes / g,
        points: stats.points / g,
        fieldGoalsMade: stats.fieldGoalsMade / g,
        fieldGoalsAttempted: stats.fieldGoalsAttempted / g,
        threePointsMade: stats.threePointsMade / g,
        threePointsAttempted: stats.threePointsAttempted / g,
        freeThrowsMade: stats.freeThrowsMade / g,
        freeThrowsAttempted: stats.freeThrowsAttempted / g,
        assists: stats.assists / g,
        turnovers: stats.turnovers / g,
        offensiveRebounds: stats.offensiveRebounds / g,
        defensiveRebounds: stats.defensiveRebounds / g,
        totalRebounds: stats.totalRebounds / g,
        steals: stats.steals / g,
        blocks: stats.blocks / g,
        personalFouls: stats.personalFouls / g
    };
}
}),
"[project]/packages/sport-basketball/src/sim/rng.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Deterministic seeded RNG for reproducible sim runs.
 *
 * Why deterministic: when a user replays a saved game, the sim should
 * produce the same result. When a bug is reported with a save file, we need
 * to reproduce the bug exactly. JS's Math.random() can't do that.
 *
 * mulberry32 is a small, fast, well-distributed PRNG. Good enough for game
 * sim — not cryptographic.
 */ __turbopack_context__.s([
    "createRng",
    ()=>createRng
]);
function createRng(seed) {
    // Hash string seeds to a 32-bit integer
    let s = typeof seed === 'number' ? seed : hashString(seed);
    s = s >>> 0; // coerce to uint32
    function next() {
        s = s + 0x6D2B79F5 >>> 0;
        let t = s;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    return {
        random: next,
        randInt (n) {
            if (n <= 0) throw new Error(`randInt(${n}) requires n > 0`);
            return Math.floor(next() * n);
        },
        pick (arr) {
            if (arr.length === 0) throw new Error('pick() requires a non-empty array');
            return arr[Math.floor(next() * arr.length)];
        },
        pickWeighted (items, weights) {
            if (items.length === 0) throw new Error('pickWeighted() requires non-empty items');
            if (items.length !== weights.length) {
                throw new Error(`pickWeighted: items (${items.length}) and weights (${weights.length}) length mismatch`);
            }
            let total = 0;
            for (const w of weights)total += w;
            if (total <= 0) throw new Error('pickWeighted: weights must sum > 0');
            let r = next() * total;
            for(let i = 0; i < items.length; i++){
                r -= weights[i];
                if (r <= 0) return items[i];
            }
            // Floating-point fallthrough; return last
            return items[items.length - 1];
        },
        chance (p) {
            return next() < p;
        }
    };
}
function hashString(s) {
    let h = 2166136261;
    for(let i = 0; i < s.length; i++){
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
}),
"[project]/packages/sport-basketball/src/sim/shotModel.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Shot selection + make probability model.
 *
 * Targets calibrated against 2024-25 NBA season averages:
 *   - Shot mix: ~42% threes, ~32% midrange/long-2, ~26% at-rim
 *   - FG%: ~47% overall (eFG% ~54%)
 *   - 3PT%: ~36%
 *   - Midrange/long-2: ~42%
 *   - At-rim: ~65%
 *   - FT%: ~78%
 *
 * Tuning approach: a 70-rated average player taking an uncontested shot
 * should hit at the league-average rate for that shot type. Higher ratings
 * + softer defenders push that up; lower ratings + tougher defenders push
 * it down. Pre-shot quality and shot type are independent — defender rating
 * affects make probability, doesn't (yet) push the offense into a different
 * shot type.
 *
 * Things this model intentionally doesn't simulate (v1 limitations):
 *   - Off-ball movement, screens, cuts (handled implicitly via ratings)
 *   - Spacing (every shot is independent)
 *   - Clutch / late-game state effects
 *   - Hot/cold streaks within a game
 *
 * Those are v2+ when we have more sim data and can calibrate the additions.
 */ __turbopack_context__.s([
    "drewShootingFoul",
    ()=>drewShootingFoul,
    "isContested",
    ()=>isContested,
    "makeProbability",
    ()=>makeProbability,
    "selectShotType",
    ()=>selectShotType
]);
// ---------------------------------------------------------------------------
// Shot type selection
// ---------------------------------------------------------------------------
/** Per-position baseline shot-type tendencies. Sum to 100 per row.
 *  These get modulated by the shooter's ratings:
 *  - A PG with high threePoint rating shifts toward more threes
 *  - A C with high postScoring rating shifts toward more post-ups
 *  Override examples: Steph Curry (PG with 95+ threePoint) shoots 60%+ threes;
 *  Nikola Jokic (C with elite postScoring + passing) shifts toward post + midrange. */ const BASE_SHOT_MIX = {
    PG: {
        three: 45,
        midrange: 25,
        at_rim: 25,
        post: 5
    },
    SG: {
        three: 50,
        midrange: 25,
        at_rim: 22,
        post: 3
    },
    SF: {
        three: 42,
        midrange: 25,
        at_rim: 28,
        post: 5
    },
    PF: {
        three: 32,
        midrange: 25,
        at_rim: 33,
        post: 10
    },
    C: {
        three: 15,
        midrange: 22,
        at_rim: 45,
        post: 18
    }
};
function selectShotType(shooterPosition, shooterRatings, rng) {
    const base = BASE_SHOT_MIX[shooterPosition];
    // Modulate weights by the shooter's rating in each shot category.
    // A shooter with elite (90+) threePoint rating shoots more threes than
    // the position baseline; a poor shooter (50) shoots fewer.
    const r = shooterRatings;
    const weights = {
        three: base.three * ratingMultiplier(r.threePoint),
        midrange: base.midrange * ratingMultiplier(r.midRange),
        at_rim: base.at_rim * ratingMultiplier(r.finishing),
        post: base.post * ratingMultiplier(r.postScoring)
    };
    return rng.pickWeighted([
        'three',
        'midrange',
        'at_rim',
        'post'
    ], [
        weights.three,
        weights.midrange,
        weights.at_rim,
        weights.post
    ]);
}
/** Scales a base weight up/down by a rating's deviation from 70 (league avg).
 *  Rating 70 → 1.0× multiplier (no change).
 *  Rating 90 → ~1.4× (elite shooters shift mix toward their strength).
 *  Rating 50 → ~0.6× (poor shooters shift mix away from their weakness). */ function ratingMultiplier(rating) {
    return 1 + (rating - 70) / 50;
}
// ---------------------------------------------------------------------------
// Make probability
// ---------------------------------------------------------------------------
/** League-average make rates by shot type. A 70-rated shooter vs a 70-rated
 *  defender hits at these rates on average. Calibrated to 2024-25 NBA.
 *
 *  Bumped slightly above raw NBA averages to compensate for the contested-shot
 *  penalty (which doesn't exist in the league-avg numbers — they already
 *  reflect contested shots) and small defender-rating effects. Sim runs at
 *  league-realistic 35-37% 3PT% with these constants. */ const LEAGUE_AVG_MAKE = {
    three: 0.39,
    midrange: 0.44,
    at_rim: 0.67,
    post: 0.50
};
/** How much a rating point above/below 70 shifts the make probability.
 *  +30 rating points (70 → 100) shifts +12% on shot make rate. */ const RATING_SHIFT_PER_POINT = 0.004;
/** How much the defender's relevant rating shifts the make probability the
 *  other direction. Defender effect is slightly weaker than shooter effect —
 *  good shooters generate good looks regardless. */ const DEFENDER_SHIFT_PER_POINT = 0.003;
function makeProbability(shotType, shooter, defender, contested) {
    // Pick the shooter's relevant rating for this shot type
    const shooterRating = shooterRatingFor(shotType, shooter);
    // Pick the defender's relevant defensive rating
    const defenderRating = defenderRatingFor(shotType, defender);
    let p = LEAGUE_AVG_MAKE[shotType];
    p += (shooterRating - 70) * RATING_SHIFT_PER_POINT;
    p -= (defenderRating - 70) * DEFENDER_SHIFT_PER_POINT;
    // Contested shots are ~5% less likely to fall. (Was 8% in v0; reduced
    // because real-NBA league-avg make rates already include contested shots,
    // so an 8% penalty over-counts the defense effect.)
    if (contested) p -= 0.05;
    // Clamp to a sensible range — even Curry doesn't shoot 90% from three
    return clamp(p, 0.05, 0.92);
}
function shooterRatingFor(shot, r) {
    switch(shot){
        case 'three':
            return r.threePoint;
        case 'midrange':
            return r.midRange;
        case 'at_rim':
            return r.finishing;
        case 'post':
            return r.postScoring;
    }
}
function defenderRatingFor(shot, r) {
    switch(shot){
        case 'three':
        case 'midrange':
            return r.perimeterDefense;
        case 'at_rim':
        case 'post':
            // Interior defense + shot-blocking both bite at the rim
            return (r.interiorDefense + r.block) / 2;
    }
}
function isContested(shooter, defender, rng) {
    const defenderQuality = (defender.perimeterDefense + defender.interiorDefense + defender.basketballIQ) / 3;
    const shooterOpenness = (shooter.basketballIQ + shooter.passing + shooter.handles) / 3;
    let p = 0.45 + (defenderQuality - 70) * 0.005 - (shooterOpenness - 70) * 0.003;
    p = clamp(p, 0.15, 0.85);
    return rng.chance(p);
}
// ---------------------------------------------------------------------------
// Shooting foul check
// ---------------------------------------------------------------------------
/** Probability of drawing a shooting foul. Higher at the rim, lower beyond
 *  the arc. Aggressive defenders foul more; skilled offensive players draw
 *  more (rip-throughs, ball-fakes). */ const SHOOTING_FOUL_BASE = {
    at_rim: 0.18,
    post: 0.12,
    midrange: 0.04,
    three: 0.025
};
function drewShootingFoul(shotType, shooter, defender, rng) {
    let p = SHOOTING_FOUL_BASE[shotType];
    // Shooter craft (basketballIQ + handles) draws more fouls
    p += (shooter.basketballIQ - 70) * 0.0008;
    p += (shooter.handles - 70) * 0.0006;
    // Sloppy defender (low IQ relative to physicality) fouls more
    if (defender.basketballIQ < 65) p += 0.02;
    return rng.chance(clamp(p, 0.01, 0.4));
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
}),
"[project]/packages/sport-basketball/src/sim/possession.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Single-possession resolver.
 *
 * Given an offensive lineup, a defensive lineup, and an RNG, simulate ONE
 * possession and emit the stat events that resulted.
 *
 * Possession outcomes (v1):
 *   - Turnover (steal or non-steal)
 *   - Shot attempt (made, missed, or fouled)
 *   - Free throws (from shooting foul)
 *   - Rebound (offensive or defensive) on missed shot
 *
 * Possession outcomes intentionally NOT modeled in v1:
 *   - Non-shooting fouls (defensive 3-second, off-ball, push-off — small effect)
 *   - Jump balls, held balls
 *   - Goaltending / basket interference
 *   - Technical fouls
 *   - Buzzer-beater clock-aware shot selection (every shot is "normal")
 *
 * The game loop (../game.ts) calls simPossession ~200 times per game,
 * alternating which team has the ball and aggregating stat events into
 * per-player game lines.
 */ __turbopack_context__.s([
    "AVG_POSSESSION_SECONDS",
    ()=>AVG_POSSESSION_SECONDS,
    "simPossession",
    ()=>simPossession
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$shotModel$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/sim/shotModel.ts [app-rsc] (ecmascript)");
;
// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
/** League average turnover rate per possession (~14 TOs / ~100 possessions). */ const BASE_TURNOVER_RATE = 0.135;
/** Fraction of turnovers that come from steals (the rest are live-ball
 *  errors — bad passes, dribble offs, traveling, etc.). */ const STEAL_FRACTION_OF_TURNOVERS = 0.55;
/** Per-team offensive rebound rate on missed shots. League average ~26%. */ const BASE_OFFENSIVE_REBOUND_RATE = 0.26;
/** Average seconds per possession. Pace adjustments happen at game level. */ const AVG_POSSESSION_SECONDS = 14.5;
function simPossession(offense, defense, rng) {
    const events = [];
    let possessionFlipsToDefense = true;
    let pointsScored = 0;
    // Step 1: Did the possession end in a turnover?
    const turnoverCheck = rng.random();
    if (turnoverCheck < BASE_TURNOVER_RATE) {
        const wasSteal = rng.chance(STEAL_FRACTION_OF_TURNOVERS);
        const turnoverPlayer = selectTurnoverPlayer(offense, rng);
        events.push({
            playerId: turnoverPlayer.id,
            field: 'turnovers'
        });
        if (wasSteal) {
            const stealer = selectStealer(defense, rng);
            events.push({
                playerId: stealer.id,
                field: 'steals'
            });
        }
        return {
            events,
            possessionFlipsToDefense: true,
            secondsElapsed: turnoverSeconds(rng),
            pointsScored: 0
        };
    }
    // Step 2: Pick a shooter — weighted by usage
    const shooter = selectShooter(offense, rng);
    const shooterIdx = offense.players.indexOf(shooter);
    const defender = defense.players[shooterIdx]; // same-position matchup, v1 simplification
    // Step 3: Pick shot type
    const shotType = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$shotModel$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["selectShotType"])(shooter.sportData.position, shooter.ratings, rng);
    const isThree = shotType === 'three';
    const contested = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$shotModel$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isContested"])(shooter.ratings, defender.ratings, rng);
    // Step 4: Did the defender block it? (Only relevant at the rim, and only
    // for shots not already going to be made through traffic.)
    const blockChance = shotType === 'at_rim' || shotType === 'post' ? Math.max(0, (defender.ratings.block - 65) * 0.0035) : 0;
    if (rng.chance(blockChance)) {
        events.push({
            playerId: defender.id,
            field: 'blocks'
        });
        events.push({
            playerId: shooter.id,
            field: 'fieldGoalsAttempted'
        });
        if (isThree) events.push({
            playerId: shooter.id,
            field: 'threePointsAttempted'
        });
        // Blocked shot → live ball → rebound
        return resolveRebound(events, offense, defense, contested, rng, 0, false);
    }
    // Step 5: Resolve shot make/miss
    const makeP = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$shotModel$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["makeProbability"])(shotType, shooter.ratings, defender.ratings, contested);
    const made = rng.chance(makeP);
    const fouled = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$shotModel$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["drewShootingFoul"])(shotType, shooter.ratings, defender.ratings, rng);
    events.push({
        playerId: shooter.id,
        field: 'fieldGoalsAttempted'
    });
    if (isThree) events.push({
        playerId: shooter.id,
        field: 'threePointsAttempted'
    });
    if (made) {
        const points = isThree ? 3 : 2;
        events.push({
            playerId: shooter.id,
            field: 'fieldGoalsMade'
        });
        if (isThree) events.push({
            playerId: shooter.id,
            field: 'threePointsMade'
        });
        events.push({
            playerId: shooter.id,
            field: 'points',
            delta: points
        });
        pointsScored += points;
        // Credit an assist ~55% of the time (NBA league average for made FGs).
        // Assister is one of the other 4 offensive players, weighted by passing.
        if (rng.chance(0.55)) {
            const assister = selectAssister(offense, shooter, rng);
            events.push({
                playerId: assister.id,
                field: 'assists'
            });
        }
        // Defender foul → and-1 free throw
        if (fouled) {
            events.push({
                playerId: defender.id,
                field: 'personalFouls'
            });
            const ftMade = resolveFreeThrows(shooter, 1, events, rng);
            pointsScored += ftMade;
        }
        return {
            events,
            possessionFlipsToDefense: true,
            secondsElapsed: shotSeconds(rng),
            pointsScored
        };
    }
    // Missed shot
    if (fouled) {
        // Defender foul on missed shot → 2 FTs (or 3 if a three-point attempt)
        events.push({
            playerId: defender.id,
            field: 'personalFouls'
        });
        const ftCount = isThree ? 3 : 2;
        const ftMade = resolveFreeThrows(shooter, ftCount, events, rng);
        pointsScored += ftMade;
        // Last FT outcome doesn't trigger a rebound in this simplified v1
        return {
            events,
            possessionFlipsToDefense: true,
            secondsElapsed: shotSeconds(rng),
            pointsScored
        };
    }
    // Plain missed shot → rebound battle
    return resolveRebound(events, offense, defense, contested, rng, pointsScored, false);
}
// ---------------------------------------------------------------------------
// Sub-resolvers
// ---------------------------------------------------------------------------
function resolveRebound(events, offense, defense, contested, rng, pointsAlreadyScored, _wasBlocked) {
    // Compute offensive rebound probability based on team rebounding ratings
    const offReboundSum = offense.players.reduce((s, p)=>s + p.ratings.rebounding, 0);
    const defReboundSum = defense.players.reduce((s, p)=>s + p.ratings.rebounding, 0);
    const offReboundEdge = (offReboundSum - defReboundSum) / 500; // small effect
    let orbRate = BASE_OFFENSIVE_REBOUND_RATE + offReboundEdge;
    if (contested) orbRate += 0.02; // contested misses → long rebounds → more orb chances
    orbRate = Math.max(0.12, Math.min(0.42, orbRate));
    const offensiveRebound = rng.chance(orbRate);
    if (offensiveRebound) {
        const rebounder = selectRebounder(offense, rng);
        events.push({
            playerId: rebounder.id,
            field: 'offensiveRebounds'
        });
        events.push({
            playerId: rebounder.id,
            field: 'totalRebounds'
        });
        return {
            events,
            possessionFlipsToDefense: false,
            secondsElapsed: shotSeconds(rng),
            pointsScored: pointsAlreadyScored
        };
    }
    const rebounder = selectRebounder(defense, rng);
    events.push({
        playerId: rebounder.id,
        field: 'defensiveRebounds'
    });
    events.push({
        playerId: rebounder.id,
        field: 'totalRebounds'
    });
    return {
        events,
        possessionFlipsToDefense: true,
        secondsElapsed: shotSeconds(rng),
        pointsScored: pointsAlreadyScored
    };
}
function resolveFreeThrows(shooter, count, events, rng) {
    // Free throw % derived from FT rating. 70 rating = 78% (league avg).
    const ftPct = 0.78 + (shooter.ratings.freeThrow - 70) * 0.006;
    const ftMakeProb = Math.max(0.4, Math.min(0.95, ftPct));
    let made = 0;
    for(let i = 0; i < count; i++){
        events.push({
            playerId: shooter.id,
            field: 'freeThrowsAttempted'
        });
        if (rng.chance(ftMakeProb)) {
            events.push({
                playerId: shooter.id,
                field: 'freeThrowsMade'
            });
            events.push({
                playerId: shooter.id,
                field: 'points'
            });
            made++;
        }
    }
    return made;
}
// ---------------------------------------------------------------------------
// Player selection (weighted)
// ---------------------------------------------------------------------------
/** Weight a player's offensive usage: scoring + shot creation. */ function usageWeight(p) {
    const r = p.ratings;
    return r.threePoint * 0.25 + r.midRange * 0.15 + r.finishing * 0.20 + r.postScoring * 0.10 + r.handles * 0.15 + r.basketballIQ * 0.15;
}
function selectShooter(lineup, rng) {
    const weights = lineup.players.map(usageWeight);
    return rng.pickWeighted(lineup.players, weights);
}
function selectAssister(lineup, exclude, rng) {
    const others = lineup.players.filter((p)=>p !== exclude);
    const weights = others.map((p)=>p.ratings.passing * 1.5 + p.ratings.basketballIQ);
    return rng.pickWeighted(others, weights);
}
function selectTurnoverPlayer(lineup, rng) {
    // Higher-usage players cough it up more (more touches), but bad handles
    // hurt — so weight is usage minus handles rating.
    const weights = lineup.players.map((p)=>Math.max(5, usageWeight(p) - p.ratings.handles * 0.6));
    return rng.pickWeighted(lineup.players, weights);
}
function selectStealer(lineup, rng) {
    const weights = lineup.players.map((p)=>p.ratings.steal);
    return rng.pickWeighted(lineup.players, weights);
}
function selectRebounder(lineup, rng) {
    // Rebounding weighted by rebounding rating + height + position bias
    const weights = lineup.players.map((p)=>{
        const pos = p.sportData.position;
        const positionBoost = pos === 'C' ? 1.3 : pos === 'PF' ? 1.15 : 1.0;
        return (p.ratings.rebounding + p.ratings.height / 3) * positionBoost;
    });
    return rng.pickWeighted(lineup.players, weights);
}
// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
function shotSeconds(rng) {
    // Most possessions take 10-20 seconds; tail to 24
    return 4 + rng.random() * 20;
}
function turnoverSeconds(rng) {
    // Turnovers are usually quicker than shot attempts
    return 2 + rng.random() * 12;
}
;
}),
"[project]/packages/sport-basketball/src/sim/game.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Full-game loop. Wraps simPossession into a complete basketball game.
 *
 * v1 design:
 *   - 4 quarters × 12 minutes (720s each) + 5-minute overtime if tied
 *   - ~95-105 possessions per team depending on pace
 *   - Two-unit rotation: 5 starters + first 5 bench, alternating in 4:2
 *     possession stints (starters play ~67% of game, bench ~33%) →
 *     starters average ~32 min, bench rotation ~16 min
 *   - Pace setting drives average possession length:
 *       fast = 12s, medium = 14.5s, slow = 17s
 *   - Plus/minus tracked per player based on score delta during their court time
 *   - Per-player minutes tracked from possession seconds
 *
 * v1 simplifications (deferred to v2):
 *   - No fatigue model (rotation is purely time-based, not exertion-based)
 *   - No foul-out (players keep playing past 6 fouls)
 *   - No clock-aware shot selection (no buzzer-beater fade-aways)
 *   - No coaching adjustments mid-game (no momentum changes, no defensive
 *     scheme switches based on game state)
 *   - Bench beyond the first 5 doesn't see the floor in v1
 *   - No starter/bench performance gap modeling (chemistry, role players)
 *
 * Test contract:
 *   - simBasketballGame is the only public entry point
 *   - Deterministic on seed
 *   - Returns BaseGameResult<BasketballStats> with full per-player box scores
 */ __turbopack_context__.s([
    "simBasketballGame",
    ()=>simBasketballGame,
    "simBasketballGameSimple",
    ()=>simBasketballGameSimple
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/types/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$rng$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/sim/rng.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$possession$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/sim/possession.ts [app-rsc] (ecmascript)");
;
;
;
const DEFAULT_SETTINGS = {
    quarterLengthSeconds: 720,
    numQuarters: 4,
    overtimeLengthSeconds: 300,
    homeAdvantage: 2.5,
    maxOvertimes: 5
};
// ===========================================================================
// Pace tuning
// ===========================================================================
const PACE_AVG_POSSESSION_SECONDS = {
    fast: 12.0,
    medium: 14.5,
    slow: 17.0
};
/** Combined pace of a game — average of both teams' pace settings. */ function gamePace(home, away) {
    const order = {
        slow: 0,
        medium: 1,
        fast: 2
    };
    const reverse = [
        'slow',
        'medium',
        'fast'
    ];
    const avg = Math.round((order[home.lineup.pace] + order[away.lineup.pace]) / 2);
    return reverse[avg];
}
// ===========================================================================
// Substitution rotation
// ===========================================================================
/** v1 substitution: alternate between starter unit (4 possessions) and
 *  bench unit (2 possessions). Repeats throughout the game.
 *  Starters get ~67% of court time → ~32 min over a 48-min game. */ const STARTER_STINT = 4;
const BENCH_STINT = 2;
/** Build the active 5-man SimLineup for a team given which unit is on
 *  the floor. Falls back to starters if the bench doesn't have 5 players. */ function buildActiveLineup(side, unit, playerById) {
    if (unit === 'starters') {
        const arr = side.lineup.starters.map((id)=>playerById.get(id));
        // TS can't prove a .map() result is a 5-tuple even though the source
        // is — cast through unknown.
        return {
            players: arr
        };
    }
    // Bench unit: first 5 in bench list. If bench has fewer than 5, mix in
    // starters as fallback to maintain a 5-man lineup. (Rare in practice
    // since NBA teams have 12-15 active players.)
    const benchIds = side.lineup.bench.slice(0, 5);
    while(benchIds.length < 5){
        // Fall back to starters in original position order
        const fallback = side.lineup.starters[benchIds.length];
        if (!benchIds.includes(fallback)) benchIds.push(fallback);
        else break; // safety
    }
    const arr = benchIds.slice(0, 5).map((id)=>playerById.get(id));
    return {
        players: arr
    };
}
function simBasketballGame(home, away, context, settingsOverride) {
    const settings = {
        ...DEFAULT_SETTINGS,
        ...context.isPlayoff ? {
            homeAdvantage: 3.5
        } : {},
        ...settingsOverride
    };
    const rng = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$rng$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createRng"])(context.rngSeed);
    // Fast player lookup by ID
    const homePlayerById = buildPlayerMap(home.players);
    const awayPlayerById = buildPlayerMap(away.players);
    // Pre-allocate stat accumulators
    const boxScores = new Map();
    const minutesPlayed = new Map();
    let homeScore = 0;
    let awayScore = 0;
    const quarterScores = [];
    let biggestLead = {
        team: 'home',
        points: 0
    };
    const trackLead = (h, a)=>{
        const diff = h - a;
        if (diff > biggestLead.points) biggestLead = {
            team: 'home',
            points: diff
        };
        if (-diff > biggestLead.points) biggestLead = {
            team: 'away',
            points: -diff
        };
    };
    // Pace + possession-length tuning
    const pace = gamePace(home, away);
    const avgPossessionSeconds = PACE_AVG_POSSESSION_SECONDS[pace];
    // Track which unit is on the floor for each team, plus stint progress
    let homeUnit = 'starters';
    let awayUnit = 'starters';
    let homeStintRemaining = STARTER_STINT;
    let awayStintRemaining = STARTER_STINT;
    let totalPossessions = 0;
    // ------------------------------------------------------------------
    // Regulation
    // ------------------------------------------------------------------
    for(let quarter = 1; quarter <= settings.numQuarters; quarter++){
        const quarterStart = {
            home: homeScore,
            away: awayScore
        };
        let secondsRemaining = settings.quarterLengthSeconds;
        // Possession arrow: in NBA, alternates between halves. v1 simplification:
        // home starts Q1, away starts Q2, home starts Q3, away starts Q4.
        let offenseIsHome = quarter % 2 === 1;
        while(secondsRemaining > 0){
            const offense = offenseIsHome ? home : away;
            const defense = offenseIsHome ? away : home;
            const offenseById = offenseIsHome ? homePlayerById : awayPlayerById;
            const defenseById = offenseIsHome ? awayPlayerById : homePlayerById;
            // Build lineups for the active units
            const offUnit = offenseIsHome ? homeUnit : awayUnit;
            const defUnit = offenseIsHome ? awayUnit : homeUnit;
            const offLineup = buildActiveLineup(offense, offUnit, offenseById);
            const defLineup = buildActiveLineup(defense, defUnit, defenseById);
            // Sim a possession
            const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$possession$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["simPossession"])(offLineup, defLineup, rng);
            // Clamp seconds if we'd overshoot the clock
            const secondsUsed = Math.min(result.secondsElapsed, secondsRemaining);
            secondsRemaining -= secondsUsed;
            // Accumulate stats for all 10 players on the floor (minutes + plus/minus)
            const offEffectivePoints = result.pointsScored;
            const defEffectivePoints = 0; // defense doesn't score on this possession in v1
            const pointsDelta = offEffectivePoints - defEffectivePoints;
            for (const p of offLineup.players){
                incMinutes(minutesPlayed, p.id, secondsUsed);
                addPlusMinus(boxScores, p.id, pointsDelta);
            }
            for (const p of defLineup.players){
                incMinutes(minutesPlayed, p.id, secondsUsed);
                addPlusMinus(boxScores, p.id, -pointsDelta);
            }
            // Apply stat events
            for (const e of result.events)applyStatEvent(boxScores, e);
            // Update score
            if (offenseIsHome) homeScore += result.pointsScored;
            else awayScore += result.pointsScored;
            trackLead(homeScore, awayScore);
            // Flip possession if needed
            if (result.possessionFlipsToDefense) offenseIsHome = !offenseIsHome;
            // Substitution check — decrement stint for the offensive team
            if (offenseIsHome) {
                homeStintRemaining--;
                if (homeStintRemaining <= 0) {
                    homeUnit = homeUnit === 'starters' ? 'bench' : 'starters';
                    homeStintRemaining = homeUnit === 'starters' ? STARTER_STINT : BENCH_STINT;
                }
            } else {
                awayStintRemaining--;
                if (awayStintRemaining <= 0) {
                    awayUnit = awayUnit === 'starters' ? 'bench' : 'starters';
                    awayStintRemaining = awayUnit === 'starters' ? STARTER_STINT : BENCH_STINT;
                }
            }
            totalPossessions++;
            // Safety: don't let degenerate cases run forever
            if (totalPossessions > 600) {
                secondsRemaining = 0;
                break;
            }
            // If the average possession length means we'd run negative seconds
            // ~half the time, end the quarter when remaining < half avg.
            if (secondsRemaining < avgPossessionSeconds * 0.5) break;
        }
        quarterScores.push({
            home: homeScore - quarterStart.home,
            away: awayScore - quarterStart.away
        });
    }
    // Apply home court advantage to expectation:
    // Distribute the homeAdvantage over the game by giving home a small
    // points boost at the end if the model didn't naturally produce it.
    // This is a simple v1 approach — a more realistic model would adjust
    // each possession's shot quality slightly. Skip if game already has
    // a wide margin (HCA doesn't matter then).
    // For v1, leave the raw sim score and skip explicit HCA adjustment —
    // we'll add per-possession HCA in v2 once we have more sim data to
    // calibrate against. The settings field stays for documentation.
    // ------------------------------------------------------------------
    // Overtime
    // ------------------------------------------------------------------
    let overtimePeriods = 0;
    while(homeScore === awayScore && overtimePeriods < settings.maxOvertimes){
        overtimePeriods++;
        const otStart = {
            home: homeScore,
            away: awayScore
        };
        let secondsRemaining = settings.overtimeLengthSeconds;
        // Possession arrow alternates each OT
        let offenseIsHome = overtimePeriods % 2 === 1;
        while(secondsRemaining > 0){
            const offense = offenseIsHome ? home : away;
            const defense = offenseIsHome ? away : home;
            const offenseById = offenseIsHome ? homePlayerById : awayPlayerById;
            const defenseById = offenseIsHome ? awayPlayerById : homePlayerById;
            const offUnit = offenseIsHome ? homeUnit : awayUnit;
            const defUnit = offenseIsHome ? awayUnit : homeUnit;
            const offLineup = buildActiveLineup(offense, offUnit, offenseById);
            const defLineup = buildActiveLineup(defense, defUnit, defenseById);
            const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$possession$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["simPossession"])(offLineup, defLineup, rng);
            const secondsUsed = Math.min(result.secondsElapsed, secondsRemaining);
            secondsRemaining -= secondsUsed;
            for (const p of offLineup.players){
                incMinutes(minutesPlayed, p.id, secondsUsed);
                addPlusMinus(boxScores, p.id, result.pointsScored);
            }
            for (const p of defLineup.players){
                incMinutes(minutesPlayed, p.id, secondsUsed);
                addPlusMinus(boxScores, p.id, -result.pointsScored);
            }
            for (const e of result.events)applyStatEvent(boxScores, e);
            if (offenseIsHome) homeScore += result.pointsScored;
            else awayScore += result.pointsScored;
            trackLead(homeScore, awayScore);
            if (result.possessionFlipsToDefense) offenseIsHome = !offenseIsHome;
            totalPossessions++;
            if (secondsRemaining < avgPossessionSeconds * 0.5) break;
        }
        quarterScores.push({
            home: homeScore - otStart.home,
            away: awayScore - otStart.away
        });
    }
    // ------------------------------------------------------------------
    // Finalize box scores: convert minutes to game stats + gamesPlayed
    // ------------------------------------------------------------------
    const finalBoxScores = {};
    for (const [playerId, stats] of boxScores){
        const mins = Math.round((minutesPlayed.get(playerId) ?? 0) / 60);
        const withMinutesAndGame = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["addBasketballStats"])(stats, {
            minutes: mins,
            gamesPlayed: 1,
            gamesStarted: isStarter(home, away, playerId) ? 1 : 0
        });
        finalBoxScores[playerId] = withMinutesAndGame;
    }
    // Also ensure all starters get a record even if they had no events
    // (very rare but possible in edge cases)
    for (const side of [
        home,
        away
    ]){
        for (const starterId of side.lineup.starters){
            if (!finalBoxScores[starterId]) {
                finalBoxScores[starterId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["addBasketballStats"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["emptyBasketballStats"])(), {
                    gamesPlayed: 1,
                    gamesStarted: 1,
                    minutes: Math.round((minutesPlayed.get(starterId) ?? 0) / 60)
                });
            }
        }
    }
    const gameData = {
        pace,
        totalPossessions,
        periodsPlayed: settings.numQuarters + overtimePeriods,
        wentToOvertime: overtimePeriods > 0,
        quarterScores,
        biggestLead
    };
    return {
        id: context.gameId,
        season: context.season,
        competitionId: context.competitionId,
        date: context.date,
        homeTeamId: home.teamId,
        awayTeamId: away.teamId,
        status: 'played',
        finalScore: {
            home: homeScore,
            away: awayScore
        },
        boxScores: finalBoxScores,
        sportData: gameData
    };
}
// ===========================================================================
// Helpers
// ===========================================================================
function buildPlayerMap(players) {
    const m = new Map();
    for (const p of players)m.set(p.id, p);
    return m;
}
function applyStatEvent(boxScores, e) {
    const cur = boxScores.get(e.playerId) ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["emptyBasketballStats"])();
    const updated = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["addBasketballStats"])(cur, {
        [e.field]: e.delta ?? 1
    });
    boxScores.set(e.playerId, updated);
}
function incMinutes(minutes, id, seconds) {
    minutes.set(id, (minutes.get(id) ?? 0) + seconds);
}
function addPlusMinus(boxScores, id, delta) {
    if (delta === 0) return;
    const cur = boxScores.get(id) ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["emptyBasketballStats"])();
    const updated = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["addBasketballStats"])(cur, {
        plusMinus: delta
    });
    boxScores.set(id, updated);
}
function isStarter(home, away, playerId) {
    return home.lineup.starters.includes(playerId) || away.lineup.starters.includes(playerId);
}
function simBasketballGameSimple(home, away, rngSeed = 'default-seed') {
    return simBasketballGame(home, away, {
        gameId: 'g-test',
        season: 2026,
        date: '2026-10-22',
        competitionId: 'primary',
        isPlayoff: false,
        rngSeed
    });
}
}),
"[project]/packages/sport-basketball/src/sim/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/sim — basketball simulation engine.
 *
 * Public surface for the v1 box-score sim. The game loop (game.ts, coming
 * next) composes these into full-game simulations.
 *
 * Architecture:
 *   - rng.ts: deterministic seeded PRNG
 *   - shotModel.ts: shot type selection + make probability
 *   - possession.ts: single-possession resolver (composes shot model + rebound)
 *   - game.ts (TODO): full-game loop wrapping ~200 possessions
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$rng$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/sim/rng.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$shotModel$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/sim/shotModel.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$possession$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/sim/possession.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$game$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/sim/game.ts [app-rsc] (ecmascript)");
;
;
;
;
}),
"[project]/packages/sport-basketball/src/playerGen/names.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * First and last name pools for basketball player generation.
 *
 * Mix is curated to reflect modern NBA demographics: heavily
 * African-American names (the largest group of US-born NBA players),
 * plus international names from the regions producing the most NBA
 * players today (Eastern Europe, sub-Saharan Africa, Spain/Portugal,
 * Caribbean, and France/Australia/Canada).
 *
 * Names are public — drawn from common-name lists, not specific real
 * players. Combinations across 400+ first × 400+ last give ~160k
 * unique full names, well beyond what a multi-year league needs.
 */ __turbopack_context__.s([
    "FIRST_NAMES",
    ()=>FIRST_NAMES,
    "LAST_NAMES",
    ()=>LAST_NAMES,
    "randomFirstName",
    ()=>randomFirstName,
    "randomLastName",
    ()=>randomLastName,
    "randomName",
    ()=>randomName
]);
const FIRST_NAMES = [
    // Common contemporary US (Black + White)
    'James',
    'Marcus',
    'Darius',
    'Tyrell',
    'Brandon',
    'Justin',
    'DeAndre',
    'Malik',
    'Chris',
    'Kevin',
    'Jordan',
    'Tyler',
    'Cameron',
    'Jaylen',
    'Trevon',
    'Lamar',
    'Patrick',
    'Josh',
    'Derrick',
    'Jalen',
    'Travis',
    'Micah',
    'Davante',
    'Saquon',
    'Kyler',
    'Joe',
    'Garrett',
    'Myles',
    'Nick',
    'Aidan',
    'Caleb',
    'Drake',
    'Christian',
    'Tyreek',
    'Stefon',
    'AJ',
    'Mike',
    'Terry',
    'George',
    'TJ',
    'Brian',
    'Tremaine',
    'Xavier',
    'Denzel',
    'Marlon',
    'Marshon',
    'Ahmad',
    'Jamal',
    'Jessie',
    'Minkah',
    'Derwin',
    'Kyle',
    'Antoine',
    'Harrison',
    'Eric',
    'Andre',
    'Devin',
    'Trent',
    'Penei',
    'Lane',
    'Tyron',
    'Zack',
    'Joel',
    'Creed',
    'Frank',
    'Jason',
    'Corey',
    'Alex',
    'David',
    'Tristan',
    'Andrew',
    'Trevor',
    'Matt',
    'Aaron',
    'Cooper',
    'Bryce',
    'Anthony',
    'Marvin',
    'Keenan',
    'Jayden',
    'Terrell',
    'Darnell',
    'Khalil',
    'Deion',
    'Jaylon',
    'Montez',
    'Demetrius',
    'Tavon',
    'Rashad',
    'Kendall',
    'Isaiah',
    'Elijah',
    'Noah',
    'Liam',
    'Ethan',
    'Mason',
    // Basketball-flavored US names (steph, kawhi, etc. archetypes — generic forms)
    'Stephen',
    'Klay',
    'Damian',
    'Devin',
    'Donovan',
    'Trae',
    'Ja',
    'Anthony',
    'Zion',
    'Paolo',
    'Jabari',
    'Jaden',
    'Cade',
    'Scoot',
    'Bennedict',
    'Brandon',
    'Reed',
    'Cole',
    'Tari',
    'Bilal',
    'Keegan',
    'Bones',
    'Buddy',
    'Anfernee',
    'Naz',
    'Bruce',
    'Wendell',
    'Onyeka',
    'Coby',
    'Patrick',
    'Romeo',
    'Saddiq',
    'Lonnie',
    'Dejounte',
    'Devonte',
    'Tre',
    'Tyrese',
    'Immanuel',
    'Aaron',
    'Quentin',
    'Bones',
    'RJ',
    'TJ',
    'PJ',
    'CJ',
    'KJ',
    'AJ',
    'BJ',
    'De\'Aaron',
    'D\'Angelo',
    'De\'Anthony',
    'Ja\'Marr',
    'O\'Shae',
    'Ke\'Bryan',
    // International — Eastern European
    'Luka',
    'Nikola',
    'Goran',
    'Bojan',
    'Dario',
    'Bogdan',
    'Ivan',
    'Marko',
    'Vlatko',
    'Vasilije',
    'Aleksej',
    'Dragan',
    'Stefan',
    'Davor',
    'Dragan',
    'Tomas',
    'Vladimir',
    'Pavel',
    'Dario',
    'Miroslav',
    'Slobodan',
    'Jovan',
    'Domantas',
    'Jonas',
    'Sarunas',
    'Mantas',
    'Donatas',
    'Linas',
    'Arvydas',
    'Kristaps',
    'Davis',
    'Janis',
    'Rolands',
    'Andris',
    // International — Western European
    'Nicolas',
    'Theo',
    'Frank',
    'Killian',
    'Bilal',
    'Sekou',
    'Ousmane',
    'Evan',
    'Rudy',
    'Vincent',
    'Joel',
    'Adam',
    'Yves',
    'Boris',
    'Ricky',
    'Sergio',
    'Pau',
    'Marc',
    'Juancho',
    'Rudy',
    'Alex',
    'Willy',
    'Dario',
    'Santi',
    'Lorenzo',
    'Danilo',
    'Marco',
    'Andrea',
    'Stefano',
    'Gianluca',
    'Achille',
    'Dennis',
    'Maxi',
    'Daniel',
    'Tibor',
    'Isaiah',
    // International — African (West + Central)
    'Joel',
    'Pascal',
    'Serge',
    'Bismack',
    'Cheick',
    'Ibou',
    'Mamadi',
    'Souleymane',
    'Salif',
    'Cheick',
    'Onuralp',
    'Furkan',
    'Cedi',
    'Alperen',
    'Omer',
    'Hamidou',
    'Hassan',
    'Khalifa',
    'Sekou',
    'Boubacar',
    // International — Australian + Canadian
    'Patty',
    'Ben',
    'Joe',
    'Josh',
    'Matthew',
    'Jock',
    'Dyson',
    'Andrew',
    'Shai',
    'Jamal',
    'Dillon',
    'Andrew',
    'Lu',
    'Cory',
    'Nickeil',
    'Tristan',
    'RJ',
    'Olivier',
    'Bennedict',
    'Caleb',
    'Brandon',
    'Khem',
    // International — Caribbean / Latin American
    'Karl-Anthony',
    'Andre',
    'Al',
    'JJ',
    'Tyler',
    'Jose',
    'Pau',
    'Charlie',
    'Anderson',
    'Bruno',
    'Rafael',
    'Cristiano',
    'Vitor',
    'Tiago',
    'Felipe',
    // More US contemporary
    'Russell',
    'Kemba',
    'Markelle',
    'Lonzo',
    'De\'Aaron',
    'Jonathan',
    'Mikal',
    'Dillon',
    'Robert',
    'Davion',
    'Tyrese',
    'Coby',
    'Coby',
    'Cassius',
    'Hamidou',
    'Theo',
    'Romeo',
    'Brandon',
    'Saddiq',
    'Talen',
    'Kira',
    'Tyrese',
    'Jaylin',
    'Cole',
    'Wendell',
    'Mfiondu',
    'Tre',
    'Naz',
    'James',
    'Devontae'
];
const LAST_NAMES = [
    // Common US surnames
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Davis',
    'Miller',
    'Wilson',
    'Moore',
    'Taylor',
    'Anderson',
    'Thomas',
    'Jackson',
    'White',
    'Harris',
    'Martin',
    'Thompson',
    'Robinson',
    'Clark',
    'Lewis',
    'Walker',
    'Hall',
    'Young',
    'King',
    'Wright',
    'Scott',
    'Green',
    'Adams',
    'Baker',
    'Hill',
    'Carter',
    'Mitchell',
    'Perez',
    'Roberts',
    'Turner',
    'Phillips',
    'Campbell',
    'Parker',
    'Evans',
    'Edwards',
    'Collins',
    'Stewart',
    'Sanchez',
    'Morris',
    'Rogers',
    'Reed',
    'Cook',
    'Morgan',
    'Bell',
    'Murphy',
    'Bailey',
    'Rivera',
    'Cooper',
    'Richardson',
    'Cox',
    'Howard',
    'Ward',
    'Torres',
    'Peterson',
    'Gray',
    'Ramirez',
    'James',
    'Watson',
    'Brooks',
    'Kelly',
    'Sanders',
    'Price',
    'Bennett',
    'Wood',
    'Barnes',
    'Ross',
    'Henderson',
    'Coleman',
    'Jenkins',
    'Perry',
    'Powell',
    'Long',
    'Patterson',
    'Hughes',
    'Flores',
    'Washington',
    'Butler',
    'Simmons',
    'Foster',
    'Gonzales',
    'Bryant',
    'Alexander',
    'Russell',
    'Griffin',
    'Diaz',
    'Hayes',
    'Myers',
    'Ford',
    'Hamilton',
    'Graham',
    'Sullivan',
    'Wallace',
    'Woods',
    'Cole',
    'West',
    'Owens',
    'Reynolds',
    'Fisher',
    'Ellis',
    'Harrison',
    'Gibson',
    'McDonald',
    'Cruz',
    'Marshall',
    'Ortiz',
    'Gomez',
    'Murray',
    'Freeman',
    'Wells',
    'Webb',
    'Simpson',
    'Stevens',
    'Tucker',
    'Porter',
    'Hunter',
    'Hicks',
    'Crawford',
    'Henry',
    'Boyd',
    'Mason',
    'Morales',
    'Kennedy',
    'Warren',
    'Dixon',
    'Ramos',
    'Reyes',
    'Burns',
    'Gordon',
    'Shaw',
    'Holmes',
    'Rice',
    'Robertson',
    'Hunt',
    'Black',
    'Daniels',
    'Palmer',
    'Mills',
    'Nichols',
    'Grant',
    'Knight',
    'Ferguson',
    'Rose',
    'Stone',
    'Hawkins',
    'Dunn',
    'Perkins',
    'Hudson',
    'Spencer',
    // Common Black surnames (more represented in NBA)
    'Banks',
    'Burnett',
    'Charles',
    'Crawford',
    'Dawson',
    'Dixon',
    'Dudley',
    'Duncan',
    'Edwards',
    'Foreman',
    'Franklin',
    'Freeman',
    'Gaines',
    'Grant',
    'Greene',
    'Gresham',
    'Hampton',
    'Hardaway',
    'Harvey',
    'Holman',
    'Holiday',
    'Hudson',
    'Hunter',
    'Iverson',
    'Jefferson',
    'Lawson',
    'Mosley',
    'Nelson',
    'Parker',
    'Patton',
    'Richmond',
    'Singleton',
    'Stevenson',
    'Townsend',
    'Tubbs',
    'Tyler',
    'Vance',
    'Walls',
    'Washington',
    'Whitley',
    'Whitfield',
    'Wilkins',
    'Wilkerson',
    'Williamson',
    'Worthy',
    // International — Eastern European
    'Doncic',
    'Jokic',
    'Bogdanovic',
    'Dragic',
    'Vucevic',
    'Saric',
    'Petrovic',
    'Stojakovic',
    'Divac',
    'Kukoc',
    'Radmanovic',
    'Tsamis',
    'Spanoulis',
    'Antetokounmpo',
    'Calathes',
    'Papagiannis',
    'Sloukas',
    'Mantzaris',
    'Sabonis',
    'Maciulis',
    'Valanciunas',
    'Kuzminskas',
    'Motiejunas',
    'Porzingis',
    'Bertans',
    'Strelnieks',
    'Timma',
    'Blums',
    // International — Western European
    'Gobert',
    'Fournier',
    'Batum',
    'Diaw',
    'Parker',
    'Pietrus',
    'Diallo',
    'Ntilikina',
    'Doumbouya',
    'Hayes',
    'Wembanyama',
    'Coulibaly',
    'Risacher',
    'Gasol',
    'Rubio',
    'Calderon',
    'Ibaka',
    'Hernangomez',
    'Mirotic',
    'Llull',
    'Doncic',
    'Pesic',
    'Markkanen',
    'Saric',
    'Bertans',
    'Jovic',
    'Belinelli',
    'Datome',
    'Gallinari',
    'Bargnani',
    'Mancinelli',
    'Melli',
    'Schroder',
    'Pleiss',
    'Theis',
    'Wagner',
    'Hartenstein',
    'Hauser',
    'Garino',
    // International — African
    'Olajuwon',
    'Mutombo',
    'Oyedeji',
    'Diakite',
    'Onuaku',
    'Nnaji',
    'Achiuwa',
    'Awad',
    'Adebayo',
    'Okoro',
    'Okafor',
    'Aminu',
    'Oladipo',
    'Ujiri',
    'Maker',
    'Bol',
    'Wagner',
    'Diop',
    'Sengun',
    'Korkmaz',
    'Osman',
    // International — Australian / Pacific
    'Mills',
    'Bogut',
    'Dellavedova',
    'Simmons',
    'Exum',
    'Ingles',
    'Maker',
    'Daniels',
    'Sotto',
    'Clarke',
    'Murray',
    'Achiuwa',
    'Powell',
    'Yeboah',
    // International — Caribbean / Latin
    'Towns',
    'Drummond',
    'Holiday',
    'Anthony',
    'Carmelo',
    'Rondo',
    'Garnett',
    'Splitter',
    'Scola',
    'Nocioni',
    'Ginobili',
    'Delfino',
    'Campazzo',
    'Varejao',
    'Barbosa',
    'Augusto',
    'Felicio',
    'Huertas',
    'Limonta'
];
function randomFirstName() {
    return FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
}
function randomLastName() {
    return LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
}
function randomName() {
    return {
        firstName: randomFirstName(),
        lastName: randomLastName()
    };
}
}),
"[project]/packages/sport-basketball/src/playerGen/playerGen.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Basketball player generator.
 *
 * Produces realistic fictional players with position-appropriate ratings,
 * heights, wingspans, and ages.
 *
 * Mirrors the football playerGen pattern from apps/web/src/lib/engine/playerGen.ts
 * but with basketball-specific shape:
 *   - Heights matter much more (Cs ~82in / 6'10", PGs ~74in / 6'2")
 *   - Wingspan tracked separately (usually height + 2 to +6 inches)
 *   - Position-weighted ratings: PGs care about handles/passing/3PT,
 *     Cs care about interior defense/rebounding/finishing
 *   - Star tier derived from overall (superstar 95+, star 88-94, etc.)
 *
 * The generator hits a target overall rating by scaling individual ratings
 * up/down after the position-typical sample. This gives realistic spread
 * within a tier while letting callers ask for "give me a 92 OVR center"
 * for fixtures, draft classes, and roster building.
 */ __turbopack_context__.s([
    "computeOverall",
    ()=>computeOverall,
    "generateBasketballDraftClass",
    ()=>generateBasketballDraftClass,
    "generateBasketballPlayer",
    ()=>generateBasketballPlayer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/types/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$playerGen$2f$names$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/playerGen/names.ts [app-rsc] (ecmascript)");
;
;
function generateBasketballPlayer(opts = {}) {
    const position = opts.position ?? pickPositionByDistribution();
    const age = opts.age ?? pickAgeByDistribution();
    const targetOvr = opts.targetOverall ?? sampleOverallNormal();
    const name = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$playerGen$2f$names$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["randomName"])();
    // Generate raw ratings from position template + variance
    let ratings = generateRatingsForPosition(position, targetOvr);
    // Compute actual OVR from individual ratings
    let actualOvr = computeOverall(ratings, position);
    // If we missed the target by more than ±2, scale ratings to hit it.
    // (Position weights mean that even after sampling around targetOvr,
    // the computed OVR can drift up or down.)
    if (Math.abs(actualOvr - targetOvr) > 2) {
        const shift = targetOvr - actualOvr;
        ratings = shiftRatings(ratings, shift);
        actualOvr = computeOverall(ratings, position);
    }
    ratings.overall = actualOvr;
    // Height + wingspan
    const height = generateHeight(position);
    ratings.height = height;
    ratings.wingspan = generateWingspan(height);
    // Derive star tier from overall
    const starTier = deriveStarTier(actualOvr);
    // Years in league based on age (NBA draft eligibility = 19; rookies have 0)
    const yearsInLeague = Math.max(0, age - 19);
    const sportData = {
        position,
        starTier,
        yearsInLeague,
        birdRights: 'none',
        isTwoWay: false,
        shootingHand: Math.random() < 0.1 ? 'left' : 'right'
    };
    const playerId = opts.idOverride ?? generatePlayerId();
    return {
        id: playerId,
        firstName: name.firstName,
        lastName: name.lastName,
        birthDate: birthDateFromAge(age),
        age,
        nationality: pickNationality(),
        kind: 'standard',
        ratings,
        seasonStats: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["emptyBasketballStats"])(),
        careerStats: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["emptyBasketballStats"])(),
        contract: null,
        rosterSlot: null,
        injury: null,
        development: {
            potential: Math.min(99, actualOvr + Math.round(rollPotentialGap(age))),
            currentTrajectory: 'plateau',
            seasonsAtCurrentTrajectory: 1
        },
        sportData
    };
}
const POSITION_RATING_MEANS = {
    PG: {
        speed: 78,
        strength: 65,
        vertical: 73,
        threePoint: 72,
        midRange: 70,
        finishing: 68,
        freeThrow: 78,
        postScoring: 50,
        handles: 82,
        passing: 78,
        perimeterDefense: 72,
        interiorDefense: 55,
        rebounding: 50,
        steal: 70,
        block: 45,
        basketballIQ: 72,
        intangibles: 70
    },
    SG: {
        speed: 76,
        strength: 70,
        vertical: 75,
        threePoint: 75,
        midRange: 72,
        finishing: 70,
        freeThrow: 78,
        postScoring: 55,
        handles: 76,
        passing: 68,
        perimeterDefense: 72,
        interiorDefense: 58,
        rebounding: 55,
        steal: 68,
        block: 50,
        basketballIQ: 70,
        intangibles: 70
    },
    SF: {
        speed: 73,
        strength: 73,
        vertical: 76,
        threePoint: 72,
        midRange: 70,
        finishing: 73,
        freeThrow: 75,
        postScoring: 60,
        handles: 70,
        passing: 67,
        perimeterDefense: 70,
        interiorDefense: 65,
        rebounding: 65,
        steal: 65,
        block: 58,
        basketballIQ: 70,
        intangibles: 70
    },
    PF: {
        speed: 68,
        strength: 78,
        vertical: 74,
        threePoint: 65,
        midRange: 68,
        finishing: 76,
        freeThrow: 72,
        postScoring: 70,
        handles: 60,
        passing: 60,
        perimeterDefense: 62,
        interiorDefense: 74,
        rebounding: 76,
        steal: 60,
        block: 68,
        basketballIQ: 70,
        intangibles: 70
    },
    C: {
        speed: 62,
        strength: 82,
        vertical: 70,
        threePoint: 55,
        midRange: 62,
        finishing: 80,
        freeThrow: 68,
        postScoring: 75,
        handles: 52,
        passing: 58,
        perimeterDefense: 58,
        interiorDefense: 80,
        rebounding: 80,
        steal: 55,
        block: 75,
        basketballIQ: 70,
        intangibles: 70
    }
};
/** Standard deviation for rating sampling. Higher SD = more variance. */ const RATING_STD_DEV = 8;
function generateRatingsForPosition(position, targetOvr) {
    const means = POSITION_RATING_MEANS[position];
    // Shift means up/down based on target overall vs league avg (70)
    const ovrShift = targetOvr - 70;
    const sample = (mean)=>{
        const value = mean + ovrShift + gaussian(0, RATING_STD_DEV);
        return clamp(Math.round(value), 25, 99);
    };
    return {
        overall: 0,
        height: 0,
        wingspan: 0,
        speed: sample(means.speed),
        strength: sample(means.strength),
        vertical: sample(means.vertical),
        threePoint: sample(means.threePoint),
        midRange: sample(means.midRange),
        finishing: sample(means.finishing),
        freeThrow: sample(means.freeThrow),
        postScoring: sample(means.postScoring),
        handles: sample(means.handles),
        passing: sample(means.passing),
        perimeterDefense: sample(means.perimeterDefense),
        interiorDefense: sample(means.interiorDefense),
        rebounding: sample(means.rebounding),
        steal: sample(means.steal),
        block: sample(means.block),
        basketballIQ: sample(means.basketballIQ),
        intangibles: sample(means.intangibles)
    };
}
// ===========================================================================
// Overall computation (position-weighted)
// ===========================================================================
/** Rating weights per position — higher weight = more important for OVR. */ const POSITION_OVR_WEIGHTS = {
    PG: {
        handles: 3,
        passing: 3,
        threePoint: 2,
        basketballIQ: 2,
        perimeterDefense: 2,
        speed: 1,
        finishing: 1
    },
    SG: {
        threePoint: 3,
        finishing: 2,
        midRange: 2,
        handles: 2,
        perimeterDefense: 2,
        speed: 1,
        basketballIQ: 1
    },
    SF: {
        threePoint: 2,
        finishing: 2,
        perimeterDefense: 2,
        rebounding: 1,
        handles: 1,
        basketballIQ: 2,
        intangibles: 1
    },
    PF: {
        finishing: 2,
        rebounding: 3,
        interiorDefense: 2,
        threePoint: 1,
        postScoring: 2,
        strength: 1,
        block: 1
    },
    C: {
        finishing: 2,
        rebounding: 3,
        interiorDefense: 3,
        block: 2,
        postScoring: 2,
        strength: 1
    }
};
const ALL_RATING_KEYS_FOR_OVR = [
    'speed',
    'strength',
    'vertical',
    'threePoint',
    'midRange',
    'finishing',
    'freeThrow',
    'postScoring',
    'handles',
    'passing',
    'perimeterDefense',
    'interiorDefense',
    'rebounding',
    'steal',
    'block',
    'basketballIQ',
    'intangibles'
];
function computeOverall(ratings, position) {
    const weights = POSITION_OVR_WEIGHTS[position];
    let weightedSum = 0;
    let totalWeight = 0;
    for (const key of ALL_RATING_KEYS_FOR_OVR){
        const w = weights[key] ?? 0.3; // ratings not in weights still contribute a little
        weightedSum += ratings[key] * w;
        totalWeight += w;
    }
    return clamp(Math.round(weightedSum / totalWeight), 40, 99);
}
// ===========================================================================
// Helpers
// ===========================================================================
function shiftRatings(ratings, shift) {
    return {
        ...ratings,
        speed: clamp(ratings.speed + shift, 25, 99),
        strength: clamp(ratings.strength + shift, 25, 99),
        vertical: clamp(ratings.vertical + shift, 25, 99),
        threePoint: clamp(ratings.threePoint + shift, 25, 99),
        midRange: clamp(ratings.midRange + shift, 25, 99),
        finishing: clamp(ratings.finishing + shift, 25, 99),
        freeThrow: clamp(ratings.freeThrow + shift, 25, 99),
        postScoring: clamp(ratings.postScoring + shift, 25, 99),
        handles: clamp(ratings.handles + shift, 25, 99),
        passing: clamp(ratings.passing + shift, 25, 99),
        perimeterDefense: clamp(ratings.perimeterDefense + shift, 25, 99),
        interiorDefense: clamp(ratings.interiorDefense + shift, 25, 99),
        rebounding: clamp(ratings.rebounding + shift, 25, 99),
        steal: clamp(ratings.steal + shift, 25, 99),
        block: clamp(ratings.block + shift, 25, 99),
        basketballIQ: clamp(ratings.basketballIQ + shift, 25, 99),
        intangibles: clamp(ratings.intangibles + shift, 25, 99)
    };
}
function clamp(n, min, max) {
    return Math.round(Math.max(min, Math.min(max, n)));
}
/** Box-Muller normal sampling. */ function gaussian(mean, stdDev) {
    const u1 = Math.random();
    const u2 = Math.random();
    return mean + stdDev * Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2);
}
/** Position distribution roughly mirrors NBA roster composition.
 *  Slight bias toward wings (SF) and guards. */ function pickPositionByDistribution() {
    const weights = {
        PG: 22,
        SG: 22,
        SF: 22,
        PF: 18,
        C: 16
    };
    const total = Object.values(weights).reduce((s, w)=>s + w, 0);
    let r = Math.random() * total;
    for (const pos of __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["BASKETBALL_POSITIONS"]){
        r -= weights[pos];
        if (r <= 0) return pos;
    }
    return 'SF';
}
/** Age distribution — peaks around 25-28, tails toward 19 (rookies) and 35 (vets). */ function pickAgeByDistribution() {
    // Realistic NBA age distribution. Sample then clamp 19-40.
    const age = Math.round(gaussian(26, 4));
    return Math.max(19, Math.min(40, age));
}
/** Overall rating distribution — most players cluster 65-75, with a long
 *  tail for stars. */ function sampleOverallNormal() {
    const sample = gaussian(70, 7);
    return clamp(Math.round(sample), 50, 95);
}
function deriveStarTier(overall) {
    if (overall >= 95) return 'superstar';
    if (overall >= 88) return 'star';
    if (overall >= 80) return 'starter';
    if (overall >= 73) return 'role';
    return 'bench';
}
/** Height in inches, position-typical. NBA averages by position:
 *  PG ~74in (6'2"), SG ~77in (6'5"), SF ~79in (6'7"),
 *  PF ~81in (6'9"), C ~82in (6'10"). */ const POSITION_HEIGHT_MEANS = {
    PG: 74,
    SG: 77,
    SF: 80,
    PF: 82,
    C: 84
};
const HEIGHT_STD_DEV = 1.5;
function generateHeight(position) {
    const mean = POSITION_HEIGHT_MEANS[position];
    const h = Math.round(gaussian(mean, HEIGHT_STD_DEV));
    return Math.max(68, Math.min(91, h));
}
/** Wingspan in inches. Usually height + 2 to +6, with elite defenders
 *  having +8 or more. */ function generateWingspan(height) {
    const diff = Math.round(2 + gaussian(2, 1.5));
    return Math.max(height - 1, height + diff);
}
/** Higher potential gap for younger players (more room to grow). Returns
 *  a value 0-15 to add to current OVR for the player's potential. */ function rollPotentialGap(age) {
    if (age >= 30) return Math.max(0, gaussian(1, 1));
    if (age >= 27) return Math.max(0, gaussian(3, 2));
    if (age >= 24) return Math.max(0, gaussian(5, 3));
    if (age >= 21) return Math.max(0, gaussian(8, 3));
    return Math.max(0, gaussian(12, 4));
}
function pickNationality() {
    // NBA is ~78% US, ~22% international. Reflect that distribution.
    if (Math.random() < 0.78) return 'US';
    const intl = [
        'CA',
        'FR',
        'AU',
        'SR',
        'ES',
        'GR',
        'LT',
        'DE',
        'GB',
        'NG',
        'CM',
        'TR',
        'IT',
        'CZ',
        'CN',
        'LV',
        'RS'
    ];
    return intl[Math.floor(Math.random() * intl.length)];
}
function birthDateFromAge(age) {
    // Approximate: assume current "season year" is some recent year. Use
    // simple subtract-from-now. This is just for display; the engine uses
    // age, not birthDate, for game logic.
    const today = new Date();
    const birthYear = today.getFullYear() - age;
    // Random month/day (1-28 to avoid month-end edge cases)
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    return `${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
let nextPlayerIdCounter = 0;
function generatePlayerId() {
    return `bball-p-${Date.now()}-${nextPlayerIdCounter++}`;
}
function generateBasketballDraftClass(_season, count = 60) {
    // _season is unused in v1 — future enhancement could vary class strength
    // by year (some drafts are deeper than others, mirroring real NBA cycles).
    const prospects = [];
    for(let i = 0; i < count; i++){
        // Talent distribution: pick a target overall from a skewed distribution
        const r = Math.random();
        let targetOvr;
        if (r < 0.03) targetOvr = Math.round(82 + Math.random() * 7); // top 3 — superstars
        else if (r < 0.12) targetOvr = Math.round(76 + Math.random() * 8); // lottery talent
        else if (r < 0.35) targetOvr = Math.round(70 + Math.random() * 7); // future starters
        else if (r < 0.70) targetOvr = Math.round(64 + Math.random() * 7); // role/rotation
        else targetOvr = Math.round(58 + Math.random() * 7); // fringe
        prospects.push(generateBasketballPlayer({
            age: 19,
            targetOverall: targetOvr
        }));
    }
    // Position in array implicitly corresponds to scouting rank. Real
    // draft ordering comes from the draft system, not here.
    return prospects;
}
}),
"[project]/packages/sport-basketball/src/playerGen/colleges.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Source-of-development pool for basketball players. Used for the
 * "college" field on draft prospects.
 *
 * Mix reflects modern NBA pipeline: heavy on US college basketball blue-bloods,
 * plus the G-League Ignite-style alternate paths, plus international clubs
 * and academies that have been NBA feeders in the past decade.
 */ __turbopack_context__.s([
    "SOURCES_OF_DEVELOPMENT",
    ()=>SOURCES_OF_DEVELOPMENT,
    "randomSourceOfDevelopment",
    ()=>randomSourceOfDevelopment
]);
const SOURCES_OF_DEVELOPMENT = [
    // US college blue-bloods (most NBA prospects)
    'Duke',
    'Kentucky',
    'North Carolina',
    'Kansas',
    'UCLA',
    'Arizona',
    'Michigan',
    'Michigan State',
    'Indiana',
    'Louisville',
    'Florida',
    'Georgetown',
    'Syracuse',
    'Connecticut',
    'Villanova',
    'Gonzaga',
    'Memphis',
    'Houston',
    'Texas',
    'Baylor',
    // Power conferences
    'Ohio State',
    'Wisconsin',
    'Purdue',
    'Illinois',
    'Maryland',
    'Iowa',
    'Tennessee',
    'Auburn',
    'Alabama',
    'Arkansas',
    'LSU',
    'Mississippi State',
    'Oklahoma',
    'Oklahoma State',
    'TCU',
    'Kansas State',
    'West Virginia',
    'USC',
    'Oregon',
    'Stanford',
    'California',
    'Washington',
    'Utah',
    'Colorado',
    'Florida State',
    'Miami (FL)',
    'Virginia',
    'Virginia Tech',
    'NC State',
    'Wake Forest',
    'Boston College',
    'Pittsburgh',
    'Notre Dame',
    'Clemson',
    // Mid-major NBA feeders
    'Saint Mary\'s',
    'Davidson',
    'Murray State',
    'Wichita State',
    'Creighton',
    'Xavier',
    'Butler',
    'Marquette',
    'Saint Joseph\'s',
    'Dayton',
    'VCU',
    'San Diego State',
    'Nevada',
    'New Mexico',
    'BYU',
    'Gonzaga',
    // G-League Ignite-style alternate paths
    'G League Ignite',
    'Overtime Elite',
    'NBA Academy',
    'Real Madrid Academy',
    // International — Spain (top European pipeline)
    'Real Madrid',
    'FC Barcelona',
    'Valencia Basket',
    'Baskonia',
    'Joventut',
    // International — France
    'ASVEL',
    'Pau-Orthez',
    'Limoges CSP',
    'Le Mans',
    'Metropolitans 92',
    'INSEP',
    // International — Germany
    'Alba Berlin',
    'Bayern Munich',
    'Brose Bamberg',
    'Ratiopharm Ulm',
    // International — Italy
    'Olimpia Milano',
    'Virtus Bologna',
    'Reyer Venezia',
    // International — Lithuania
    'Zalgiris Kaunas',
    'Lietuvos Rytas',
    // International — Serbia / Balkans
    'Crvena Zvezda',
    'Partizan Belgrade',
    'Mega Basket',
    'Buducnost',
    // International — Greece / Turkey
    'Olympiacos',
    'Panathinaikos',
    'Anadolu Efes',
    'Fenerbahce',
    'Galatasaray',
    // International — Australia (NBL feeds)
    'NBL Next Stars',
    'Sydney Kings',
    'Melbourne United',
    'Perth Wildcats',
    'Adelaide 36ers',
    'NZ Breakers',
    // International — Canada
    'Canada Basketball',
    'Athlete Institute',
    // International — Senegal / Africa
    'NBA Academy Africa',
    'BAL',
    'AS Douanes',
    // Direct-from-HS (rare but real — Ohama Banchero, LaMelo Ball path)
    'High School (direct)',
    'Prep / Reclassified'
];
function randomSourceOfDevelopment() {
    return SOURCES_OF_DEVELOPMENT[Math.floor(Math.random() * SOURCES_OF_DEVELOPMENT.length)];
}
}),
"[project]/packages/sport-basketball/src/playerGen/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/playerGen — player generation.
 *
 * Public surface for generating basketball players and draft classes.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$playerGen$2f$playerGen$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/playerGen/playerGen.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$playerGen$2f$names$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/playerGen/names.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$playerGen$2f$colleges$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/playerGen/colleges.ts [app-rsc] (ecmascript)");
;
;
;
}),
"[project]/packages/sport-basketball/src/scheduleGenerator/scheduleGenerator.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * NBA-style 82-game schedule generator.
 *
 * For each team:
 *   - 4 games vs each of 4 division rivals (4 × 4 = 16 games)
 *   - 4 games vs each of 6 other teams in the same conference, 3 games
 *     vs each of the other 4 same-conference teams (6×4 + 4×3 = 36 games)
 *   - 2 games vs each of 15 opposite-conference teams (15 × 2 = 30 games)
 *   Total: 16 + 36 + 30 = 82 games per team
 *
 * Home/away split is 41/41 per team.
 *
 * Calendar:
 *   - Regular season starts late October, ends mid-April (~170 days)
 *   - Each team plays ~82 games over those days = ~3.5 games/week
 *   - No back-to-back-to-back (no team plays 3 games in 3 nights)
 *   - Back-to-backs allowed (real NBA averages 11-14 per team per season)
 *
 * v1 design notes:
 *   - The "3-vs-4" split for same-conference non-division opponents is
 *     pseudo-random in v1 (real NBA cycles which 6 vs 4 each year based
 *     on prior standings). v2 can wire prior-season records in.
 *   - No nationally-televised game targeting (e.g., Christmas Day games,
 *     opening night). All games are equal-priority in v1.
 *   - No arena availability constraints. Each team has a home slot every
 *     day they're scheduled at home — no concert-blocking conflicts.
 *   - No All-Star break carve-out. Schedule is uniform Oct-Apr.
 */ __turbopack_context__.s([
    "generateBasketballSchedule",
    ()=>generateBasketballSchedule
]);
// ===========================================================================
// Constants
// ===========================================================================
/** Games per opponent. */ const GAMES_VS_DIVISION_RIVAL = 4;
const GAMES_VS_OPPOSITE_CONFERENCE = 2;
/** Per same-conference non-division opponent. NBA actually does 3 vs 6 of
 *  them and 4 vs the other 4, totaling 18+16 = 34 same-conf non-div games.
 *  Combined with 16 division games and 30 opposite-conf games = 80.
 *  Plus 2 extra games handled via "play-in" / NBA Cup style additions.
 *  For v1 simplicity, we use 4-vs-6 and 3-vs-4 to hit exactly 82. */ const GAMES_VS_SAME_CONF_HEAVY = 4;
const GAMES_VS_SAME_CONF_LIGHT = 3;
/** Calendar: ~170 days. Real NBA season opens mid-October, ends mid-April. */ const SEASON_DAYS = 170;
function generateBasketballSchedule(teams, opts) {
    if (teams.length !== 30) {
        throw new Error(`Basketball schedule generator expects exactly 30 teams (got ${teams.length})`);
    }
    validateConferenceStructure(teams);
    const rng = makeSimpleRng(opts.rngSeed ?? `bball-schedule-${opts.season}`);
    // Step 1: build the matchup table — for each pair of teams, how many
    // total games + which team is home for how many.
    const matchups = buildMatchupCounts(teams, rng);
    // Step 2: turn matchups into specific (home, away) games (no dates yet).
    const allGames = matchupsToGames(matchups);
    // Step 3: assign dates over the season calendar, respecting:
    //   - No team plays twice on the same day
    //   - No team plays 3 games in 3 nights (B2B allowed, B2B2B forbidden)
    //   - Games spread roughly evenly across the calendar
    const seasonStart = opts.seasonStart ?? `${opts.season}-10-22`;
    const scheduled = assignDates(allGames, teams, seasonStart, rng);
    // Step 4: wrap into BaseGameResult shape
    return scheduled.map((g, idx)=>({
            id: `${opts.season}-bball-g${idx + 1}`,
            season: opts.season,
            competitionId: 'primary',
            date: g.date,
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
            status: 'scheduled',
            finalScore: null,
            boxScores: {},
            sportData: {
                dayOfSeason: g.dayOfSeason
            }
        }));
}
function buildMatchupCounts(teams, rng) {
    const result = [];
    // Pre-compute the per-pair total game count.
    // For same-conference non-division pairs we need a balanced 6-regular
    // subgraph: each team plays 4 games vs 6 same-conf non-div opponents
    // (heavy) and 3 games vs the other 4 (light). buildHeavyEdgeSet
    // returns the set of heavy pairs.
    const heavyEdges = buildHeavyEdgeSet(teams, rng);
    for(let i = 0; i < teams.length; i++){
        for(let j = i + 1; j < teams.length; j++){
            const a = teams[i];
            const b = teams[j];
            const totalGames = gamesBetween(a, b, heavyEdges);
            // Home/away split: balanced when totalGames is even, otherwise alternate
            const aHome = Math.floor(totalGames / 2) + (totalGames % 2 === 1 && rng.bool() ? 1 : 0);
            const bHome = totalGames - aHome;
            result.push({
                teamA: a.id,
                teamB: b.id,
                aHomeCount: aHome,
                bHomeCount: bHome
            });
        }
    }
    return result;
}
function gamesBetween(a, b, heavyEdges) {
    const aConf = teamConference(a);
    const bConf = teamConference(b);
    const aDiv = teamDivision(a);
    const bDiv = teamDivision(b);
    if (aConf !== bConf) return GAMES_VS_OPPOSITE_CONFERENCE;
    if (aDiv === bDiv) return GAMES_VS_DIVISION_RIVAL;
    return heavyEdges.has(pairKey(a.id, b.id)) ? GAMES_VS_SAME_CONF_HEAVY : GAMES_VS_SAME_CONF_LIGHT;
}
/** Canonical pair key (sorted team IDs joined by '~'). */ function pairKey(a, b) {
    return a < b ? `${a}~${b}` : `${b}~${a}`;
}
/**
 * For each conference (15 teams, 3 divisions of 5), choose which
 * same-conf non-div pairs are "heavy" (4 games) vs "light" (3 games).
 * Each team must have exactly 6 heavy and 4 light opponents among its
 * 10 non-div same-conf opponents (total 6+4 = 10).
 *
 * Combinatorial constraint: we need a 6-regular subgraph on 15 nodes
 * (edges = 15*6/2 = 45) drawn from the 75 possible non-div pairs.
 *
 * Algorithm: randomized greedy with retry. For each conference:
 *   - Try up to 50 shuffles of the pair order
 *   - Greedy fill heavy edges while respecting the per-team cap of 6
 *   - If a configuration achieves all teams at exactly 6, accept
 *   - Otherwise, retry with a fresh shuffle
 * In practice valid configurations are found in < 5 attempts.
 */ function buildHeavyEdgeSet(teams, rng) {
    const heavy = new Set();
    const conferences = new Set(teams.map(teamConference));
    for (const conf of conferences){
        const confTeams = teams.filter((t)=>teamConference(t) === conf);
        if (confTeams.length !== 15) {
            throw new Error(`Conference ${conf} has ${confTeams.length} teams (expected 15)`);
        }
        const subset = pickConfHeavyEdges(confTeams, rng);
        for (const edge of subset)heavy.add(edge);
    }
    return heavy;
}
function pickConfHeavyEdges(confTeams, rng) {
    // Build the list of non-div pairs in this conference
    const allPairs = [];
    for(let i = 0; i < confTeams.length; i++){
        for(let j = i + 1; j < confTeams.length; j++){
            const a = confTeams[i];
            const b = confTeams[j];
            if (teamDivision(a) === teamDivision(b)) continue; // same div = already 4 games
            allPairs.push({
                a,
                b,
                key: pairKey(a.id, b.id)
            });
        }
    }
    // Expected: 75 pairs (10 non-div opponents per team × 15 teams / 2)
    for(let attempt = 0; attempt < 50; attempt++){
        const shuffled = shuffle(allPairs, rng);
        const heavy = new Set();
        const heavyCount = new Map();
        for (const t of confTeams)heavyCount.set(t.id, 0);
        for (const p of shuffled){
            const aCount = heavyCount.get(p.a.id);
            const bCount = heavyCount.get(p.b.id);
            if (aCount < 6 && bCount < 6) {
                heavy.add(p.key);
                heavyCount.set(p.a.id, aCount + 1);
                heavyCount.set(p.b.id, bCount + 1);
            }
        }
        // Validate: every team should have exactly 6 heavy edges
        let valid = true;
        for (const t of confTeams){
            if (heavyCount.get(t.id) !== 6) {
                valid = false;
                break;
            }
        }
        if (valid) return heavy;
    }
    throw new Error('Could not construct 6-regular heavy-edge subgraph in 50 attempts');
}
function matchupsToGames(matchups) {
    const games = [];
    for (const m of matchups){
        for(let k = 0; k < m.aHomeCount; k++){
            games.push({
                homeTeamId: m.teamA,
                awayTeamId: m.teamB
            });
        }
        for(let k = 0; k < m.bHomeCount; k++){
            games.push({
                homeTeamId: m.teamB,
                awayTeamId: m.teamA
            });
        }
    }
    return games;
}
function assignDates(games, teams, seasonStart, rng) {
    // Track per-team "days played" for spreading + B2B2B prevention
    const daysByTeam = new Map();
    for (const t of teams)daysByTeam.set(t.id, []);
    // Shuffle games so order doesn't bias scheduling
    const shuffled = shuffle(games, rng);
    const scheduled = [];
    for (const g of shuffled){
        const day = findValidDay(daysByTeam.get(g.homeTeamId), daysByTeam.get(g.awayTeamId), SEASON_DAYS, rng);
        daysByTeam.get(g.homeTeamId).push(day);
        daysByTeam.get(g.awayTeamId).push(day);
        scheduled.push({
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
            date: addDaysIso(seasonStart, day),
            dayOfSeason: day
        });
    }
    return scheduled;
}
/** Find a day in [0, maxDay) where neither team is already scheduled AND
 *  no B2B2B is created for either team. Full-enumerates rather than
 *  random-sampling so we never miss a valid clean day when one exists. */ function findValidDay(homeDays, awayDays, maxDay, rng) {
    // Pass 1: collect every day where the strict constraint holds (no B2B2B)
    const cleanDays = [];
    for(let day = 0; day < maxDay; day++){
        if (isDayValid(day, homeDays, awayDays, /* allowB2B2B */ false)) {
            cleanDays.push(day);
        }
    }
    if (cleanDays.length > 0) {
        // Pick a random clean day — randomization spreads load across the season
        return cleanDays[rng.int(cleanDays.length)];
    }
    // Pass 2: allow B2B2B. Should be rare with a healthy 170-day calendar
    // but better than failing outright.
    const fallbackDays = [];
    for(let day = 0; day < maxDay; day++){
        if (isDayValid(day, homeDays, awayDays, /* allowB2B2B */ true)) {
            fallbackDays.push(day);
        }
    }
    if (fallbackDays.length > 0) {
        return fallbackDays[rng.int(fallbackDays.length)];
    }
    throw new Error(`Could not find any valid day for scheduling (maxDay=${maxDay})`);
}
function isDayValid(day, homeDays, awayDays, allowB2B2B) {
    // Neither team can already be scheduled on this day
    if (homeDays.includes(day) || awayDays.includes(day)) return false;
    if (allowB2B2B) return true;
    // B2B2B check: if a team already plays day-1 AND day-2, adding a game on
    // day would create a B2B2B. Same for day+1, day+2.
    for (const teamDays of [
        homeDays,
        awayDays
    ]){
        if (createsThreeInThree(day, teamDays)) return false;
    }
    return true;
}
function createsThreeInThree(day, existingDays) {
    // Check if `day` plus 2 of `existingDays` forms a 3-game-in-3-night cluster
    const window = existingDays.filter((d)=>Math.abs(d - day) <= 2);
    if (window.length < 2) return false;
    // Find any pair in window such that {day, d1, d2} spans exactly 3 days
    // and includes all 3 of those consecutive days
    for(let i = 0; i < window.length; i++){
        for(let j = i + 1; j < window.length; j++){
            const trio = [
                day,
                window[i],
                window[j]
            ].sort((x, y)=>x - y);
            if (trio[2] - trio[0] === 2 && trio[1] - trio[0] === 1) return true;
        }
    }
    return false;
}
function addDaysIso(start, days) {
    const d = new Date(start + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
// ===========================================================================
// Conference / division helpers — read from team.sportData
// ===========================================================================
function teamConference(team) {
    const sd = team.sportData;
    if (!sd?.conference) {
        throw new Error(`Team ${team.id} missing sportData.conference (need 'Eastern' or 'Western')`);
    }
    return sd.conference;
}
function teamDivision(team) {
    const sd = team.sportData;
    if (!sd?.division) {
        throw new Error(`Team ${team.id} missing sportData.division (need 'Atlantic' | 'Central' | ...)`);
    }
    return sd.division;
}
function validateConferenceStructure(teams) {
    const conferences = {};
    const divisions = {};
    for (const t of teams){
        const c = teamConference(t);
        const d = teamDivision(t);
        conferences[c] = (conferences[c] ?? 0) + 1;
        divisions[`${c}/${d}`] = (divisions[`${c}/${d}`] ?? 0) + 1;
    }
    // 2 conferences × 15 teams each
    for (const [c, n] of Object.entries(conferences)){
        if (n !== 15) throw new Error(`Conference ${c} has ${n} teams (expected 15)`);
    }
    // 6 divisions × 5 teams each
    for (const [cd, n] of Object.entries(divisions)){
        if (n !== 5) throw new Error(`Division ${cd} has ${n} teams (expected 5)`);
    }
}
function makeSimpleRng(seed) {
    let s = hashString(seed);
    function next() {
        s = s + 0x6D2B79F5 >>> 0;
        let t = s;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    return {
        int (n) {
            return Math.floor(next() * n);
        },
        bool () {
            return next() < 0.5;
        },
        pick (arr) {
            return arr[Math.floor(next() * arr.length)];
        }
    };
}
function hashString(s) {
    let h = 2166136261;
    for(let i = 0; i < s.length; i++){
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function shuffle(arr, rng) {
    const result = arr.slice();
    for(let i = result.length - 1; i > 0; i--){
        const j = rng.int(i + 1);
        [result[i], result[j]] = [
            result[j],
            result[i]
        ];
    }
    return result;
}
}),
"[project]/packages/sport-basketball/src/scheduleGenerator/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$scheduleGenerator$2f$scheduleGenerator$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/scheduleGenerator/scheduleGenerator.ts [app-rsc] (ecmascript)");
;
}),
"[project]/packages/sport-basketball/src/draftSystem/draftOrder.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * NBA-style draft order generator.
 *
 * Modern NBA lottery (since 2019):
 *   - 14 lottery teams = non-playoff teams (the 14 worst records)
 *   - Bottom 3 teams each have a flat 14.0% chance at the #1 pick
 *   - Picks 4-14 are determined sequentially after #1-#3 are picked
 *   - Any lottery team can win the lottery, but their final pick position
 *     is capped at "their reverse-standings slot + 4" (anti-tank rule)
 *
 * v1 simplification: implement the weighted odds but skip the "cannot
 * fall more than 4 spots" rule (it adds complexity for rare edge cases).
 * v2 can layer that on later.
 *
 * Picks 15-30 (Round 1) and 31-60 (Round 2): strict reverse standings
 * of the playoff teams plus straight reverse standings of all teams for
 * round 2. We pass through the seed for determinism.
 */ __turbopack_context__.s([
    "basketballPickValue",
    ()=>basketballPickValue,
    "generateBasketballDraftOrder",
    ()=>generateBasketballDraftOrder
]);
// ===========================================================================
// Lottery odds (modern NBA — flattened in 2019)
// ===========================================================================
/** Odds (as combinations out of 1000) that each lottery slot wins
 *  the #1 pick. Order: slot 1 = worst record, slot 14 = 14th-worst.
 *  Slots 1-3 are flat 14.0% (140 combinations), then descending. */ const LOTTERY_ODDS_NUMBER_ONE = [
    140,
    140,
    140,
    125,
    105,
    90,
    75,
    60,
    45,
    30,
    20,
    15,
    10,
    5
];
/** Sanity check: combinations should sum to 1000. */ const LOTTERY_TOTAL = 1000;
{
    let sum = 0;
    for (const n of LOTTERY_ODDS_NUMBER_ONE)sum += n;
    if (sum !== LOTTERY_TOTAL) {
        // Compile-time-ish sanity. Throws at module load if odds drift.
        throw new Error(`Lottery odds sum to ${sum}, expected ${LOTTERY_TOTAL}`);
    }
}function makeRng(seed) {
    let s = hashString(seed);
    function next() {
        s = s + 0x6D2B79F5 >>> 0;
        let t = s;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    return {
        random: next,
        int (n) {
            return Math.floor(next() * n);
        }
    };
}
function hashString(s) {
    let h = 2166136261;
    for(let i = 0; i < s.length; i++){
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function generateBasketballDraftOrder(standings, opts = {}) {
    if (standings.length !== 30) {
        throw new Error(`Basketball draft order expects 30 teams (got ${standings.length})`);
    }
    const rng = makeRng(opts.rngSeed ?? 'default-draft-seed');
    const rounds = opts.rounds ?? 2;
    // ------------------------------------------------------------------
    // Sort standings worst-to-best (most losses first, then fewest wins)
    // ------------------------------------------------------------------
    const sorted = standings.slice().sort((a, b)=>{
        // More losses = worse = higher pick = lower draft index
        if (a.losses !== b.losses) return b.losses - a.losses;
        // Tiebreaker: fewer wins = worse
        if (a.wins !== b.wins) return a.wins - b.wins;
        return 0;
    });
    // ------------------------------------------------------------------
    // Lottery teams = those that didn't make playoffs
    // ------------------------------------------------------------------
    const lotteryTeams = sorted.filter((s)=>!s.madePlayoffs);
    const playoffTeamsByRecord = sorted.filter((s)=>s.madePlayoffs);
    // Standard NBA: 14 lottery teams. If fewer, run a smaller lottery.
    // If more, only the bottom 14 enter the lottery.
    const numLotterySlots = Math.min(14, lotteryTeams.length);
    // ------------------------------------------------------------------
    // Run lottery for slots 1-3 (anti-tank flat odds)
    // ------------------------------------------------------------------
    const order = [];
    const remainingLottery = lotteryTeams.slice(0, numLotterySlots);
    for(let lotteryPickNum = 0; lotteryPickNum < 3 && remainingLottery.length > 0; lotteryPickNum++){
        const winnerIdx = pickByWeightedOdds(remainingLottery, rng);
        const winner = remainingLottery.splice(winnerIdx, 1)[0];
        order.push(winner.teamId);
    }
    // ------------------------------------------------------------------
    // Picks 4-14: among remaining lottery teams, by reverse standings
    // (v1 simplification: skip the "cannot fall more than 4 spots" rule)
    // ------------------------------------------------------------------
    // remainingLottery is still sorted worst-to-best by record
    for (const team of remainingLottery){
        order.push(team.teamId);
    }
    // ------------------------------------------------------------------
    // Picks 15-30 (round 1 cont'd): reverse standings of playoff teams
    // ------------------------------------------------------------------
    for (const team of playoffTeamsByRecord){
        order.push(team.teamId);
    }
    // ------------------------------------------------------------------
    // Round 2+: strict reverse standings across the whole league
    // ------------------------------------------------------------------
    for(let round = 1; round < rounds; round++){
        for (const team of sorted){
            order.push(team.teamId);
        }
    }
    return order;
}
/** Pick a winner from `teams` using LOTTERY_ODDS_NUMBER_ONE weights for
 *  whichever slots they occupy. Returns the index into `teams`. */ function pickByWeightedOdds(teams, rng) {
    // Sum the odds for the teams currently in the lottery (some may have
    // already won a previous lottery slot and been removed)
    let total = 0;
    const weights = [];
    for(let i = 0; i < teams.length; i++){
        const w = LOTTERY_ODDS_NUMBER_ONE[i] ?? 0;
        weights.push(w);
        total += w;
    }
    if (total <= 0) {
        // All odds collapsed (shouldn't happen). Fall back to first team.
        return 0;
    }
    let roll = rng.random() * total;
    for(let i = 0; i < teams.length; i++){
        roll -= weights[i];
        if (roll <= 0) return i;
    }
    return teams.length - 1;
}
function basketballPickValue(overallPick) {
    if (overallPick < 1) return 0;
    // Exponential: value = a * exp(-b * (pick - 1))
    // Calibrated so pick 1 = 1000, pick 60 ≈ 15
    const a = 1000;
    const b = 0.071; // ln(1000/15) / 59 ≈ 0.0712
    const v = a * Math.exp(-b * (overallPick - 1));
    return Math.max(1, Math.round(v));
}
}),
"[project]/packages/sport-basketball/src/draftSystem/aiPick.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * AI auto-draft pick.
 *
 * Called when a team's pick is on the clock and the user delegates
 * (or when the picking team isn't the user-controlled GM). Selects
 * the most appropriate available prospect.
 *
 * v1 algorithm (simple but reasonable):
 *   1. Score each prospect by (overall * 0.75) + (potential * 0.25)
 *   2. Apply a positional-need multiplier if the team's roster is light
 *      at the prospect's position (1.10x if need is high, 1.00x neutral,
 *      0.92x if oversupplied)
 *   3. Add small RNG noise (±3 points) so the AI isn't perfectly
 *      predictable. Real GMs disagree.
 *   4. Pick the prospect with the highest adjusted score
 *
 * v2 enhancements (not in v1):
 *   - Team-specific strategy (rebuild vs contender) affects potential weight
 *   - "Best player available" mode vs "positional need" mode toggle
 *   - Risk preference (boom/bust vs safe)
 *   - Scouting noise per team (some teams see prospects more accurately)
 */ __turbopack_context__.s([
    "aiBasketballDraftPick",
    ()=>aiBasketballDraftPick
]);
function aiBasketballDraftPick(team, availableProspects, opts = {}) {
    if (availableProspects.length === 0) {
        throw new Error('aiBasketballDraftPick: no available prospects');
    }
    const rng = makeRng(opts.rngSeed ?? `ai-pick-${team.teamId}-${availableProspects.length}`);
    const needByPosition = computePositionalNeed(team.rosterPlayers);
    let bestProspect = availableProspects[0];
    let bestScore = -Infinity;
    for (const p of availableProspects){
        const score = scoreProspect(p, needByPosition, rng);
        if (score > bestScore) {
            bestScore = score;
            bestProspect = p;
        }
    }
    return bestProspect.id;
}
function scoreProspect(prospect, needByPosition, rng) {
    const ovr = prospect.ratings.overall;
    const pot = prospect.development.potential;
    // Weighted blend: ovr is 75% of value, potential is 25%
    const talent = ovr * 0.75 + pot * 0.25;
    // Positional need multiplier
    const need = needByPosition[prospect.sportData.position] ?? 1.0;
    // RNG noise: ±3 points
    const noise = (rng.random() - 0.5) * 6;
    return talent * need + noise;
}
/**
 * Compute positional need multipliers from the current roster.
 * Returns a multiplier per position:
 *   1.15 — high need (0-1 players at this position)
 *   1.00 — neutral (2-3 players)
 *   0.88 — oversupplied (4+ players)
 *
 * Tuned so a 75-OVR need-pick beats a 75-OVR oversupplied-pick in the
 * majority of trials. v2 could expose this as a per-team strategy slider
 * (e.g., rebuild teams weight talent harder, contenders weight need harder).
 */ function computePositionalNeed(roster) {
    const counts = {
        PG: 0,
        SG: 0,
        SF: 0,
        PF: 0,
        C: 0
    };
    for (const p of roster){
        counts[p.sportData.position]++;
    }
    const multipliers = {
        PG: 1.0,
        SG: 1.0,
        SF: 1.0,
        PF: 1.0,
        C: 1.0
    };
    for (const pos of Object.keys(counts)){
        const c = counts[pos];
        if (c <= 1) multipliers[pos] = 1.15;
        else if (c >= 4) multipliers[pos] = 0.88;
        else multipliers[pos] = 1.00;
    }
    return multipliers;
}
function makeRng(seed) {
    let s = hashString(seed);
    return {
        random () {
            s = s + 0x6D2B79F5 >>> 0;
            let t = s;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    };
}
function hashString(s) {
    let h = 2166136261;
    for(let i = 0; i < s.length; i++){
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
}),
"[project]/packages/sport-basketball/src/draftSystem/rookieScale.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Rookie scale contract generator.
 *
 * NBA rookie scale (v1 model):
 *   - Round 1 picks (1-30): 4-year contracts. Years 1-2 guaranteed,
 *     years 3 and 4 are team options. Salaries scale exponentially
 *     by pick number; #1 overall ~5.5% of cap, #30 ~1.4% of cap.
 *     Annual raises follow standard NBA rookie scale (~6-8% per year).
 *   - Round 2 picks (31-60): 2-year contracts at the league minimum.
 *     In real NBA these are often two-way contracts or partially-
 *     guaranteed deals; v1 just uses guaranteed minimums for simplicity.
 *
 * v2 enhancements (not in v1):
 *   - 4th-year qualifying offer + restricted free agency mechanics
 *   - Rookie extension eligibility window (3rd year offseason)
 *   - 80%/100% guarantee gradient on round 2 deals
 *   - Two-way contract option for late round 2 picks
 */ __turbopack_context__.s([
    "DEFAULT_CAP_REFERENCE",
    ()=>DEFAULT_CAP_REFERENCE,
    "rookieScaleContract",
    ()=>rookieScaleContract
]);
const DEFAULT_CAP_REFERENCE = 140_000_000;
/** Year-1 salary as percentage of the cap, indexed by pick number (1-30).
 *  Calibrated against the 2024-25 NBA rookie scale, scaled to fit cap
 *  percentages so it remains accurate as the cap grows. */ const R1_PCT_OF_CAP_BY_PICK = [
    0.055,
    0.049,
    0.044,
    0.040,
    0.036,
    0.033,
    0.030,
    0.028,
    0.026,
    0.024,
    0.023,
    0.021,
    0.020,
    0.019,
    0.018,
    0.017,
    0.016,
    0.0155,
    0.015,
    0.0145,
    0.014,
    0.0135,
    0.0132,
    0.0129,
    0.0126,
    0.0124,
    0.0122,
    0.0120,
    0.0118,
    0.0116
];
/** Per-year raise compound rate for round 1 rookies (~7% per year). */ const R1_YEARLY_RAISE = 0.07;
/** Round 2 (picks 31-60): flat 2-year contracts at league minimum. */ const R2_MINIMUM_SALARY = 1_200_000;
function rookieScaleContract(overallPick, opts) {
    if (overallPick < 1 || overallPick > 60) {
        throw new Error(`Rookie scale only defined for picks 1-60 (got ${overallPick})`);
    }
    const isRound1 = overallPick <= 30;
    const cap = opts.capForSeason ?? DEFAULT_CAP_REFERENCE;
    const years = [];
    let guaranteedTotal = 0;
    if (isRound1) {
        const year1Salary = Math.round(cap * R1_PCT_OF_CAP_BY_PICK[overallPick - 1]);
        let salary = year1Salary;
        for(let i = 0; i < 4; i++){
            const guaranteed = i < 2; // first 2 years guaranteed, 3+4 are team options
            const seasonYear = opts.signedSeason + i;
            years.push({
                season: seasonYear,
                baseSalary: Math.round(salary),
                proratedBonus: 0,
                guaranteed
            });
            if (guaranteed) guaranteedTotal += Math.round(salary);
            salary = salary * (1 + R1_YEARLY_RAISE);
        }
    } else {
        // Round 2: 2-year, both minimums, both guaranteed (v1 simplification)
        for(let i = 0; i < 2; i++){
            years.push({
                season: opts.signedSeason + i,
                baseSalary: R2_MINIMUM_SALARY,
                proratedBonus: 0,
                guaranteed: true
            });
            guaranteedTotal += R2_MINIMUM_SALARY;
        }
    }
    return {
        years,
        signedSeason: opts.signedSeason,
        guaranteedAtSigning: guaranteedTotal,
        modifications: [],
        sportData: {
            contractType: isRound1 ? 'rookie_scale_r1' : 'rookie_scale_r2',
            pickNumber: overallPick
        }
    };
}
}),
"[project]/packages/sport-basketball/src/draftSystem/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/draftSystem — NBA draft mechanics.
 *
 * Public surface:
 *   - generateBasketballDraftOrder — lottery + reverse-standings → pick order
 *   - aiBasketballDraftPick — auto-pick best prospect for a team
 *   - basketballPickValue — numeric pick value for trade evaluation
 *   - rookieScaleContract — first-contract generator for drafted players
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$draftOrder$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/draftOrder.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$aiPick$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/aiPick.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$rookieScale$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/rookieScale.ts [app-rsc] (ecmascript)");
;
;
;
}),
"[project]/packages/sport-basketball/src/awards/awards.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * NBA awards engine.
 *
 * Computes individual season-end awards from final season stats. v1 covers
 * the seven core individual awards:
 *   - MVP (Most Valuable Player)
 *   - DPOY (Defensive Player of the Year)
 *   - ROY (Rookie of the Year)
 *   - 6MOY (Sixth Man of the Year)
 *   - MIP (Most Improved Player) — requires prior-season stats
 *   - COY (Coach of the Year) — winner is the top-coach-of-the-best-team
 *   - Finals MVP — requires championship + Finals stats context
 *
 * v2 enhancements not in v1:
 *   - All-NBA teams (1st, 2nd, 3rd)
 *   - All-Defensive teams
 *   - All-Rookie teams
 *   - Vote shares simulated (top 5-10 finalists with realistic vote splits)
 *   - Eligibility rules: minimum games (65 in real NBA), minimum minutes
 */ __turbopack_context__.s([
    "computeBasketballAwards",
    ()=>computeBasketballAwards
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/types/index.ts [app-rsc] (ecmascript)");
;
function computeBasketballAwards(players, teams, opts = {}) {
    const minGames = opts.minGamesPlayed ?? 50;
    const eligible = players.filter((p)=>(p.seasonStats.gamesPlayed ?? 0) >= minGames);
    // Quick lookup: which team is each player on (use team season records)
    const teamByTeamId = new Map(teams.map((t)=>[
            t.teamId,
            t
        ]));
    const teamForPlayer = (p)=>{
        if (!p.rosterSlot) return undefined;
        return teamByTeamId.get(p.rosterSlot.teamId);
    };
    return {
        mvp: pickMvp(eligible, teamForPlayer),
        dpoy: pickDpoy(eligible, teamForPlayer),
        roy: pickRoy(eligible, teamForPlayer),
        sixthMan: pickSixthMan(eligible, teamForPlayer),
        mip: pickMip(eligible, opts.priorSeasonPlayers ?? [], teamForPlayer),
        coy: pickCoy(teams),
        finalsMvp: pickFinalsMvp(players, opts)
    };
}
// ===========================================================================
// MVP — high stats on a winning team
// ===========================================================================
function pickMvp(eligible, teamFor) {
    if (eligible.length === 0) return null;
    const scored = eligible.map((p)=>{
        const pg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["perGame"])(p.seasonStats);
        const team = teamFor(p);
        const teamWins = team?.wins ?? 0;
        // Voters weight scoring + team success heavily
        const ppg = pg.points ?? 0;
        const apg = pg.assists ?? 0;
        const rpg = pg.totalRebounds ?? 0;
        const plusMinusPerGame = (p.seasonStats.plusMinus ?? 0) / Math.max(1, p.seasonStats.gamesPlayed);
        const score = ppg * 1.0 + apg * 0.8 + rpg * 0.6 + teamWins * 0.4 + plusMinusPerGame * 5 + // Small bonus for shooting efficiency
        (p.seasonStats.fieldGoalsMade / Math.max(1, p.seasonStats.fieldGoalsAttempted) - 0.45) * 20;
        return {
            player: p,
            score
        };
    });
    scored.sort((a, b)=>b.score - a.score);
    const winner = scored[0];
    const reasoning = formatMvpReasoning(winner.player);
    return {
        winnerId: winner.player.id,
        teamId: winner.player.rosterSlot?.teamId,
        finalists: scored.slice(1, 5).map((s)=>s.player.id),
        reasoning,
        score: Math.round(winner.score * 10) / 10
    };
}
function formatMvpReasoning(p) {
    const pg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["perGame"])(p.seasonStats);
    return `${p.firstName} ${p.lastName} averaged ${(pg.points ?? 0).toFixed(1)} PPG, ${(pg.assists ?? 0).toFixed(1)} APG, and ${(pg.totalRebounds ?? 0).toFixed(1)} RPG`;
}
// ===========================================================================
// DPOY — high steals/blocks + interior presence + team defense
// ===========================================================================
function pickDpoy(eligible, teamFor) {
    if (eligible.length === 0) return null;
    const scored = eligible.map((p)=>{
        const pg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["perGame"])(p.seasonStats);
        const team = teamFor(p);
        const teamDefenseRating = team ? Math.max(0, 120 - team.pointsAgainst / Math.max(1, team.wins + team.losses)) : 0;
        // Defensive contribution weighted by rating talent + actual stat output
        const stocksPerGame = (pg.steals ?? 0) + (pg.blocks ?? 0);
        const defRebPerGame = pg.defensiveRebounds ?? 0;
        const interior = (p.ratings.interiorDefense + p.ratings.block) / 2;
        const perimeter = p.ratings.perimeterDefense;
        const score = stocksPerGame * 8 + defRebPerGame * 2 + interior * 0.15 + perimeter * 0.1 + teamDefenseRating * 0.3;
        return {
            player: p,
            score
        };
    });
    scored.sort((a, b)=>b.score - a.score);
    const winner = scored[0];
    return {
        winnerId: winner.player.id,
        teamId: winner.player.rosterSlot?.teamId,
        finalists: scored.slice(1, 5).map((s)=>s.player.id),
        reasoning: formatDpoyReasoning(winner.player),
        score: Math.round(winner.score * 10) / 10
    };
}
function formatDpoyReasoning(p) {
    const pg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["perGame"])(p.seasonStats);
    return `${p.firstName} ${p.lastName} averaged ${(pg.blocks ?? 0).toFixed(1)} BPG and ${(pg.steals ?? 0).toFixed(1)} SPG as the league's premier defender`;
}
// ===========================================================================
// ROY — rookie only (yearsInLeague === 0)
// ===========================================================================
function pickRoy(eligible, teamFor) {
    const rookies = eligible.filter((p)=>p.sportData.yearsInLeague === 0);
    if (rookies.length === 0) return null;
    // Same scoring as MVP but applied to rookies only, team success weighted less
    const scored = rookies.map((p)=>{
        const pg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["perGame"])(p.seasonStats);
        const team = teamFor(p);
        const teamWins = team?.wins ?? 0;
        const score = (pg.points ?? 0) * 1.2 + (pg.assists ?? 0) * 0.8 + (pg.totalRebounds ?? 0) * 0.6 + teamWins * 0.15 + (p.seasonStats.fieldGoalsMade / Math.max(1, p.seasonStats.fieldGoalsAttempted) - 0.45) * 15;
        return {
            player: p,
            score
        };
    });
    scored.sort((a, b)=>b.score - a.score);
    const winner = scored[0];
    return {
        winnerId: winner.player.id,
        teamId: winner.player.rosterSlot?.teamId,
        finalists: scored.slice(1, 5).map((s)=>s.player.id),
        reasoning: `${winner.player.firstName} ${winner.player.lastName} is the top rookie of the season`,
        score: Math.round(winner.score * 10) / 10
    };
}
// ===========================================================================
// 6MOY — bench role only
// ===========================================================================
function pickSixthMan(eligible, _teamFor) {
    const bench = eligible.filter((p)=>{
        const gp = p.seasonStats.gamesPlayed ?? 0;
        const gs = p.seasonStats.gamesStarted ?? 0;
        // Real-NBA rule: more bench appearances than starts
        return gp > 0 && gs / gp < 0.5;
    });
    if (bench.length === 0) return null;
    const scored = bench.map((p)=>{
        const pg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["perGame"])(p.seasonStats);
        const score = (pg.points ?? 0) * 1.0 + (pg.assists ?? 0) * 0.7 + (pg.totalRebounds ?? 0) * 0.4 + (p.seasonStats.fieldGoalsMade / Math.max(1, p.seasonStats.fieldGoalsAttempted) - 0.45) * 12;
        return {
            player: p,
            score
        };
    });
    scored.sort((a, b)=>b.score - a.score);
    const winner = scored[0];
    return {
        winnerId: winner.player.id,
        teamId: winner.player.rosterSlot?.teamId,
        finalists: scored.slice(1, 5).map((s)=>s.player.id),
        reasoning: `${winner.player.firstName} ${winner.player.lastName} was the league's premier bench contributor`,
        score: Math.round(winner.score * 10) / 10
    };
}
// ===========================================================================
// MIP — most improved year over year (requires prior-season player data)
// ===========================================================================
function pickMip(eligible, priorSeasonPlayers, teamFor) {
    if (priorSeasonPlayers.length === 0) return null;
    const priorById = new Map(priorSeasonPlayers.map((p)=>[
            p.id,
            p
        ]));
    const candidates = eligible.map((p)=>{
        const prior = priorById.get(p.id);
        if (!prior || (prior.seasonStats.gamesPlayed ?? 0) < 20) return null;
        const thisPg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["perGame"])(p.seasonStats);
        const priorPg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["perGame"])(prior.seasonStats);
        const improvementPpg = (thisPg.points ?? 0) - (priorPg.points ?? 0);
        const improvementApg = (thisPg.assists ?? 0) - (priorPg.assists ?? 0);
        const improvementRpg = (thisPg.totalRebounds ?? 0) - (priorPg.totalRebounds ?? 0);
        // Bonus for moving from bench to starter
        const priorStartRate = (prior.seasonStats.gamesStarted ?? 0) / Math.max(1, prior.seasonStats.gamesPlayed);
        const thisStartRate = (p.seasonStats.gamesStarted ?? 0) / Math.max(1, p.seasonStats.gamesPlayed);
        const promotionBonus = (thisStartRate - priorStartRate) * 5;
        const score = improvementPpg * 1.5 + improvementApg * 1.0 + improvementRpg * 0.8 + promotionBonus;
        return {
            player: p,
            score
        };
    }).filter((x)=>x !== null);
    if (candidates.length === 0) return null;
    candidates.sort((a, b)=>b.score - a.score);
    const winner = candidates[0];
    if (winner.score <= 0) return null;
    return {
        winnerId: winner.player.id,
        teamId: winner.player.rosterSlot?.teamId,
        finalists: candidates.slice(1, 5).map((c)=>c.player.id),
        reasoning: `${winner.player.firstName} ${winner.player.lastName} made the biggest year-over-year leap in the league`,
        score: Math.round(winner.score * 10) / 10
    };
}
// ===========================================================================
// COY — team-based
// ===========================================================================
function pickCoy(teams) {
    if (teams.length === 0) return null;
    // v1: simply pick the head coach of the team with the most wins.
    // v2 should compare to preseason expectations (Vegas O/U or similar).
    const sorted = teams.slice().sort((a, b)=>b.wins - a.wins);
    const top = sorted[0];
    if (!top.headCoachId) return null;
    return {
        winnerId: top.headCoachId,
        teamId: top.teamId,
        finalists: sorted.slice(1, 5).map((t)=>t.headCoachId).filter((id)=>!!id),
        reasoning: `Head coach of the ${top.wins}-${top.losses} top team`,
        score: top.wins
    };
}
// ===========================================================================
// Finals MVP — best player on the championship team using Finals-only stats
// ===========================================================================
function pickFinalsMvp(players, opts) {
    if (!opts.championshipTeamId || !opts.finalsStats) return null;
    const champPlayers = players.filter((p)=>p.rosterSlot?.teamId === opts.championshipTeamId);
    if (champPlayers.length === 0) return null;
    const scored = champPlayers.map((p)=>{
        const stats = opts.finalsStats[p.id];
        if (!stats) return {
            player: p,
            score: 0
        };
        const pg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["perGame"])(stats);
        const score = (pg.points ?? 0) * 1.2 + (pg.assists ?? 0) * 0.7 + (pg.totalRebounds ?? 0) * 0.6 + (pg.steals ?? 0) * 1.5 + (pg.blocks ?? 0) * 1.5;
        return {
            player: p,
            score
        };
    });
    scored.sort((a, b)=>b.score - a.score);
    const winner = scored[0];
    if (winner.score === 0) return null;
    return {
        winnerId: winner.player.id,
        teamId: opts.championshipTeamId,
        finalists: scored.slice(1, 5).map((s)=>s.player.id),
        reasoning: `${winner.player.firstName} ${winner.player.lastName} led the championship team in the Finals`,
        score: Math.round(winner.score * 10) / 10
    };
}
}),
"[project]/packages/sport-basketball/src/awards/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/awards — season-end awards engine.
 *
 * Public surface:
 *   - computeBasketballAwards(players, teams, opts) → BasketballAwardWinners
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$awards$2f$awards$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/awards/awards.ts [app-rsc] (ecmascript)");
;
}),
"[project]/packages/sport-basketball/src/developmentSystem/development.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Basketball player development system.
 *
 * Models multi-season aging: how a player's ratings change year-over-year.
 *
 * NBA-realistic aging curve:
 *   - 19-22: Steep rise. Rookies developing into rotation players. +2-5 OVR/year possible.
 *   - 23-25: Continued growth approaching peak. +1-3 OVR/year average.
 *   - 26-28: Peak years, mostly flat. -1 to +1 OVR/year.
 *   - 29-31: Subtle decline begins. -1 to -2 OVR/year.
 *   - 32-34: Decline accelerates. -1 to -3 OVR/year.
 *   - 35+:   Steep decline, except for elite skill players. -2 to -4 OVR/year.
 *
 * Differential rating decline:
 *   - Athletic ratings (speed, vertical) decline first and fastest
 *   - Skill ratings (3PT, FT, basketballIQ) hold longer
 *   - Defense tracks roughly with age (mix of athletic + skill)
 *
 * v1 simplifications:
 *   - No injury history effect on aging
 *   - No system fit / coach quality effects
 *   - No offseason training mode
 *   - Mid-season ticks are no-op
 */ __turbopack_context__.s([
    "developBasketballPlayer",
    ()=>developBasketballPlayer,
    "shouldBasketballPlayerRetire",
    ()=>shouldBasketballPlayerRetire,
    "tickBasketballPlayer",
    ()=>tickBasketballPlayer
]);
// ===========================================================================
// Aging curve tunables
// ===========================================================================
function expectedDriftForAge(age) {
    if (age <= 21) return 3.5;
    if (age <= 23) return 2.0;
    if (age <= 25) return 1.0;
    if (age <= 28) return 0.0;
    if (age <= 31) return -1.2;
    if (age <= 34) return -2.2;
    if (age <= 37) return -3.0;
    return -3.5;
}
function driftStdForAge(age) {
    if (age <= 22) return 2.5;
    if (age <= 28) return 1.5;
    return 1.8;
}
function developBasketballPlayer(player, season, opts = {}) {
    const rng = makeRng(opts.rngSeed ?? `${player.id}-${season}`);
    const newAge = player.age + 1;
    const expected = expectedDriftForAge(newAge);
    const std = driftStdForAge(newAge);
    const drift = Math.round(expected + gaussian(0, std, rng));
    const newRatings = applyAgingToRatings(player.ratings, newAge, drift, rng);
    const newOverall = approximateOverall(newRatings, player.sportData.position);
    newRatings.overall = newOverall;
    const newTrajectory = computeTrajectory(drift, newAge, player.development.currentTrajectory);
    const trajectorySeasons = newTrajectory === player.development.currentTrajectory ? player.development.seasonsAtCurrentTrajectory + 1 : 1;
    const newPotential = updatePotential(player.development.potential, newOverall, newAge, rng);
    return {
        ...player,
        age: newAge,
        ratings: newRatings,
        development: {
            potential: newPotential,
            currentTrajectory: newTrajectory,
            seasonsAtCurrentTrajectory: trajectorySeasons
        },
        sportData: {
            ...player.sportData,
            yearsInLeague: player.sportData.yearsInLeague + 1
        }
    };
}
function shouldBasketballPlayerRetire(player, opts = {}) {
    const rng = makeRng(opts.rngSeed ?? `retire-${player.id}-${player.age}`);
    const age = player.age;
    const ovr = player.ratings.overall;
    if (age >= 40) return true;
    if (age >= 35 && ovr < 60) return true;
    if (age >= 33 && ovr < 55) return true;
    if (age >= 35 && ovr < 75 && rng.random() < 0.15) return true;
    if (age >= 37 && ovr < 80 && rng.random() < 0.25) return true;
    return false;
}
function tickBasketballPlayer(player, _ticksAdvanced) {
    return player;
}
// ===========================================================================
// Rating-aging math
// ===========================================================================
function applyAgingToRatings(ratings, newAge, ovrDrift, rng) {
    const athleticBias = newAge >= 30 ? 1.4 : newAge <= 22 ? 1.2 : 1.0;
    const skillBias = newAge >= 30 ? 0.6 : 1.0;
    const defenseBias = 1.0;
    const out = {
        ...ratings
    };
    // Athletic
    out.speed = shiftRating(ratings.speed, ovrDrift * athleticBias, rng);
    out.strength = shiftRating(ratings.strength, ovrDrift * (newAge >= 30 ? 0.8 : 1.0), rng);
    out.vertical = shiftRating(ratings.vertical, ovrDrift * athleticBias, rng);
    // Offense — skills hold longer
    out.threePoint = shiftRating(ratings.threePoint, ovrDrift * skillBias, rng);
    out.midRange = shiftRating(ratings.midRange, ovrDrift * skillBias, rng);
    out.finishing = shiftRating(ratings.finishing, ovrDrift * (newAge >= 30 ? 0.8 : 1.0), rng);
    out.freeThrow = shiftRating(ratings.freeThrow, ovrDrift * 0.4, rng);
    out.postScoring = shiftRating(ratings.postScoring, ovrDrift * (newAge >= 30 ? 0.7 : 1.0), rng);
    out.handles = shiftRating(ratings.handles, ovrDrift * skillBias, rng);
    out.passing = shiftRating(ratings.passing, ovrDrift * 0.5, rng);
    // Defense
    out.perimeterDefense = shiftRating(ratings.perimeterDefense, ovrDrift * defenseBias, rng);
    out.interiorDefense = shiftRating(ratings.interiorDefense, ovrDrift * defenseBias, rng);
    out.rebounding = shiftRating(ratings.rebounding, ovrDrift * defenseBias, rng);
    out.steal = shiftRating(ratings.steal, ovrDrift * defenseBias, rng);
    out.block = shiftRating(ratings.block, ovrDrift * (newAge >= 30 ? 1.2 : 1.0), rng);
    // Mental — IQ grows slightly for vets in their late 20s/early 30s
    if (newAge >= 24 && newAge <= 33) {
        out.basketballIQ = shiftRating(ratings.basketballIQ, Math.max(0, 0.3 + rng.random() * 0.5), rng);
    } else {
        out.basketballIQ = shiftRating(ratings.basketballIQ, ovrDrift * 0.3, rng);
    }
    out.intangibles = shiftRating(ratings.intangibles, ovrDrift * 0.3, rng);
    return out;
}
function shiftRating(value, drift, rng) {
    const noise = (rng.random() - 0.5) * 2.5;
    return clamp(Math.round(value + drift + noise), 25, 99);
}
const POSITION_OVR_WEIGHTS = {
    PG: {
        handles: 3,
        passing: 3,
        threePoint: 2,
        basketballIQ: 2,
        perimeterDefense: 2,
        speed: 1,
        finishing: 1
    },
    SG: {
        threePoint: 3,
        finishing: 2,
        midRange: 2,
        handles: 2,
        perimeterDefense: 2,
        speed: 1,
        basketballIQ: 1
    },
    SF: {
        threePoint: 2,
        finishing: 2,
        perimeterDefense: 2,
        rebounding: 1,
        handles: 1,
        basketballIQ: 2,
        intangibles: 1
    },
    PF: {
        finishing: 2,
        rebounding: 3,
        interiorDefense: 2,
        threePoint: 1,
        postScoring: 2,
        strength: 1,
        block: 1
    },
    C: {
        finishing: 2,
        rebounding: 3,
        interiorDefense: 3,
        block: 2,
        postScoring: 2,
        strength: 1
    }
};
const ALL_RATING_KEYS = [
    'speed',
    'strength',
    'vertical',
    'threePoint',
    'midRange',
    'finishing',
    'freeThrow',
    'postScoring',
    'handles',
    'passing',
    'perimeterDefense',
    'interiorDefense',
    'rebounding',
    'steal',
    'block',
    'basketballIQ',
    'intangibles'
];
/** Inlined OVR computation — same formula as playerGen's, kept here
 *  to avoid a circular import. */ function approximateOverall(r, position) {
    const weights = POSITION_OVR_WEIGHTS[position] ?? {};
    let weightedSum = 0;
    let totalWeight = 0;
    for (const key of ALL_RATING_KEYS){
        const w = weights[key] ?? 0.3;
        weightedSum += r[key] * w;
        totalWeight += w;
    }
    return clamp(Math.round(weightedSum / totalWeight), 40, 99);
}
function computeTrajectory(drift, age, current) {
    if (drift >= 5) return 'breakout';
    if (drift >= 2) return 'rising';
    if (drift <= -4) return 'cliff';
    if (drift <= -2) return 'declining';
    if (age >= 32 && current === 'declining') return 'declining';
    return 'plateau';
}
function updatePotential(currentPotential, newOverall, age, rng) {
    let gap;
    if (age <= 21) gap = Math.max(0, 10 + gaussian(0, 3, rng));
    else if (age <= 24) gap = Math.max(0, 5 + gaussian(0, 2, rng));
    else if (age <= 27) gap = Math.max(0, 2 + gaussian(0, 1.5, rng));
    else gap = Math.max(0, gaussian(0, 1, rng));
    const newCeiling = Math.min(99, newOverall + Math.round(gap));
    return Math.max(newOverall, Math.min(currentPotential, newCeiling));
}
function makeRng(seed) {
    let s = hashString(seed);
    return {
        random () {
            s = s + 0x6D2B79F5 >>> 0;
            let t = s;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    };
}
function hashString(s) {
    let h = 2166136261;
    for(let i = 0; i < s.length; i++){
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function gaussian(mean, stdDev, rng) {
    const u1 = rng.random();
    const u2 = rng.random();
    return mean + stdDev * Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2);
}
function clamp(n, min, max) {
    return Math.round(Math.max(min, Math.min(max, n)));
}
}),
"[project]/packages/sport-basketball/src/developmentSystem/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/developmentSystem — player aging + retirement.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$developmentSystem$2f$development$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/developmentSystem/development.ts [app-rsc] (ecmascript)");
;
}),
"[project]/packages/sport-basketball/src/capRules/capRules.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * NBA-style salary cap rules for BS Hoops.
 *
 * Models the NBA's soft cap system:
 *   - Annual salary cap (rises with the league's BRI — Basketball Related Income)
 *   - Luxury tax threshold (~$30M above the cap typically)
 *   - First apron + second apron (declared but penalties deferred to v2)
 *   - Soft-cap exceptions (Mid-Level Exception, Bi-Annual, Bird rights)
 *
 * v1 scope:
 *   - Basic contract legality (max length, max salary as % of cap, raises)
 *   - Team payroll vs cap + tax thresholds
 *   - Dead cap from straight release (waive-and-stretch in follow-up commit)
 *   - Market salary helper
 *   - Bird rights resolution + basic cap actions (follow-up commit)
 *
 * v2 deferred:
 *   - Full apron penalties (frozen TPE, no sign-and-trades, etc.)
 *   - Sign-and-trade Base Year Compensation math
 *   - Repeater tax (luxury tax surcharge after 3+ years in tax)
 *   - Designated Veteran Extension / Designated Rookie Extension
 *   - Hard cap triggers (sign-and-trade acquisition, MLE use, etc.)
 *   - Mid-season trade deadline cap holds
 */ __turbopack_context__.s([
    "BASE_CAP_2026",
    ()=>BASE_CAP_2026,
    "CAP_INFLATION_RATE",
    ()=>CAP_INFLATION_RATE,
    "LEAGUE_MINIMUM_SALARY",
    ()=>LEAGUE_MINIMUM_SALARY,
    "MAX_CONTRACT_YEARS",
    ()=>MAX_CONTRACT_YEARS,
    "MAX_YEARLY_RAISE",
    ()=>MAX_YEARLY_RAISE,
    "TAX_THRESHOLD_MULT",
    ()=>TAX_THRESHOLD_MULT,
    "basketballContractRemainingGuaranteed",
    ()=>basketballContractRemainingGuaranteed,
    "basketballContractYearForSeason",
    ()=>basketballContractYearForSeason,
    "basketballFirstApron",
    ()=>basketballFirstApron,
    "basketballSalaryCap",
    ()=>basketballSalaryCap,
    "basketballSecondApron",
    ()=>basketballSecondApron,
    "basketballTaxThreshold",
    ()=>basketballTaxThreshold,
    "basketballTeamCapStatus",
    ()=>basketballTeamCapStatus,
    "basketballTeamPayroll",
    ()=>basketballTeamPayroll,
    "isLegalBasketballContract",
    ()=>isLegalBasketballContract,
    "isLegalBasketballRoster",
    ()=>isLegalBasketballRoster
]);
// ===========================================================================
// Annual cap calculation
// ===========================================================================
/** League-wide cap reference for the 2026-27 season. Real-NBA cap was
 *  ~$140M in 2024-25 and rising ~7%/year with the new TV deal kicking in. */ const BASE_CAP_2026 = 140_000_000;
/** Year-over-year cap inflation. NBA averaged ~7% over the past decade
 *  due to BRI growth. */ const CAP_INFLATION_RATE = 0.07;
/** Luxury tax threshold = cap × this multiplier. Real NBA ratio is ~1.21. */ const TAX_THRESHOLD_MULT = 1.215;
/** First apron threshold = cap × this multiplier. Real NBA ratio is ~1.245. */ const FIRST_APRON_MULT = 1.245;
/** Second apron threshold = cap × this multiplier. Real NBA ratio is ~1.30. */ const SECOND_APRON_MULT = 1.295;
function basketballSalaryCap(season) {
    const yearsFrom2026 = season - 2026;
    const cap = BASE_CAP_2026 * Math.pow(1 + CAP_INFLATION_RATE, yearsFrom2026);
    // Round to nearest $100K for clean numbers
    return Math.round(cap / 100_000) * 100_000;
}
function basketballTaxThreshold(season) {
    return Math.round(basketballSalaryCap(season) * TAX_THRESHOLD_MULT / 100_000) * 100_000;
}
function basketballFirstApron(season) {
    return Math.round(basketballSalaryCap(season) * FIRST_APRON_MULT / 100_000) * 100_000;
}
function basketballSecondApron(season) {
    return Math.round(basketballSalaryCap(season) * SECOND_APRON_MULT / 100_000) * 100_000;
}
// ===========================================================================
// Contract legality
// ===========================================================================
/** Maximum contract length in years. NBA: 5 years if signing with own
 *  Bird-rights team, 4 years otherwise. v1 uses 5 as the cap; year-3+4
 *  team option rules live in the rookie-scale module. */ const MAX_CONTRACT_YEARS = 5;
/** Maximum starting salary as % of cap, by player tier. Real NBA:
 *  - 0-6 years experience: 25% of cap
 *  - 7-9 years: 30% of cap
 *  - 10+ years: 35% of cap
 *  Plus exceptions for Designated Player Extensions (deferred to v2). */ function maxStartingPctOfCap(yearsInLeague) {
    if (yearsInLeague >= 10) return 0.35;
    if (yearsInLeague >= 7) return 0.30;
    return 0.25;
}
/** Maximum year-over-year raise. NBA: 8% for re-signing own player,
 *  5% for signing with a new team. v1 uses 8% as the cap. */ const MAX_YEARLY_RAISE = 0.08;
/** Minimum salary (rookie minimum + vet minimum approximated). */ const LEAGUE_MINIMUM_SALARY = 1_200_000;
function isLegalBasketballContract(contract, player, season) {
    const violations = [];
    const warnings = [];
    if (contract.years.length === 0) {
        violations.push('Contract must have at least one year');
        return {
            legal: false,
            violations,
            warnings
        };
    }
    // Max length
    if (contract.years.length > MAX_CONTRACT_YEARS) {
        violations.push(`Contract exceeds max length of ${MAX_CONTRACT_YEARS} years (got ${contract.years.length})`);
    }
    // Years must be sequential starting at signedSeason
    const expectedStart = contract.signedSeason;
    for(let i = 0; i < contract.years.length; i++){
        if (contract.years[i].season !== expectedStart + i) {
            violations.push(`Year ${i + 1} season is ${contract.years[i].season}, expected ${expectedStart + i}`);
        }
    }
    // Per-year salary validation
    const cap = basketballSalaryCap(season);
    const yearsInLeague = player.sportData.yearsInLeague;
    const maxStartPct = maxStartingPctOfCap(yearsInLeague);
    const maxStartingSalary = cap * maxStartPct;
    const firstYearTotal = contract.years[0].baseSalary + contract.years[0].proratedBonus;
    if (firstYearTotal > maxStartingSalary + 1) {
        violations.push(`Year-1 salary $${(firstYearTotal / 1e6).toFixed(1)}M exceeds max ${(maxStartPct * 100).toFixed(0)}% of cap ($${(maxStartingSalary / 1e6).toFixed(1)}M)`);
    }
    if (firstYearTotal < LEAGUE_MINIMUM_SALARY) {
        violations.push(`Year-1 salary $${(firstYearTotal / 1e6).toFixed(2)}M below league minimum $${(LEAGUE_MINIMUM_SALARY / 1e6).toFixed(2)}M`);
    }
    // Year-over-year raises
    for(let i = 1; i < contract.years.length; i++){
        const prev = contract.years[i - 1].baseSalary;
        const cur = contract.years[i].baseSalary;
        if (prev <= 0) continue; // skip degenerate
        const raise = (cur - prev) / prev;
        if (raise > MAX_YEARLY_RAISE + 0.001) {
            violations.push(`Year ${i + 1} raise ${(raise * 100).toFixed(1)}% exceeds max ${(MAX_YEARLY_RAISE * 100).toFixed(0)}%`);
        }
        if (raise < -MAX_YEARLY_RAISE - 0.001) {
            warnings.push(`Year ${i + 1} pay cut ${(raise * 100).toFixed(1)}% — unusual but legal`);
        }
    }
    return {
        legal: violations.length === 0,
        violations,
        warnings
    };
}
function basketballTeamPayroll(players, season) {
    let total = 0;
    for (const p of players){
        if (p.sportData.isTwoWay) continue; // two-way contracts don't hit the cap
        if (!p.contract) continue;
        const yearForSeason = p.contract.years.find((y)=>y.season === season);
        if (!yearForSeason) continue;
        total += yearForSeason.baseSalary + yearForSeason.proratedBonus;
    }
    return total;
}
function basketballTeamCapStatus(players, season) {
    const payroll = basketballTeamPayroll(players, season);
    const cap = basketballSalaryCap(season);
    const taxThreshold = basketballTaxThreshold(season);
    const firstApron = basketballFirstApron(season);
    const secondApron = basketballSecondApron(season);
    const isOverTax = payroll > taxThreshold;
    return {
        payroll,
        cap,
        taxThreshold,
        firstApron,
        secondApron,
        capRoom: cap - payroll,
        taxBill: isOverTax ? computeLuxuryTax(payroll, taxThreshold) : 0,
        isOverCap: payroll > cap,
        isOverTax,
        isOverFirstApron: payroll > firstApron,
        isOverSecondApron: payroll > secondApron
    };
}
/**
 * NBA luxury tax schedule (incremental rates, v1 approximation):
 *   $0-5M over:  $1.50 per $1
 *   $5-10M over: $1.75 per $1
 *   $10-15M over: $2.50 per $1
 *   $15-20M over: $3.25 per $1
 *   $20M+ over:  $3.75 per $1 (plus $0.50 per $5M tier above)
 *
 * Repeater multiplier (3+ years in tax) deferred to v2.
 */ function computeLuxuryTax(payroll, threshold) {
    const over = payroll - threshold;
    if (over <= 0) return 0;
    const tiers = [
        {
            upTo: 5_000_000,
            rate: 1.50
        },
        {
            upTo: 10_000_000,
            rate: 1.75
        },
        {
            upTo: 15_000_000,
            rate: 2.50
        },
        {
            upTo: 20_000_000,
            rate: 3.25
        }
    ];
    let tax = 0;
    let remaining = over;
    let prevCap = 0;
    for (const tier of tiers){
        const tierWidth = tier.upTo - prevCap;
        const amountInTier = Math.min(remaining, tierWidth);
        tax += amountInTier * tier.rate;
        remaining -= amountInTier;
        prevCap = tier.upTo;
        if (remaining <= 0) break;
    }
    // Excess beyond $20M over: $3.75 per $1
    if (remaining > 0) tax += remaining * 3.75;
    return Math.round(tax);
}
function isLegalBasketballRoster(players, season) {
    const violations = [];
    const warnings = [];
    const capStatus = basketballTeamCapStatus(players, season);
    // Hard cap enforcement: only the second apron is a hard ceiling, and
    // only for teams that have hit it through specific moves (sign-and-trade
    // acquisition, MLE/BAE use). v1 warns rather than violates — full hard-cap
    // tracking comes in v2 with cap actions.
    if (capStatus.isOverSecondApron) {
        warnings.push(`Team payroll $${(capStatus.payroll / 1e6).toFixed(1)}M exceeds second apron ($${(capStatus.secondApron / 1e6).toFixed(1)}M) — would be hard-cap-blocked if any apron-trigger moves were made this season`);
    }
    if (capStatus.isOverFirstApron) {
        warnings.push(`Team payroll exceeds first apron — restricted access to MLE, can't aggregate salaries in trades, etc.`);
    }
    if (capStatus.isOverTax) {
        warnings.push(`Team payroll over tax threshold — projected luxury tax bill: $${(capStatus.taxBill / 1e6).toFixed(1)}M`);
    }
    return {
        legal: violations.length === 0,
        violations,
        warnings,
        capStatus
    };
}
function basketballContractRemainingGuaranteed(contract, fromSeason) {
    let total = 0;
    for (const y of contract.years){
        if (y.season < fromSeason) continue;
        if (!y.guaranteed) continue;
        total += y.baseSalary + y.proratedBonus;
    }
    return total;
}
function basketballContractYearForSeason(contract, season) {
    return contract.years.find((y)=>y.season === season) ?? null;
}
;
}),
"[project]/packages/sport-basketball/src/capRules/deadCap.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Dead cap from released players.
 *
 * Two paths:
 *   - Straight release ("waive"): all remaining guaranteed money hits as
 *     dead cap in the year it was originally owed. No spreading.
 *   - Waive-and-stretch: spread total remaining guaranteed across
 *     (2 × remaining years) + 1 years. Reduces year-to-year dead cap
 *     bite but extends the term. NBA rule: only available before Sept 1
 *     of the league year; v1 ignores the date gate.
 *
 * v1 simplifications:
 *   - No "set-off rights" (when waived player signs elsewhere, the
 *     original team's dead cap reduces by their new salary above the
 *     minimum). Adds bookkeeping; defer.
 *   - No buy-out negotiation (player accepts less to be released early).
 *     Real NBA: players can accept buyouts that reduce the dead cap.
 *   - No "stretch-provision cap blocker" — in real NBA you can't
 *     stretch if the stretched amount would push prior-year dead cap
 *     above 15% of cap. v1 ignores.
 */ __turbopack_context__.s([
    "basketballDeadCapForRelease",
    ()=>basketballDeadCapForRelease,
    "basketballStretchPreview",
    ()=>basketballStretchPreview
]);
function basketballDeadCapForRelease(player, opts) {
    if (!player.contract) return [];
    const mode = opts.mode ?? 'waive';
    const remaining = remainingGuaranteedYears(player.contract, opts.releaseSeason);
    if (remaining.length === 0) return [];
    if (mode === 'waive') {
        // Straight release: each guaranteed year hits as dead cap in its
        // originally-owed season.
        return remaining.map((y)=>({
                season: y.season,
                amount: y.amount,
                reason: 'release:waive'
            }));
    }
    // Waive-and-stretch: spread total over (2 × remaining years) + 1
    const totalRemaining = remaining.reduce((s, y)=>s + y.amount, 0);
    const yearsRemaining = remaining.length;
    const stretchYears = 2 * yearsRemaining + 1;
    const perYear = Math.round(totalRemaining / stretchYears);
    const entries = [];
    for(let i = 0; i < stretchYears; i++){
        // Final year absorbs any rounding remainder
        const amount = i === stretchYears - 1 ? totalRemaining - perYear * (stretchYears - 1) : perYear;
        entries.push({
            season: opts.releaseSeason + i,
            amount,
            reason: 'release:stretch'
        });
    }
    return entries;
}
/** Filter contract years for "guaranteed money from a given season forward."
 *  Used by both straight release + stretch math. */ function remainingGuaranteedYears(contract, fromSeason) {
    const out = [];
    for (const y of contract.years){
        if (y.season < fromSeason) continue;
        if (!y.guaranteed) continue;
        out.push({
            season: y.season,
            amount: y.baseSalary + y.proratedBonus
        });
    }
    return out;
}
function basketballStretchPreview(player, releaseSeason) {
    if (!player.contract) return null;
    const waiveEntries = basketballDeadCapForRelease(player, {
        releaseSeason,
        mode: 'waive'
    });
    const stretchEntries = basketballDeadCapForRelease(player, {
        releaseSeason,
        mode: 'stretch'
    });
    if (waiveEntries.length === 0) return null;
    const waiveYearOne = waiveEntries.find((e)=>e.season === releaseSeason)?.amount ?? 0;
    const stretchYearOne = stretchEntries.find((e)=>e.season === releaseSeason)?.amount ?? 0;
    const termExtensionYears = stretchEntries.length - waiveEntries.length;
    return {
        waiveEntries,
        stretchEntries,
        yearOneSavings: waiveYearOne - stretchYearOne,
        termExtensionYears
    };
}
}),
"[project]/packages/sport-basketball/src/capRules/marketSalary.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Free-agent market salary model.
 *
 * Given a player's overall rating, age, position, and league cap, estimate
 * what they'd ask for in free agency. Used by:
 *   - Negotiation engine (player's starting ask)
 *   - Trade evaluator (player value normalization)
 *   - UI hint on the FA board ("market: $18M/yr")
 *
 * Model: piecewise function of OVR with age-curve + position-scarcity
 * multipliers, anchored to known NBA reference points.
 *
 * Anchors (2024-25 NBA, % of cap):
 *   - 95+ OVR (Jokic/Luka/SGA): 25-35% of cap (capped by max-salary tier)
 *   - 88-94 OVR (All-Stars):    18-26%
 *   - 82-87 OVR (All-Star bench / borderline): 12-18%
 *   - 76-81 OVR (rotation starters):           7-12%
 *   - 70-75 OVR (solid rotation / 6th men):    4-7%
 *   - 65-69 OVR (deep bench / fringe):         min-2M to 4M
 *   - <65 OVR:                                 league min
 *
 * v1 simplifications:
 *   - No supply/demand modeling (if every team needs a center, all centers
 *     get a premium). v2 should price scarcity.
 *   - No "team fit" effect (3-and-D wings get a premium from contenders).
 *   - No max-salary tier enforcement at the top (caller layers via cap rules).
 */ __turbopack_context__.s([
    "basketballMarketContractYears",
    ()=>basketballMarketContractYears,
    "basketballMarketSalary",
    ()=>basketballMarketSalary
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/capRules.ts [app-rsc] (ecmascript)");
;
// ===========================================================================
// Position scarcity multipliers
// ===========================================================================
/** NBA positional value, v1 approximation. Wings + centers are scarcer
 *  than guards across the league; PFs are most fungible. */ const POSITION_VALUE_MULT = {
    PG: 1.00,
    SG: 0.95,
    SF: 1.05,
    PF: 0.98,
    C: 1.08
};
// ===========================================================================
// Age curve
// ===========================================================================
/** Age multiplier — what fraction of "peak value" a player commands at age X.
 *  Peak is 26-28. Drops on either side; older players get shorter / smaller
 *  deals. */ function ageValueMultiplier(age) {
    if (age <= 21) return 0.85; // rookie deals, untested
    if (age <= 24) return 0.95;
    if (age <= 28) return 1.00; // peak
    if (age <= 31) return 0.92;
    if (age <= 34) return 0.78;
    if (age <= 37) return 0.55;
    return 0.35;
}
// ===========================================================================
// OVR → % of cap (piecewise)
// ===========================================================================
function basePctOfCap(ovr) {
    if (ovr >= 95) return 0.30;
    if (ovr >= 92) return 0.26;
    if (ovr >= 88) return 0.22;
    if (ovr >= 85) return 0.16;
    if (ovr >= 82) return 0.13;
    if (ovr >= 78) return 0.10;
    if (ovr >= 76) return 0.08;
    if (ovr >= 73) return 0.055;
    if (ovr >= 70) return 0.04;
    if (ovr >= 67) return 0.025;
    if (ovr >= 65) return 0.018;
    return 0.012; // around league min
}
function basketballMarketSalary(player, opts = {}) {
    const season = opts.season ?? 2026;
    const cap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballSalaryCap"])(season);
    const ovr = player.ratings.overall;
    const age = player.age;
    const pos = player.sportData.position;
    const pct = basePctOfCap(ovr);
    const ageMult = ageValueMultiplier(age);
    const posMult = POSITION_VALUE_MULT[pos];
    const raw = cap * pct * ageMult * posMult;
    // Noise — ±5% by default
    const noise = opts.noiseSeed ? noiseFactor(opts.noiseSeed) : 1.0;
    const withNoise = raw * noise;
    // Clamp to league minimum on the low end
    const final = Math.max(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["LEAGUE_MINIMUM_SALARY"], Math.round(withNoise / 100_000) * 100_000);
    return final;
}
function basketballMarketContractYears(player) {
    const ovr = player.ratings.overall;
    const age = player.age;
    // Stars want max length (capped at 5 by cap rules)
    if (ovr >= 88) return age >= 33 ? 3 : age >= 30 ? 4 : 5;
    if (ovr >= 80) return age >= 32 ? 2 : age >= 28 ? 3 : 4;
    if (ovr >= 73) return age >= 32 ? 1 : age >= 28 ? 2 : 3;
    // Fringe players: 1-year prove-it deals
    return age >= 30 ? 1 : 2;
}
// ===========================================================================
// Deterministic small-noise helper
// ===========================================================================
/** Produce a multiplier in [0.95, 1.05] from a string seed. */ function noiseFactor(seed) {
    let h = 2166136261;
    for(let i = 0; i < seed.length; i++){
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const u = (h >>> 0) / 4294967296;
    return 0.95 + u * 0.10;
}
}),
"[project]/packages/sport-basketball/src/capRules/birdRights.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Bird rights resolution.
 *
 * NBA Bird rights are a cap exception that lets a team re-sign their own
 * player above the cap. The three tiers:
 *
 *   - Full Bird Rights: Played 3+ consecutive years with the same team
 *     without changing teams as a free agent. Team can re-sign up to max
 *     salary, exceeding the cap, with 5-year max + 8% raises.
 *
 *   - Early Bird Rights: 2 consecutive years with the same team. Limited
 *     to 175% of prior salary OR league average salary (whichever is
 *     higher), 5-year max with 8% raises.
 *
 *   - Non-Bird Rights: 1 year or less with the team. Limited to 120% of
 *     prior salary OR 120% of league minimum (whichever is higher),
 *     4-year max with 5% raises.
 *
 * v1 simplifications:
 *   - We don't yet track per-year team history on the player; we
 *     approximate via the player's current `sportData.birdRights` field
 *     (set when contract was signed) and current team membership.
 *   - The "consecutive years" requirement (no FA gap) is approximated:
 *     if the player's current team matches the team asking, the stored
 *     birdRights value is honored. Otherwise 'none'.
 *   - Cap holds (placeholder cap charges for departed FAs the team
 *     hasn't formally renounced) are not modeled in v1.
 */ __turbopack_context__.s([
    "basketballBirdRightsMaxSalary",
    ()=>basketballBirdRightsMaxSalary,
    "basketballResolveBirdRights",
    ()=>basketballResolveBirdRights
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/capRules.ts [app-rsc] (ecmascript)");
;
function basketballResolveBirdRights(player, forTeamId) {
    // Player must be currently rostered with the asking team to use stored
    // Bird rights. New teams start at 'none'.
    if (!player.rosterSlot || player.rosterSlot.teamId !== forTeamId) {
        return 'none';
    }
    return player.sportData.birdRights;
}
function basketballBirdRightsMaxSalary(player, forTeamId, season) {
    const tier = basketballResolveBirdRights(player, forTeamId);
    if (tier === 'none') return null;
    const cap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballSalaryCap"])(season);
    const yearsInLeague = player.sportData.yearsInLeague;
    // Max salary tier from cap rules: 25/30/35% by years-in-league
    const maxPct = yearsInLeague >= 10 ? 0.35 : yearsInLeague >= 7 ? 0.30 : 0.25;
    const absoluteMax = cap * maxPct;
    if (tier === 'full') {
        // Full Bird = up to absolute max salary, 5-year deal, 8% raises
        return {
            tier,
            maxStartingSalary: absoluteMax,
            maxLengthYears: 5,
            maxRaisePct: 0.08
        };
    }
    // Early Bird = 175% of prior or league average, whichever higher
    const priorYearSalary = currentSalary(player, season - 1);
    const earlyBirdCap = Math.max(priorYearSalary * 1.75, cap * 0.10);
    return {
        tier,
        maxStartingSalary: Math.min(absoluteMax, earlyBirdCap),
        maxLengthYears: 5,
        maxRaisePct: 0.08
    };
}
function currentSalary(player, season) {
    if (!player.contract) return 0;
    const y = player.contract.years.find((yr)=>yr.season === season);
    if (!y) return 0;
    return y.baseSalary + y.proratedBonus;
}
}),
"[project]/packages/sport-basketball/src/capRules/capActions.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Available cap actions for a team.
 *
 * Returns the list of cap-related moves a team can make right now, given
 * their current payroll + apron status. The negotiation/UI layer uses this
 * to render affordances ("Use MLE", "Match RFA offer", etc.) and to gate
 * actions that would push the team over a hard cap.
 *
 * v1 scope:
 *   - Sign with cap room (if under cap)
 *   - Room exception (if under cap, after using room)
 *   - Non-tax MLE (over cap, under first apron)
 *   - Tax MLE (in tax, under first apron)
 *   - Taxpayer MLE (in first apron, blocked by second apron)
 *   - Bi-Annual Exception (under first apron)
 *   - Veteran minimum (always)
 *   - Waive-and-stretch (always, if has releasable contracts)
 *
 * v2 deferred:
 *   - Trade-pending TPE (Traded Player Exception) — generated by trades,
 *     usable for up to 1 year. Requires trade history tracking.
 *   - Sign-and-trade arrangements — multi-team coordination + BYC math.
 *   - Hard-cap activation tracking (sign-and-trade acquisition, MLE use,
 *     etc.) that affects future-action availability.
 *   - BAE every-other-year enforcement (requires history).
 */ __turbopack_context__.s([
    "basketballAvailableCapActions",
    ()=>basketballAvailableCapActions
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/capRules.ts [app-rsc] (ecmascript)");
;
// ===========================================================================
// Approximated exception amounts (% of cap)
// ===========================================================================
/** Non-tax Mid-Level: real-NBA ~$13M for 2024-25 ≈ 9% of cap. */ const NON_TAX_MLE_PCT = 0.094;
/** Tax MLE (over tax line, under first apron): ~$5.6M ≈ 4% of cap. */ const TAX_MLE_PCT = 0.040;
/** Taxpayer MLE (first apron team): same ~$5.6M, but use blocked by 2nd apron. */ const TAXPAYER_MLE_PCT = 0.040;
/** Bi-Annual Exception: ~$4.5M ≈ 3.2% of cap. */ const BAE_PCT = 0.032;
/** Room Exception: ~$8M ≈ 5.7% of cap. */ const ROOM_EXCEPTION_PCT = 0.057;
function basketballAvailableCapActions(teamId, players, season) {
    // Only count players on THIS team
    const teamPlayers = players.filter((p)=>p.rosterSlot?.teamId === teamId);
    const status = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballTeamCapStatus"])(teamPlayers, season);
    const cap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballSalaryCap"])(season);
    const actions = [];
    // --- Cap-room signing path (team under cap) ---
    if (status.capRoom > 0) {
        actions.push({
            id: 'sign_with_cap_room',
            label: `Sign with cap room ($${(status.capRoom / 1e6).toFixed(1)}M)`,
            description: 'Use available cap room to sign a free agent at any salary up to your room.',
            available: true,
            approxAmount: status.capRoom
        });
        actions.push({
            id: 'use_room_exception',
            label: `Use Room Exception (~$${(cap * ROOM_EXCEPTION_PCT / 1e6).toFixed(1)}M)`,
            description: 'Room teams get a smaller exception after using their cap room.',
            available: true,
            approxAmount: cap * ROOM_EXCEPTION_PCT
        });
    } else {
        // --- Over-cap exceptions ---
        // MLE — flavor depends on where the team sits relative to tax + aprons
        if (status.isOverSecondApron) {
            actions.push({
                id: 'use_mle',
                label: 'Use MLE',
                description: 'Mid-Level Exception is not available for teams over the second apron.',
                available: false,
                blockedReason: 'Team is over the second apron',
                approxAmount: 0
            });
        } else if (status.isOverFirstApron) {
            const amount = cap * TAXPAYER_MLE_PCT;
            actions.push({
                id: 'use_mle_taxpayer',
                label: `Use Taxpayer MLE (~$${(amount / 1e6).toFixed(1)}M)`,
                description: 'First-apron teams can only use the smaller taxpayer MLE.',
                available: true,
                approxAmount: amount
            });
        } else if (status.isOverTax) {
            const amount = cap * TAX_MLE_PCT;
            actions.push({
                id: 'use_mle_taxpayer',
                label: `Use Tax MLE (~$${(amount / 1e6).toFixed(1)}M)`,
                description: 'Tax-paying teams have access to a reduced MLE.',
                available: true,
                approxAmount: amount
            });
        } else {
            const amount = cap * NON_TAX_MLE_PCT;
            actions.push({
                id: 'use_mle_nontax',
                label: `Use Non-Tax MLE (~$${(amount / 1e6).toFixed(1)}M)`,
                description: 'Full non-taxpayer mid-level exception (~9% of the cap).',
                available: true,
                approxAmount: amount
            });
        }
        // BAE — blocked by first apron
        if (status.isOverFirstApron) {
            actions.push({
                id: 'use_bae',
                label: 'Use Bi-Annual Exception',
                description: 'BAE is unavailable above the first apron.',
                available: false,
                blockedReason: 'Team is over the first apron',
                approxAmount: 0
            });
        } else {
            const amount = cap * BAE_PCT;
            actions.push({
                id: 'use_bae',
                label: `Use Bi-Annual Exception (~$${(amount / 1e6).toFixed(1)}M)`,
                description: 'Available every other year for teams under the first apron.',
                available: true,
                approxAmount: amount
            });
        }
    }
    // --- Always-available actions ---
    actions.push({
        id: 'sign_minimum',
        label: 'Sign veteran minimum',
        description: 'Always available — no exception needed.',
        available: true,
        approxAmount: 1_200_000
    });
    // Waive-and-stretch only if the team has at least one releasable contract
    const hasReleasable = teamPlayers.some((p)=>p.contract && p.contract.years.some((y)=>y.guaranteed && y.season >= season));
    if (hasReleasable) {
        actions.push({
            id: 'stretch_release',
            label: 'Waive and stretch a player',
            description: 'Spread remaining guaranteed money across (2N+1) years to reduce annual dead cap.',
            available: true
        });
    }
    return actions;
}
}),
"[project]/packages/sport-basketball/src/capRules/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/capRules — NBA salary cap mechanics.
 *
 * Foundation commit: cap calculation, contract legality, payroll math.
 * Dead cap + market salary + Bird rights land in follow-up commits.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/capRules.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$deadCap$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/deadCap.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$marketSalary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/marketSalary.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$birdRights$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/birdRights.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capActions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/capActions.ts [app-rsc] (ecmascript)");
;
;
;
;
;
}),
"[project]/packages/sport-basketball/src/capRules/index.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BASE_CAP_2026",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["BASE_CAP_2026"],
    "CAP_INFLATION_RATE",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CAP_INFLATION_RATE"],
    "LEAGUE_MINIMUM_SALARY",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["LEAGUE_MINIMUM_SALARY"],
    "MAX_CONTRACT_YEARS",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["MAX_CONTRACT_YEARS"],
    "MAX_YEARLY_RAISE",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["MAX_YEARLY_RAISE"],
    "TAX_THRESHOLD_MULT",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["TAX_THRESHOLD_MULT"],
    "basketballAvailableCapActions",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capActions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAvailableCapActions"],
    "basketballBirdRightsMaxSalary",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$birdRights$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballBirdRightsMaxSalary"],
    "basketballContractRemainingGuaranteed",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballContractRemainingGuaranteed"],
    "basketballContractYearForSeason",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballContractYearForSeason"],
    "basketballDeadCapForRelease",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$deadCap$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballDeadCapForRelease"],
    "basketballFirstApron",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballFirstApron"],
    "basketballMarketContractYears",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$marketSalary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballMarketContractYears"],
    "basketballMarketSalary",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$marketSalary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballMarketSalary"],
    "basketballResolveBirdRights",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$birdRights$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballResolveBirdRights"],
    "basketballSalaryCap",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballSalaryCap"],
    "basketballSecondApron",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballSecondApron"],
    "basketballStretchPreview",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$deadCap$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballStretchPreview"],
    "basketballTaxThreshold",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballTaxThreshold"],
    "basketballTeamCapStatus",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballTeamCapStatus"],
    "basketballTeamPayroll",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballTeamPayroll"],
    "isLegalBasketballContract",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isLegalBasketballContract"],
    "isLegalBasketballRoster",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isLegalBasketballRoster"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/capRules.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$deadCap$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/deadCap.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$marketSalary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/marketSalary.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$birdRights$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/birdRights.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capActions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/capActions.ts [app-rsc] (ecmascript)");
}),
"[project]/packages/sport-basketball/src/draftSystem/index.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_CAP_REFERENCE",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$rookieScale$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DEFAULT_CAP_REFERENCE"],
    "aiBasketballDraftPick",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$aiPick$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["aiBasketballDraftPick"],
    "basketballPickValue",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$draftOrder$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballPickValue"],
    "generateBasketballDraftOrder",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$draftOrder$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["generateBasketballDraftOrder"],
    "rookieScaleContract",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$rookieScale$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["rookieScaleContract"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$draftOrder$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/draftOrder.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$aiPick$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/aiPick.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$rookieScale$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/rookieScale.ts [app-rsc] (ecmascript)");
}),
"[project]/packages/sport-basketball/src/tradeEvaluator/tradeEvaluator.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Basketball trade evaluator.
 *
 * Given a proposed multi-team trade, returns whether it is:
 *   - Cap-legal (salary-matching rules per team)
 *   - "Fair" (value-in vs value-out for each team)
 *   - Accepted by each team's AI (combines fairness + need)
 *
 * NBA salary-matching rules (v1 implementation):
 *   - Teams under the cap: can take back any amount up to (outgoing + capRoom).
 *   - Teams over the cap follow the tiered 125% rule:
 *       - Outgoing salary ≤ $7.5M:  take back ≤ 200% + $250k
 *       - $7.5M < outgoing ≤ $29M:  take back ≤ outgoing + $7.5M
 *       - Outgoing > $29M:           take back ≤ 125% + $250k
 *
 * Player value model:
 *   - Player's market salary is the base value (computed via marketSalary)
 *   - Contract surplus value (player's market salary - actual cap hit) is
 *     added — a cheap deal is more valuable than an expensive same-OVR
 *     player.
 *
 * v1 simplifications:
 *   - No apron-specific trade rules (first apron: no aggregation; second
 *     apron: hard 1:1 ceiling). Surfaced via warnings only.
 *   - No traded-player-exception generation (multi-team trades that net
 *     a team under-paying create a TPE; v2 should track + use).
 *   - No base-year compensation (sign-and-trade BYC math). v2.
 *   - No outgoing-team retained salary (deferred).
 *   - Cash-sent is treated as a value transfer only, not a cap charge.
 *     NBA limits cash to ~$7.5M/season per team — v1 doesn't enforce.
 *   - AI acceptance is a simple value-delta check; v2 should weight
 *     positional need, team timeline (rebuild vs contender), etc.
 */ __turbopack_context__.s([
    "evaluateBasketballTrade",
    ()=>evaluateBasketballTrade
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/index.ts [app-rsc] (ecmascript)");
;
function evaluateBasketballTrade(proposal, context) {
    const warnings = [];
    const perTeam = [];
    const pickValueFn = context.pickValueFn ?? ((p)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballPickValue"])(p.round));
    // Build a quick (teamId,playerId) → player lookup
    const allPlayers = new Map();
    for (const players of context.teamRosters.values()){
        for (const p of players)allPlayers.set(p.id, p);
    }
    // For each side: compute outgoing + incoming
    for (const side of proposal.sides){
        const outgoing = collectOutgoing(side, allPlayers, proposal.season, pickValueFn);
        // Incoming = sum of all OTHER sides' outgoing flowing TO this team.
        // v1 simplification: trades are partitioned per-side; we assume the
        // proposed flow is balanced (i.e., everything one side sends out goes
        // somewhere). For 2-team trades, incoming = the other side's outgoing.
        // For 3+ team trades, the caller's split determines flow.
        const incoming = collectIncomingForSide(side, proposal, allPlayers, pickValueFn, proposal.season);
        const teamRoster = context.teamRosters.get(side.teamId) ?? [];
        const capStatus = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballTeamCapStatus"])(teamRoster, proposal.season);
        const cap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballSalaryCap"])(proposal.season);
        const isOverCap = capStatus.payroll > cap;
        const maxIncomingAllowed = computeMaxIncomingSalary(outgoing.salary, capStatus.capRoom, isOverCap);
        const capCompliant = incoming.salary <= maxIncomingAllowed + 1; // +1 for float fuzz
        const netValue = incoming.totalValue - outgoing.totalValue;
        const fairnessTolerance = Math.max(2_000_000, outgoing.totalValue * 0.15);
        const willAccept = netValue >= -fairnessTolerance;
        let reasoning;
        if (!capCompliant) {
            reasoning = `Cap violation: taking back $${(incoming.salary / 1e6).toFixed(1)}M exceeds max $${(maxIncomingAllowed / 1e6).toFixed(1)}M for $${(outgoing.salary / 1e6).toFixed(1)}M outgoing.`;
        } else if (netValue >= 1_500_000) {
            reasoning = `Team gains ~$${(netValue / 1e6).toFixed(1)}M in value — clear win.`;
        } else if (netValue >= -fairnessTolerance) {
            reasoning = `Roughly even value (within $${(Math.abs(netValue) / 1e6).toFixed(1)}M).`;
        } else {
            reasoning = `Team loses ~$${(Math.abs(netValue) / 1e6).toFixed(1)}M in value — unlikely to accept.`;
        }
        perTeam.push({
            teamId: side.teamId,
            valueIn: incoming.totalValue,
            valueOut: outgoing.totalValue,
            netValue,
            willAccept,
            capCompliant,
            reasoning,
            capDetail: {
                outgoingSalary: outgoing.salary,
                incomingSalary: incoming.salary,
                maxIncomingAllowed,
                isOverCap
            }
        });
    }
    // Apron warnings — non-blocking
    for (const outcome of perTeam){
        const status = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballTeamCapStatus"])(context.teamRosters.get(outcome.teamId) ?? [], proposal.season);
        if (status.isOverFirstApron && outcome.capDetail.incomingSalary > outcome.capDetail.outgoingSalary + 1) {
            warnings.push(`${outcome.teamId} is over the first apron — taking back more salary than sending may not be permitted in real CBA (v1 doesn't enforce).`);
        }
    }
    const legal = perTeam.every((t)=>t.capCompliant);
    const allAccept = perTeam.every((t)=>t.willAccept);
    let summary;
    if (!legal) {
        summary = 'Trade is not cap-legal.';
    } else if (allAccept) {
        summary = 'Trade is legal and accepted by all teams.';
    } else {
        const rejecting = perTeam.filter((t)=>!t.willAccept).map((t)=>t.teamId).join(', ');
        summary = `Trade is legal but rejected by: ${rejecting}.`;
    }
    return {
        legal,
        allAccept,
        perTeam,
        summary,
        warnings
    };
}
// ===========================================================================
// Salary-matching rule (v1: tiered 125% rule)
// ===========================================================================
function computeMaxIncomingSalary(outgoing, capRoom, isOverCap) {
    if (!isOverCap) {
        // Under cap: outgoing + remaining cap room
        return outgoing + Math.max(0, capRoom);
    }
    // Over cap — tiered NBA rule (v1 approximation):
    // outgoing ≤ $7.5M: 200% + $250k
    // $7.5M < outgoing ≤ $29M: outgoing + $7.5M
    // > $29M: 125% + $250k
    if (outgoing <= 7_500_000) {
        return outgoing * 2 + 250_000;
    }
    if (outgoing <= 29_000_000) {
        return outgoing + 7_500_000;
    }
    return outgoing * 1.25 + 250_000;
}
function collectOutgoing(side, allPlayers, season, pickValueFn) {
    let totalValue = 0;
    let salary = 0;
    for (const id of side.playersSent){
        const p = allPlayers.get(id);
        if (!p) continue;
        totalValue += playerValue(p, season);
        salary += currentSeasonSalary(p, season);
    }
    for (const pick of side.picksSent){
        totalValue += pickValueFn(pick) * 100_000; // scale pick "points" to dollars-ish
    }
    totalValue += side.cashSent ?? 0;
    return {
        totalValue,
        salary
    };
}
/** For a given side, sum the outgoing of OTHER sides as incoming. */ function collectIncomingForSide(side, proposal, allPlayers, pickValueFn, season) {
    let totalValue = 0;
    let salary = 0;
    for (const other of proposal.sides){
        if (other.teamId === side.teamId) continue;
        const out = collectOutgoing(other, allPlayers, season, pickValueFn);
        // v1: split incoming equally across all OTHER teams' outgoing for
        // multi-team trades. For 2-team trades this is exact. For 3+ team
        // trades, the caller can refine by setting up the sides so flow is
        // implicit; v2 should allow explicit per-side recipients.
        totalValue += out.totalValue / Math.max(1, proposal.sides.length - 1);
        salary += out.salary / Math.max(1, proposal.sides.length - 1);
    }
    return {
        totalValue,
        salary
    };
}
/** Player value for fairness math: market salary + contract surplus. */ function playerValue(player, season) {
    const market = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballMarketSalary"])(player, {
        season
    });
    const currentSalary = currentSeasonSalary(player, season);
    // Surplus value = how much team is "saving" vs market rate.
    // A $5M player on a $1M deal has $4M of surplus value.
    const surplus = Math.max(0, market - currentSalary);
    return market + surplus * 1.5; // weight surplus higher than nominal market
}
function currentSeasonSalary(player, season) {
    if (!player.contract) return 0;
    const y = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballContractYearForSeason"])(player.contract, season);
    return y ? y.baseSalary + y.proratedBonus : 0;
}
}),
"[project]/packages/sport-basketball/src/tradeEvaluator/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/tradeEvaluator — multi-team trade legality + fairness.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$tradeEvaluator$2f$tradeEvaluator$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/tradeEvaluator/tradeEvaluator.ts [app-rsc] (ecmascript)");
;
}),
"[project]/packages/sport-basketball/src/lineupModel/lineupModel.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * NBA-style lineup model.
 *
 * Basketball lineups are a rotation: 5 starters (one per position) + a bench
 * ordered by rotation priority. Each starting position also has a designated
 * backup so injury substitutions are deterministic.
 *
 * The core stores lineups as opaque TLineup blobs and hands them to the
 * adapter for sim and rendering. This module supplies:
 *   - buildDefault(roster): auto-build a sensible lineup from a roster
 *   - validate(lineup, roster): check internal consistency
 *
 * v1 simplifications:
 *   - buildDefault picks top-OVR player at each position. No "starting
 *     two PFs because we don't have a real C" heuristic — if you don't
 *     have a C, you get a null starter at C and a violation from validate.
 *   - Bench is sorted by OVR descending after starters are picked.
 *   - No minutes distribution — sim engine has its own simple 4:2 starter:bench
 *     pattern. v2 lineup model could carry explicit minutes targets.
 */ __turbopack_context__.s([
    "buildDefaultBasketballLineup",
    ()=>buildDefaultBasketballLineup,
    "buildDefaultLineupAdapter",
    ()=>buildDefaultLineupAdapter,
    "validateBasketballLineup",
    ()=>validateBasketballLineup,
    "validateLineupAdapter",
    ()=>validateLineupAdapter
]);
// ===========================================================================
// Starter slot order
// ===========================================================================
const STARTER_POSITIONS = [
    'PG',
    'SG',
    'SF',
    'PF',
    'C'
];
function buildDefaultBasketballLineup(roster) {
    // Group roster by position, each group sorted by OVR descending
    const byPos = {
        PG: [],
        SG: [],
        SF: [],
        PF: [],
        C: []
    };
    for (const p of roster){
        byPos[p.sportData.position].push(p);
    }
    for (const pos of STARTER_POSITIONS){
        byPos[pos].sort((a, b)=>b.ratings.overall - a.ratings.overall);
    }
    // Pick starters (top of each pile)
    const starterIds = [];
    const used = new Set();
    for (const pos of STARTER_POSITIONS){
        const top = byPos[pos][0];
        if (top) {
            starterIds.push(top.id);
            used.add(top.id);
        } else {
            // No player at this position — use sentinel
            starterIds.push('');
        }
    }
    // Pick backups (second-best at each position; fall back to next-best
    // unused player who can plausibly play the position)
    const backupsByPosition = {
        PG: null,
        SG: null,
        SF: null,
        PF: null,
        C: null
    };
    for (const pos of STARTER_POSITIONS){
        const candidate = byPos[pos].find((p)=>!used.has(p.id));
        if (candidate) {
            backupsByPosition[pos] = candidate.id;
            used.add(candidate.id);
        }
    }
    // Bench = everyone else, sorted by OVR descending (rotation priority)
    const bench = roster.filter((p)=>!used.has(p.id)).sort((a, b)=>b.ratings.overall - a.ratings.overall).map((p)=>p.id);
    return {
        starters: starterIds,
        bench,
        backupsByPosition,
        pace: 'medium'
    };
}
function validateBasketballLineup(lineup, roster) {
    const violations = [];
    const warnings = [];
    const rosterById = new Map(roster.map((p)=>[
            p.id,
            p
        ]));
    // Starters: exactly 5, all on roster, all non-empty
    if (lineup.starters.length !== 5) {
        violations.push({
            code: 'LINEUP_WRONG_STARTER_COUNT',
            message: `Lineup must have exactly 5 starters; got ${lineup.starters.length}.`
        });
    }
    const starterSet = new Set();
    for(let i = 0; i < lineup.starters.length; i++){
        const id = lineup.starters[i];
        const expectedPos = STARTER_POSITIONS[i];
        if (!id) {
            violations.push({
                code: 'LINEUP_MISSING_STARTER',
                message: `No starter assigned at ${expectedPos}.`
            });
            continue;
        }
        if (starterSet.has(id)) {
            violations.push({
                code: 'LINEUP_DUPLICATE_STARTER',
                message: `Player ${id} appears twice in starters.`,
                ref: {
                    kind: 'player',
                    id
                }
            });
        }
        starterSet.add(id);
        const player = rosterById.get(id);
        if (!player) {
            violations.push({
                code: 'LINEUP_STARTER_NOT_ON_ROSTER',
                message: `Starter ${id} is not on the roster.`,
                ref: {
                    kind: 'player',
                    id
                }
            });
            continue;
        }
        if (player.sportData.position !== expectedPos) {
            // Warning rather than violation — small-ball / position-less can be
            // legitimate, but UI should flag the mismatch.
            warnings.push({
                code: 'LINEUP_POSITION_MISMATCH',
                message: `${id} listed as ${player.sportData.position} starting at ${expectedPos}.`,
                ref: {
                    kind: 'player',
                    id
                }
            });
        }
    }
    // Bench: no overlap with starters, all on roster
    const benchSet = new Set();
    for (const id of lineup.bench){
        if (starterSet.has(id)) {
            violations.push({
                code: 'LINEUP_BENCH_OVERLAPS_STARTER',
                message: `${id} is both a starter and on the bench.`,
                ref: {
                    kind: 'player',
                    id
                }
            });
        }
        if (benchSet.has(id)) {
            violations.push({
                code: 'LINEUP_DUPLICATE_BENCH',
                message: `${id} listed twice on the bench.`,
                ref: {
                    kind: 'player',
                    id
                }
            });
        }
        benchSet.add(id);
        if (!rosterById.has(id)) {
            violations.push({
                code: 'LINEUP_BENCH_NOT_ON_ROSTER',
                message: `Bench player ${id} is not on the roster.`,
                ref: {
                    kind: 'player',
                    id
                }
            });
        }
    }
    // Backups: optional, but if set must be on roster & not the same as the starter
    for (const pos of STARTER_POSITIONS){
        const backupId = lineup.backupsByPosition[pos];
        if (!backupId) continue;
        const starterId = lineup.starters[STARTER_POSITIONS.indexOf(pos)];
        if (backupId === starterId) {
            violations.push({
                code: 'LINEUP_BACKUP_IS_STARTER',
                message: `Backup ${pos} ${backupId} is also the starter.`,
                ref: {
                    kind: 'player',
                    id: backupId
                }
            });
        }
        if (!rosterById.has(backupId)) {
            violations.push({
                code: 'LINEUP_BACKUP_NOT_ON_ROSTER',
                message: `Backup ${pos} ${backupId} is not on the roster.`,
                ref: {
                    kind: 'player',
                    id: backupId
                }
            });
        }
    }
    return {
        valid: violations.length === 0,
        violations,
        warnings
    };
}
function buildDefaultLineupAdapter(players) {
    return buildDefaultBasketballLineup(players);
}
function validateLineupAdapter(lineup, players) {
    return validateBasketballLineup(lineup, players);
}
}),
"[project]/packages/sport-basketball/src/lineupModel/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

/**
 * @bs/sport-basketball/lineupModel — 5-starter rotation lineup with backups.
 */ __turbopack_context__.s([
    "basketballLineupModel",
    ()=>basketballLineupModel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$lineupModel$2f$lineupModel$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/lineupModel/lineupModel.ts [app-rsc] (ecmascript)");
;
;
const basketballLineupModel = {
    kind: 'rotation',
    buildDefault: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$lineupModel$2f$lineupModel$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["buildDefaultLineupAdapter"],
    validate: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$lineupModel$2f$lineupModel$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["validateLineupAdapter"]
};
}),
"[project]/packages/sport-basketball/src/coachingSystem/coachingSystem.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Basketball coaching system.
 *
 * Defines:
 *   - Coach roles: HC (head coach), AC (assistant), PDC (player development),
 *     ATC (athletic trainer).
 *   - Tactical schemes head coaches can run, grouped by philosophy.
 *   - Helper functions for resolving coach effects on the sim.
 *
 * v1 effects model (simple, declarative):
 *   - HC scheme nudges pace, shot selection, and defensive style
 *   - PDC adds a small development boost to younger players
 *   - ATC reduces injury rate
 *
 * The CoachingSystem contract from @bs/core/adapter is type-only — it just
 * tells the core which roles + schemes exist. The actual effects are
 * applied by sport-specific consumers (sim engine, development system).
 */ __turbopack_context__.s([
    "BASKETBALL_COACH_ROLES",
    ()=>BASKETBALL_COACH_ROLES,
    "BASKETBALL_HC_SCHEMES",
    ()=>BASKETBALL_HC_SCHEMES,
    "BASKETBALL_SCHEMES",
    ()=>BASKETBALL_SCHEMES,
    "basketballCoachingSystem",
    ()=>basketballCoachingSystem,
    "listBasketballSchemes",
    ()=>listBasketballSchemes,
    "resolveBasketballATCEffect",
    ()=>resolveBasketballATCEffect,
    "resolveBasketballPDCEffect",
    ()=>resolveBasketballPDCEffect,
    "resolveBasketballSchemeEffect",
    ()=>resolveBasketballSchemeEffect
]);
const BASKETBALL_COACH_ROLES = [
    'HC',
    'AC',
    'PDC',
    'ATC'
];
const BASKETBALL_HC_SCHEMES = [
    'five_out',
    'horns',
    'princeton',
    'triangle',
    'flow'
];
const BASKETBALL_SCHEMES = {
    HC: BASKETBALL_HC_SCHEMES,
    AC: [],
    PDC: [],
    ATC: []
};
const HC_SCHEME_EFFECTS = {
    five_out: {
        paceMultiplier: 1.04,
        threePointAttemptMultiplier: 1.15,
        postAttemptMultiplier: 0.70,
        defensiveIntensityMultiplier: 1.00,
        description: 'Spread the floor with five shooters; live and die by the three.'
    },
    horns: {
        paceMultiplier: 1.00,
        threePointAttemptMultiplier: 1.00,
        postAttemptMultiplier: 0.95,
        defensiveIntensityMultiplier: 1.05,
        description: 'Balanced two-screen pick-and-roll attack; sound defense.'
    },
    princeton: {
        paceMultiplier: 0.95,
        threePointAttemptMultiplier: 1.05,
        postAttemptMultiplier: 0.90,
        defensiveIntensityMultiplier: 1.00,
        description: 'Motion offense with cuts and ball movement; patient possessions.'
    },
    triangle: {
        paceMultiplier: 0.88,
        threePointAttemptMultiplier: 0.80,
        postAttemptMultiplier: 1.30,
        defensiveIntensityMultiplier: 1.05,
        description: 'Post-centric, slow-paced triangle offense.'
    },
    flow: {
        paceMultiplier: 1.10,
        threePointAttemptMultiplier: 1.05,
        postAttemptMultiplier: 0.85,
        defensiveIntensityMultiplier: 0.95,
        description: 'High-pace read-and-react; offensive freedom over defensive discipline.'
    }
};
function resolveBasketballSchemeEffect(scheme) {
    return HC_SCHEME_EFFECTS[scheme];
}
function listBasketballSchemes() {
    return BASKETBALL_HC_SCHEMES.map((scheme)=>({
            scheme,
            effect: HC_SCHEME_EFFECTS[scheme]
        }));
}
function resolveBasketballPDCEffect(pdcRating, playerAge) {
    // Above-average PDC (>70) speeds up growth for sub-25 players
    if (playerAge >= 25) return 1.0;
    const bonus = Math.max(0, (pdcRating - 70) / 100); // up to +0.29 at 99
    return 1.0 + bonus * 0.5; // capped at +14.5% growth
}
function resolveBasketballATCEffect(atcRating) {
    // ATC >70 reduces injury rate; <70 increases it.
    const delta = (atcRating - 70) / 100; // -0.7 to +0.29
    return Math.max(0.6, 1.0 - delta * 0.5); // never below 60% of baseline
}
const basketballCoachingSystem = {
    roles: BASKETBALL_COACH_ROLES,
    schemes: BASKETBALL_SCHEMES,
    maxStaffSize: 6
};
}),
"[project]/packages/sport-basketball/src/coachingSystem/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/coachingSystem — coach roles, schemes, and effects.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$coachingSystem$2f$coachingSystem$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/coachingSystem/coachingSystem.ts [app-rsc] (ecmascript)");
;
}),
"[project]/packages/sport-basketball/src/uiMetadata/uiMetadata.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Basketball UI metadata.
 *
 * Declarative description of how the UI should render basketball-specific
 * content: rating cards, stat tables, position groupings, and lineup
 * rendering. The core/UI consumes these through the SportAdapter contract.
 *
 * Adding a new rating or stat field?
 *   1. Update BasketballRatings / BasketballStats in src/types
 *   2. Add a descriptor here so the UI surfaces it
 *   3. The leaders/stat pages pick it up automatically
 */ __turbopack_context__.s([
    "basketballUiMetadata",
    ()=>basketballUiMetadata,
    "describeBasketballLineup",
    ()=>describeBasketballLineup,
    "positionGroups",
    ()=>positionGroups,
    "ratingFields",
    ()=>ratingFields,
    "statColumns",
    ()=>statColumns
]);
// ===========================================================================
// Rating field descriptors — grouped for the player card UI
// ===========================================================================
const ratingFields = [
    // Shooting
    {
        key: 'threePoint',
        label: '3PT',
        group: 'Shooting'
    },
    {
        key: 'midRange',
        label: 'MID',
        group: 'Shooting'
    },
    {
        key: 'finishing',
        label: 'FIN',
        group: 'Shooting'
    },
    {
        key: 'freeThrow',
        label: 'FT',
        group: 'Shooting'
    },
    {
        key: 'postScoring',
        label: 'POST',
        group: 'Shooting'
    },
    // Playmaking
    {
        key: 'handles',
        label: 'HND',
        group: 'Playmaking'
    },
    {
        key: 'passing',
        label: 'PAS',
        group: 'Playmaking'
    },
    // Defense
    {
        key: 'perimeterDefense',
        label: 'PRM',
        group: 'Defense'
    },
    {
        key: 'interiorDefense',
        label: 'INT',
        group: 'Defense'
    },
    {
        key: 'rebounding',
        label: 'REB',
        group: 'Defense'
    },
    {
        key: 'steal',
        label: 'STL',
        group: 'Defense'
    },
    {
        key: 'block',
        label: 'BLK',
        group: 'Defense'
    },
    // Athletic
    {
        key: 'speed',
        label: 'SPD',
        group: 'Athletic'
    },
    {
        key: 'vertical',
        label: 'VRT',
        group: 'Athletic'
    },
    {
        key: 'strength',
        label: 'STR',
        group: 'Athletic'
    },
    // Mental
    {
        key: 'basketballIQ',
        label: 'IQ',
        group: 'Mental'
    },
    {
        key: 'intangibles',
        label: 'ITG',
        group: 'Mental'
    }
];
// ===========================================================================
// Stat column descriptors — for box scores + leaders pages
// ===========================================================================
const statColumns = [
    {
        key: 'points',
        label: 'PTS',
        category: 'Scoring',
        format: 'decimal',
        higherIsBetter: true
    },
    {
        key: 'totalRebounds',
        label: 'REB',
        category: 'Rebounds',
        format: 'decimal',
        higherIsBetter: true
    },
    {
        key: 'offensiveRebounds',
        label: 'OREB',
        category: 'Rebounds',
        format: 'decimal',
        higherIsBetter: true
    },
    {
        key: 'defensiveRebounds',
        label: 'DREB',
        category: 'Rebounds',
        format: 'decimal',
        higherIsBetter: true
    },
    {
        key: 'assists',
        label: 'AST',
        category: 'Playmaking',
        format: 'decimal',
        higherIsBetter: true
    },
    {
        key: 'turnovers',
        label: 'TO',
        category: 'Playmaking',
        format: 'decimal',
        higherIsBetter: false
    },
    {
        key: 'steals',
        label: 'STL',
        category: 'Defense',
        format: 'decimal',
        higherIsBetter: true
    },
    {
        key: 'blocks',
        label: 'BLK',
        category: 'Defense',
        format: 'decimal',
        higherIsBetter: true
    },
    {
        key: 'personalFouls',
        label: 'PF',
        category: 'Defense',
        format: 'decimal',
        higherIsBetter: false
    },
    {
        key: 'fieldGoalsMade',
        label: 'FGM',
        category: 'Shooting',
        format: 'integer',
        higherIsBetter: true
    },
    {
        key: 'fieldGoalsAttempted',
        label: 'FGA',
        category: 'Shooting',
        format: 'integer',
        higherIsBetter: true
    },
    {
        key: 'threePointsMade',
        label: '3PM',
        category: 'Shooting',
        format: 'integer',
        higherIsBetter: true
    },
    {
        key: 'threePointsAttempted',
        label: '3PA',
        category: 'Shooting',
        format: 'integer',
        higherIsBetter: true
    },
    {
        key: 'freeThrowsMade',
        label: 'FTM',
        category: 'Shooting',
        format: 'integer',
        higherIsBetter: true
    },
    {
        key: 'freeThrowsAttempted',
        label: 'FTA',
        category: 'Shooting',
        format: 'integer',
        higherIsBetter: true
    },
    {
        key: 'minutes',
        label: 'MIN',
        category: 'Usage',
        format: 'decimal',
        higherIsBetter: true
    },
    {
        key: 'plusMinus',
        label: '+/-',
        category: 'Impact',
        format: 'decimal',
        higherIsBetter: true
    }
];
// ===========================================================================
// Position groups — for depth chart display
// ===========================================================================
const positionGroups = [
    {
        label: 'Backcourt',
        positions: [
            'PG',
            'SG'
        ]
    },
    {
        label: 'Wing',
        positions: [
            'SF'
        ]
    },
    {
        label: 'Frontcourt',
        positions: [
            'PF',
            'C'
        ]
    }
];
// ===========================================================================
// Lineup description — render the rotation as groups for the UI
// ===========================================================================
const STARTER_POSITION_LABELS = [
    'PG',
    'SG',
    'SF',
    'PF',
    'C'
];
function describeBasketballLineup(lineup) {
    const startersGroup = {
        label: 'Starters',
        slots: STARTER_POSITION_LABELS.map((pos, i)=>({
                label: pos,
                playerId: lineup.starters[i] || null,
                isStarter: true
            }))
    };
    const benchGroup = {
        label: 'Bench',
        slots: lineup.bench.map((id, i)=>({
                label: `${i + 1}`,
                playerId: id,
                isStarter: false
            }))
    };
    const backupsGroup = {
        label: 'Position Backups',
        slots: STARTER_POSITION_LABELS.map((pos)=>({
                label: pos,
                playerId: lineup.backupsByPosition[pos],
                isStarter: false
            }))
    };
    return {
        groups: [
            startersGroup,
            benchGroup,
            backupsGroup
        ]
    };
}
const basketballUiMetadata = {
    ratingFields: ratingFields,
    statColumns: statColumns,
    positionGroups,
    themeOverrides: {
        accentColor: '#E66B00',
        accentColorAlt: '#1D428A'
    },
    describeLineup: describeBasketballLineup
};
;
}),
"[project]/packages/sport-basketball/src/uiMetadata/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/uiMetadata — rating fields, stat columns, position
 * groups, and lineup rendering for the UI.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$uiMetadata$2f$uiMetadata$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/uiMetadata/uiMetadata.ts [app-rsc] (ecmascript)");
;
}),
"[project]/packages/sport-basketball/src/statsEngine/statsEngine.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Basketball stats engine.
 *
 * Implements the StatsEngine<BasketballStats> contract from @bs/core/adapter:
 *   - empty(): zero stats object
 *   - accumulate(target, source): field-by-field addition
 *   - derived(stats): computed values (TS%, eFG%, per-game splits)
 *   - format(key, value): display formatting
 *
 * Delegates the heavy lifting to the existing helpers in ../types and
 * ../capRules-adjacent code where it makes sense.
 */ __turbopack_context__.s([
    "basketballStatsEngine",
    ()=>basketballStatsEngine
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/types/index.ts [app-rsc] (ecmascript)");
;
// ===========================================================================
// Helpers
// ===========================================================================
const PERCENT_FIELDS = new Set([
    'fgPct',
    'tpPct',
    'ftPct',
    'ts',
    'efg'
]);
const INTEGER_FIELDS = new Set([
    'fieldGoalsMade',
    'fieldGoalsAttempted',
    'threePointsMade',
    'threePointsAttempted',
    'freeThrowsMade',
    'freeThrowsAttempted',
    'gamesPlayed',
    'gamesStarted'
]);
function safeDivide(numerator, denominator) {
    return denominator > 0 ? numerator / denominator : 0;
}
const basketballStatsEngine = {
    empty (_kind) {
        // Basketball is uniform-shape — `kind` ignored.
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["emptyBasketballStats"])();
    },
    accumulate (target, source) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["addBasketballStats"])(target, source);
    },
    derived (stats) {
        const games = Math.max(1, stats.gamesPlayed || 1);
        return {
            ppg: +(stats.points / games).toFixed(1),
            rpg: +(stats.totalRebounds / games).toFixed(1),
            apg: +(stats.assists / games).toFixed(1),
            spg: +(stats.steals / games).toFixed(1),
            bpg: +(stats.blocks / games).toFixed(1),
            topg: +(stats.turnovers / games).toFixed(1),
            mpg: +(stats.minutes / games).toFixed(1),
            fgPct: +safeDivide(stats.fieldGoalsMade, stats.fieldGoalsAttempted).toFixed(3),
            tpPct: +safeDivide(stats.threePointsMade, stats.threePointsAttempted).toFixed(3),
            ftPct: +safeDivide(stats.freeThrowsMade, stats.freeThrowsAttempted).toFixed(3),
            ts: +(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["trueShootingPct"])(stats).toFixed(3),
            efg: +(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["effectiveFieldGoalPct"])(stats).toFixed(3)
        };
    },
    format (statKey, value) {
        const key = String(statKey);
        if (PERCENT_FIELDS.has(key)) {
            return `${(value * 100).toFixed(1)}%`;
        }
        if (INTEGER_FIELDS.has(key)) {
            return Math.round(value).toString();
        }
        // Most stats are per-game decimals with 1 decimal place
        return value.toFixed(1);
    }
};
}),
"[project]/packages/sport-basketball/src/statsEngine/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/statsEngine — empty/accumulate/derived/format stats ops.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$statsEngine$2f$statsEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/statsEngine/statsEngine.ts [app-rsc] (ecmascript)");
;
}),
"[project]/packages/sport-basketball/src/adapter/basketballAdapter.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

/**
 * Basketball SportAdapter assembly.
 *
 * Wires every capability module in this package — sim, playerGen, schedule,
 * draft, awards, development, capRules, tradeEvaluator, coaching, lineup,
 * UI metadata — into one object satisfying SportAdapter<BasketballRatings,
 * BasketballStats, BasketballPosition, BasketballLineup>.
 *
 * The core engine consumes only this object; it never reaches into individual
 * modules. That keeps the multi-sport boundary clean: when @bs/sport-hockey
 * lands, the core's only change is to import a different adapter.
 *
 * v1 design choices:
 *   - Where our existing function signatures don't exactly match the contract
 *     (e.g. computeBasketballAwards takes BasketballPlayer[] not a stats map),
 *     we wrap them in adapter methods that translate the args.
 *   - Wrappers that the core hasn't fully wired yet stay thin — they call our
 *     underlying functions with sensible defaults rather than throwing stubs.
 *   - Type assertions are used to bridge from concrete BasketballPlayer to
 *     the generic BasePlayer<TRatings, TStats> the contract requires. This is
 *     sound: BasketballPlayer extends BasePlayer<BasketballRatings, BasketballStats>.
 */ __turbopack_context__.s([
    "basketballAdapter",
    ()=>basketballAdapter,
    "basketballCompetitions",
    ()=>basketballCompetitions,
    "basketballRosterRules",
    ()=>basketballRosterRules,
    "basketballSeasonCalendar",
    ()=>basketballSeasonCalendar
]);
// Module imports — re-used as-is when their signature matches the contract.
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$playerGen$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/playerGen/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$playerGen$2f$playerGen$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/playerGen/playerGen.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$statsEngine$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/statsEngine/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$statsEngine$2f$statsEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/statsEngine/statsEngine.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/sim/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$game$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/sim/game.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$scheduleGenerator$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/scheduleGenerator/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$scheduleGenerator$2f$scheduleGenerator$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/scheduleGenerator/scheduleGenerator.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$draftOrder$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/draftOrder.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$aiPick$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/aiPick.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$developmentSystem$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/developmentSystem/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$developmentSystem$2f$development$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/developmentSystem/development.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$tradeEvaluator$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/tradeEvaluator/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$tradeEvaluator$2f$tradeEvaluator$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/tradeEvaluator/tradeEvaluator.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$marketSalary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/marketSalary.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$awards$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/awards/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$awards$2f$awards$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/awards/awards.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$lineupModel$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/lineupModel/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$coachingSystem$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/coachingSystem/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$coachingSystem$2f$coachingSystem$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/coachingSystem/coachingSystem.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$uiMetadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/uiMetadata/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$uiMetadata$2f$uiMetadata$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/uiMetadata/uiMetadata.ts [app-rsc] (ecmascript)");
// ===========================================================================
// Cap rules — defer to standalone implementations
// ===========================================================================
// Re-import only what we use here for the capRules wrapper.
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/capRules.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$deadCap$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/deadCap.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capActions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/capActions.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
;
const basketballRosterRules = {
    buckets: [
        {
            name: 'active',
            label: 'Active Roster (15)',
            capacity: 15,
            countsAsActive: true,
            countsAgainstCap: true,
            eligibleForLineups: true,
            ownership: 'self'
        },
        {
            name: 'two_way',
            label: 'Two-Way Contracts (3)',
            capacity: 3,
            countsAsActive: false,
            countsAgainstCap: false,
            eligibleForLineups: true,
            ownership: 'self'
        },
        {
            name: 'inactive',
            label: 'Inactive List',
            capacity: Infinity,
            countsAsActive: false,
            countsAgainstCap: true,
            eligibleForLineups: false,
            ownership: 'self'
        }
    ],
    activeRosterSize: 15,
    positionLimits: {
        PG: {
            min: 2,
            max: 4
        },
        SG: {
            min: 2,
            max: 4
        },
        SF: {
            min: 2,
            max: 4
        },
        PF: {
            min: 2,
            max: 4
        },
        C: {
            min: 2,
            max: 3
        }
    },
    validate (team, _league) {
        const violations = [];
        const warnings = [];
        const active = team.rosterBuckets?.active ?? [];
        if (active.length > 15) {
            violations.push({
                code: 'ROSTER_OVER_ACTIVE_LIMIT',
                message: `Active roster has ${active.length} players (max 15).`
            });
        }
        if (active.length < 13) {
            violations.push({
                code: 'ROSTER_UNDER_MIN',
                message: `Active roster has ${active.length} players (min 13).`
            });
        }
        return {
            valid: violations.length === 0,
            violations,
            warnings
        };
    }
};
// ===========================================================================
// SeasonCalendar
// ===========================================================================
/** NBA-style calendar in day-ticks. Preseason short, regular season is
 *  the long stretch, playoffs ~50 days, offseason gets the rest. */ const PHASES = [
    {
        name: 'preseason',
        label: 'Preseason',
        startTick: 1,
        endTick: 20,
        hasGames: true,
        allowedMovements: [
            'trade',
            'free_agency_sign',
            'release'
        ]
    },
    {
        name: 'regular_season',
        label: 'Regular Season',
        startTick: 21,
        endTick: 200,
        hasGames: true,
        allowedMovements: [
            'trade',
            'release',
            'free_agency_sign'
        ]
    },
    {
        name: 'playoffs',
        label: 'Playoffs',
        startTick: 201,
        endTick: 250,
        hasGames: true,
        allowedMovements: []
    },
    {
        name: 'offseason',
        label: 'Offseason',
        startTick: 251,
        endTick: 300,
        hasGames: false,
        allowedMovements: [
            'trade',
            'free_agency_sign',
            'release'
        ]
    }
];
const basketballSeasonCalendar = {
    ticksPerSeason: 300,
    phases: PHASES,
    describeTick (tick) {
        const phase = PHASES.find((p)=>tick >= p.startTick && tick <= p.endTick);
        if (!phase) return `Day ${tick}`;
        const dayInPhase = tick - phase.startTick + 1;
        return `${phase.label} — Day ${dayInPhase}`;
    },
    phaseForTick (tick) {
        const phase = PHASES.find((p)=>tick >= p.startTick && tick <= p.endTick);
        return phase?.name ?? 'offseason';
    }
};
const basketballCompetitions = [
    {
        id: 'primary',
        displayName: 'BS Hoops',
        format: {
            kind: 'round_robin',
            gamesPerOpponent: 3,
            followedByPlayoff: {
                rounds: [
                    {
                        name: 'Play-In',
                        tieFormat: {
                            type: 'single_match'
                        }
                    },
                    {
                        name: 'First Round',
                        tieFormat: {
                            type: 'best_of',
                            games: 7
                        }
                    },
                    {
                        name: 'Conference Semis',
                        tieFormat: {
                            type: 'best_of',
                            games: 7
                        }
                    },
                    {
                        name: 'Conference Finals',
                        tieFormat: {
                            type: 'best_of',
                            games: 7
                        }
                    },
                    {
                        name: 'Finals',
                        tieFormat: {
                            type: 'best_of',
                            games: 7
                        }
                    }
                ],
                reseededEachRound: false
            }
        },
        entryRule: 'all_league',
        weight: 1.0
    }
];
// ===========================================================================
// PlayerGenerator wrapper
// ===========================================================================
const basketballPlayerGen = {
    generatePlayer (opts) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$playerGen$2f$playerGen$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["generateBasketballPlayer"])({
            age: opts.age,
            position: opts.position,
            targetOverall: opts.targetOverall,
            archetype: opts.archetype
        });
    },
    generateDraftClass (season, count) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$playerGen$2f$playerGen$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["generateBasketballDraftClass"])(season, count);
    },
    migrate (rawPlayer, _fromVersion) {
        // v1: no migrations needed yet — return as-is. A future version field
        // change will route here.
        return rawPlayer;
    }
};
// ===========================================================================
// SimEngine wrapper
// ===========================================================================
const basketballSimEngine = {
    simGame (home, away, ctx) {
        const buildSide = (snap)=>({
                teamId: snap.team.id,
                players: snap.availablePlayers,
                lineup: snap.lineup
            });
        const gameCtx = {
            gameId: `game-${ctx.rngSeed}`,
            season: ctx.season,
            date: new Date().toISOString().slice(0, 10),
            competitionId: ctx.competitionId,
            isPlayoff: ctx.isPlayoff,
            rngSeed: ctx.rngSeed
        };
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$game$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["simBasketballGame"])(buildSide(home), buildSide(away), gameCtx);
    }
};
// ===========================================================================
// ScheduleGenerator wrapper
// ===========================================================================
const basketballScheduleGen = {
    generate (teams, season, _competitionId, _prevSeasonResults) {
        // generateBasketballSchedule needs BasketballTeamForSchedule (same shape).
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$scheduleGenerator$2f$scheduleGenerator$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["generateBasketballSchedule"])(teams, {
            season
        });
    }
};
// ===========================================================================
// DraftSystem wrapper
// ===========================================================================
const basketballDraftSystemAdapter = {
    rounds: 2,
    draftPhase: 'offseason_early',
    orderRule: 'mixed_lottery_then_reverse',
    computeDraftOrder (teams, prevSeasonResults) {
        // Derive simple standings from prevSeasonResults
        const winsByTeam = new Map();
        const lossesByTeam = new Map();
        for (const t of teams){
            winsByTeam.set(t.id, 0);
            lossesByTeam.set(t.id, 0);
        }
        for (const g of prevSeasonResults){
            if (!g.finalScore) continue;
            const homeWon = g.finalScore.home > g.finalScore.away;
            const winner = homeWon ? g.homeTeamId : g.awayTeamId;
            const loser = homeWon ? g.awayTeamId : g.homeTeamId;
            winsByTeam.set(winner, (winsByTeam.get(winner) ?? 0) + 1);
            lossesByTeam.set(loser, (lossesByTeam.get(loser) ?? 0) + 1);
        }
        const standings = teams.map((t)=>({
                teamId: t.id,
                wins: winsByTeam.get(t.id) ?? 0,
                losses: lossesByTeam.get(t.id) ?? 0,
                // v1: top 16 by wins make playoffs. The core may override this later.
                madePlayoffs: false
            }));
        // Mark top 16 by wins as playoff teams
        const sortedByWins = [
            ...standings
        ].sort((a, b)=>b.wins - a.wins);
        for(let i = 0; i < 16 && i < sortedByWins.length; i++){
            sortedByWins[i].madePlayoffs = true;
        }
        // Re-sort by wins ascending (worst first) for the lottery input
        standings.sort((a, b)=>a.wins - b.wins);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$draftOrder$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["generateBasketballDraftOrder"])(standings);
    },
    aiPick (pickingTeamId, availableProspects, state) {
        // Find the picking team's roster in the league state (teams is an array)
        const team = state.teams?.find((t)=>t.id === pickingTeamId);
        const rosterIds = team?.playerIds ?? [];
        const rosterPlayers = rosterIds.map((id)=>state.players?.[id]).filter((p)=>!!p);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$aiPick$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["aiBasketballDraftPick"])({
            teamId: pickingTeamId,
            rosterPlayers
        }, availableProspects);
    },
    pickValue (pick, _teams) {
        // v1: use round-based curve; pick within a round defaults to "middle"
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$draftOrder$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballPickValue"])(pick.round);
    }
};
// ===========================================================================
// DevelopmentSystem wrapper
// ===========================================================================
const basketballDevAdapter = {
    developSeason (player, season) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$developmentSystem$2f$development$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["developBasketballPlayer"])(player, season);
    },
    shouldRetire (player) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$developmentSystem$2f$development$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["shouldBasketballPlayerRetire"])(player);
    },
    tickPlayer (player, ticksAdvanced) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$developmentSystem$2f$development$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["tickBasketballPlayer"])(player, ticksAdvanced);
    }
};
// ===========================================================================
// PlayerMovementValuator (trade) wrapper
// ===========================================================================
const basketballTradeValuator = {
    playerValue (player, _forTeam, league) {
        const season = league?.currentSeason ?? new Date().getFullYear();
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$marketSalary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballMarketSalary"])(player, {
            season
        });
    },
    evaluate (movement, league) {
        if (movement.type !== 'trade') {
            return {
                accept: true,
                reasoning: 'Non-trade movement; no evaluation needed.'
            };
        }
        // Build roster map from league state (teams is an array)
        const teamRosters = new Map();
        if (league?.teams) {
            for (const team of league.teams){
                const players = (team.playerIds ?? []).map((id)=>league.players?.[id]).filter((p)=>!!p);
                teamRosters.set(team.id, players);
            }
        }
        const proposal = {
            season: league?.currentSeason ?? new Date().getFullYear(),
            sides: movement.sides.map((s)=>({
                    teamId: s.teamId,
                    playersSent: s.playersSent,
                    picksSent: s.picksSent,
                    cashSent: s.cashSent
                }))
        };
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$tradeEvaluator$2f$tradeEvaluator$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["evaluateBasketballTrade"])(proposal, {
            teamRosters
        });
        return {
            accept: result.legal && result.allAccept,
            reasoning: result.summary
        };
    },
    supportedMovementTypes: [
        'trade',
        'free_agency_sign',
        'release'
    ]
};
// ===========================================================================
// AwardSystem wrapper
// ===========================================================================
const basketballAwards = {
    definitions: [
        {
            id: 'mvp',
            name: 'MVP',
            description: 'Most Valuable Player',
            primaryStatKeys: [
                'points',
                'assists',
                'totalRebounds'
            ]
        },
        {
            id: 'dpoy',
            name: 'Defensive Player of the Year',
            description: 'Top defender',
            primaryStatKeys: [
                'steals',
                'blocks',
                'defensiveRebounds'
            ]
        },
        {
            id: 'roy',
            name: 'Rookie of the Year',
            description: 'Top rookie',
            primaryStatKeys: [
                'points',
                'assists'
            ]
        },
        {
            id: 'sixth_man',
            name: 'Sixth Man of the Year',
            description: 'Top bench player',
            primaryStatKeys: [
                'points'
            ]
        },
        {
            id: 'mip',
            name: 'Most Improved Player',
            description: 'Biggest year-over-year improvement',
            primaryStatKeys: [
                'points'
            ]
        },
        {
            id: 'coy',
            name: 'Coach of the Year',
            description: 'Top coaching performance',
            primaryStatKeys: []
        },
        {
            id: 'finals_mvp',
            name: 'Finals MVP',
            description: 'Best player in the Finals',
            primaryStatKeys: [
                'points',
                'assists',
                'totalRebounds'
            ]
        }
    ],
    computeWinners (_finalStats, _seasonResults) {
        // The core hands us aggregated stats but our underlying computeBasketballAwards
        // function works off Player[] + team records. v1: just return an empty
        // map; the higher-level orchestration (which has BasketballPlayer[] handy)
        // calls computeBasketballAwards directly. v2 will reshape this interface.
        return {};
    }
};
;
;
const basketballCapRulesAdapter = {
    currentCap (season) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballSalaryCap"])(season);
    },
    isLegalContract (contract, player, _team, league) {
        const season = league?.currentSeason ?? contract.signedSeason;
        const res = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isLegalBasketballContract"])(contract, player, season);
        return {
            valid: res.legal,
            violations: res.legal ? [] : res.violations.map((v)=>({
                    code: 'CONTRACT_INVALID',
                    message: v
                })),
            warnings: (res.warnings ?? []).map((w)=>({
                    code: 'CONTRACT_WARNING',
                    message: w
                }))
        };
    },
    isLegalRoster (team, league) {
        const season = league?.currentSeason ?? new Date().getFullYear();
        const players = (team.playerIds ?? []).map((id)=>league.players?.[id]).filter((p)=>!!p);
        const res = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capRules$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isLegalBasketballRoster"])(players, season);
        return {
            valid: res.legal,
            violations: res.violations.map((v)=>({
                    code: 'ROSTER_VIOLATION',
                    message: v
                })),
            warnings: (res.warnings ?? []).map((w)=>({
                    code: 'ROSTER_WARNING',
                    message: w
                }))
        };
    },
    deadCapForRelease (player, league) {
        const season = league?.currentSeason ?? new Date().getFullYear();
        const entries = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$deadCap$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballDeadCapForRelease"])(player, {
            releaseSeason: season
        });
        return entries.map((e)=>({
                season: e.season,
                amount: e.amount
            }));
    },
    marketSalary (player, league) {
        const season = league?.currentSeason ?? new Date().getFullYear();
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$marketSalary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballMarketSalary"])(player, {
            season
        });
    },
    availableCapActions (team, league) {
        const season = league?.currentSeason ?? new Date().getFullYear();
        const players = (team.playerIds ?? []).map((id)=>league.players?.[id]).filter((p)=>!!p);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$capActions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAvailableCapActions"])(team.id, players, season);
    }
};
const basketballAdapter = {
    sportId: 'basketball',
    displayName: 'BS Hoops',
    brandName: 'BS Hoops',
    positions: [
        'PG',
        'SG',
        'SF',
        'PF',
        'C'
    ],
    playerKinds: [
        'standard'
    ],
    rosterRules: basketballRosterRules,
    seasonCalendar: basketballSeasonCalendar,
    competitions: basketballCompetitions,
    playerGen: basketballPlayerGen,
    statsEngine: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$statsEngine$2f$statsEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballStatsEngine"],
    simEngine: basketballSimEngine,
    scheduleGenerator: basketballScheduleGen,
    draftSystem: basketballDraftSystemAdapter,
    developmentSystem: basketballDevAdapter,
    tradeValuator: basketballTradeValuator,
    awards: basketballAwards,
    ui: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$uiMetadata$2f$uiMetadata$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballUiMetadata"],
    lineupModel: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$lineupModel$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["basketballLineupModel"],
    coachingSystem: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$coachingSystem$2f$coachingSystem$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballCoachingSystem"],
    capRules: basketballCapRulesAdapter
};
}),
"[project]/packages/sport-basketball/src/adapter/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball/adapter — assembled SportAdapter object for basketball.
 *
 * The core engine imports this and uses it as the single entry point into
 * the basketball sport implementation. Individual modules (sim, draft, etc.)
 * remain importable for tests and tooling that needs them directly.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$basketballAdapter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/adapter/basketballAdapter.ts [app-rsc] (ecmascript) <locals>");
;
}),
"[project]/packages/sport-basketball/src/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * @bs/sport-basketball — BS Hoops sport adapter.
 *
 * Implements the SportAdapter contract from @bs/core/adapter for basketball.
 *
 * IN PROGRESS. Phase 2A is building this out. The sim engine is the hardest
 * single piece and lands first.
 *
 * Reference: packages/core/src/adapter/sketches/basketball.adapter.sketch.ts
 * was the types-only sketch that proved the SportAdapter interface could
 * express basketball. This package promotes that sketch into a real, runnable
 * implementation.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/types/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$sim$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/sim/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$playerGen$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/playerGen/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$scheduleGenerator$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/scheduleGenerator/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$draftSystem$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/draftSystem/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$awards$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/awards/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$developmentSystem$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/developmentSystem/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$capRules$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/capRules/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$tradeEvaluator$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/tradeEvaluator/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$lineupModel$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/lineupModel/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$coachingSystem$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/coachingSystem/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$uiMetadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/uiMetadata/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$statsEngine$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/statsEngine/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/adapter/index.ts [app-rsc] (ecmascript) <locals>");
;
;
;
;
;
;
;
;
;
;
;
;
;
;
}),
"[project]/packages/sport-basketball/src/adapter/index.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "basketballAdapter",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$basketballAdapter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["basketballAdapter"],
    "basketballCompetitions",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$basketballAdapter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["basketballCompetitions"],
    "basketballRosterRules",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$basketballAdapter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["basketballRosterRules"],
    "basketballSeasonCalendar",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$basketballAdapter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["basketballSeasonCalendar"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/adapter/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$basketballAdapter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/adapter/basketballAdapter.ts [app-rsc] (ecmascript) <locals>");
}),
"[project]/apps/bs-basketball/src/app/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HomePage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/sport-basketball/src/adapter/index.ts [app-rsc] (ecmascript)");
;
;
function HomePage() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "max-w-4xl mx-auto p-8",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "border-b pb-4 mb-8",
                style: {
                    borderColor: 'var(--accent)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-5xl font-extrabold tracking-tight",
                        style: {
                            color: 'var(--accent)'
                        },
                        children: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].brandName
                    }, void 0, false, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 18,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-lg mt-1 opacity-70",
                        children: "Build your dynasty. Run the franchise."
                    }, void 0, false, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 24,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                lineNumber: 17,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "mb-8",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-2xl font-bold mb-3",
                        children: "Engine wired"
                    }, void 0, false, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 30,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mb-2",
                        children: [
                            "Adapter ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                                className: "bg-slate-200 dark:bg-slate-800 px-1 rounded",
                                children: "sportId"
                            }, void 0, false, {
                                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                lineNumber: 32,
                                columnNumber: 19
                            }, this),
                            ":",
                            ' ',
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                children: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].sportId
                            }, void 0, false, {
                                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                lineNumber: 33,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 31,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mb-2",
                        children: [
                            "Positions:",
                            ' ',
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                children: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].positions.join(' / ')
                            }, void 0, false, {
                                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                lineNumber: 37,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 35,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mb-2",
                        children: [
                            "Roster size: ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                children: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].rosterRules.activeRosterSize
                            }, void 0, false, {
                                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                lineNumber: 40,
                                columnNumber: 24
                            }, this),
                            " active +",
                            ' ',
                            __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].rosterRules.buckets.filter((b)=>b.name !== 'active').map((b)=>`${b.capacity === Infinity ? '∞' : b.capacity} ${b.label.toLowerCase()}`).join(' + ')
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 39,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: [
                            "Calendar: ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                children: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].seasonCalendar.ticksPerSeason
                            }, void 0, false, {
                                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                lineNumber: 47,
                                columnNumber: 21
                            }, this),
                            " ticks across",
                            ' ',
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                children: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].seasonCalendar.phases.length
                            }, void 0, false, {
                                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                lineNumber: 48,
                                columnNumber: 11
                            }, this),
                            " phases"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 46,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                lineNumber: 29,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "mb-8",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-2xl font-bold mb-3",
                        children: "Season phases"
                    }, void 0, false, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 53,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: "space-y-1",
                        children: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].seasonCalendar.phases.map((phase)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "flex items-baseline gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-semibold w-40",
                                        style: {
                                            color: 'var(--accent-alt)'
                                        },
                                        children: phase.label
                                    }, void 0, false, {
                                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                        lineNumber: 57,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "opacity-70 text-sm",
                                        children: [
                                            "ticks ",
                                            phase.startTick,
                                            "–",
                                            phase.endTick,
                                            phase.hasGames ? '' : ' · no games'
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                        lineNumber: 63,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, phase.name, true, {
                                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                lineNumber: 56,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 54,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                lineNumber: 52,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "mb-8",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-2xl font-bold mb-3",
                        children: "Awards"
                    }, void 0, false, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 73,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-2 sm:grid-cols-3 gap-2",
                        children: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].awards.definitions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "p-3 rounded border",
                                style: {
                                    borderColor: 'var(--border)',
                                    background: 'var(--muted)'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "font-bold",
                                        children: a.name
                                    }, void 0, false, {
                                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                        lineNumber: 81,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-xs opacity-60",
                                        children: a.description
                                    }, void 0, false, {
                                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                        lineNumber: 82,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, a.id, true, {
                                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                lineNumber: 76,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 74,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                lineNumber: 72,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-2xl font-bold mb-3",
                        children: "Coaching schemes"
                    }, void 0, false, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 89,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: "flex flex-wrap gap-2",
                        children: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].coachingSystem.schemes.HC.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "px-3 py-1 rounded-full text-sm font-medium",
                                style: {
                                    background: 'var(--accent)',
                                    color: '#fff'
                                },
                                children: s
                            }, s, false, {
                                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                                lineNumber: 92,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                        lineNumber: 90,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                lineNumber: 88,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("footer", {
                className: "mt-12 pt-4 border-t opacity-60 text-sm",
                style: {
                    borderColor: 'var(--border)'
                },
                children: [
                    "2C-1 shell · adapter assembled · ",
                    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$sport$2d$basketball$2f$src$2f$adapter$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["basketballAdapter"].competitions.length,
                    " competition(s)"
                ]
            }, void 0, true, {
                fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
                lineNumber: 103,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/bs-basketball/src/app/page.tsx",
        lineNumber: 16,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/bs-basketball/src/app/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/apps/bs-basketball/src/app/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__bffe2e01._.js.map