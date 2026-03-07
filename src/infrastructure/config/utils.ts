export function nowIso(): string {
  return new Date().toISOString();
}

export function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}
