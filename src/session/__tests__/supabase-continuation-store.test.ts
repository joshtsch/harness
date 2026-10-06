import { describe, expect, it } from "vitest";
import { ContinuationRevisionConflictError, SupabaseContinuationStore } from "../supabase-continuation-store.js";

describe("Supabase continuation store", () => {
  it("routes contract operations through authenticated RPC calls", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const store = new SupabaseContinuationStore({
      url: "https://example.supabase.co/",
      serviceKey: "server-only-key",
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        const name = String(url).split("/").at(-1);
        if (name === "continuation_list") return Response.json([]);
        return Response.json(null);
      },
    });

    await store.load("sessions/key");
    await store.list("active");
    await store.readArtifact("artifact/key");
    await store.loadUserRecord("user-records/key");
    await store.commitUserRecord("user-records/key", null, { privacy: "encrypted", ciphertext: "-----BEGIN AGE ENCRYPTED FILE-----\nopaque" });
    const manifest = { key: "sessions/key", revision: 1, state: "active" as const, latest: {}, events: [] };
    await store.commit(null, manifest, []);

    expect(calls.map((call) => call.url.split("/").at(-1))).toEqual([
      "continuation_load", "continuation_list", "continuation_read_artifact", "continuation_user_record_load", "continuation_user_record_commit", "continuation_commit",
    ]);
    expect(calls[0]?.init.headers).toMatchObject({ apikey: "server-only-key", authorization: "Bearer server-only-key" });
    expect(JSON.parse(String(calls[4]?.init.body))).toEqual({
      p_record_key: "user-records/key",
      p_expected_revision: null,
      p_content: { privacy: "encrypted", ciphertext: "-----BEGIN AGE ENCRYPTED FILE-----\nopaque" },
    });
    expect(JSON.parse(String(calls[5]?.init.body))).toEqual({ p_expected_revision: null, p_manifest: manifest, p_artifacts: [] });
  });

  it("maps transactional conflicts without exposing remote response bodies", async () => {
    const store = new SupabaseContinuationStore({
      url: "https://example.supabase.co",
      serviceKey: "server-only-key",
      fetcher: async () => Response.json({ code: "40001", message: "private database details" }, { status: 400 }),
    });
    await expect(store.load("sessions/key")).rejects.toBeInstanceOf(ContinuationRevisionConflictError);
    await expect(store.load("sessions/key")).rejects.toThrow("continuation revision conflict");
    await expect(store.load("sessions/key")).rejects.not.toThrow("private database details");
  });

  it("requires HTTPS outside local development and reports configuration omissions", () => {
    expect(() => new SupabaseContinuationStore({ url: "http://example.com", serviceKey: "key" })).toThrow("HTTPS");
    expect(() => new SupabaseContinuationStore({ url: "https://example.com", serviceKey: " " })).toThrow("service key is required");
  });
});
