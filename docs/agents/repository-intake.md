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

## Prepare the repository

Choose the path from observed state:

| State | Next action |
| --- | --- |
| Registered project with a managed clone | Reuse the clone and enter session setup. |
| Existing remote without registration | Register and validate it, then clone through the harness. |
| Registered project with a missing clone | Run `pnpm clone <project-name>` from the harness root. |
| Remote does not exist | Register its planned identity, then follow the provisioning bootstrap below. |

Existing clones retain their contents and history. Verify their identity before
reuse. Keep normal implementation in the project's managed `.worktrees/` checkout.

For a new remote, complete the [Terraform coverage gate](infrastructure.md#terraform-coverage-gate)
after registration and before selecting a provisioning write tool. Prepare and
review configuration in the owning repository's bootstrap checkout under
`.worktrees/`, with remote state and locking. Establish the remote through
Terraform for supported operations. Registration of a planned remote does not
require that it already exist.

Bootstrap is limited to repository metadata, the setup contract, and infrastructure
configuration needed to establish the remote and its initial default branch.
Record its purpose and recovery state in scratch while the new tracker is
unavailable. Once the remote exists, create its originating issue before feature
implementation. Establish the managed clone under `projects/`, then enter
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
path. The legacy `pnpm create:project` provisions with GitHub CLI and registers
only after pushing; its live and resume paths do not meet this workflow. Keep
provisioning on the Terraform path until the helper supports it. Follow the
infrastructure policy's explicit fallback process only for documented unsupported
operations or safe recovery; missing access is not a coverage gap.
