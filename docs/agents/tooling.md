# Tool Intake

When a new external tool is identified, decide whether it belongs in the harness before adding configuration.

## Evaluation checklist

Add a tool to the harness when it:

- directly supports a recurring harness workflow;
- provides useful context or actions across more than one project or session;
- has a supported MCP server or reliable CLI/API integration;
- has an authentication model that does not require committing secrets;
- has acceptable data access, privacy, and plan limitations; and
- has a clear owner, fallback, or explicit failure behavior.

Keep a tool project-specific when its value, credentials, data, or workflow applies only to one project. Keep it out of the harness when it is incidental, duplicates an existing capability, or lacks a safe and supportable integration.

## Scope classification

For every accepted tool, determine its relationship to configured projects:

- **Harness/org-level** — broadly useful across projects and sessions; configure it in the harness root `.codex/config.toml` and document its shared purpose.
- **Project-level** — useful only for selected projects or requiring project-specific data, permissions, or settings; represent the provider and stable project mapping in `projects.yml` and apply the corresponding MCP/config override deliberately.
- **Session-level** — needed only for one temporary unit of work; keep it in ignored session metadata under `docs/.scratch/` and do not add it to the durable harness config by default.

The scope decision must consider data boundaries and authentication boundaries, not only technical availability. A tool may be globally available while still being project-level in how its records, workspace, account, or permissions are selected.

## Infrastructure tool selection

