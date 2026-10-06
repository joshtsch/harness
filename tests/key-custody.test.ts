import { describe, expect, it } from "vitest";
import { BitwardenKeyCustody } from "../src/bitwarden-custody.js";
import { parseCustodyIdentity, serializeCustodyIdentity } from "../src/key-custody.js";

describe("key custody", () => {
  it("round-trips a strict custody identity envelope", () => {
    const identity = { role: "recovery" as const, recipient: "age1recovery", identity: "AGE-SECRET-KEY-1..." };
    expect(parseCustodyIdentity(serializeCustodyIdentity(identity), "recovery")).toEqual(identity);
  });

  it("rejects a note whose role does not match its destination", () => {
    expect(() => parseCustodyIdentity(JSON.stringify({ format_version: 1, role: "primary", recipient: "age1", identity: "secret" }), "recovery")).toThrow("invalid recovery custody note");
  });

  it("does not pass custody JSON as a process argument", async () => {
    const calls: Array<{ args: string[]; input?: string; session?: string }> = [];
    const provider = new BitwardenKeyCustody(async (args, input, session) => {
      calls.push({ args, input, session });
      if (args[0] === "get") throw new Error("not found");
      return "";
    });
    await provider.put({ role: "primary", recipient: "age1", identity: "secret" }, "session", false);
    expect(calls.at(-1)?.args).not.toContain("secret");
    expect(calls.at(-1)?.args).not.toContain("session");
    expect(calls.at(-1)?.input).toContain("secret");
    expect(calls.at(-1)?.session).toBe("session");
  });

  it("retrieves the exact item and parses only its notes", async () => {
    const provider = new BitwardenKeyCustody(async (args) => {
      expect(args).toEqual(["get", "item", "Harness Primary Encryption Identity"]);
      return JSON.stringify({ id: "item-id", notes: JSON.stringify({ format_version: 1, role: "primary", recipient: "age1", identity: "secret" }) });
    });
    await expect(provider.get("primary", "session")).resolves.toMatchObject({ role: "primary", recipient: "age1" });
  });

  it("uses the exact Bitwarden item id when replacing a note", async () => {
    const calls: string[][] = [];
    const provider = new BitwardenKeyCustody(async (args) => {
      calls.push(args);
      if (args[0] === "get") return JSON.stringify({ id: "exact-item-id", notes: "" });
      return "";
    });
    await provider.put({ role: "recovery", recipient: "age1", identity: "secret" }, "session", true);
    expect(calls.at(-1)).toEqual(["edit", "item", "exact-item-id"]);
  });

  it("treats Bitwarden's capitalized not-found response as an empty custody slot", async () => {
    const provider = new BitwardenKeyCustody(async (args) => {
      if (args[0] === "get") throw new Error("Bitwarden operation failed: Not found.");
      return "";
    });
    await expect(provider.put({ role: "primary", recipient: "age1", identity: "secret" }, "session")).resolves.toBeUndefined();
  });
});
