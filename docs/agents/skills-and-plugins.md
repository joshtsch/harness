# Skills and Plugins

How the harness installs, routes, and verifies project skills and agent plugins,
and the Claude Code project settings. General tool intake lives in
[Tooling](tooling.md).

## Skill inventory and plugins

`capabilities.yml` defines provider-neutral skill purposes and contracts.
`agent-policy.yml` assigns each locked project skill to one capability, names its
canonical route, declares companions and wrapper dependencies, and records Codex,
Gemini, and Claude Code support.
Run `pnpm capabilities check` after changing the lock or policy. To select a
project skill, run `pnpm capabilities route <provider> <capability>`; add
companions by capability name. A degraded route needs `--allow-degraded` after
reviewing its limitations. `pnpm init:harness` checks that the policy covers
every locked project skill. With `--provider gemini`, it also checks that
Gemini has loaded project-local canonical skills and disabled noncanonical or
unavailable ones. `.gemini/settings.json` loads `AGENTS.md` for Gemini and
applies those skill exclusions. With `--provider claude`, it checks that
`CLAUDE.md` imports `AGENTS.md`, links each canonical, Claude-supported skill from
`.agents/skills/` into ignored `.claude/skills/`, and removes only links it
created for skills that are no longer enabled, including skills dropped from
policy. It refuses to replace any other
`.claude/skills/` entry. Add `--json` to emit provider, capability, and skill
names as redacted selection output. After a capability is actually used, run
`pnpm capabilities record <provider> <capability>` to append a redacted usage
event under ignored `docs/.scratch/`. The event contains only timestamp,
provider, capability, mode/task kind, companion, and skill names; it contains
no prompt or transcript. The same command records a mode after it is used.
Initialization also [reports project clone availability](session-lifecycle.md#initialization-and-project-clones);
`--clone-projects` opts into restoring missing clones before dependency restoration.
An installed `available` skill can serve as a canonical skill's dependency but
cannot be selected as a primary route. Follow the task-choice and mode-routing
rules in [Agent role routing](agent-roles.md#capability-routing).

This routing check governs the project skill inventory. Host-global skills and
plugin-bundled skills have separate installation and enablement controls.

Skills and plugins are dependencies of the harness workflow, but their installation
scope must remain explicit:

- When a requested skill is missing from the project inventory, check
  `.codex/skill-sources.yml` before reporting it unavailable. A skill package or
  repository is not a native plugin; use the listed project-local installer and
  then add the skill to capability policy when it should be routable.
- Install skills without their own plugin through `pnpm dlx skills` using its
  project-local mode. Do not install those skills globally. Native plugins are the
  exception and use the Codex/plugin installer described by `.codex/plugins.yml`.
- Track external project-installed skills in `skills-lock.json`. Generated or
  pulled files under `.agents/skills/` are ignored and restored with
  `pnpm dlx skills experimental_install` during harness initialization.
- Author harness-coupled skills in tracked `harness-skills/<name>/`. Harness
  initialization links them into `.agents/skills/` and checks them alongside the
  external skill inventory. Add each skill to `capabilities.yml` and
  `agent-policy.yml`; do not add it to `skills-lock.json`.
- `harness-memory` is the canonical vault workflow and depends one way on
  `knowledge-routing`. The old `initialize-llm-wiki` entry is retired in capability
  policy but retained in the external installation inventory. Its project-local
  Codex exclusion is declared by a name-based `[[skills.config]]` entry in
  `.codex/config.toml`. Verify host discovery after installation: the Codex
  `skills/list` API must report every `initialize-llm-wiki` copy as disabled and
  `harness-memory` as enabled. CLI 0.163.0-alpha.11 reads the project setting but
  still discovers enabled copies unless the exclusion is also set at user scope.
  On that host, use its native `skills/config/write` API with
  `{ "name": "initialize-llm-wiki", "enabled": false }`, then verify `skills/list`
  again. This disables that retired name across the user's projects, including
  its user-level copy, while retaining installed files and lock metadata. It
  changes no other skill's enablement. On an older host without name selectors,
  use the [documented user-config path exclusions](https://learn.chatgpt.com/docs/build-skills#enable-or-disable-local-codex-skills)
  for each installed copy and verify the result before treating setup as complete.
  Gemini retains its exclusion in `.gemini/settings.json`. Restart Codex after
  changing enablement; an already-loaded session catalog is not rewritten. Use
  `pnpm capabilities route codex harness-memory` (or provider `gemini`). Data
  migration requires its own reviewed scope. Discover active vaults with
  `pnpm wikis --json`; see [the rollout preview](harness-memory.md#migration-preview).
- Author skills that work unchanged outside this harness in the shared
  `joshtsch/skills` repository, then install them here with `pnpm dlx skills`.
  Keep existing installations intact until each skill is reviewed for ownership
  and migrated deliberately.
- The current `joshtsch/skills` entries `scope-router` and `save` depend on
  harness policy or workflows; migrate them to `harness-skills/` in a separate
  inventory change. The upstream `grill-with-docs` skill is the canonical design
  interview that records domain docs.
  `agent-system-audit` is the broadly reusable entry in that source set.
- `mattpocock/skills` is an approved external skill source, not a native Codex
  plugin. Install selected skills project-locally with `pnpm dlx skills`; keep it
  in `.codex/skill-sources.yml`, not `.codex/plugins.yml`, and use the manifest's
  recorded installer command.
- During local development of a skill in another repository, use a symlink into
  `.agents/skills/` so the harness loads the working copy without copying unpushed
  changes. Keep that target outside this repository; never commit the symlink.
- The current `codex plugin` CLI exposes marketplace and plugin installation at the
  host level; it does not expose a project-local flag. Approved plugins may therefore
  be installed at host level when explicitly listed in `.codex/plugins.yml`. Do not
  route native plugins through `pnpm dlx skills`.
- For Codex sessions, `pnpm init:harness` verifies every manifest entry with `codex plugin list` and fails
  with the exact installation commands for any missing plugin.
  Inventory capture is bounded at 8 MiB per stdout/stderr stream. Larger output
  fails verification; reduce the inventory output before retrying. Command
  failures report status or availability without reproducing plugin output.
- `.claude/settings.json` enables the same approved plugins for Claude Code:
  `ponytail@ponytail` from the Ponytail marketplace it declares, and
  `vercel@claude-plugins-official` and `supabase@claude-plugins-official` from
  the official Claude marketplace. Keep it aligned with `.codex/plugins.yml`;
  a test compares the plugin names. For Claude sessions, `pnpm init:harness`
  checks `claude plugin list --json` and fails with the exact
  `claude plugin marketplace add` and `claude plugin install --scope project`
  commands for any missing plugin. It never installs plugins itself.
- `pnpm init:harness` restores external project skills, links tracked harness skills,
  removes links to harness skills deleted from `harness-skills/`, and verifies every skill in the combined capability inventory is installed at
  `.agents/skills/<name>/SKILL.md`.
- Ponytail and Vercel are approved harness-level plugins and are listed in
  `.codex/plugins.yml`. Vercel provides shared deployment, Next.js, and Vercel
  workflow guidance; use its connected account only when the user places a
  Vercel project in scope.

The manifest records identity, source, and installation instructions; it does not
contain credentials or plugin output.

## Local skill development

For local development, link a skill with:

```sh
pnpm link:skill <skill-name> <path-to-skill-directory>
```

The command refuses to replace an existing skill directory or link. Remove the local
link manually before relinking a skill.

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

## Claude Code settings

Tracked `.claude/settings.json` applies to Claude Code sessions started in the
harness. Sessions started in `projects/` load the force-tracked
`projects/.claude/settings.json` instead, which registers the same hooks through
`$CLAUDE_PROJECT_DIR/../scripts/`. Keep the hook lists in both files in step.
Personal overrides belong in ignored `.claude/settings.local.json`.

- **Deny rules** block Claude's file tools from reading or editing local
  environment files (`.env`, `.env.local`, `.env.*.local`, `.env.production`)
  and from reading `.secure-documents/`. `.env.example` stays editable. The rules
  do not cover shell commands or reads through the resolved target of the
  `.secure-documents` symlink; data-safety rules still apply to both.
- **Commit guard** (`scripts/claude-hooks/git-guard.mjs`, Bash) blocks commits
  on `main` or `master`, commits of `projects.local.yml` or environment files
  other than `.env.example`, and staged diffs the sensitive-content scan flags.
  Stage in a separate command, then commit without paths or `-a`/`-i`/`-o`.
  Pushes are not guarded; branch protection covers `main`.
- **Default-clone guard** (`scripts/claude-hooks/default-clone-guard.mjs`, Edit,
  Write, NotebookEdit, and Bash) blocks writes inside `projects/<project>/` for
  configured projects and points to `pnpm worktree`. For Bash it sees only
  redirection and `tee` targets.

Both hooks block the call when they cannot run, for example before
`pnpm install`. They apply only to Claude Code; Codex and Gemini sessions rely
on the written rules.
