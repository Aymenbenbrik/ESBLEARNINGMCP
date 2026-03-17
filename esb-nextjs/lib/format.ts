export function safeNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function safePercent(value: unknown, digits = 1, fallback = '0.0%'): string {
  const num = safeNumber(value, NaN);
  if (!Number.isFinite(num)) return fallback;
  return `${num.toFixed(digits)}%`;
}
