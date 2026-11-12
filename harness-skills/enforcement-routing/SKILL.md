---
name: enforcement-routing
description: "Use when deciding how a rule is enforced: CI, permission rules, agent hooks, git hooks, or check scripts; or when a rule keeps being missed."
---

# Route a rule to its enforcement levels

Recommend the mechanical levels that make a rule hold and name what they leave open. Produce a plan; do not edit configuration, hooks, workflows, or documentation unless the user separately asks for that work. Where written guidance lives and how agents reach it is [`knowledge-routing`](../knowledge-routing/SKILL.md)'s decision; this skill hands it the gaps. This is a handoff, not a dependency.

The aim is the lightest context load. Mechanical levels cost no context until they fire, and their block message delivers the fix at the moment it is needed. Written guidance costs context on every session that loads it, so it carries only what enforcement cannot.

## Levels

Ordered by how hard each is to get around:

| # | Level | Can | Covers | Gaps |
| --- | --- | --- | --- | --- |
| 1 | Server-side rule: required CI check, branch protection, push protection | Block a merge, a push to a protected branch, or a push carrying a secret | Everyone who pushes or merges | Required checks run after push, so only push protection stops a pushed secret. A committed workflow or protection resource does not prove it is active. |
| 2 | Permission deny rule | Block a tool call | One provider's agents | Pattern-matched; a different command reaches the same effect. Only blocks. |
| 3 | Agent hook | Block a tool call; require work before a session ends | One provider's agents | Script code: it lets the call through on a crash unless it exits as a block. Pattern-matched like level 2. |
| 4 | Git hook | Block commit or push | Everyone in that clone | Skipped by `--no-verify`; absent until installed. |
| 5 | Check script | Report pass or fail | Whoever runs it | Runs only when CI, a hook, or a person runs it. |

Anything these levels leave open falls to written guidance, which only informs and leaves compliance to the agent's choice. Memory suggests and never enforces.

## Process

1. **Bound the rule.** Split composite guidance into atomic rules. Restate each as a predicate a machine could check, such as "no commit on `main`". If no predicate exists, the rule is judgment: skip to step 5.
2. **Find the harm point.** Name the action where a violation does damage (tool call, commit, push, or merge) and whether the damage is reversible. Name what must happen if the rule requires an action rather than forbidding one.
3. **Set the floor.** Choose the earliest level that sees the violation before its harm point. Irreversible harm before push needs level 2 or 3. Harm at push or merge needs level 1. A required action needs level 1, 3 (end-of-session hook), or 4; level 2 cannot require anything. A rule that binds only one user floors at level 2 or 3 in that user's ignored `.claude/settings.local.json` ([Claude Code settings](../../docs/agents/skills-and-plugins.md#claude-code-settings)), and its backstops stay in personal configuration, never in shared CI, protection, or tracked hooks.
4. **Add backstops.** Each mechanism is code to maintain, so add a backstop only for a gap that is likely to be hit and whose harm is irreversible or costly. Reversible harm gets the floor and at most one backstop; name the backstops you skipped in one line. Each backstop covers a named gap of the floor:
   - A provider-specific floor (levels 2–3) gets a level 1 or 4 backstop when the rule also binds people or other providers, unless it binds only one user (step 3).
   - A level 4 floor gets deny rules for `--no-verify` on commit and push.
   - Hooks and deny rules that guard against agents get a deny rule for edits to their own configuration and scripts.
   - A level 5 script gets a level 1 or 3 caller, or it does not count as enforcement.
   - A secret that could leak on push gets push protection; a required check is too late.
5. **Name the gaps.** Default to the block message. Write it as the recovery instruction: what was blocked, why, and the command or path that works. List each gap that still needs written guidance:
   - the rule is judgment with no predicate;
   - a provider, person, or command path escapes every level;
   - a late block wastes significant work, so the agent must know before starting.

   Route each gap's text with `knowledge-routing`, which follows the one-line-and-link rule in [documentation strategy](../../docs/agents/documentation-strategy.md#enforcement). With no gaps, the rule needs no written guidance.
6. **Reuse what exists.** Before proposing a new mechanism, read the current inventory: [Claude Code settings](../../docs/agents/skills-and-plugins.md#claude-code-settings) for deny rules and hooks, `.github/workflows/` for CI, and the `check:*` scripts in `package.json`. Extend an existing guard or check over adding a parallel one. Mark any mechanism unverified when its provider state was not inspected.

## Report format

Return only the table and the lists below; cite inventory inside the rows instead of restating it. One row per atomic rule:

| Rule | Harm point | Floor | Backstops and the gap each covers | Block message | Gaps for `knowledge-routing` |
| --- | --- | --- | --- | --- | --- |

Then list unverified provider state and any written guidance that a future mechanism could retire.
