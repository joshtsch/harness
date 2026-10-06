import { describe, expect, it } from "vitest";
import { setupCustody } from "../src/custody-setup.js";
import type { CustodyIdentity, KeyCustodyProvider } from "../src/key-custody.js";

function fakeProvider(initial: Partial<Record<"primary" | "recovery", CustodyIdentity>> = {}): KeyCustodyProvider & { values: typeof initial } {
  const values = { ...initial };
  return {
    values,
    async get(role) {
      const value = values[role];
      if (!value) throw new Error("not found");
      return value;
    },
    async put(identity) {
      values[identity.role] = identity;
    },
  };
}

describe("custody setup", () => {
  it("creates both identities only when custody is empty", async () => {
    const provider = fakeProvider();
    const result = await setupCustody(provider, "session");
    expect(result.created).toBe(true);
    expect(provider.values.primary?.role).toBe("primary");
    expect(provider.values.recovery?.role).toBe("recovery");
  });

  it("accepts Bitwarden's capitalized not-found response for empty custody", async () => {
    const roles: string[] = [];
    const values: Partial<Record<"primary" | "recovery", CustodyIdentity>> = {};
    const provider: KeyCustodyProvider = {
      async get(role) {
        const value = values[role];
        if (!value) throw new Error("Bitwarden operation failed: Not found.");
        return value;
      },
      async put(identity) { roles.push(identity.role); values[identity.role] = identity; },
    };
    await expect(setupCustody(provider, "session")).resolves.toMatchObject({ created: true });
    expect(roles).toEqual(["primary", "recovery"]);
  });

  it("fails closed on partial custody state", async () => {
    const provider = fakeProvider({ primary: { role: "primary", recipient: "age1primary", identity: "secret" } });
    await expect(setupCustody(provider, "session")).rejects.toThrow("partial custody state");
  });

  it("fails closed when existing identities are not distinct", async () => {
    const identity = { role: "primary" as const, recipient: "age1same", identity: "secret" };
    const provider = fakeProvider({ primary: identity, recovery: { ...identity, role: "recovery" } });
    await expect(setupCustody(provider, "session")).rejects.toThrow("must be distinct");
  });
});
