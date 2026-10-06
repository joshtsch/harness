export const CONTEXT_LAYERS = [
  "policy",
  "domain",
  "workflow",
  "mode",
  "skill",
  "session",
  "memory",
] as const;

export type ContextLayer = (typeof CONTEXT_LAYERS)[number];

export type ContextEntry = {
  id: string;
  layer: ContextLayer;
  source?: string;
  provenance?: string;
  conflictsWith?: readonly string[];
};

export type ContextExclusion = {
  id: string;
  excludedBy: string;
  reason: "lower-precedence-conflict";
};

export type ResolvedContext = {
  included: readonly ContextEntry[];
  excluded: readonly ContextExclusion[];
};

function conflicts(left: ContextEntry, right: ContextEntry): boolean {
  return left.conflictsWith?.includes(right.id) === true || right.conflictsWith?.includes(left.id) === true;
}

export function resolveContext(entries: readonly ContextEntry[]): ResolvedContext {
  const byId = new Map<string, ContextEntry>();
  for (const entry of entries) {
    if (byId.has(entry.id)) throw new Error(`duplicate context entry: ${entry.id}`);
    byId.set(entry.id, entry);
  }

  const included: ContextEntry[] = [];
  const excluded: ContextExclusion[] = [];
  for (const layer of CONTEXT_LAYERS) {
    const layerEntries = entries.filter((entry) => entry.layer === layer);
    for (let leftIndex = 0; leftIndex < layerEntries.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < layerEntries.length; rightIndex += 1) {
        if (conflicts(layerEntries[leftIndex], layerEntries[rightIndex])) {
          throw new Error(`unresolved context conflict: ${layerEntries[leftIndex].id} and ${layerEntries[rightIndex].id}`);
        }
      }
    }

    for (const entry of layerEntries) {
      const winner = included.find((higher) => conflicts(higher, entry));
      if (winner) {
        excluded.push({ id: entry.id, excludedBy: winner.id, reason: "lower-precedence-conflict" });
      } else {
        included.push(entry);
      }
    }
  }

  return {
    included,
    excluded,
  };
}
