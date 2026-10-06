import { parseSecureRecord } from "./secure-records.js";

export const projectConfigRecordId = "projects-config";

export function projectConfigRecordSource(config: string): string {
  if (!config.trim()) throw new Error("local project configuration is empty");
  return `---\naccess:\n  harness: true\n---\n${config}`;
}

export function projectConfigFromRecord(source: string): string {
  const body = parseSecureRecord(source).body;
  if (!body.trim()) throw new Error("stored project configuration is empty");
  return body;
}
