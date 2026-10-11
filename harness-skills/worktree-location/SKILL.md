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
   decision record. Do not expose local path values in tracked files or logs.
3. Retrieve only matching user memory:

   ```sh
   pnpm decision-memory get --category worktree-location --user local \
     --project <project-name> --business-line <business-line> \
     --environment <environment> [--project-actual <configured-path>] \
     [--decision-record <verified-project-record-path>]
   ```

   Omit unknown scope flags. Supply `--project-actual` only for an explicit
   project-owned setting; a machine-wide environment default is not a project
   override.
4. Apply the result:
   - `available`: report the preference as a candidate. Use it only when it
     agrees with policy and no more authoritative setting applies.
   - `stale`: ask the user to reconfirm before relying on it.
   - `conflict`: fail closed and ask which preference is current.
   - `not-found`: continue with current policy and configuration.
   - `deviation.status: undocumented`: report the project setting and missing
     rationale, then follow the clear project configuration. Do not block.
5. Record or replace a preference only after the user explicitly confirms the
   exact value. Use `pnpm decision-memory record --input <reviewed-json-file>
   --confirm`; replacement also requires `--replace-id <record-id>`.

The local memory file lives outside repositories and is not encrypted or synced.
Keep records limited to non-sensitive preferences; never store credentials, PII,
transcripts, or project implementation details.
