/**
 * @bs/sport-basketball/adapter — assembled SportAdapter object for basketball.
 *
 * The core engine imports this and uses it as the single entry point into
 * the basketball sport implementation. Individual modules (sim, draft, etc.)
 * remain importable for tests and tooling that needs them directly.
 */

export {
  basketballAdapter,
  basketballRosterRules,
  basketballSeasonCalendar,
  basketballCompetitions,
} from './basketballAdapter';
