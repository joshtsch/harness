# Personalized Agent Coding Harness

This TypeScript harness coordinates agent sessions across independent Git repositories. Public defaults live in `projects.yml`; installation-specific projects belong in ignored `projects.local.yml`. Projects are cloned under ignored `projects/` and worked on exclusively through isolated worktrees outside the harness tree.

Start at the repository root and read [AGENTS.md](AGENTS.md) for workflow routing. Domain vocabulary lives in [CONTEXT.md](CONTEXT.md); durable workflow guidance lives under [docs/agents/](docs/agents/).

Infrastructure changes follow [Terraform-first management](docs/agents/infrastructure.md): use Terraform when provider coverage exists, keep shared state remote and locked, and record why any manual fallback was necessary.
Next.js applications deploy through Vercel unless the user explicitly approves a documented exception.

Repository-owned infrastructure is defined in [`infrastructure/`](infrastructure/).
The HCP control plane in [`infrastructure/hcp/`](infrastructure/hcp/) is managed
by the manually created `platform-bootstrap` workspace, which does not manage
itself. See [infrastructure management](docs/agents/infrastructure.md) for the
workspace policy.

Initialize the harness before starting a session with `pnpm init:harness` for
Codex or `pnpm init:harness --provider gemini` for Gemini. This runs
the configured environment checks, restores project skills from `skills-lock.json`,
and checks their capability policy. For Codex sessions, it also verifies the
plugins in `.codex/plugins.yml`. For Gemini sessions, it verifies that Gemini
loads `AGENTS.md` through `.gemini/settings.json`, enables canonical project
skills, and disables noncanonical or unavailable ones.
The save skill lock entry uses a repository clone URL and a separate `ref` for
`codex/5-save-session`; GitHub tree URLs cannot distinguish that branch's slash
from a skill subdirectory in the Skills CLI. The approved Codex plugins are
`ponytail@ponytail`, `vercel@openai-curated-remote`, and
`supabase@openai-curated-remote`. Installed plugin identifiers must match the
manifest; initialization reports installation guidance when one is missing.
Plugin inventories can use up to 8 MiB per stdout/stderr stream. Larger output
fails verification with a bounded-capture diagnostic; command failures do not
reproduce inventory contents. See [tooling guidance](docs/agents/tooling.md#skills-and-plugins).
The policy lives in `capabilities.yml` and
`agent-policy.yml`; it records one canonical project skill per capability and
explicit Codex and Gemini support. Inspect a route with
`pnpm capabilities route codex lean-build` or
`pnpm capabilities route gemini scope-router`. Run `pnpm capabilities check`
after changing the skill lock or policy. Add `--json` to a route command for a
redacted selection output. After using a capability, record its usage without
prompts or transcripts with `pnpm capabilities record codex lean-build`.
The same command records modes, for example `pnpm capabilities record codex caveman`.
For implementation tasks, `pnpm capabilities decide codex "fix a regression"`
selects a work shape from declared triggers and reports ambiguity for review.

## Public configuration boundary

`projects.yml` contains safe public defaults only. Add repositories you are
authorized to access to ignored `projects.local.yml` before running a session.
The local file uses the same schema and overrides public scalar values; local
lists replace public lists.
Keep private repository names, account identifiers, external resource IDs, CRM
records, and personal project descriptions out of tracked files. Use environment
variables for external IDs and keep credentials outside the repository.

Check host prerequisites directly with `pnpm check:prereqs`. The check covers
Git, Node.js, pnpm, npx, the selected agent CLI, `age`, and the Bitwarden CLI. It only checks
that each command is available; it does not unlock Bitwarden or contact an
account. `pnpm init:harness` runs the same check before other initialization
stages, and `pnpm setup:session` runs it before resolving the session issue.

Initialization also validates the merged project configuration and reports each
clone as `existing` or `missing`. Plain init leaves project repositories
unchanged and shows a restore command when clones are missing. Run
`pnpm init:harness --clone-projects` to clone all missing configured projects
into ignored `projects/`; add `--provider gemini` when using Gemini.
Existing clones are preserved. Failed clones or invalid destinations are
reported per project and make initialization exit nonzero. See
[clone restoration and retries](docs/agents/session-lifecycle.md#initialization-and-project-clones).

Start an issue-bound session with `pnpm setup:session --goal "Expected outcome" <project> <issue-number>`.
Both `pnpm worktree` and `pnpm setup:session` default to the sibling
`<harness-folder>-worktrees/`. Set `HARNESS_WORKTREE_ROOT` in the process
environment to choose another external root. See [configuration](docs/agents/project-configuration.md#worktree-root)
and [existing worktree migration](docs/agents/session-lifecycle.md#existing-worktrees).
Set `HARNESS_AGENT_PROVIDER=gemini` to check Gemini CLI during setup.
The harness resolves the issue title through the configured tracker before it
clones or creates worktrees. For untracked work, use
an issue in the configured tracker first; implementation sessions do not have
an exploratory bypass.

Session startup fetches participating clean default clones and fast-forwards
them when safe. It reports each as `updated`, `current`, or `skipped` with a
reason. Dirty, ahead, divergent, and nondefault clones are preserved; a skipped
clone stops preparation before bootstrap or worktree creation.
`--refresh` remains accepted for older invocations; refresh now happens on every
session start. Standalone `pnpm worktree` still requires an explicit refresh.

The required goal is distinct from the issue-derived purpose. Supply one line
of at most 1000 characters without secrets or PII. The goal is stored in
`docs/.scratch/setup/<session-id>/session.json` and the adjacent generated
`AGENTS.md`. Load that session file alongside the harness and project instructions
when starting agent work; the manifest points to it and successful setup prints
its path. Project-owned `AGENTS.md` files are preserved.

Create a worktree for a new or existing branch with:

```sh
pnpm worktree --refresh --branch feature/follow-up --base feature/first-change <project> <issue-key> "Follow-up change"
```

`--branch` selects the branch; without it, the issue key and title determine the
name. An existing origin branch is tracked, and an existing local branch keeps
its commits. `--base` accepts an origin branch name, optionally prefixed with
`origin/`, and defaults to the project's default branch for new worktrees.
The harness records it as `branch.<branch>.harness-base` in the project's Git
configuration. Reuse reads that value and refuses a conflicting explicit base.
`--refresh` fetches origin with pruning so deleted bases are detected. Without
refresh, checks use the available remote-tracking refs. See
[branch and base lifecycle](docs/agents/session-lifecycle.md#worktree-branches-and-bases).

Before opening that issue, classify every repository the session may modify and
register durable projects in `projects.yml` or ignored `projects.local.yml`.
This includes durable external skill-source repositories; one-off dependencies
and temporary checkouts remain outside the project inventory.

List configured child wikis with `pnpm wikis` or `pnpm wikis --json`.
Research and source-capture requests route to the matching child wiki; harness
wiki content is reserved for harness knowledge.

## MCP servers

Codex MCP configuration for this harness lives in [.codex/config.toml](.codex/config.toml).
When adding or migrating a server, keep project-scoped configuration in the
relevant repository’s `.codex/config.toml`; use `~/.codex/config.toml` only for
explicitly user-wide setup. Do not use root `.mcp.json` for native Codex project
configuration; reserve that format for portable/plugin packaging. Authentication
and credentials remain outside Git.

Before closing a session, follow [Completing a Session](docs/agents/session-completion.md)
to verify issue links, review, change requests, merges, and synchronized local
`main` branches. That workflow also inventories the harness and affected child
wikis and ingests durable research or decisions into the correct wiki.

## Portable session continuation

Use the `save` skill to capture a handoff, decisions, and outputs. The CLI
stores encrypted artifacts in Supabase so another session or machine can resume
the work.

### Set up saving

1. Install the harness dependencies with `pnpm install --frozen-lockfile` and
   make the `age` executable available. Provision the continuation backend using
   [the repository infrastructure guide](infrastructure/README.md), then
   apply the checked-in [continuation migration](supabase/migrations/20261004040031_continuation_state.sql)
   and [artifact revision fix](supabase/migrations/20261006222000_continuation_artifact_revision_advancement.sql)
   in order through your database deployment workflow. Terraform provisions the project;
   the migration installs the tables and RPC functions used by the CLI.
2. Configure the five settings below through your external secret store or an
   ignored local `.env`. Reuse the same backend, shared key, and age identities
   on each machine. Generate the shared key once from at least 32
   cryptographically random bytes and store its canonical base64 value in
   external custody. Changing it changes the derived session, artifact, and
   project-record keys.

   | Variable | Required value |
   | --- | --- |
   | `HARNESS_CONTINUATION_SUPABASE_URL` | The HTTPS project URL for the continuation backend. |
   | `HARNESS_CONTINUATION_SUPABASE_SERVICE_ROLE_KEY` | Its service-role key, supplied from external secret custody. |
   | `HARNESS_CONTINUATION_KEY_BASE64` | The shared key encoded as canonical base64, representing at least 32 random bytes. |
   | `HARNESS_SECURE_AGE_RECIPIENTS` | Comma-separated, distinct primary and recovery public age recipients. |
   | `HARNESS_SECURE_AGE_IDENTITY` | The path to a protected age identity file outside the repository. Save needs it for the retry queue; resume uses it for decryption. |

   Use the existing Bitwarden primary and recovery custody notes described in
   [secure document storage](docs/agents/secure-documents.md). Keep the private
   identity file restricted to its owner. Supply the file path, rather than its
   private key, as `HARNESS_SECURE_AGE_IDENTITY`.
3. If using a local `.env`, create it from [the example file](.env.example)
   without replacing an existing file, then fill in the values privately:

   ```sh
   test -f .env || cp .env.example .env
   chmod 600 .env
   ```

   Leave optional overrides commented or unset when using their defaults. If
   you copied an older template, remove empty `HARNESS_SECURE_DOCUMENTS_DIR`
   and `HARNESS_BITWARDEN_SESSION_FILE` assignments before loading it: empty
   paths override the protected storage and session-file defaults.

   Keep `.env` outside Git. Use shell-compatible `KEY=value` assignments and
   quote values containing spaces. The CLI reads exported process environment
   variables; it does not load `.env` automatically. Load a trusted `.env` into
   the shell before running the commands:

   ```sh
   set -a
   . ./.env
   set +a
   pnpm continuation:list
   ```

   The list command checks backend access without creating or claiming a
   session. It does not validate encryption keys. Start your agent from the
   configured environment as well; a separate terminal or an already running
   app does not inherit these exports. Keep the service key and shared key out
   of agent prompts and logs.

### Save and resume

The `save` skill prepares the artifacts and invokes the CLI. To invoke it
directly, retain the source notes or session context for retry and create
disposable handoff and decisions copies in a private temporary directory. Run
this command from the harness root:

```sh
pnpm save -- --handoff <handoff-file> --decisions <decisions-file>
```

Remove the plaintext input copies after the command finishes, including when
it fails. A failure before `saved` or `queued` may leave no persisted copy;
fix the configuration and recreate inputs from the retained source context
before retrying. A `saved` response includes the opaque `sessionKey`; retain
that key to resume on another configured machine or provider. A `queued` response is an
encrypted local retry intent and cannot yet be resumed. Once the backend is
reachable, run `pnpm continuation:flush` and confirm it succeeds before
resuming.

Use `--projects-local <file>` to sync portable project metadata. Resume with
`pnpm resume -- --session-key <key>`, list sessions with
`pnpm continuation:list`, renew a claim with
`pnpm continuation:renew -- --checkpoint-file <file>`, and resolve or supersede
one with `pnpm continuation:close`. Hydrate project metadata with
`pnpm continuation:projects -- --output projects.local.yml`.

Local resume checkpoints are age-encrypted at rest.
Resume returns decrypted artifacts to the active provider in its command result;
the local checkpoint retains only the encrypted claim data. Keep all credentials
outside Git. Run
`pnpm save:audit -- --session-key <key> --report <file>` for a review-only
session audit. The storage, encryption, lifecycle, and retry rules are in
[ADR-0015](docs/adr/0015-supabase-only-session-state.md).

The database contract tests live under `supabase/tests/database/`; run them
with `supabase test db` against the local Supabase stack (Docker required).

Create a new minimal GitHub project with
`pnpm create:project <name> --public` or `pnpm create:project <name> --private`.
Use `--dry-run` to validate without side effects, or `--resume` after an
interrupted creation.

## Secure records

The default local secure-record directory is `.secure-documents/`. Records are
encrypted individually with the external `age` CLI and remain outside Git.
The secure-record commands require explicit authorization and external key
configuration:

```text
pnpm secure:init
pnpm secure:login
pnpm secure:custody -- setup
pnpm secure:custody -- drill
pnpm secure:custody -- export --output <recovery-export.age> --recipient <age-recipient> --confirm-export
pnpm secure:custody -- import --input <recovery-export.age> --identity <age-identity-file> --confirm-import
pnpm secure:migrate -- --record-id <record-id> --input <plaintext-markdown-file> --confirm-delete-plaintext
pnpm secure:rotate -- rotate --record-id <record-id> --confirm
pnpm secure:rotate -- cleanup --record-id <record-id> --confirm
pnpm secure:list -- --authorize --actor harness
pnpm secure:read -- <record-id> --authorize --actor harness
pnpm secure:write -- <record-id> --input <temporary-markdown-file>
```

`secure:init` creates or validates an `age` identity outside the repository and
prints session-local exports for the identity path and public recipient. It
never prints the private key. After writing a record, read it back successfully
before removing any plaintext source. New writes require the comma-separated
`HARNESS_SECURE_AGE_RECIPIENTS` value containing both primary and recovery
recipients.
`secure:custody`, `secure:migrate`, and `secure:rotate` accept an explicit
`HARNESS_BITWARDEN_SESSION`/`BW_SESSION` or interactively unlock Bitwarden for
that command only. The session stays in memory. They run the disposable
recovery drill before real records are touched; migration additionally requires
dual recipients, verification with both identities, and explicit
`--confirm-delete-plaintext` before removing a plaintext source.
When the visible Codex terminal is the only interactive shell, run
`pnpm secure:login` there once. It stores the short-lived session in a
user-scoped, permission-restricted temporary file outside the repository so
subsequent secure commands can reuse it without copying the token between
terminal tabs.
Secure-record writes encrypt the note with the configured age recipients and
store that ciphertext in a Bitwarden Secure Note named
`Harness Secure Record: <record-id>`; local `.md.age` files remain as a
compatibility mirror. Reads and lists prefer Bitwarden and fall back to local
records that have not been migrated yet.

See [secure document storage](docs/agents/secure-documents.md) for environment
variables, scope, and privacy rules. Use [.env.example](.env.example) as the
names-only template; never commit `.env` or resolved credentials.

Back up or restore ignored local project configuration explicitly after
Bitwarden and age custody are ready:

```text
pnpm config:backup
pnpm config:backup -- --replace
pnpm config:restore
pnpm config:restore -- --replace
```

Backup validates the merged configuration before encrypting the complete local
file into the harness-scoped Bitwarden secure record `projects-config`.

The agent-facing wiki lives in [`docs/llm-wiki-harness/`](docs/llm-wiki-harness/). Custom skills are authored in [joshtsch/skills](https://github.com/joshtsch/skills).
Approved external skills sources, including [mattpocock/skills](https://github.com/mattpocock/skills)
and [pbakaus/impeccable](https://github.com/pbakaus/impeccable),
are recorded in `.codex/skill-sources.yml`. Use `pnpm dlx skills` for pushed
skills; use `pnpm link:skill` for local testing.

Impeccable is the default for UI shaping, critique, and polish. See
[UI design routing](docs/agents/agent-roles.md#ui-design-routing) and
[installation details](docs/agents/tooling.md#impeccable-installation).

## Prompt/session optimization adapter

Normal harness work can submit a session trace through `adaptPromptSession`. Pass a session-scoped prompt, resolved context, operational events, artifacts, feedback, and observed state. The adapter validates trace provenance and sensitive content, derives open observations and ranked candidate improvements, writes only those observations to `docs/.scratch/setup/<session-id>/observations.jsonl`, and returns a candidate handoff only when safety and outcome gates pass. Handoffs remain review-only; callers must not promote or apply them automatically.

```ts
import { adaptPromptSession, type PromptSessionInput } from "./src/optimization/index.js";

const input: PromptSessionInput = {
  harnessRoot: process.cwd(), sessionId: "session-1", traceId: "trace-1", projectKey: "harness",
  prompt: "Review the completed session",
  resolvedContext: { id: "context-1", provenance: "trace-1:context", summary: "resolved session context" },
  events: [{ sessionId: "session-1", projectKey: "harness", mode: "review", skill: "review", event: "complete", durationMs: 10, result: "success" }],
  artifacts: [{ id: "report", provenance: "trace-1:artifact:report", exists: true, valid: true }],
  observedState: [{ id: "working-tree", provenance: "trace-1:state:working-tree", matches: true }],
  feedback: [{ id: "feedback-1", source: "deterministic", summary: "diff check passed", proposedChange: "Suggest review mode for diff-only tasks", expectedBenefit: "fewer unrelated edits", risk: "false recommendation", confidence: 0.8, rollbackPath: "remove recommendation rule", verification: ["run tests"], scope: "harness", expectedBenefitScore: 0.8, cost: 0.1, riskScore: 0.1, evidenceStrength: 0.9 }],
};
const result = await adaptPromptSession(input);
```

The adapter also returns review-only `ruleSuggestions` when a user states a
repeatable expectation, or when the caller supplies a bounded agent
`ruleSignals` entry. Each suggestion includes a proposed issue title and body,
but the harness does not create or publish a GitHub issue automatically. During
session setup, suggestions are printed as `Rule suggestion: ...`, recorded in
the session event log, and persisted as namespaced scratch state under
`docs/.scratch/setup/<session-id>/rule-suggestions.jsonl`.
