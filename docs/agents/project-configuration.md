# Project Configuration

`projects.yml` is the canonical public configuration source. Portable private
project metadata is canonical in the encrypted user-level Supabase record.
`projects.local.yml` is a machine-local overlay/cache using the same schema; sync
portable fields from Supabase and retain machine-specific fields locally. The
harness validates the merged configuration before touching any repository. A
generated runtime representation must never become a second source of truth.

The overlay deep-merges mappings. Local scalar values override public values,
and local lists replace public lists. Keep private repository names, account
identifiers, external resource IDs, CRM records, and personal project context
in the encrypted remote record. Keep machine-specific paths and credentials
local. Do not use Bitwarden as the runtime configuration source; it remains
external custody for secrets and encryption identities.

Each project entry should identify:

- a unique logical name;
- its Git remote and default branch;
- its issue-tracker type and project key;
- its optional CRM provider;
- its optional business-line memberships and project-level tool mappings;
- its optional child-wiki description, topics, and paths (`wiki.pages`, `wiki.raw`, and `wiki.templates`);
- the project-owned `scripts/setup.sh`;
- verification and other optional workflow commands.

Verification commands use `verification`, and optional commands use `workflows`.
Each entry has `command`, `args`, and optional `required`; verification defaults to
required, workflows default to optional. Commands run from the project worktree.

Common defaults may be declared at the top level and overridden per project. Unknown fields and ambiguous project names should be rejected. Secrets and machine-specific values may come from environment variables; they should not be committed to configuration.

Projects with a durable agent wiki declare a short `wiki.description`, a
non-empty `wiki.topics` list, and its relative paths under `wiki`. Run
`pnpm wikis` for a human-readable inventory or `pnpm wikis --json` for agent
discovery. The paths are metadata only; the child repository remains the source
of truth for its wiki content. Topics are routing hints only: agents must also
inspect the source content before selecting a destination.

Business lines are declared under top-level `business_lines` with a stable key, `display_name`, and optional `tool_mappings`. Projects list zero or more business-line keys in `business_lines`. A mapping names a provider and one or more opaque `targets`; each target has an `id`, an `access` value (`read`, `write`, or `read_write`), and an optional `default` flag. Target IDs may use an exact `${ENV_VAR}` reference; the referenced environment variable must be set at load time. Calendar mappings may have one default target, and any writable calendar mapping must have exactly one default writable target. These identifiers select external resources; credentials and external records stay outside `projects.yml`. When multiple business lines provide a tool, reads may return their compatible union; conflicting target definitions fail during resolution, and calendar writes require an explicit default writable target when more than one applies.

CRM configuration is provider-neutral. A project may declare a CRM type, such as `attio`, and later provide provider-specific connection or workflow settings through the corresponding integration.

External tools must be classified by scope before they are added. Shared tools belong in the harness-level MCP configuration; project-specific providers, records, workspace/account mappings, permissions, or overrides belong in the relevant project entry. Temporary tools belong in ignored session state rather than durable configuration. Session tool metadata may contain only `tool_mappings`; resolution precedence is session mapping, project override, then inherited business-line mapping. Session mappings apply only to the loaded session and must contain stable target identifiers, never credentials or external records.

## Worktree root

The location decision is recorded in [ADR-0002](../adr/0002-isolated-deterministic-worktrees.md#external-root-amendment--october-9-2026).

`HARNESS_WORKTREE_ROOT` is an optional machine-local process environment setting.
Unset or blank uses the sibling `<harness-folder>-worktrees/` of the physical
harness directory. An absolute path is used directly; a relative path resolves
from the physical harness root. The CLI does not load `.env` automatically.

Both `pnpm worktree` and `pnpm setup:session` resolve this setting before
preparing projects. Roots inside the harness, including the harness itself and
symlink aliases, are rejected. Existing ancestors are resolved even when the
target directory has not been created. Project-directory aliases into the
harness are also rejected before worktree creation.

Worktrees use `<root>/<project>/<issue-title>/`. Session manifests, setup
environment (`HARNESS_WORKTREE_PATH`), and subsequent workflow commands use
the actual external path. Creation records `harness.root` in the project clone's
shared Git configuration; `git config --get harness.root` from a linked worktree
finds its owning harness without walking parent directories. Relocating the
harness requires rerunning creation/setup to refresh this pointer.

See [existing worktrees](session-lifecycle.md#existing-worktrees) for preservation,
discovery, migration, and rollback. Listing and pruning commands are tracked in
issue #14; they must use this resolver when implemented.

## Project setup contract

Every project owns `scripts/setup.sh` at its repository root. The script must be deterministic, idempotent, observable, and usable when the repository is opened in isolation. The harness invokes it from the project root with an explicit phase and standardized session metadata, including project name, issue identity, purpose, worktree path, and harness root.

The harness owns worktree preparation and verification policy. Project setup remains project-owned so each repository can choose its own language, package manager, and tooling.
