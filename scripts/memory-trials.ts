import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const phases = ["recall", "ingest-proposal", "ingest-apply", "ingest-rerun", "roundtrip-recall"] as const;
const outcomes = ["pass", "fail", "blocked", "unsupported"] as const;
const metrics = ["elapsedMs", "firstEvidenceMs", "toolCalls", "sourceReads", "irrelevantReads", "inputTokens", "outputTokens"] as const;
type Slot = { case: string; phase: typeof phases[number]; attempt: number };
type Observation = Slot & { outcome: typeof outcomes[number]; semanticReviewed: boolean; evidence: string[]; measurements: Partial<Record<typeof metrics[number], number | null>> };
export interface TrialRun {
  version: 1;
  suiteDigest: string;
  variant: string;
  revision: string;
  environment: { model: string; settings: string; tools: string; context: "fresh" | "repeated" };
  expected: Slot[];
  observations: Observation[];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected trial object");
  return value as Record<string, unknown>;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function key(slot: Slot): string { return `${slot.case}:${slot.phase}:${slot.attempt}`; }

export function parseTrialRun(value: unknown): TrialRun {
  const run = object(value);
  if (run.version !== 1 || typeof run.suiteDigest !== "string" || !/^[a-f0-9]{64}$/.test(run.suiteDigest) ||
    !nonempty(run.variant) || !nonempty(run.revision)) throw new Error("Invalid trial identity");
  const env = object(run.environment);
  if (![env.model, env.settings, env.tools].every(nonempty) || !["fresh", "repeated"].includes(env.context as string)) throw new Error("Invalid trial environment");
  if (!Array.isArray(run.expected) || !run.expected.length || !Array.isArray(run.observations)) throw new Error("Expected trial slots and observations");
  const slot = (value: unknown): Slot => {
    const item = object(value);
    if (typeof item.case !== "string" || !/^[a-z0-9-]+$/.test(item.case) || !phases.includes(item.phase as Slot["phase"]) ||
      !Number.isSafeInteger(item.attempt) || (item.attempt as number) < 1) throw new Error("Invalid trial slot");
    return { case: item.case, phase: item.phase as Slot["phase"], attempt: item.attempt as number };
  };
  const expected = run.expected.map(slot);
  const expectedKeys = new Set(expected.map(key));
  if (expectedKeys.size !== expected.length) throw new Error("Duplicate expected slot");
  const seen = new Set<string>();
  const observations = run.observations.map((value): Observation => {
    const item = object(value);
    const identity = slot(item);
    if (!expectedKeys.has(key(identity)) || seen.has(key(identity))) throw new Error("Unexpected or duplicate observation");
    seen.add(key(identity));
    if (!outcomes.includes(item.outcome as Observation["outcome"]) || typeof item.semanticReviewed !== "boolean" ||
      !Array.isArray(item.evidence) || !item.evidence.length || !item.evidence.every(nonempty)) throw new Error("Invalid outcome or missing evidence references");
    if (item.outcome === "pass" && !item.semanticReviewed) throw new Error("A pass requires semantic review");
    const measurements = object(item.measurements);
    for (const [name, number] of Object.entries(measurements)) {
      if (!metrics.includes(name as typeof metrics[number]) || (number !== null && (typeof number !== "number" || !Number.isFinite(number) || number < 0 ||
        (!name.endsWith("Ms") && !Number.isSafeInteger(number))))) throw new Error("Invalid measurement");
    }
    if (typeof measurements.firstEvidenceMs === "number" && typeof measurements.elapsedMs === "number" && measurements.firstEvidenceMs > measurements.elapsedMs) throw new Error("Evidence time exceeds elapsed time");
    return { ...identity, outcome: item.outcome as Observation["outcome"], semanticReviewed: item.semanticReviewed,
      evidence: item.evidence as string[], measurements: measurements as Observation["measurements"] };
  });
  return { version: 1, suiteDigest: run.suiteDigest, variant: run.variant, revision: run.revision,
    environment: { model: env.model as string, settings: env.settings as string, tools: env.tools as string, context: env.context as "fresh" | "repeated" }, expected, observations };
}

function distribution(values: number[]) {
  values.sort((a, b) => a - b);
  const size = values.length;
  return { samples: size, median: size ? (values[Math.floor((size - 1) / 2)]! + values[Math.ceil((size - 1) / 2)]!) / 2 : null,
    p95: size ? values[Math.ceil(size * 0.95) - 1]! : null };
}

export function summarizeTrialRun(run: TrialRun) {
  return { variant: run.variant, revision: run.revision, suiteDigest: run.suiteDigest, environment: run.environment,
    phases: phases.filter((phase) => run.expected.some((slot) => slot.phase === phase)).map((phase) => {
      const expected = run.expected.filter((slot) => slot.phase === phase).length;
      const observed = run.observations.filter((item) => item.phase === phase);
      const passed = observed.filter((item) => item.outcome === "pass").length;
      return { phase, expected, observed: observed.length, missing: expected - observed.length,
        outcomes: Object.fromEntries(outcomes.map((outcome) => [outcome, observed.filter((item) => item.outcome === outcome).length])),
        passRateOfPlanned: passed / expected,
        measurements: Object.fromEntries(metrics.map((metric) => {
          const values = observed.map((item) => item.measurements[metric]).filter((value): value is number => typeof value === "number");
          return [metric, { ...distribution(values), unavailable: expected - values.length }];
        })) };
    }), latencyIncludesFailedAttempts: true, tailEstimatesAreExploratory: true };
}

export function compareTrialRuns(baseline: TrialRun, candidate: TrialRun) {
  const slots = (run: TrialRun) => run.expected.map(key).join("\n");
  if (baseline.suiteDigest !== candidate.suiteDigest || JSON.stringify(baseline.environment) !== JSON.stringify(candidate.environment) ||
    slots(baseline) !== slots(candidate)) throw new Error("Comparison requires identical suite, environment, and planned slots");
  return { baseline: summarizeTrialRun(baseline), candidate: summarizeTrialRun(candidate),
    paired: baseline.expected.map((slot) => {
      const before = baseline.observations.find((item) => key(item) === key(slot));
      const after = candidate.observations.find((item) => key(item) === key(slot));
      return { ...slot, baseline: before?.outcome ?? "missing", candidate: after?.outcome ?? "missing",
        deltas: Object.fromEntries(metrics.map((metric) => {
          const a = before?.measurements[metric];
          const b = after?.measurements[metric];
          return [metric, typeof a === "number" && typeof b === "number" ? b - a : null];
        })) };
    }) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, first, second, ...extra] = process.argv.slice(2).filter((value) => value !== "--");
    if (!first || extra.length || !["report", "compare"].includes(command ?? "") || (command === "compare") !== Boolean(second)) throw new Error("Usage: pnpm memory:trials report <run.json> | compare <baseline.json> <candidate.json>");
    const baseline = parseTrialRun(JSON.parse(await readFile(first, "utf8")));
    const report = second ? compareTrialRuns(baseline, parseTrialRun(JSON.parse(await readFile(second, "utf8")))) : summarizeTrialRun(baseline);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : "Trial reporting failed"); process.exitCode = 1; }
}
