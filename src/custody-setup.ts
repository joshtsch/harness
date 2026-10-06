import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyCustodyProvider, CustodyIdentity } from "./key-custody.js";
import { initializeAgeIdentity } from "./secure-setup.js";

export async function setupCustody(provider: KeyCustodyProvider, session: string): Promise<{ created: boolean; primary: CustodyIdentity; recovery: CustodyIdentity }> {
  const existing = await readExisting(provider, session);
  if (existing.primary && existing.recovery) {
    assertDistinct(existing.primary, existing.recovery);
    return { created: false, primary: existing.primary, recovery: existing.recovery };
  }
  if (existing.primary || existing.recovery) throw new Error("partial custody state; reconcile provider notes before setup");

  const directory = await mkdtemp(join(tmpdir(), "harness-custody-setup-"));
  try {
    const primary = await makeIdentity(join(directory, "primary.txt"), "primary");
    const recovery = await makeIdentity(join(directory, "recovery.txt"), "recovery");
    await provider.put(primary, session);
    await provider.put(recovery, session);
    const verified = await readExisting(provider, session);
    if (!verified.primary || !verified.recovery
      || verified.primary.recipient !== primary.recipient
      || verified.primary.identity !== primary.identity
      || verified.recovery.recipient !== recovery.recipient
      || verified.recovery.identity !== recovery.identity) {
      throw new Error("custody note verification failed");
    }
    assertDistinct(verified.primary, verified.recovery);
    return { created: true, primary: verified.primary, recovery: verified.recovery };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function assertDistinct(primary: CustodyIdentity, recovery: CustodyIdentity): void {
  if (primary.recipient === recovery.recipient || primary.identity === recovery.identity) throw new Error("primary and recovery identities must be distinct");
}

export async function withGeneratedCustodyPair<T>(action: (primary: CustodyIdentity, recovery: CustodyIdentity) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "harness-custody-rotation-"));
  try {
    return await action(await makeIdentity(join(directory, "primary.txt"), "primary"), await makeIdentity(join(directory, "recovery.txt"), "recovery"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readExisting(provider: KeyCustodyProvider, session: string): Promise<Partial<Record<"primary" | "recovery", CustodyIdentity>>> {
  const result: Partial<Record<"primary" | "recovery", CustodyIdentity>> = {};
  for (const role of ["primary", "recovery"] as const) {
    try {
      result[role] = await provider.get(role, session);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.toLowerCase().includes("not found")) throw error;
    }
  }
  return result;
}

async function makeIdentity(path: string, role: "primary" | "recovery"): Promise<CustodyIdentity> {
  const generated = await initializeAgeIdentity(path, "/repo/harness");
  return { role, recipient: generated.recipient, identity: await readFile(generated.identityPath, "utf8") };
}
