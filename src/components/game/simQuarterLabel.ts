/** Label for the "sim the rest of this quarter" control (quarter 5+ is overtime). */
export function simQuarterLabel(quarter: number, short = false): string {
  if (quarter >= 5) return short ? 'Sim OT' : 'Sim rest of OT';
  return short ? `Sim Q${quarter}` : `Sim to end of Q${quarter}`;
}
