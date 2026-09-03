/**
 * Linear bar widths. Nepal's bar is a sliver on a linear scale.
 * Do not switch this to a log scale. The only floor is 1px.
 */

export function barPercent(share: number, maxShare: number): number {
  if (!(maxShare > 0) || !(share >= 0) || !Number.isFinite(share) || !Number.isFinite(maxShare)) {
    return 0;
  }
  return (share / maxShare) * 100;
}

/** True width, never clamped above 1px, never log-scaled. */
export function barWidth(value: number, max: number): string {
  const pct = barPercent(value, max);
  if (pct <= 0) return '0px';
  return `max(1px, ${pct}%)`;
}

export function sortMetricRows<T extends { value: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.value - a.value);
}
