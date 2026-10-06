import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CustodyIdentity } from "./key-custody.js";

export async function withTemporaryIdentity<T>(identity: CustodyIdentity, action: (identityPath: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "harness-age-identity-"));
  const path = join(directory, `${identity.role}.txt`);
  try {
    await writeFile(path, `${identity.identity}\n`, { mode: 0o600 });
    await chmod(path, 0o600);
    return await action(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
