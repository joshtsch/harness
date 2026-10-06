# Routines and provider-neutral scheduling

**Status:** accepted

The harness treats a routine, its schedule, and its authorized automation as separate concepts. A routine describes a repeatable task and its input/output contract. A schedule describes when it may run. An automation joins the two with an approval policy and an execution tier.

The harness owns the provider-neutral contracts, dry-run behavior, evidence, and promotion gates. It does not own a scheduling engine initially. ChatGPT Automations is the first host scheduler through a schedule adapter; other hosts can be added without changing routine definitions. The first implementation supports observe, suggest, and draft tiers. Execution that changes external systems is a later pilot and requires explicit enablement, scoped authorization, idempotency, retry and failure handling, notifications, and a dry run.

Routine candidates come from repeated task traces and user-confirmed patterns. They remain candidates until the routine contract, schedule, approval policy, and success measures are reviewed. Raw external data and credentials remain outside durable routine context. Browser-based authentication is a separate investigation; cookies and session material are never copied into routine traces or memory.

## Consequences

- Routine discovery can improve from evidence without silently creating unattended work.
- Host schedulers provide execution, lifecycle, and notification behavior while the harness keeps the contract portable.
- ChatGPT Automations is a useful first adapter, but local execution still depends on the host's availability and configuration.
- Draft-only execution is the initial default. External side effects require a later, explicitly approved pilot.
- The first pilot should be a low-risk read-only or reporting routine. Calendar updates from booking data are a separate external-side-effect pilot.
