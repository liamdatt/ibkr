export const money = (v: number | null | undefined, currency = "USD", digits = 0) =>
  v == null ? "–" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);

export const price = (v: number | null | undefined) =>
  v == null ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const percent = (v: number | null | undefined, digits = 2) =>
  v == null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;

export const ratio = (v: number | null | undefined) => (v == null ? "–" : `${(v * 100).toFixed(1)}%`);

export const plain = (v: number | null | undefined, digits = 1) => (v == null ? "–" : v.toFixed(digits));

export const compact = (v: number | null | undefined) =>
  v == null ? "–" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

export const direction = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");

export function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
