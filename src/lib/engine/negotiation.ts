/**
 * Free-agency negotiation state machine.
 * Pure functions — no Zustand / store dependency.
 */

export interface NegotiationMessage {
  sender: 'player' | 'system';
  text: string;
  type: 'neutral' | 'positive' | 'negative' | 'counter' | 'result';
}

export interface NegotiationState {
  playerId: string;
  playerName: string;
  position: string;
  playerOverall: number;
  playerMood: number; // 0-100
  askingSalary: number;
  askingYears: number;
  currentOfferSalary: number;
  currentOfferYears: number;
  round: number;
  maxRounds: number;
  patience: number; // 0-100
  messages: NegotiationMessage[];
  outcome: 'pending' | 'accepted' | 'rejected';
}

/* ── helpers ─────────────────────────────────────── */

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fmtSalary(s: number): string {
  return `$${r1(s)}M/yr`;
}

function fmtYears(y: number): string {
  return `${y} year${y > 1 ? 's' : ''}`;
}

/* ── initialisation ──────────────────────────────── */

export function initNegotiation(
  player: { id: string; firstName: string; lastName: string; position: string; age: number; ratings: { overall: number }; mood?: number },
  estimatedSalary: number,
): NegotiationState {
  const askingYears = player.age >= 32 ? 1 : player.age >= 28 ? 2 : 3;
  const mood = player.mood ?? 70;

  // Angry players demand more, happy players are more flexible
  const moodSalaryMult = mood < 30 ? 1.15 : mood < 50 ? 1.08 : mood < 60 ? 1.03 : mood >= 85 ? 0.95 : 1.0;
  const adjustedSalary = r1(estimatedSalary * moodSalaryMult);

  // Low mood = less patience, fewer rounds of negotiation
  const basePat = mood < 30 ? 40 : mood < 50 ? 60 : mood < 70 ? 80 : 100;
  const baseRounds = mood < 30 ? 2 : mood < 50 ? 2 + (Math.random() > 0.5 ? 1 : 0) : 3 + (Math.random() > 0.5 ? 1 : 0);

  return {
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    position: player.position,
    playerOverall: player.ratings.overall,
    playerMood: mood,
    askingSalary: adjustedSalary,
    askingYears,
    currentOfferSalary: adjustedSalary,
    currentOfferYears: askingYears,
    round: 0,
    maxRounds: baseRounds,
    patience: basePat,
    messages: [
      {
        sender: 'player',
        text: mood < 30
          ? pick([
            `I'll hear you out, but honestly I'm not sure I want to be here. ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}, minimum.`,
            `After the way things have gone, I'm not feeling great about staying. If you want me, it's ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
          ])
          : mood < 50
          ? `I'm looking for around ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}. Let's see what you've got.`
          : `I'm looking for around ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}. What can you offer?`,
        type: mood < 50 ? 'negative' : 'neutral',
      },
    ],
    outcome: 'pending',
  };
}

/* ── core offer processing ───────────────────────── */

export function processOffer(
  state: NegotiationState,
  offeredSalary: number,
  offeredYears: number,
): NegotiationState {
  const next: NegotiationState = {
    ...state,
    round: state.round + 1,
    currentOfferSalary: offeredSalary,
    currentOfferYears: offeredYears,
    messages: [...state.messages],
    // copy mutable fields
    askingSalary: state.askingSalary,
    askingYears: state.askingYears,
    patience: state.patience,
    outcome: state.outcome,
  };

  // Record the user's offer
  next.messages.push({
    sender: 'system',
    text: `You offered ${fmtSalary(offeredSalary)} for ${fmtYears(offeredYears)}.`,
    type: 'neutral',
  });

  const salaryPct = offeredSalary / state.askingSalary;
  const yearsPct = state.askingYears > 0 ? offeredYears / state.askingYears : 1;
  const satisfaction = salaryPct * 0.7 + yearsPct * 0.3;

  const mood = state.playerMood;
  const isAngry = mood < 30;
  const isUnhappy = mood < 50;

  // Decrease patience — unhappy players lose patience faster
  const patDrain = isAngry ? 30 + Math.floor(Math.random() * 15) :
                   isUnhappy ? 22 + Math.floor(Math.random() * 12) :
                   15 + Math.floor(Math.random() * 10);
  next.patience = state.patience - patDrain;

  const roll = Math.random();

  // ── Angry players may refuse to re-sign regardless of offer ──
  if (isAngry && state.round === 0 && roll < 0.30) {
    next.outcome = 'rejected';
    next.messages.push({
      sender: 'player',
      text: pick([
        `No thanks. I've made up my mind — I need a fresh start somewhere else.`,
        `I appreciate the offer, but my mind is made up. I want out.`,
        `Sorry, but after everything, I'm not coming back. I wish you the best.`,
      ]),
      type: 'result',
    });
    return next;
  }

  // ── Mid-negotiation walkaway to "test free agency" ──
  // Higher chance when unhappy, elite players, or after multiple rounds of back-and-forth
  if (next.outcome === 'pending' && state.round >= 1 && satisfaction < 0.95) {
    const walkawayBase = isAngry ? 0.25 : isUnhappy ? 0.15 : 0.06;
    const eliteBonus = state.playerOverall >= 80 ? 0.08 : state.playerOverall >= 70 ? 0.04 : 0;
    const roundBonus = state.round >= 2 ? 0.08 : 0;
    const lowballPenalty = satisfaction < 0.80 ? 0.12 : 0;
    const walkawayChance = walkawayBase + eliteBonus + roundBonus + lowballPenalty;

    if (roll < walkawayChance) {
      next.outcome = 'rejected';
      next.messages.push({
        sender: 'player',
        text: pick([
          `Thanks, but I'm going to test free agency and see what my value is out there.`,
          `I appreciate the interest, but I want to see what the market has to offer before committing.`,
          `I've decided to explore my options. I need to know my worth on the open market.`,
          `We've been going back and forth too long. I'm going to test the waters elsewhere.`,
          ...(isAngry ? [
            `Honestly? I don't think this is where I want to be. I'm testing free agency.`,
            `I need a change of scenery. Good luck this season.`,
          ] : []),
          ...(state.playerOverall >= 80 ? [
            `A player of my caliber should see what's out there. I'm hitting the open market.`,
          ] : []),
        ]),
        type: 'result',
      });
      return next;
    }
  }

  if (satisfaction >= 0.95) {
    /* ── Very good offer — at or above asking ── */
    // Unhappy players are harder to convince even at asking price
    const acceptChance = isAngry ? 0.50 : isUnhappy ? 0.70 : 0.85;
    if (roll < acceptChance) {
      next.outcome = 'accepted';
      next.messages.push({
        sender: 'player',
        text: isUnhappy
          ? pick([
            `...Alright. The money's right. I'll stay, but things need to change around here.`,
            `Fine. It's a good deal. But I want to see this team compete.`,
          ])
          : pick([
            `That's a great offer. I'm in! Let's make it official.`,
            `You've got yourself a deal! I'm excited to get started.`,
            `That works for me. Where do I sign?`,
          ]),
        type: 'result',
      });
    } else {
      const counterSalary = r1(offeredSalary * (isUnhappy ? 1.05 : 1.02));
      // If the counter rounds to the same as the offer, just accept (avoids "bump to $X" when already at $X)
      if (counterSalary <= offeredSalary) {
        next.outcome = 'accepted';
        next.messages.push({
          sender: 'player',
          text: pick([
            `Alright, you've convinced me. Let's do it.`,
            `Fair enough. I'm in — let's make it official.`,
            `Deal. Where do I sign?`,
          ]),
          type: 'result',
        });
      } else {
        next.askingSalary = counterSalary;
        next.messages.push({
          sender: 'player',
          text: isUnhappy
            ? pick([
              `We're getting close, but I need a little more to feel valued here. ${fmtSalary(counterSalary)}.`,
              `Almost there. Make it ${fmtSalary(counterSalary)} and I'll consider it.`,
            ])
            : `We're really close. Can you bump it to ${fmtSalary(counterSalary)}? That would seal the deal.`,
          type: 'counter',
        });
      }
    }
  } else if (satisfaction >= 0.88) {
    /* ── Close to asking — may accept ────────── */
    const baseAccept = (satisfaction - 0.88) * 5 + 0.15;
    const moodPenalty = isAngry ? 0.15 : isUnhappy ? 0.08 : 0;
    const acceptChance = Math.max(0.02, baseAccept - moodPenalty);
    if (roll < acceptChance) {
      next.outcome = 'accepted';
      next.messages.push({
        sender: 'player',
        text: isUnhappy
          ? pick([
            `It's not what I wanted, but I'll take it. Don't make me regret this.`,
            `Alright, I'll stay. But I expect things to improve around here.`,
          ])
          : pick([
            `Alright, I can work with that. You've got a deal!`,
            `It's not exactly what I hoped, but let's do it.`,
            `Deal. I'm ready to contribute.`,
          ]),
        type: 'result',
      });
    } else {
      const counterSalary = r1((offeredSalary + state.askingSalary) / 2);
      const counterYears = Math.max(1, Math.round((offeredYears + state.askingYears) / 2));
      next.askingSalary = counterSalary;
      next.askingYears = counterYears;
      // Build a context-aware counter message
      const salaryMatch = Math.abs(offeredSalary - counterSalary) < 0.2;
      const yearsMatch = offeredYears === counterYears;
      let counterText: string;
      if (salaryMatch && !yearsMatch) {
        counterText = pick([
          `The money works, but I need more commitment. Can you do ${fmtYears(counterYears)}?`,
          `I like the salary, but I need the security of ${fmtYears(counterYears)}.`,
          `We're close on money. Make it ${fmtYears(counterYears)} and we have a deal.`,
        ]);
      } else if (!salaryMatch && yearsMatch) {
        counterText = pick([
          `The term works, but I need ${fmtSalary(counterSalary)} to make this happen.`,
          `I'm good with ${fmtYears(counterYears)}, but the salary needs to be ${fmtSalary(counterSalary)}.`,
          `Bump the salary to ${fmtSalary(counterSalary)} and I'll sign.`,
        ]);
      } else {
        counterText = pick([
          `I appreciate the interest, but I need a bit more. How about ${fmtSalary(counterSalary)} for ${fmtYears(counterYears)}?`,
          `We're getting closer. I'd feel better about ${fmtSalary(counterSalary)} for ${fmtYears(counterYears)}.`,
          `Not quite there yet. ${fmtSalary(counterSalary)} for ${fmtYears(counterYears)} would work for me.`,
        ]);
      }
      next.messages.push({ sender: 'player', text: counterText, type: 'counter' });
    }
  } else if (satisfaction >= 0.75) {
    /* ── Below market — skeptical, will counter ── */
    const gap = state.askingSalary - offeredSalary;
    const counterSalary = r1(state.askingSalary - gap * 0.15);
    next.askingSalary = counterSalary;
    const salaryLow = offeredSalary < state.askingSalary * 0.95;
    const yearsLow = offeredYears < state.askingYears;
    let rejectText: string;
    if (salaryLow && yearsLow) {
      rejectText = pick([
        `That's below what I'm worth. I'd need at least ${fmtSalary(counterSalary)} for ${fmtYears(state.askingYears)}.`,
        `I need more money and a longer deal. ${fmtSalary(counterSalary)} for ${fmtYears(state.askingYears)}.`,
      ]);
    } else if (yearsLow) {
      rejectText = pick([
        `The money's not bad, but ${fmtYears(offeredYears)} doesn't give me enough security. I need ${fmtYears(state.askingYears)}.`,
        `I need a longer commitment. ${fmtSalary(counterSalary)} for ${fmtYears(state.askingYears)} is what it'll take.`,
      ]);
    } else {
      rejectText = pick([
        `That's below what I'm worth. I'd need at least ${fmtSalary(counterSalary)}.`,
        `I don't think that reflects my value. How about ${fmtSalary(counterSalary)}?`,
        `My agent says we need ${fmtSalary(counterSalary)} minimum.`,
      ]);
    }
    next.messages.push({ sender: 'player', text: rejectText, type: 'negative' });
  } else {
    /* ── Lowball offer — reject or stern counter ─ */
    if (roll < 0.70 || next.patience <= 0) {
      next.outcome = 'rejected';
      next.messages.push({
        sender: 'player',
        text: pick([
          `That offer is insulting. I'm not interested in further discussions.`,
          `We're way too far apart. I'll be looking elsewhere.`,
          `I don't think this is going to work out. Good luck this season.`,
        ]),
        type: 'result',
      });
    } else {
      const counterSalary = r1(state.askingSalary * 0.97);
      next.askingSalary = counterSalary;
      next.messages.push({
        sender: 'player',
        text: pick([
          `You're going to have to do a lot better than that. I need at least ${fmtSalary(counterSalary)}.`,
          `That's nowhere close to what I'm worth. Come back with something serious.`,
        ]),
        type: 'negative',
      });
    }
  }

  /* ── Force resolution at max rounds ────────── */
  if (next.outcome === 'pending' && next.round >= next.maxRounds) {
    if (satisfaction >= 0.85 && !isAngry) {
      next.outcome = 'accepted';
      next.currentOfferSalary = next.askingSalary;
      next.currentOfferYears = next.askingYears;
      next.messages.push({
        sender: 'player',
        text: `Look, we've been going back and forth. Let's just do ${fmtSalary(next.askingSalary)} for ${fmtYears(next.askingYears)} and call it a day.`,
        type: 'result',
      });
    } else {
      next.outcome = 'rejected';
      next.messages.push({
        sender: 'player',
        text: isAngry
          ? pick([
            `I've heard enough. I'm testing the open market.`,
            `This isn't working. I need a fresh start — I'm going to free agency.`,
          ])
          : pick([
            `We're too far apart. I'm going to explore other options. Good luck.`,
            `Thanks, but I'm going to test free agency and see what's out there.`,
          ]),
        type: 'result',
      });
    }
  }

  /* ── Patience walkaway ─────────────────────── */
  if (next.outcome === 'pending' && next.patience <= 0) {
    next.outcome = 'rejected';
    next.messages.push({
      sender: 'player',
      text: pick([
        `I've lost patience with these negotiations. I'm moving on.`,
        `We've been at this too long. I'm going to see what else is out there.`,
        `I appreciate the effort, but I'm done negotiating. I'll take my chances in free agency.`,
      ]),
      type: 'result',
    });
  }

  return next;
}
