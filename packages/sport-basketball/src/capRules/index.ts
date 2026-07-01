/**
 * @bs/sport-basketball/capRules — NBA salary cap mechanics.
 *
 * Foundation commit: cap calculation, contract legality, payroll math.
 * Dead cap + market salary + Bird rights land in follow-up commits.
 */

export {
  basketballSalaryCap,
  basketballTaxThreshold,
  basketballFirstApron,
  basketballSecondApron,
  isLegalBasketballContract,
  basketballTeamPayroll,
  basketballTeamCapStatus,
  isLegalBasketballRoster,
  basketballContractRemainingGuaranteed,
  basketballContractYearForSeason,
  BASE_CAP_2026,
  CAP_INFLATION_RATE,
  TAX_THRESHOLD_MULT,
  MAX_CONTRACT_YEARS,
  MAX_YEARLY_RAISE,
  LEAGUE_MINIMUM_SALARY,
  minimumSalary,
  maxStartingPctOfCap,
  basketballMaxSalary,
} from './capRules';
export type {
  ContractValidationResult,
  TeamCapStatus,
  RosterValidationResult,
} from './capRules';

export {
  basketballDeadCapForRelease,
  basketballStretchPreview,
} from './deadCap';
export type {
  ReleaseMode,
  DeadCapEntry,
  DeadCapForReleaseOptions,
} from './deadCap';

export {
  basketballMarketSalary,
  basketballMarketContractYears,
} from './marketSalary';
export type {
  MarketSalaryOptions,
} from './marketSalary';

export {
  basketballResolveBirdRights,
  basketballBirdRightsMaxSalary,
} from './birdRights';
export type { BirdRightsTier } from './birdRights';

export {
  basketballAvailableCapActions,
} from './capActions';
export type { BasketballCapAction } from './capActions';
