# Contributing

Start from the repository root. Read [AGENTS.md](AGENTS.md) and [CONTEXT.md](CONTEXT.md)
before changing the harness.

Use a feature branch. Link work to a GitHub issue. Keep private project
configuration in ignored `projects.local.yml`; never commit credentials, raw
MCP output, or personal data.

Before opening a change request, run the relevant tests, typecheck, build,
documentation checks, and sensitive-content check. Run the two-axis review
against `main`, resolve actionable findings, then include verification results
and the issue link in the change request.
