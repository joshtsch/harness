import { describe, expect, it } from "vitest";
import { assertSafeContinuationArtifact } from "../continuation-content-policy.js";

describe("continuation artifact content policy", () => {
  it("accepts a concise summary with a date and repository references", () => {
    expect(() => assertSafeContinuationArtifact("State: complete.\nDate: 2026-10-04.\nNext: open PR #141." )).not.toThrow();
  });

  it("rejects likely credentials and personal contact details without echoing them", () => {
    expect(() => assertSafeContinuationArtifact("api_key: abcdefghijklmnop")).toThrow("likely credentials or personal information");
    expect(() => assertSafeContinuationArtifact("service_role_key: fake-token.fake-token.fake-token.fake-token.")).toThrow("likely credentials or personal information");
    expect(() => assertSafeContinuationArtifact("Bearer eyJfakeheader.eyJfakepayload.fakesignature")).toThrow("likely credentials or personal information");
    expect(() => assertSafeContinuationArtifact("Contact me at person@example.com")).toThrow("likely credentials or personal information");
  });

  it("rejects obvious provider conversation transcripts", () => {
    expect(() => assertSafeContinuationArtifact("User: start\nAssistant: reply\nUser: continue\nAssistant: done")).toThrow("raw conversation transcripts");
    expect(() => assertSafeContinuationArtifact("Alice: start\nBob: reply")).toThrow("raw conversation transcripts");
    expect(() => assertSafeContinuationArtifact("Alice: start\nAlice: continues")).toThrow("raw conversation transcripts");
    expect(() => assertSafeContinuationArtifact("Alice: start\nBob: reply\nAlice: continue\nBob: done")).toThrow("raw conversation transcripts");
    expect(() => assertSafeContinuationArtifact("Alice: start\nBob: reply\nAlice: continue")).toThrow("raw conversation transcripts");
    expect(() => assertSafeContinuationArtifact("speaker 1: start\nspeaker 2: reply")).toThrow("raw conversation transcripts");
    expect(() => assertSafeContinuationArtifact("[10:00] Alice: hello\n[10:01] Bob: hi")).toThrow("raw conversation transcripts");
    expect(() => assertSafeContinuationArtifact('[{"role":"user"},{"role":"assistant"},{"role":"user"}]')).toThrow("raw conversation transcripts");
    expect(() => assertSafeContinuationArtifact('[{"role":"user"},{"role":"assistant"},{"role":"user"},{"role":"assistant"}]')).toThrow("raw conversation transcripts");
  });
});
