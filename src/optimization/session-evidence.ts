import { validateSessionFinalization, type SessionFinalization } from "../session/session-finalization.js";
import type { PromptSessionInput, SessionOptimizationHookOptions } from "./index.js";

/** Normalize one validated finalization into the adapter's structured evidence input. */
export function collectSessionEvidence(options: SessionOptimizationHookOptions, input: SessionFinalization): PromptSessionInput {
  const finalization = validateSessionFinalization(input);
  const failed = finalization.status !== "success";

  return {
    harnessRoot: options.harnessRoot,
    sessionId: finalization.sessionId,
    traceId: finalization.traceId,
    projectKey: finalization.projectKey,
    prompt: finalization.prompt.id,
    resolvedContext: finalization.resolvedContext,
    events: finalization.events,
    artifacts: finalization.artifacts,
    observedState: finalization.observedState,
    feedback: finalization.feedback.map((item) => ({
      ...item,
      scope: "session" as const,
      expectedBenefitScore: item.confidence,
      cost: 0.5,
      riskScore: 0.5,
      evidenceStrength: item.confidence,
    })),
    signals: failed ? { outcome: 0 } : undefined,
  };
}
