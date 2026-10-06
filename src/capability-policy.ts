import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse } from "yaml";
import { loadProjectSkillNames } from "./project-skills.js";

type RecordValue = Record<string, unknown>;
export type Support = "supported" | "degraded" | "unavailable";
export type SkillState = "canonical" | "available" | "retired";

export interface Capability {
  intent: string;
  inputs: string[];
  output: string;
  authority: "observe" | "suggest" | "modify";
  verification: string;
  group?: string;
  kind: "task" | "mode";
  triggers: string[];
}

export interface SkillRoute {
  capability: string;
  state: SkillState;
  providers: Record<string, Support>;
  requires: string[];
}

export interface CapabilityPolicy {
  providers: string[];
  capabilities: Record<string, Capability>;
  skills: Record<string, SkillRoute>;
  companions: Record<string, string[]>;
}

function object(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a mapping`);
  return value as RecordValue;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be a list of non-empty strings`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) throw new Error(`${label} must be ${choices.join(", ")}`);
  return value as T;
}

export function parseCapabilityPolicy(catalogText: string, policyText: string): CapabilityPolicy {
  const catalog = object(parse(catalogText), "capability catalog");
  const policy = object(parse(policyText), "agent policy");
  if (catalog.version !== 1 || policy.version !== 1) throw new Error("capability policy version must be 1");
  const providers = strings(policy.providers, "providers");
  if (!providers.length || new Set(providers).size !== providers.length) throw new Error("providers must be unique and non-empty");

  const capabilities: Record<string, Capability> = {};
  for (const [id, value] of Object.entries(object(catalog.capabilities, "capabilities"))) {
    const entry = object(value, `capabilities.${id}`);
    capabilities[id] = {
      intent: string(entry.intent, `${id}.intent`),
      inputs: strings(entry.inputs, `${id}.inputs`),
      output: string(entry.output, `${id}.output`),
      authority: oneOf(entry.authority, ["observe", "suggest", "modify"], `${id}.authority`),
      verification: string(entry.verification, `${id}.verification`),
      ...(entry.group === undefined ? {} : { group: string(entry.group, `${id}.group`) }),
      kind: entry.kind === undefined ? "task" : oneOf(entry.kind, ["task", "mode"], `${id}.kind`),
      triggers: entry.triggers === undefined ? [] : strings(entry.triggers, `${id}.triggers`),
    };
  }

  const skills: Record<string, SkillRoute> = {};
  for (const [name, value] of Object.entries(object(policy.skills, "skills"))) {
    const entry = object(value, `skills.${name}`);
    const capability = string(entry.capability, `${name}.capability`);
    if (!capabilities[capability]) throw new Error(`${name} references unknown capability ${capability}`);
    const providerSupport: Record<string, Support> = {};
    for (const provider of providers) {
      providerSupport[provider] = oneOf(entry[provider], ["supported", "degraded", "unavailable"], `${name}.${provider}`);
    }
    skills[name] = {
      capability,
      state: oneOf(entry.state, ["canonical", "available", "retired"], `${name}.state`),
      providers: providerSupport,
      requires: entry.requires === undefined ? [] : strings(entry.requires, `${name}.requires`),
    };
  }

  for (const [name, route] of Object.entries(skills)) {
    for (const dependency of route.requires) {
      if (!skills[dependency] || dependency === name) throw new Error(`${name} requires unknown skill ${dependency}`);
    }
  }

  const companions: Record<string, string[]> = {};
  for (const [primary, value] of Object.entries(object(policy.companions ?? {}, "companions"))) {
    if (!capabilities[primary]) throw new Error(`companions references unknown capability ${primary}`);
    companions[primary] = strings(value, `companions.${primary}`);
    for (const companion of companions[primary]) {
      if (!capabilities[companion] || companion === primary || capabilities[companion].kind === "mode") throw new Error(`${primary} has invalid companion ${companion}`);
    }
  }

  for (const capability of Object.keys(capabilities)) {
    const canonical = Object.entries(skills).filter(([, route]) => route.capability === capability && route.state === "canonical");
    if (canonical.length !== 1) throw new Error(`${capability} requires exactly one canonical skill; found ${canonical.length}`);
  }
  return { providers, capabilities, skills, companions };
}

export async function loadCapabilityPolicy(catalogPath: string, policyPath: string): Promise<CapabilityPolicy> {
  const [catalog, policy] = await Promise.all([readFile(catalogPath, "utf8"), readFile(policyPath, "utf8")]);
  return parseCapabilityPolicy(catalog, policy);
}

export async function verifyCapabilityInventory(policy: CapabilityPolicy, lockPath: string): Promise<void> {
  const locked = await loadProjectSkillNames(lockPath);
  const missing = locked.filter((name) => !policy.skills[name]);
  const extra = Object.keys(policy.skills).filter((name) => !locked.includes(name));
  if (missing.length || extra.length) throw new Error(`skill policy/lock drift: missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"}`);
}

