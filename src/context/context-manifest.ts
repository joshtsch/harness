import { findSensitiveContent } from "../sensitive-content.js";
import { CONTEXT_LAYERS, resolveContext, type ContextEntry, type ContextExclusion, type ContextLayer } from "./context-layers.js";

export interface ContextManifestItem {
  id: string;
  source: string;
  summary: string;
}

export interface ContextManifestContract {
  instructions: readonly ContextManifestItem[];
  tools: readonly ContextManifestItem[];
  routing: readonly ContextManifestItem[];
  outputRequirements: readonly ContextManifestItem[];
  validationChecks: readonly ContextManifestItem[];
}

export interface ContextManifestOptions {
  activeMode: string;
  contract: ContextManifestContract;
  estimatedContextCost: number;
}

export interface ContextManifestSource {
  id: string;
  layer: ContextLayer;
  source: string;
  provenance: string;
}

export interface ContextManifestExclusion extends ContextExclusion {
  layer: ContextLayer;
  source: string;
  provenance: string;
}

export interface ContextManifest {
  activeMode: string;
  includedSources: readonly ContextManifestSource[];
  excludedSources: readonly ContextManifestExclusion[];
  precedence: readonly ContextLayer[];
  precedenceDecisions: readonly { id: string; decision: "included" | "excluded"; constrainedBy?: string }[];
  conflicts: readonly { id: string; constrainedBy: string }[];
  estimatedContextCost: number;
  contract: ContextManifestContract;
}

function requiredText(value: string, label: string): string {
  if (value.trim() === "" || value.includes("\n")) throw new Error(`${label} must be a single non-empty line`);
  if (findSensitiveContent(`+${value}`).length > 0) throw new Error(`${label} contains sensitive content`);
  return value;
}

function sourceFor(entry: ContextEntry): ContextManifestSource {
  requiredText(entry.id, `context.id`);
  const source = requiredText(entry.source ?? entry.id, `context.${entry.id}.source`);
  const provenance = requiredText(entry.provenance ?? source, `context.${entry.id}.provenance`);
  return {
    id: entry.id,
    layer: entry.layer,
    source,
    provenance,
  };
}

function validateContract(contract: ContextManifestContract): ContextManifestContract {
  for (const [section, items] of Object.entries(contract)) {
    for (const [index, item] of items.entries()) {
      requiredText(item.id, `contract.${section}[${index}].id`);
      requiredText(item.source, `contract.${section}[${index}].source`);
      requiredText(item.summary, `contract.${section}[${index}].summary`);
    }
  }
  return contract;
}

export function createContextManifest(entries: readonly ContextEntry[], options: ContextManifestOptions): ContextManifest {
  requiredText(options.activeMode, "activeMode");
  if (!Number.isFinite(options.estimatedContextCost) || options.estimatedContextCost < 0) {
    throw new Error("estimatedContextCost must be a non-negative finite number");
  }

  const resolved = resolveContext(entries);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const includedSources = resolved.included.map(sourceFor);
  const excludedSources = resolved.excluded.map((excluded) => {
    const entry = byId.get(excluded.id);
    if (!entry) throw new Error(`missing context entry for exclusion: ${excluded.id}`);
    return { ...excluded, ...sourceFor(entry) };
  });

  return {
    activeMode: options.activeMode,
    includedSources,
    excludedSources,
    precedence: CONTEXT_LAYERS,
    precedenceDecisions: [
      ...includedSources.map(({ id }) => ({ id, decision: "included" as const })),
      ...excludedSources.map(({ id, excludedBy }) => ({ id, decision: "excluded" as const, constrainedBy: excludedBy })),
    ],
    conflicts: excludedSources.map(({ id, excludedBy }) => ({ id, constrainedBy: excludedBy })),
    estimatedContextCost: options.estimatedContextCost,
    contract: validateContract(options.contract),
  };
}
