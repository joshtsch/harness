# Agent Instructions

This harness improves its own workflows and coordinates work across independent Git repositories. It owns orchestration, not project code. Start at the harness root. Domain vocabulary lives in [CONTEXT.md](CONTEXT.md).

## Core boundaries

- Protect secrets, credentials, raw MCP output, and PII. Follow [Secrets and PII safety](docs/agents/data-safety.md).
- Keep child repositories' remotes, branches, and histories independent. Work in harness-managed worktrees outside the harness tree; preserve main clones and unsafe checkouts. Claude Code hooks block file writes in default clones. See [Architecture and boundaries](docs/agents/architecture.md) and [Session lifecycle](docs/agents/session-lifecycle.md).
- Make harness changes on a feature branch. Follow the [harness contribution workflow](docs/agents/contributing.md) and complete its review gate before opening a change request.
- When task ownership is unclear, use [project discovery](harness-skills/project-discovery/SKILL.md). Classify repository scope before provisioning or writing, and register durable projects before repository work. Follow [Repository intake](docs/agents/repository-intake.md).
- Treat `projects.yml` as public configuration and ignored `projects.local.yml` as its installation-specific overlay. Validate the merged configuration. See [Project configuration](docs/agents/project-configuration.md).
- Update affected authoritative documentation with each code or operational change. Update `.env.example` when environment variables change.
- Use Terraform for supported infrastructure changes. Complete the [Terraform coverage gate](docs/agents/infrastructure.md#terraform-coverage-gate) before choosing an infrastructure write tool.

## Context routing

- Route durable facts and user corrections to their authoritative source before dependent work; follow [recording and retrieval](docs/agents/documentation-strategy.md#recording-and-retrieval). Memory capture follows [dry-run-first review and approval](docs/agents/harness-memory.md#dry-run-first-memory-changes); keep unapproved proposals in the active review channel. Use `$knowledge-routing` when ownership or placement is unclear, and `$harness-memory` for selected-vault operations.
- [Documentation strategy](docs/agents/documentation-strategy.md) defines the authoritative surface for each knowledge type. [Agent documentation map](docs/agents/README.md) routes to focused procedures; load only the guidance needed for the current operation.
- Keep non-memory transient handoffs and recovery state under ignored `docs/.scratch/`.
- Before adding, enabling, or removing a skill or plugin, or reporting a skill unavailable, read [skill and plugin guidance](docs/agents/skills-and-plugins.md).

## Work and completion

- For DNS failures, connection errors, or stalled network commands, follow [Sandbox network troubleshooting](docs/agents/tooling.md#sandbox-network-troubleshooting) before diagnosing the host network or remote service.
- Follow [Agent role routing](docs/agents/agent-roles.md) for capability selection, provider-specific behavior, and skill ownership. Resolve skill routes with `pnpm capabilities`; unresolved or unsupported routes fail closed.
- Before creating tracker issues, follow [Shaping tracker work](docs/agents/triage-labels.md#shaping-tracker-work): every task belongs to an epic, so find or file the epic first.
- Before opening a change request, commit on the feature branch and run `$paired-review` against the local branch; open the change request only once the review session reports nothing unresolved. After later pushes to an open change request, run it again to continue the loop.
- When a project has Storybook, add or update stories for every UI element a change adds or changes. See [UI stories](docs/agents/session-completion.md#ui-stories).
- Before reporting work complete, follow [Session completion](docs/agents/session-completion.md) and report remaining blockers or preserved changes.
- Do not send messages or publish external content unless the user's request authorizes that action.
