# Vault page profile

Target [OKF 0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md).
`wiki/` is the bundle boundary. Concepts use YAML frontmatter with `type`;
indexes/logs are reserved navigation files. Only the bundle-root index carries
`okf_version`. Raw files, outputs, templates, and agent guides are outside it.

The harness template supplies title, description, tags, sources, generation
metadata, and status. These are local authoring conventions, not additional OKF
requirements. Record `verified` for actual checks, never as scaffold data. Use
timezone-qualified timestamps and preserve unknown keys.

Actor fields use `<producer>/<version>` for agents/tools, `process:<id>` for
deterministic processes, and `human:<alias>` for actual human actions. If the
producer version is unavailable, label it `unknown` rather than inventing one.
`generated` is a mapping with `by` and `at`; `verified` is a mapping or list of
those events. Prose such as "machine source comparison" describes the check in
the body, not the actor identifier.

Give cited sources stable IDs/resources and matching Markdown footnotes. Record
capture/confirmation dates separately from page generation. Mark uncertain
claims. Use explicit relative Markdown links; repair them on moves. Cite external
vaults by repository/revision/path, not machine paths. Exports include permitted
evidence or declare external dependencies.

## Preferences

Use `type: Preference` with producer-defined fields:

- `scope`: user and optional project, business-line, environment identifiers.
- `category`, `preference`, `rationale`, and `stale_after`.
- Confirmation evidence in `sources` and a real `verified` event after confirmation.

Follow [decision-memory precedence](../../../docs/agents/decision-memory.md):
match applicable scopes; narrower wins; stale, conflicting, or incomparable
preferences need confirmation. Memory suggests; instructions, policy, and project
configuration prevail. Configuration rationale stays in project-owned docs.
Retain only non-sensitive preferences in vaults, subject to [dry-run-first review](../../../docs/agents/harness-memory.md#dry-run-first-memory-changes).

Until an approved backend cutover, the existing decision-memory store remains
authoritative. Use its CLI and confirmation safeguards rather than creating a
second vault store. A template does not establish an active preference backend.
