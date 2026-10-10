# Agent Documentation Map

These documents describe harness workflow policy. `AGENTS.md` is the entry point and should route an agent to only the guidance needed for the current operation.

Attio and Granola workflows default to their public APIs; see [API access and fallback](tooling.md#api-access-and-fallback). Project-scoped MCP servers are declared in the relevant project's `.codex/config.toml`. Existing MCP registrations remain available, with credentials supplied outside tracked configuration.

| Concern | Document |
| --- | --- |
| Repository creation, adoption, and registration | [repository-intake.md](repository-intake.md) |
| Ownership and repository boundaries | [architecture.md](architecture.md) |
| `projects.yml` and project capabilities | [project-configuration.md](project-configuration.md) |
| Infrastructure provisioning and configuration | [infrastructure.md](infrastructure.md) |
| Sessions, setup, worktrees, change requests, wiki ingestion, and cleanup | [session-lifecycle.md](session-lifecycle.md) and [session-completion.md](session-completion.md) |
| GitHub issues and specs | [issue-tracker.md](issue-tracker.md) |
| Triage labels and workflow | [triage-labels.md](triage-labels.md) |
| Domain glossary and ADR consumption | [domain.md](domain.md) |
| Tool intake and MCP inventory | [tooling.md](tooling.md) |
| Agent role routing | [agent-roles.md](agent-roles.md) |
| Documentation strategy | [documentation-strategy.md](documentation-strategy.md) |
| Secure document storage | [secure-documents.md](secure-documents.md) |
| Ubiquitous language | [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) |
| Harness branch and merge-request workflow | [contributing.md](contributing.md) |
| Secrets and PII safety | [data-safety.md](data-safety.md) |

This directory evolves as workflow capabilities are added. Keep stable policy here; keep transient state in `docs/.scratch/`.
