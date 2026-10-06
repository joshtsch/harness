import { parse, stringify } from "yaml";
import { findSensitiveContent } from "../sensitive-content.js";
import { projectsLocalRecordKey, type ArtifactContent, type ContinuationUserRecordStore } from "./continuation.js";

export type ProjectConfigEncryptor = (plaintext: string) => Promise<Extract<ArtifactContent, { privacy: "encrypted" }>>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const privateField = /(?:password|token|secret|credential|private.?key|identity|api.?key|access.?key|service.?role|auth(?:entication|orization)?|bearer|personal.?access.?token|(?:^|_)pat(?:_|$))/i;
const machineField = /(?:^|_)(?:absolute|machine|checkout|clone|worktree|workspace|cache|scratch|temp|directory|local_path|base_path|project_root|repo_root|repository_root|working_root|project_dir|repo_dir|working_dir|workdir|root)(?:_|$)/i;
const machinePathField = /(?:^|_)(?:path|cwd|working_directory)(?:_|$)/i;
const absolutePath = /^(?:\/|~(?:[\\/]|$)|[a-z]:[\\/]|\\\\)/i;

function portable(value: unknown, field = ""): unknown {
  const normalizedField = field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[\s.-]+/g, "_");
  if (privateField.test(normalizedField) || machineField.test(normalizedField)
      || (machinePathField.test(normalizedField) && normalizedField !== "wiki_path")) return undefined;
  if (typeof value === "string") {
    if (findSensitiveContent(`+${JSON.stringify(value)}`).some(({ kind }) => kind === "credential" || kind === "private-key")) return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed.split(/[\\/]/).includes("..") || absolutePath.test(trimmed)) return undefined;
    if (/^file:/i.test(trimmed)) return undefined;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        if (url.protocol === "file:") return undefined;
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return undefined;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => portable(item)).filter((item) => item !== undefined);
  if (!record(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const safe = portable(item, key);
    if (safe !== undefined) result[key] = safe;
  }
  return result;
}

function parseProjects(source: string, message: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parse(source);
  } catch {
    throw new Error(message);
  }
  if (!record(parsed) || (parsed.projects !== undefined && !record(parsed.projects))) throw new Error("projects.local.yml must contain a projects mapping");
  return parsed;
}

export function createProjectsLocalProjection(source: string, keyMaterial: Uint8Array): string {
  if (keyMaterial.length < 32) throw new Error("continuation key must be at least 32 bytes");
  const parsed = parseProjects(source, "projects.local.yml is not valid YAML");
  return stringify(portable(parsed), { lineWidth: 0 });
}

export function mergeProjectsLocal(remoteSource: string, localSource: string): string {
  const remote = parseProjects(remoteSource, "remote projects.local record is invalid");
  const local = parseProjects(localSource, "projects.local.yml is not valid YAML");
  const merge = (base: unknown, overlay: unknown): unknown => {
    if (record(base) && record(overlay)) {
      const result: Record<string, unknown> = { ...base };
      for (const [key, value] of Object.entries(overlay)) result[key] = key in result ? merge(result[key], value) : value;
      return result;
    }
    return overlay;
  };
  return stringify(merge(local, remote), { lineWidth: 0 });
}

export async function persistProjectsLocalRecord(
  store: ContinuationUserRecordStore,
  keyMaterial: Uint8Array,
  source: string,
  encrypt: ProjectConfigEncryptor,
): Promise<number> {
  const key = projectsLocalRecordKey(keyMaterial);
  const current = await store.loadUserRecord(key);
  return commitProjectsLocalProjection(store, keyMaterial, createProjectsLocalProjection(source, keyMaterial), encrypt, current?.revision ?? null);
}

export async function commitProjectsLocalProjection(
  store: ContinuationUserRecordStore,
  keyMaterial: Uint8Array,
  projection: string,
  encrypt: ProjectConfigEncryptor,
  expectedRevision: number | null,
): Promise<number> {
  const key = projectsLocalRecordKey(keyMaterial);
  const content = await encrypt(projection);
  return store.commitUserRecord(key, expectedRevision, content);
}

export async function readProjectsLocalRecord(
  store: ContinuationUserRecordStore,
  keyMaterial: Uint8Array,
  decrypt: (content: ArtifactContent) => Promise<string>,
): Promise<{ revision: number; content: string }> {
  const record = await store.loadUserRecord(projectsLocalRecordKey(keyMaterial));
  if (!record) throw new Error("no remote projects.local record is available");
  return { revision: record.revision, content: await decrypt(record.content) };
}
