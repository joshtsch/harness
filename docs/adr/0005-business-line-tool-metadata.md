# Business-line metadata owns shared tool mappings

Business lines are reusable organizational or product groupings related to one or more projects, and projects may belong to multiple business lines or none. Shared tool mappings, including CRM and calendar targets, live on the business line; projects without a business line may define local mappings, and any project may override inherited options explicitly. Reads can use the union of mappings, while writes and single-record operations require an explicit target; calendar writes require exactly one default writable target. This keeps cross-project relationships in canonical harness configuration without forcing unrelated repositories into a business grouping or putting credentials and external records in Git.

## Consequences

- Configuration loading must validate reusable business-line references, tool mappings, target identifiers, and override conflicts.
- Resolution must distinguish inherited business-line mappings from project-local overrides and require explicit selection when multiple business lines produce competing write targets.
- Missing mappings fail only when the requested tool workflow needs them; unrelated project and session workflows continue.
- Existing project-level `crm` remains a supported override while business-line CRM mappings provide shared defaults.

## Implementation plan

1. Extend `projects.yml` with reusable business-line definitions, optional project memberships, and tool mappings.
2. Add strict parsing and validation for references, targets, access intent, defaults, and conflicting overrides.
3. Add resolution and tool-context lookup that combines business lines before applying project overrides; require explicit targets for ambiguous writes.
4. Preserve project-level `crm` as an override and add focused tests for unassigned projects, shared projects, and calendar default rules.
5. Document provider adapters separately, then add calendar and CRM operations without moving credentials or external records into repository configuration.
