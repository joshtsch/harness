import { describe, expect, it } from "vitest";
import { BitwardenSecureRecordStore, secureRecordItemName } from "../src/bitwarden-records.js";

describe("Bitwarden secure records", () => {
  it("stores ciphertext in a named secure note and reads it back", async () => {
    let created: string | undefined;
    const store = new BitwardenSecureRecordStore(async (args, input) => {
      if (args[0] === "get") throw new Error("Bitwarden operation failed: Not found.");
      created = input;
      return "";
    });
    await store.put("coverage", Buffer.from("ciphertext"), "session");
    expect(JSON.parse(created!)).toMatchObject({ type: 2, name: secureRecordItemName("coverage"), secureNote: { type: 0 } });
    expect(JSON.parse(JSON.parse(created!).notes).ciphertext_base64).toBe(Buffer.from("ciphertext").toString("base64"));
  });

  it("lists only harness secure-record notes", async () => {
    const store = new BitwardenSecureRecordStore(async () => JSON.stringify([
      { name: "Harness Secure Record: coverage" },
      { name: "Personal note" },
      { name: "Harness Secure Record: not valid!" },
    ]));
    await expect(store.list("session")).resolves.toEqual(["coverage"]);
  });
});
