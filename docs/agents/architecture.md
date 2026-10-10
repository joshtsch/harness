# Architecture and Boundaries

The harness is an orchestration layer around independent Git repositories. A configured project is never treated as a package in a monorepo: it has its own remote, default branch, issue tracker, setup behavior, and change-request lifecycle.

The harness CLI starts at the harness root and may coordinate one or more projects in a session. Each participating project receives its own worktree under the [external worktree root](project-configuration.md#worktree-root). Cross-project coordination is represented by session metadata, not by combining repositories or histories.

Session startup may fetch and fast-forward a clean project default clone before
worktree creation. This synchronization exception does not permit implementation
in default clones; unsafe checkouts are preserved and preparation stops.

The harness repository itself is outside the child-project lifecycle. Harness changes use ordinary feature branches and GitHub change requests; the harness CLI manages only configured child projects. Create a feature branch before changing harness files; never develop directly on the default branch.

Every harness change must pass tests, typechecking, build verification, and a two-axis code review against `main` before its merge request is opened. The review checks both repository standards and the originating issue or specification.