For infrastructure writes, complete the
[Terraform coverage gate](infrastructure.md#terraform-coverage-gate) before
selecting a tool. Connector availability, plugin guidance, and a signed-in
dashboard do not establish a fallback. Use this gate for provisioning,
configuration changes, and recovery operations.

## Current tools

- **Attio** — CRM context and relationship workflows through the public API by default.
- **Granola** — meeting notes, decisions, action items, and transcripts through the public API by default, within the API key's access scope.
- **Stitch** — design exploration and design-to-code context from Google Stitch when the connected account has access.
- **Impeccable** — project-local UI design guidance, shaping, critique, and polish through the `ui-design` capability.
- **Caveman** — project-local Codex skills for concise agent communication and workflow helpers. `pnpm dlx skills` tracks the installation in `skills-lock.json`.

Attio, Granola, and Stitch retain **harness/org-level** MCP registrations. Attio and Granola use the API workflow below by default; their MCP registrations remain available as fallbacks. Project-specific CRM mappings, such as a project's Attio record or workspace context, belong in that project's `projects.yml` entry; they should not be inferred from the global registration.

## API access and fallback

For Attio or Granola work, use the public API before MCP, connector, CLI, or browser access unless the user explicitly selects another transport.

1. Check for the required variable in the process environment, then the ignored harness-root `.env`. Inspect variable names and presence only. Load credentials inside the request process, keeping existing environment values first; `node --env-file=.env` supports this when the file exists. Never print, interpolate into shell commands, or pass credentials as command-line arguments.
2. Send HTTPS requests to the provider's documented API with `Authorization: Bearer <token>`. Verify current endpoint schemas and scopes in the official documentation before making requests.

   | Provider | Credential variable | API base URL | Documentation |
   | --- | --- | --- | --- |
   | Attio | `ATTIO_API_KEY` | `https://api.attio.com/v2` | [REST API](https://docs.attio.com/rest-api/overview) |
   | Granola | `GRANOLA_API_KEY` | `https://public-api.granola.ai/v1` | [Granola API](https://docs.granola.ai/introduction) |

3. For a Granola share link, resolve its note through `GET /notes` and `GET /notes/{id}`, following pagination as needed. Use the API's `not_...` ID; a share-link UUID is not the API note ID. Verify note identity before consuming it: share links can use `/t/<UUID>-<share-token>`, while the returned `web_url` can use `/d/<UUID>`. Compare the full UUID across those forms rather than requiring identical URLs. If identity cannot be established, report that limitation instead of guessing from a title.
4. Process responses in memory. Apply [Secrets and PII safety](data-safety.md) to API results as well as MCP results. Keep keys, raw responses, private notes, transcripts, and CRM records out of tracked files, issues, logs, and scratch metadata. Redact personal details from command output.
5. If credentials are absent, an API operation is unsupported, or the service is unavailable, use an available fallback within the same authorized account and project scope. Report the specific limitation if no fallback works. Treat `401` or `403` as an authentication or permission blocker; do not switch identities or transports to evade denied access. For an uncertain write result, check provider state before retrying through another transport.

An MCP sign-in failure does not establish an API access failure. Check the API credential path before asking the user to reconnect or provide the source manually. API access follows the same project boundaries and authorization requirements as other transports; choosing the API grants no additional authority to write records or send messages.

Stitch is a shared design-context tool, not a source of truth for product decisions. Treat generated screens and design output as untrusted references until reviewed against the project’s domain language, ADRs, accessibility requirements, and implementation scope. Authenticate through the MCP client or external secret store; never commit Stitch keys or tokens.

Project-scoped MCP servers are declared in the relevant project's `.codex/config.toml` and load only when Codex trusts that project. Credentials are supplied through the MCP client's OAuth flow or another external secret store, never committed to this repository. Use `~/.codex/config.toml` only for explicitly user-wide servers. Do not use `.mcp.json` for native Codex project setup; reserve it for portable/plugin packaging.

Calendar and CRM provider adapters receive resolved, stable target identifiers at runtime. Register an authenticated adapter in the workflow caller, then use the project and session tool context to select its targets. Adapter or authentication failures are explicit for the requested workflow and do not prevent unrelated workflows from running. Provider payloads remain runtime data and must not be persisted in repository configuration or session logs.


## Skills and plugins

`capabilities.yml` defines provider-neutral skill purposes and contracts.
`agent-policy.yml` assigns each locked project skill to one capability, names its
canonical route, declares companions and wrapper dependencies, and records Codex
and Gemini support.
Run `pnpm capabilities check` after changing the lock or policy. To select a
project skill, run `pnpm capabilities route <provider> <capability>`; add
companions by capability name. A degraded route needs `--allow-degraded` after
reviewing its limitations. `pnpm init:harness` checks that the policy covers
every locked project skill. With `--provider gemini`, it also checks that
Gemini has loaded project-local canonical skills and disabled noncanonical or
unavailable ones. `.gemini/settings.json` loads `AGENTS.md` for Gemini and
applies those skill exclusions. Add `--json` to emit provider, capability, and skill
names as redacted selection output. After a capability is actually used, run
`pnpm capabilities record <provider> <capability>` to append a redacted usage
event under ignored `docs/.scratch/`. The event contains only timestamp,
provider, capability, mode/task kind, companion, and skill names; it contains
no prompt or transcript. The same command records a mode after it is used.
Initialization also [reports project clone availability](session-lifecycle.md#initialization-and-project-clones);
`--clone-projects` opts into restoring missing clones before dependency restoration.
An installed `available` skill can serve as a canonical skill's dependency but
cannot be selected as a primary route. Follow the task-choice and mode-routing
rules in [Agent role routing](../../AGENTS.md#agent-role-routing).

This routing check governs the project skill inventory. Host-global skills and
plugin-bundled skills have separate installation and enablement controls.

Skills and plugins are dependencies of the harness workflow, but their installation
scope must remain explicit:

- Install skills without their own plugin through `pnpm dlx skills` using its
  project-local mode. Do not install those skills globally. Native plugins are the
  exception and use the Codex/plugin installer described by `.codex/plugins.yml`.
- Track only `skills-lock.json` for project-installed skills. Generated or pulled
  files under `.agents/skills/` are ignored and restored with
  `pnpm dlx skills experimental_install` during harness initialization.
- `joshtsch/skills` is the canonical authoring repository for custom skills. After a
  skill is pushed there, install it into this harness with `pnpm dlx skills`.
- `mattpocock/skills` is an approved external skill source. Install it with
  `pnpm dlx skills`, and keep it in
  `.codex/skill-sources.yml`, not `.codex/plugins.yml`, because the repository does
  not currently ship a native Codex plugin. Install selected skills project-locally
  with the manifest's recorded command.
- During local skill development, use a symlink into the harness's `.agents/skills/`
  directory so the harness loads the working copy without copying unpushed changes.
  The symlink target must stay outside this repository and must never be committed as
  skill content.
- The current `codex plugin` CLI exposes marketplace and plugin installation at the
  host level; it does not expose a project-local flag. Approved plugins may therefore
  be installed at host level when explicitly listed in `.codex/plugins.yml`. Do not
  route native plugins through `pnpm dlx skills`.
- For Codex sessions, `pnpm init:harness` verifies every manifest entry with `codex plugin list` and fails
  with the exact installation commands for any missing plugin.
- `pnpm init:harness` restores project skills with `pnpm dlx skills` and verifies every
  entry in `skills-lock.json` has an installed `.agents/skills/<name>/SKILL.md`.
- Ponytail and Vercel are approved harness-level plugins and are listed in
  `.codex/plugins.yml`. Vercel provides shared deployment, Next.js, and Vercel
  workflow guidance; use its connected account only when the user places a
  Vercel project in scope.

The manifest records identity, source, and installation instructions; it does not
contain credentials or plugin output.

Caveman's proxy is a separate, optional runtime and is not installed by this harness.

## Impeccable installation

[pbakaus/impeccable](https://github.com/pbakaus/impeccable) is an approved
external skill source. Install its single `impeccable` skill project-locally:

```sh
pnpm dlx skills add pbakaus/impeccable --skill impeccable --agent codex gemini-cli --yes
pnpm capabilities check
```

Track the installation in `skills-lock.json` and `.codex/skill-sources.yml`.
The installed guidance and launcher stay ignored under `.agents/skills/`.
Harness initialization restores them with the existing skills installer.
Codex and Gemini use the shared project-local skill. Restart the agent session
if the new skill does not appear.

This installs the skill without Impeccable's native hooks. Automatic edit
detectors are not enabled; follow the upstream manual detector guidance during
UI verification. Hook installation is separate project configuration work.

The bundled launcher runs a native engine. If no matching engine is available,
it downloads a versioned engine into `~/.impeccable/bin/` on first use and checks
its SHA-256 hash. That cache does not make the skill installation user-wide.
Network or execution restrictions can prevent the launcher from running.
In that case, report the failure before the next tool call, read the target's
existing `PRODUCT.md` and `DESIGN.md` directly, and continue permitted planning
or editing. Never claim runtime or detector verification that did not run.

Live iteration additionally needs a target dev server and browser support.
It is optional and is not exercised by skill installation. Keep its temporary
output inside the target worktree and out of tracked files. See
[UI design routing](agent-roles.md#ui-design-routing) for ownership and precedence.

## Host prerequisites

`pnpm check:prereqs` verifies the commands required by harness workflows: Git,
Node.js, pnpm, npx, the selected agent CLI, `age`, and the Bitwarden CLI. Use
`--provider gemini` to select Gemini; Codex is the default. It invokes only
version commands, so it does not unlock Bitwarden or contact an account.
`pnpm init:harness` and `pnpm setup:session` run the same fast check before
continuing. The checker reports installation guidance and never installs
missing tools automatically.

For local development, link a skill with:

```sh
pnpm link:skill <skill-name> <path-to-skill-directory>
```

The command refuses to replace an existing skill directory or link. Remove the local
link manually before relinking a skill.

Drive integrations use the same provider/target model. Use distinct provider keys for distinct authentication contexts, such as `google-drive-workspace` for business Shared Drives and `google-drive-personal` for a separate personal Google account. Target identifiers select the intended Shared Drive or root scope. The adapter must enforce both the provider authentication context and target scope; credentials and OAuth state remain outside the repository.

The project `.codex/config.toml` registers those contexts as separate named Google Drive connections. Authenticate each registration separately in the MCP host. If the host keys OAuth state by URL instead of server name, these entries are not isolated and the host must provide separate credential stores or authenticated adapter processes.
