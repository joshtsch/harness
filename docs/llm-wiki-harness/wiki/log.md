# Wiki Log

**Summary**: Append-only record of wiki updates.
**Sources**: ../../../AGENTS.md
**Last updated**: October 9, 2026

- 2026-09-16: Initialized wiki for harness knowledge and cross-project information. Created starter structure. Preserved existing root `AGENTS.md`.
- 2026-09-16: Moved wiki into `docs/llm-wiki-harness/` to isolate agent-facing knowledge from harness implementation docs.
- October 6, 2026: Indexed [Attio and Granola API guidance](../../agents/tooling.md#api-access-and-fallback). Policy stays in agent docs; credentials and private records stay outside wiki.

- October 6, 2026: Recorded fresh publication snapshot and private historical archive in [ADR-0012](../../adr/0012-public-repository-hygiene.md). Private history stays outside the public repository.

- October 6, 2026: Publication authorized through locked Terraform state. Persist visibility in HCP; apply visibility-only run after merge requests close. See [release checklist](../../public-release-checklist.md).

- October 7, 2026: Indexed [Impeccable UI design routing](../../agents/agent-roles.md#ui-design-routing). Installation and policy stay in agent docs.

- October 9, 2026: Indexed [initialization plugin checks](../../agents/tooling.md#skills-and-plugins). Capture permits 8 MiB per output stream; failure diagnostics omit inventory contents.

## Related pages

- [[index]]
