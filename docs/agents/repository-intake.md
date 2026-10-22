# Repository intake

Use this workflow when a request requires creating, adopting, or changing a
repository. Shared account configuration in a repository, such as GitHub community
defaults, is still project work.

## Resolve ownership and register

1. Start at the harness root. Inspect the merged project inventory and classify
   every repository the session may modify. The harness itself follows
   [Harness contribution workflow](contributing.md).
2. Use read-only discovery to determine whether the target remote and managed
   clone exist. This inspection may precede registration. Resolve ambiguous
   ownership with the user before writes.
3. Reuse an existing project entry, or register the durable project in
   `projects.yml` or the ignored `projects.local.yml` overlay. Keep private
   metadata in the local overlay. A logical project name may differ from the
   remote repository name; use the remote and tracker fields for that identity.
4. Validate the merged configuration and record the selected project, repository,
   and purpose in ignored `docs/.scratch/`. Registration must be valid before
   repository provisioning, issue creation, branches, or worktrees.
5. For a project using Terraform, set `hcp_workspace` to its unique HCP workspace
   name in the project entry. Set private `hcp_organization` only as permitted
   by the [infrastructure organization policy](infrastructure.md#state-and-execution).
   Run `pnpm hcp:projects plan` from the harness root
   after registration and review the complete control-plane plan. Run
   `pnpm hcp:projects apply` only when its workspace changes are approved. The
   command derives the full list from merged configuration and persists it in
   HCP; do not edit the list separately in the HCP UI. A project without
   `hcp_workspace` receives no workspace.

## Prepare the repository

### Quality and formatting

During onboarding, inspect the repository's language and existing toolchain,
then retrieve applicable user preferences with
`pnpm decision-memory get --category code-quality --user local`. Treat a fresh
preference as a recommendation and ask the project owner to confirm the lint
and format preset or choose a custom one. An existing toolchain does not cancel
an applicable preference; explain the recommended change and ask before
replacing tools. When there is no applicable preference or established
toolchain, offer a stack-native preset. For JavaScript/TypeScript, use an
applicable user preference; otherwise, offer [ESLint](https://eslint.org/docs/latest/use/command-line-interface)
and [Prettier's check mode](https://prettier.io/docs/cli/#check), invoked through
the project's package manager (for example, `pnpm exec eslint .` and
`pnpm exec prettier . --check`). For Python, [Ruff](https://docs.astral.sh/ruff/linter/)
provides linting plus a [formatter](https://docs.astral.sh/ruff/formatter/)
with a non-mutating `--check` mode. For other stacks, prefer the existing
ecosystem formatter and linter or ask the owner to choose a supported project
tool. Do not add dependencies or rewrite existing style without the owner's
choice.

When the applicable preference recommends Biome, recommend it for both Node
linting and formatting. Configure `quality.lint` with Biome's lint command and
`quality.format` with its format command, without write flags. Biome also offers
a combined `check` command; see its [CLI guide](https://biomejs.dev/reference/cli/)
for commands and CI usage.

Set explicit formatting rules in the project's configuration, add repeatable
lint and non-mutating format-check commands, and run both in the project's CI.
Record those exact commands under the project's `quality.lint` and
`quality.format` fields in the merged harness configuration. Both checks run as
required gates in each harness session; a project missing either command cannot
start a session until onboarding is complete. See
[project configuration](project-configuration.md#project-configuration) for the
command schema and enforcement behavior.

Choose the path from observed state:

| State | Next action |
| --- | --- |
| Registered project with a managed clone | Reuse the clone and enter session setup. |
| Existing remote without registration | Register and validate it, then clone through the harness. |
| Registered project with a missing clone | Run `pnpm clone <project-name>` from the harness root. |
| GitHub remote does not exist | Register and validate its planned identity, then create it with `gh repo create`. |
| Other remote does not exist | Register its planned identity, then follow that provider's provisioning policy. |

Existing clones retain their contents and history. Verify their identity before
reuse. Keep normal implementation in the project's managed checkout under the
[external worktree root](project-configuration.md#worktree-root).

For a new GitHub repository, register and validate its planned identity, then
use `gh repo create` for repository creation. Repository creation is part of
project intake; Terraform is not the repository-provisioning path. Run the
[Terraform coverage gate](infrastructure.md#terraform-coverage-gate) for
separate infrastructure resources needed by the project, such as hosting,
databases, or shared platform workspaces. Registration of a planned remote does
not require that it already exist.

Bootstrap is limited to repository metadata and the setup contract needed to
establish the remote and its initial default branch. Record the operation and
recovery state in scratch while the new tracker is unavailable. Once the remote
exists, establish its managed clone under `projects/`, then create its
originating issue before feature implementation. Enter
[Session and worktree lifecycle](session-lifecycle.md) for setup, an issue-bound
worktree, implementation, verification, review, and a change request. Requested
feature content, including a PR template, belongs in that worktree.

## Resolve blockers within the selected path

Run required provider initialization before implementation. If initialization,
tracker access, state access, or tooling fails, resolve that setup failure or
report the exact blocker while preserving prepared work. A failed setup gate
provides no authorization to bypass registration, use a different provisioning
transport, or edit a main clone.

Check a helper's actual behavior against this workflow before using its write
path. The legacy `pnpm create:project` registers only after pushing; its live
and resume paths do not meet this workflow. Register and validate first, create
the repository with `gh repo create`, and then clone through the harness. Follow
the infrastructure policy for separate infrastructure resources; missing access
is not a coverage gap.
