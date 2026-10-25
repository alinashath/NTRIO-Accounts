export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function dec(n: { toNumber?: () => number } | number | null | undefined): number {
  if (n == null) return 0;
  if (typeof n === "number") return n;
  if (typeof n.toNumber === "function") return n.toNumber();
  return Number(n);
}
