# Secrets and PII Safety

Never commit secrets or personally identifiable information (PII) to the harness repository, child-project repositories, issue comments, agent briefs, logs, scratch metadata, MCP configuration, or generated artifacts.

## Rules

- Keep API keys, OAuth tokens, passwords, private keys, and connection strings in an external secret store or environment variables.
- Keep `.env` files and local credential material untracked; commit only safe templates such as `.env.example`.
- Treat CRM records, meeting notes, transcripts, attendee details, email addresses, phone numbers, and customer-specific context as PII or sensitive business data unless explicitly confirmed otherwise.
- Do not copy MCP results from Attio or Granola into tracked files. Record only stable identifiers or redacted summaries when durable context is genuinely required.
- Redact secrets and PII from GitHub issues, PRs, comments, test fixtures, command output, and `docs/.scratch/` state.
- Run `pnpm check:sensitive` against staged changes before committing. Treat findings as a blocking signal and review the complete diff manually; the scanner cannot prove that content is safe.

Use environment-variable references for external identifiers that could reveal personal or sensitive account context. Keep the resolved values in local environment configuration or an external secret store, never in tracked YAML, MCP configuration, logs, or issue content.

## Tool intake implication

When adding a tool, determine whether its data is harness/org-level, project-level, or session-level and whether that scope could expose another project's or person's data. Prefer the narrowest scope that supports the workflow, and never encode credentials or raw records in repository configuration.
