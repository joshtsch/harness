# Provider-neutral capabilities and skill governance

**Status:** accepted
**Authors:** User and Codex
**Tags:** capabilities, skills, providers, routing, policy

The harness will govern provider-neutral capabilities rather than treating one agent provider's skills as the system model. A capability defines the user intent, input/output contract, authority, and verification requirements; provider-specific skills implement capabilities, and provider adapters translate them to each provider's tools and invocation rules. The first supported providers are Codex and Gemini.

The harness will maintain one canonical implementation per capability, with explicitly declared companions and provider support states. Ambiguous, retired, or unsupported routes fail closed. Installation locks record artifacts and provenance; capability policy records canonical ownership, composition, lifecycle, and routing. Usage evidence may propose changes, but cannot alter policy without review.

This separates portable harness behavior from Codex-specific skill conventions and prevents overlapping skills from silently competing. Provider-specific extensions may exist, but cannot claim a shared capability without satisfying its contract.
