# Agent Instructions

This repository is the personalized agent coding harness. Start every session at the harness root, never inside a child project.

Domain vocabulary lives in [CONTEXT.md](CONTEXT.md).

## Non-negotiable boundaries

Never commit secrets, credentials, raw MCP output, or PII; follow [Secrets and PII safety](docs/agents/data-safety.md).

- The harness owns orchestration, not project code.
- Child repositories live under ignored `projects/` and retain independent remotes, branches, and Git history.
- Child-project work happens only in harness-managed worktrees outside the harness tree. See [worktree root configuration](docs/agents/project-configuration.md#worktree-root).
- Harness changes happen on a feature branch, never directly on the default branch.
- A harness change must pass code review before its merge request is opened.
- Keep implementation out of child-project main/default branches and main clones. Session startup may fetch and fast-forward a clean default clone under [Session and worktree lifecycle](docs/agents/session-lifecycle.md); preserve dirty, ahead, divergent, and nondefault checkouts.
- Treat `projects.yml` as the canonical public configuration source. Permit the
  ignored `projects.local.yml` overlay for installation-specific private project
  metadata; validate the merged configuration and never commit the local file.
- Before provisioning a repository, opening an issue, creating a branch, or
  creating a worktree, inventory
  every repository the session may modify and classify it as an existing
  project, new project, harness change, external dependency/skill source, or
  temporary checkout. Register every durable project in the appropriate
  project configuration first; use the harness-managed clone/worktree for
  subsequent work. For repository creation or adoption, follow
  [Repository intake](docs/agents/repository-intake.md) before selecting write tools.
- When the user asks to install or configure an MCP server, use the Codex project configuration at `.codex/config.toml` for this harness (or the target project's `.codex/config.toml` for a child-project-only server). Use `~/.codex/config.toml` only when the user explicitly requests user-wide scope. Do not add new MCP servers to `.mcp.json`; that format is for portable/plugin packaging, not native Codex project configuration. Migrate existing `.mcp.json` entries when touching MCP setup.
- For Attio or Granola work, default to the public APIs. Read [API access and fallback](docs/agents/tooling.md#api-access-and-fallback) before selecting a tool or reporting an access blocker.
- For every code or operational change, assess the affected authoritative documentation and update it in the same change. This may include `README.md`, `AGENTS.md`, skills, and project docs, according to ownership. Do not defer required documentation updates; before handoff, verify docs match the changed behavior or record in the handoff why no documentation change is warranted.
- Whenever you introduce or change environment variables, update the affected repository's `.env.example` in the same change. Include each variable's name, a safe default or empty placeholder, and comments explaining required versus optional settings. Never put credentials or machine-specific identifiers in the example file.
- Before selecting any infrastructure write tool (including MCP, API, CLI, or
  dashboard), complete the [Terraform coverage gate](docs/agents/infrastructure.md#terraform-coverage-gate).
  Use Terraform for supported changes, remote state and locking for shared
  infrastructure, and an explicitly authorized fallback for unsupported operations.
- Deploy Next.js applications through Vercel. Use the approved Vercel plugin and document any explicitly approved exception.
- Install skills without a native plugin through `pnpm dlx skills` in its
  project-local scope; never install those skills globally. Native plugins are the
  exception: approved Codex plugins are listed in `.codex/plugins.yml` and use the
  Codex/plugin installer when no project-local plugin scope exists. For Codex
  sessions, `pnpm init:harness` must verify those plugins before work starts.

## Load relevant guidance

- [Secrets and PII safety](docs/agents/data-safety.md)

- [Architecture and boundaries](docs/agents/architecture.md)
- [Project configuration](docs/agents/project-configuration.md)
- [Infrastructure management](docs/agents/infrastructure.md)
- [Session and worktree lifecycle](docs/agents/session-lifecycle.md)
- [Tool intake and MCP inventory](docs/agents/tooling.md)
- [Agent role routing](docs/agents/agent-roles.md)
- [Documentation strategy](docs/agents/documentation-strategy.md)
- [Harness contribution workflow](docs/agents/contributing.md) when changing harness code or policy.
- [Session completion](docs/agents/session-completion.md) before reporting a session complete.
- [Agent documentation map](docs/agents/README.md)
- [Secure document storage](docs/agents/secure-documents.md)
- [Triage label definitions](docs/agents/triage-labels.md)

Load the focused document(s) relevant to the current operation. Store transient handoff and recovery data in ignored `docs/.scratch/`.

## Harness development

The harness itself is developed with ordinary Git branches/worktrees and GitHub change requests outside the harness CLI. The default branch is an integration branch: do not commit work directly to it.

## Agent role routing

Project skill routes are declared in `capabilities.yml` and `agent-policy.yml`.
Run `pnpm capabilities decide <provider> <task>` for work-shape requests;
ask the user to choose when it reports overlapping or unmatched intent.
For other project skills, classify the task against `pnpm capabilities list`, then run
`pnpm capabilities route <provider> <capability>` before selecting a
project-installed skill. Route a session mode with
`pnpm capabilities mode <provider> <mode>`. Use one primary route per task and include companions
in the same call. Ask the user to choose when more than one capability fits;
unresolved or unsupported routes fail closed.

- Use Caveman for conversational prose in harness sessions.
- Use Caveman-style concise prose for maintained wiki pages and agent guidance under
  `docs/llm-wiki-harness/wiki/`. Preserve source wording in
  `docs/llm-wiki-harness/raw/` and template wording in
  `docs/llm-wiki-harness/templates/`.
- Use `/humanizer` for human-facing prose after technical content is complete. This
  includes emails, blog posts, issue descriptions, change requests, and durable
  documentation outside `docs/llm-wiki-harness/`. Preserve code, commands, paths,
  identifiers, issue keys, citations, and exact error messages.
- For research or source-capture requests, run `pnpm wikis --json`, compare the
  source content with each matching wiki's declared topics, and route the work
  only when coverage is clear. Write requested source materials to that wiki's
  `raw` path and authored synthesis to its `pages` path. Use
  `docs/llm-wiki-harness/` only for harness knowledge. If coverage is unclear or
  more than one child wiki matches, ask which one; do not silently choose.
- Use Impeccable (`ui-design`) by default for UI shaping, critique, and polish.
  For UI implementation, retain the work-shape primary route and include
  `ui-design` as a companion of `lean-build` or `surgical-patch`.
  Follow [UI design routing](docs/agents/agent-roles.md#ui-design-routing) for
  project context, tool boundaries, and runtime limits.
- Use Ponytail for code generation.
- Use `/implement` to manage the development loop.
- Use `/code-review` to determine readiness for review. It runs the required review
  and creates the change request when the branch is ready.

## Merge-request gate

Before opening a merge request for harness changes:

1. Ensure the work is on a feature branch based on the current `main`.
2. Run the relevant tests, typecheck, and build.
3. Run the two-axis `code-review` against `main`, covering both repository standards and the originating issue/spec.
4. Address every actionable review finding, then rerun the two-axis review against the updated branch. Repeat this review-and-fix loop until both axes have no unresolved blocking findings. Do not open the merge request while actionable findings remain; explicitly accepted findings must include a documented reason and user approval.

The merge request description should link the originating GitHub issue and summarize verification results. Use “merge request” as the provider-neutral term; GitHub presents it as a pull request.

Treat “pick up an issue,” “work on an issue,” and equivalent requests as end-to-end development requests. After selecting the issue, continue through implementation, verification, review, and change-request creation. Stop only when blocked by missing access, required user input, or a failed gate that needs user direction. Do not report work as complete while the required review or change request remains undone.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `joshtsch/harness`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository with a root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
