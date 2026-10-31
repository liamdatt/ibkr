type Entry = { at: number; value: Promise<unknown> };
const entries = new Map<string, Entry>();

/** Remembers a result for `ttlMs` and shares in-flight requests. Failures are not kept. */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  entries.set(key, { at: Date.now(), value });
  value.catch(() => entries.delete(key));
  return value;
}
