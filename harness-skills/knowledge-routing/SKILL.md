---
name: knowledge-routing
description: "Use when deciding where durable agent knowledge belongs, adding, moving, or revising agent guidance, or assessing documentation impact from a policy, workflow, or code change."
---

# Route knowledge to its source

Recommend where knowledge belongs and how an agent should reach it when needed. Produce a placement plan; do not write, move, or persist knowledge unless the user separately asks for that work.

## Process

1. **Bound the item.** Restate the smallest useful knowledge unit. Separate composite guidance into independently owned rules, facts, procedures, preferences, or temporary state.
2. **Set scope and owner.** Classify it as harness-wide, cross-project, project-specific, user-specific, session-only, or external. Identify the repository or person that owns changes to it.
3. **Inspect the relevant sources.** Read `CONTEXT.md` for the seven context layers and `docs/agents/documentation-strategy.md` for the authoritative-surface map. Inspect only the likely destination and its nearest index or entry point. Search for an existing source, competing copy, or conflict before recommending a new one.
4. **Choose the meaning layer.** Use the context layer that explains how the knowledge should shape work: policy, domain, workflow, mode, skill, session, or memory. For composite items, make one recommendation per atomic item.
5. **Choose the authoritative carrier.** Apply the documentation-strategy map. Use the smallest fitting source of truth, then identify only the links, indexes, or enforcement that make it reachable and maintained.
6. **Choose activation.** State how the agent encounters the source: always-loaded instructions, a focused pointer, a routed or invoked skill, project/session setup, a query, a hook, or an explicit tool/script call. Keep branch-specific detail behind a pointer when it is not needed on every task.
7. **Check boundaries.** Flag privacy, source-of-truth, duplication, conflict, stale-cache, discoverability, and ownership risks. Memory is a suggestion store, not policy; it cannot promote itself. Cross-project patterns require review before they become shared guidance.
8. **Return a plan.** Do not make the edits as part of routing.

## Placement rules

- Use the authoritative-surface table in `docs/agents/documentation-strategy.md`; do not create a competing category-to-document map here.
- Match activation to the trigger: concise always-loaded boundary, focused document pointer, invoked skill, session loader, query, hook, or script. Prefer a pointer or on-demand query for branch-specific knowledge.
- Use tracked `harness-skills/` for harness-coupled skills. Use the shared skills repository for skills that work unchanged outside the harness.
- Keep session state and memory scoped to their intended lifetime and audience. Neither may override policy; memory cannot promote itself. Cross-project patterns need review before becoming shared guidance.
- Keep one authoritative source. Add only the links, indexes, or enforcement needed for discovery and maintenance.

## Report format

Return a concise table with one row per atomic item and these fields:

| Item | Owner and scope | Context layer | Authoritative source | Activation path | Required links or enforcement |
| --- | --- | --- | --- | --- | --- |

Then list any conflict, duplication, privacy concern, or missing information that affects the recommendation. If the source or owner cannot be determined from repository evidence, label the uncertainty and ask only the question that blocks a reliable placement.
