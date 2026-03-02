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
  player: { id: string; firstName: string; lastName: string; position: string; age: number; ratings: { overall: number } },
  estimatedSalary: number,
): NegotiationState {
  const askingYears = player.age >= 32 ? 1 : player.age >= 28 ? 2 : 3;

  return {
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    position: player.position,
    playerOverall: player.ratings.overall,
    askingSalary: estimatedSalary,
    askingYears,
    currentOfferSalary: estimatedSalary,
    currentOfferYears: askingYears,
    round: 0,
    maxRounds: 3 + (Math.random() > 0.5 ? 1 : 0),
    patience: 100,
    messages: [
      {
        sender: 'player',
        text: `I'm looking for around ${fmtSalary(estimatedSalary)} for ${fmtYears(askingYears)}. What can you offer?`,
        type: 'neutral',
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

  // Decrease patience
  next.patience = state.patience - (15 + Math.floor(Math.random() * 10));

  const roll = Math.random();

  if (satisfaction >= 0.95) {
    /* ── Very good offer ─────────────────────── */
    if (roll < 0.90) {
      next.outcome = 'accepted';
      next.messages.push({
        sender: 'player',
        text: pick([
          `That's a great offer. I'm in! Let's make it official.`,
          `You've got yourself a deal! I'm excited to get started.`,
          `That works for me. Where do I sign?`,
        ]),
        type: 'result',
      });
    } else {
      const counterSalary = r1(offeredSalary * 1.02);
      next.askingSalary = counterSalary;
      next.messages.push({
        sender: 'player',
        text: `We're really close. Can you bump it to ${fmtSalary(counterSalary)}? That would seal the deal.`,
        type: 'counter',
      });
    }
  } else if (satisfaction >= 0.80) {
    /* ── Decent offer — counter or accept ──── */
    const acceptChance = (satisfaction - 0.80) * 3 + 0.10;
    if (roll < acceptChance) {
      next.outcome = 'accepted';
      next.messages.push({
        sender: 'player',
        text: pick([
          `Alright, I can work with that. You've got a deal!`,
          `It's not exactly what I hoped, but let's do it.`,
          `Deal. I'm ready to contribute.`,
        ]),
        type: 'result',
      });
    } else {
      const counterSalary = r1((offeredSalary + state.askingSalary) / 2);
      const counterYears = Math.round((offeredYears + state.askingYears) / 2);
      next.askingSalary = counterSalary;
      next.askingYears = Math.max(1, counterYears);
      next.messages.push({
        sender: 'player',
        text: pick([
          `I appreciate the interest, but I need a bit more. How about ${fmtSalary(counterSalary)} for ${fmtYears(next.askingYears)}?`,
          `We're in the ballpark, but can you come up to ${fmtSalary(counterSalary)} for ${fmtYears(next.askingYears)}?`,
          `Getting closer. I'd feel better about ${fmtSalary(counterSalary)} for ${fmtYears(next.askingYears)}.`,
        ]),
        type: 'counter',
      });
    }
  } else if (satisfaction >= 0.60) {
    /* ── Below market — skeptical ────────────── */
    if (roll < 0.05) {
      next.outcome = 'accepted';
      next.messages.push({
        sender: 'player',
        text: `It's below what I was hoping for, but I believe in this team. Let's do it.`,
        type: 'result',
      });
    } else {
      const gap = state.askingSalary - offeredSalary;
      const counterSalary = r1(state.askingSalary - gap * 0.2);
      next.askingSalary = counterSalary;
      next.messages.push({
        sender: 'player',
        text: pick([
          `That's well below market value. The lowest I'd consider is ${fmtSalary(counterSalary)} for ${fmtYears(state.askingYears)}.`,
          `I don't think that reflects my value. I need at least ${fmtSalary(counterSalary)}.`,
          `My agent says that's way too low. We'd need ${fmtSalary(counterSalary)} minimum.`,
        ]),
        type: 'negative',
      });
    }
  } else {
    /* ── Insulting offer ─────────────────────── */
    if (roll < 0.80 || next.patience <= 0) {
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
      const counterSalary = r1(state.askingSalary * 0.95);
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
    if (satisfaction >= 0.70) {
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
        text: `We're too far apart. I'm going to explore other options. Good luck.`,
        type: 'result',
      });
    }
  }

  /* ── Patience walkaway ─────────────────────── */
  if (next.outcome === 'pending' && next.patience <= 0) {
    next.outcome = 'rejected';
    next.messages.push({
      sender: 'player',
      text: `I've lost patience with these negotiations. I'm moving on.`,
      type: 'result',
    });
  }

  return next;
}
