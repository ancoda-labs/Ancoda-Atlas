/**
 * Sparkline geometry for the climate What Arrived panel.
 * Linear scale, no library. Null years break the line so a gap is a gap.
 */

type SparkValue = number | null | undefined;

function sparkMax(values: SparkValue[]): number {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return numeric.length ? Math.max(...numeric, 0) : 0;
}

function sparkXY(
  values: SparkValue[],
  index: number,
  value: number,
  width: number,
  height: number,
): [number, number] {
  const n = values.length;
  const span = sparkMax(values);
  const x = n <= 1 ? width / 2 : (index / (n - 1)) * width;
  const y = span <= 0 ? height / 2 : height - (value / span) * height;
  return [x, y];
}

/** One polyline per contiguous numeric run. Nulls do not connect across years. */
export function sparkPolylines(
  values: SparkValue[],
  width: number,
  height: number,
): string[] {
  const n = values.length;
  if (n === 0 || width <= 0 || height <= 0) return [];

  const lines: string[] = [];
  let run: Array<[number, number]> = [];
  const flush = () => {
    if (!run.length) return;
    lines.push(run.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
    run = [];
  };

  values.forEach((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      flush();
      return;
    }
    run.push(sparkXY(values, index, value, width, height));
  });
  flush();
  return lines;
}

export function sparkPoints(
  values: SparkValue[],
  width: number,
  height: number,
): string {
  return sparkPolylines(values, width, height)[0] || '';
}

export function sparkDot(
  values: SparkValue[],
  width: number,
  height: number,
): { x: number; y: number } | null {
  const n = values.length;
  if (n === 0 || width <= 0 || height <= 0) return null;
  for (let i = n - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const [x, y] = sparkXY(values, i, value, width, height);
      return { x, y };
    }
  }
  return null;
}
