/** Isolate imported dependencies within this test worker; never connect to operating services. */
export function loadWithMocks<T>(target: string, dependencies: Record<string, unknown>): { module: T; restore: () => void } {
  const originals = new Map<string, NodeModule | undefined>();
  const targetId = require.resolve(target);
  originals.set(targetId, require.cache[targetId]);
  delete require.cache[targetId];
  for (const [name, exports] of Object.entries(dependencies)) {
    const id = require.resolve(name);
    originals.set(id, require.cache[id]);
    require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
  }
  const restore = () => {
    for (const [id, entry] of Array.from(originals)) {
      if (entry) require.cache[id] = entry; else delete require.cache[id];
    }
  };
  try {
    return { module: require(target) as T, restore };
  } catch (error) {
    restore();
    throw error;
  }
}
