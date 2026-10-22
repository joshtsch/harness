# Agent Instructions

This harness improves its own workflows and coordinates work across independent Git repositories. It owns orchestration, not project code. Start at the harness root. Domain vocabulary lives in [CONTEXT.md](CONTEXT.md).

## Core boundaries

- Protect secrets, credentials, raw MCP output, and PII. Follow [Secrets and PII safety](docs/agents/data-safety.md).
- Keep child repositories' remotes, branches, and histories independent. Work in harness-managed worktrees outside the harness tree; preserve main clones and unsafe checkouts. See [Architecture and boundaries](docs/agents/architecture.md) and [Session lifecycle](docs/agents/session-lifecycle.md).
- Make harness changes on a feature branch. Follow the [harness contribution workflow](docs/agents/contributing.md) and complete its review gate before opening a change request.
- Classify repository scope before provisioning or writing, and register durable projects before repository work. Follow [Repository intake](docs/agents/repository-intake.md).
- Treat `projects.yml` as public configuration and ignored `projects.local.yml` as its installation-specific overlay. Validate the merged configuration; never commit the local file. See [Project configuration](docs/agents/project-configuration.md).
- Update affected authoritative documentation with each code or operational change. Update `.env.example` when environment variables change.
- Use Terraform for supported infrastructure changes. Complete the [Terraform coverage gate](docs/agents/infrastructure.md#terraform-coverage-gate) before choosing an infrastructure write tool.

## Context routing

- For project registration, backlog review, standards alignment, or portfolio maintenance, follow [Backlog management](docs/agents/backlog-management.md) before changing issue state.
- When adding, revising, moving, or assessing the placement of durable agent knowledge, invoke `$knowledge-routing`. It recommends the authoritative source and the path that loads it when needed; it does not write by default.
- [Documentation strategy](docs/agents/documentation-strategy.md) defines the authoritative surface for each knowledge type. [Agent documentation map](docs/agents/README.md) routes to focused procedures; load only the guidance needed for the current operation.
- Keep transient handoffs and recovery state under ignored `docs/.scratch/`.
- For skill installation, check approved project-local sources before reporting a skill unavailable. See [skill and plugin guidance](docs/agents/tooling.md#skills-and-plugins).

## Work and completion

- For DNS failures, connection errors, or stalled network commands, follow [Sandbox network troubleshooting](docs/agents/tooling.md#sandbox-network-troubleshooting) before diagnosing the host network or remote service.
- Follow [Agent role routing](docs/agents/agent-roles.md) for capability selection, provider-specific behavior, and skill ownership. Resolve skill routes with `pnpm capabilities`; unresolved or unsupported routes fail closed.
- Before reporting work complete, follow [Session completion](docs/agents/session-completion.md) and report remaining blockers or preserved changes.
- Do not send messages or publish external content unless the user's request authorizes that action.
