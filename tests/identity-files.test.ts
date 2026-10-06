import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { withTemporaryIdentity } from "../src/identity-files.js";

describe("temporary identities", () => {
  it("removes materialized identity files after the operation", async () => {
    let path = "";
    await withTemporaryIdentity({ role: "primary", recipient: "age1primary", identity: "secret" }, async (identityPath) => {
      path = identityPath;
      return undefined;
    });
    await expect(access(path)).rejects.toThrow();
  });
});