export function decideCapability(policy: CapabilityPolicy, task: string): string {
  const group = "work-shape";
  const normalized = ` ${task.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const candidates = Object.entries(policy.capabilities).filter(([, capability]) =>
    capability.group === group && capability.triggers.some((trigger) =>
      normalized.includes(` ${trigger.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `),
    ),
  ).map(([id]) => id);
  if (candidates.length !== 1) throw new Error(`unresolved ${group} intent: ${candidates.join(", ") || "no match"}`);
  return candidates[0]!;
}

function assertUsableSkill(policy: CapabilityPolicy, provider: string, name: string, allowDegraded: boolean, path = new Set<string>()): void {
  const route = policy.skills[name];
  if (!route || route.state === "retired") throw new Error(`required skill ${name} is missing or retired`);
  const support = route.providers[provider];
  if (support !== "supported" && !(support === "degraded" && allowDegraded)) throw new Error(`${name} is ${support ?? "unconfigured"} on ${provider}`);
  if (path.has(name)) throw new Error(`skill dependency cycle at ${name}`);
  path.add(name);
  for (const dependency of route.requires) assertUsableSkill(policy, provider, dependency, allowDegraded, path);
  path.delete(name);
}

function canonicalSkill(policy: CapabilityPolicy, capability: string): string | undefined {
  return Object.entries(policy.skills).find(([, route]) => route.capability === capability && route.state === "canonical")?.[0];
}

function routedCanonicalSkill(policy: CapabilityPolicy, provider: string, capability: string, allowDegraded: boolean): string {
  const name = canonicalSkill(policy, capability);
  if (!name) throw new Error(`${capability} has no canonical skill`);
  assertUsableSkill(policy, provider, name, allowDegraded);
  return name;
}

export function routeCapability(policy: CapabilityPolicy, provider: string, primary: string, companions: string[] = [], allowDegraded = false): string[] {
  if (!policy.providers.includes(provider)) throw new Error(`unknown provider ${provider}`);
  if (!policy.capabilities[primary]) throw new Error(`unknown capability ${primary}`);
  if (policy.capabilities[primary].kind === "mode") throw new Error(`${primary} is a mode; use mode routing`);
  if (new Set(companions).size !== companions.length) throw new Error("duplicate companions");
  const groups = new Set<string>();
  if (policy.capabilities[primary].group) groups.add(policy.capabilities[primary].group);
  for (const companion of companions) {
    if (!policy.companions[primary]?.includes(companion)) throw new Error(`${companion} is not a companion of ${primary}`);
    if (policy.capabilities[companion]?.kind === "mode") throw new Error(`${companion} is a mode; use mode routing`);
    const group = policy.capabilities[companion]?.group;
    if (group && groups.has(group)) throw new Error(`conflicting ${group} capabilities`);
    if (group) groups.add(group);
  }
  return [primary, ...companions].map((capability) => routedCanonicalSkill(policy, provider, capability, allowDegraded));
}

export function routeSkill(policy: CapabilityPolicy, provider: string, skill: string, allowDegraded = false): string[] {
  const route = policy.skills[skill];
  if (!route) throw new Error(`unknown project skill ${skill}`);
  if (route.state !== "canonical") {
    const canonical = canonicalSkill(policy, route.capability);
    throw new Error(`${skill} is ${route.state}; use ${canonical}`);
  }
  if (!policy.providers.includes(provider)) throw new Error(`unknown provider ${provider}`);
  if (policy.capabilities[route.capability]?.kind === "mode") throw new Error(`${skill} is a mode; use mode routing`);
  assertUsableSkill(policy, provider, skill, allowDegraded);
  return [skill];
}

export async function recordCapabilityUsage(policy: CapabilityPolicy, provider: string, capability: string, path: string, companions: string[] = [], allowDegraded = false): Promise<void> {
  const kind = policy.capabilities[capability]?.kind;
  if (kind === "mode" && companions.length) throw new Error("modes cannot have companions");
  const skills = kind === "mode"
    ? routeMode(policy, provider, capability, allowDegraded)
    : routeCapability(policy, provider, capability, companions, allowDegraded);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify({ version: 1, at: new Date().toISOString(), provider, capability, kind, companions, skills })}\n`, { mode: 0o600 });
}

export function routeMode(policy: CapabilityPolicy, provider: string, mode: string, allowDegraded = false): string[] {
  if (policy.capabilities[mode]?.kind !== "mode") throw new Error(`${mode} is not a mode`);
  if (!policy.providers.includes(provider)) throw new Error(`unknown provider ${provider}`);
  return [routedCanonicalSkill(policy, provider, mode, allowDegraded)];
}
