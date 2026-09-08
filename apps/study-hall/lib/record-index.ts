/** Preserve Array.find's first-match behavior when indexing legacy duplicate keys. */
export function indexFirstBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T> {
  const index = new Map<K, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (!index.has(key)) index.set(key, item);
  }
  return index;
}
