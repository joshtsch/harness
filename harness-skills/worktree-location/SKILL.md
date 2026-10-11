---
name: worktree-location
description: "Use when choosing or reviewing the default location for harness-managed project worktrees."
---

# Resolve the worktree location

Treat local decision memory as a candidate preference. Explicit user instructions,
harness policy, and current project configuration take precedence.

1. Read the worktree-root rules in `docs/agents/project-configuration.md` and
   identify the current project, business line, and environment when known.
2. Inspect the effective `HARNESS_WORKTREE_ROOT` setting and any project-owned
   decision record. A record must include category, scope, preferred and actual
   patterns, reason, date, deciding authority, and a configuration reference.
   Do not expose local path values in tracked files or logs.
3. Retrieve only matching user memory. Project sessions export `HARNESS_ROOT`.
   Run the command from that directory so it works when the current directory
   is a child-project worktree. When already in the harness, use its root:

   ```sh
   PROJECT_ROOT="${HARNESS_WORKTREE_PATH:-$(git rev-parse --show-toplevel)}"
   pnpm --dir "${HARNESS_ROOT:-.}" decision-memory get --category worktree-location --user local \
     --project <project-name> --business-line <business-line> \
     --environment <environment> [--project-actual <configured-path>] \
     [--project-root "$PROJECT_ROOT" --decision-record <absolute-verified-project-record-path>]
   ```

   Omit unknown scope flags. Supply `--project-actual` only for an explicit
   project-owned setting; a machine-wide environment default is not a project
   override.
4. Apply the result:
   - `available`: report the preference as a candidate and include its
     confidence. Do not choose or apply a default from memory; ask the user to
     select or confirm the candidate before using it.
   - `stale`: ask the user to reconfirm before relying on it.
   - `conflict`: fail closed and ask which preference is current.
   - `not-found`: continue with current policy and configuration.
   - `deviation.status: undocumented`: report the project setting and missing
     rationale, then follow the clear project configuration. Do not block.
5. Record or replace a preference only after the user explicitly confirms the
   exact value. Run:

   ```sh
   pnpm --dir "${HARNESS_ROOT:-.}" decision-memory record \
     --input <reviewed-json-file> --confirm
   ```

   Replacement also requires `--replace-id <record-id>`.

Project rationale belongs in project-owned documentation, not local memory.
Use the project's documented decision-record destination or
`docs/decisions/worktree-location.md`. Draft the record with the required fields
from [decision memory guidance](../../docs/agents/decision-memory.md#record-a-project-override-rationale)
and only create or update it after the user confirms the exact rationale and
configuration change. Never infer rationale from an observed setting.

The local memory file lives outside repositories and is not encrypted or synced.
Keep records limited to non-sensitive preferences; never store credentials, PII,
transcripts, or project implementation details.
