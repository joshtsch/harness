import { findSensitiveContent } from "../sensitive-content.js";

const speakerLine = /^\s*(?:user|assistant|system|developer|tool)\s*:/gim;
const labeledLine = /^\s*(?:(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s+))?([A-Z][\w .'-]{0,39}):\s+\S/gim;
const serializedRole = /"role"\s*:\s*"(?:user|assistant|system|developer|tool)"/gi;
const summaryLabels = new Set([
  "blocker", "blockers", "completed", "context", "current state", "date", "decision", "decisions",
  "goal", "next", "next actions", "next steps", "notes", "open questions", "outcome", "owner",
  "question", "questions", "references", "result", "risk", "state", "status", "summary", "verification",
]);

export function assertSafeContinuationArtifact(content: string): void {
  const diff = content.split(/\r?\n/).map((line) => `+${line}`).join("\n");
  const findings = findSensitiveContent(diff).filter((finding) =>
    finding.kind !== "phone" || !/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(finding.match),
  );
  if (findings.length) throw new Error("continuation artifact contains likely credentials or personal information");

  const turns = content.match(speakerLine)?.length ?? 0;
  const serializedTurns = content.match(serializedRole)?.length ?? 0;
  const labeledSpeakers = [...content.matchAll(labeledLine)].map((match) => match[1].trim().toLowerCase());
  const nonSummaryLabels = labeledSpeakers.filter((label) => !summaryLabels.has(label));
  if (turns >= 4 || serializedTurns >= 2
      || nonSummaryLabels.length >= 2) {
    throw new Error("raw conversation transcripts cannot be stored as continuation artifacts");
  }
}
