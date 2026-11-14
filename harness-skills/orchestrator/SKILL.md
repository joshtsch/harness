---
name: orchestrator
description: Act as the orchestrator session that starts, relays for, previews, merges and archives a project's implementation and review sessions. Use when told you are the orchestrator of a project's sessions, or asked to start an implementation session for an issue.
---

# Orchestrate implementation and review sessions

An orchestrator session is defined in [Agent Context](../../CONTEXT.md#agent-context).
It stays in the harness root and writes no project code. It owns the loop below
for one project; each issue runs in its own implementation session, paired with
its own review session.

Claude Code only: the loop needs `start_session`, `SendMessage`,
`preview_start` and session archiving. Start every child with `use_worktree: false`
and `cwd` set to its harness-managed worktree, which lies outside the harness
tree; never start one in the harness folder.

Once your purpose is settled, rename this session `Orchestrator: <purpose>` with
`set_session_title`, so it stands out from the sessions it starts.

Approval gates: tracker writes (labels, comments, Gherkin, triage), publication,
merges and archiving need the user's say-so in chat. A child's report is a claim:
before telling the user something is done, check it with `git log`, `gh pr view`
or `gh pr checks`.

## 1. Start an issue

1. Resolve the project and its quality gates with `pnpm projects --json`
   (merged `projects.yml` and `projects.local.yml`).
2. Create the worktree from the harness root:
   - Default base: `HARNESS_AGENT_PROVIDER=claude pnpm setup:session --goal "<outcome>" <project> <issue>`.
     It rejects epics and issues without Gherkin; see section 6 for those. Pass
     `HARNESS_AGENT_PROVIDER=claude` because the default Codex provider may be
     missing.
   - Stacked on an unmerged branch: `pnpm worktree --refresh --base <branch> <project> <issue> "<title>"`,
     since `setup:session` has no `--base`. This path writes no session
     `AGENTS.md` and runs no issue checks: confirm yourself that the issue is
     not an epic and has Gherkin, and point the brief at the harness and
     worktree `AGENTS.md` files instead.
3. Start the implementation session: `start_session` with `initiation: "user_asked"`,
   `context: "fresh"`, `cwd` = the worktree, `use_worktree: false`,
   `wake_when_done: true`, and a `background` naming the project, the parallel
   sessions and decisions so far. Fill every field of the brief; the session
   starts cold:

```text
You are the implementation session for <issue link> in <project>.
Read <the generated session AGENTS.md, or for stacked work the harness and worktree AGENTS.md> with the harness and project instructions.
Worktree: <path>, branch <branch>, base <base>.
Done: <the project's quality gates>, Storybook stories for every UI element added or changed, docs updated.
Parallel work: <other sessions and issues, or "none">. Stay within <file and package boundaries>.
Stop and ask me on any decision the issue leaves unsettled; record settled decisions on the issue or PR.
Commit, then report to me that the work is ready for review. Do not propose a review session yourself; $paired-review's offer step is mine, and I send you the reviewer's id. Open the PR only after a clean review. Never merge.
```

## 2. Review

When the implementation session reports committed work ready for review, start
its review session right away, without asking the user. Skip this section if that
session already started a reviewer.

1. Check the commit with `git log`, then start a separate review session in the
   same worktree (`initiation: "user_asked"`, `use_worktree: false`, read-only
   work) with the [paired-review](../paired-review/SKILL.md) review prompt,
   sending findings to the implementation session's `local_…` id. The user's
   instruction to orchestrate covers this start, but the app refuses starts on a
   turn another session's message began. If it refuses, propose the reviewer as
   an `own_initiative` card with the same brief, tell the user in one line, and
   do step 2 once it starts.
2. Message the implementation session the reviewer's id, so it sends re-review
   requests there and dismisses any review card it proposed.

A subagent review does not satisfy paired-review.

## 3. Relay

Forward a child's design question to the user with your recommendation (several
linked decisions: run [interview](../interview/SKILL.md)). Send the answer back
quoting the user's words, and ask the child to record the decision on the issue
or PR.

## 4. Test before merge

1. Add a per-issue entry to the harness root's ignored `.claude/launch.json`:
   its own port, and a database and upload
   directory under your scratchpad, run against the worktree:
   `"runtimeExecutable": "env"`, `"runtimeArgs": ["PORT=<port>", "<DB var>=<scratchpad path>", …, "pnpm", "--dir", "<worktree>", "<dev script>"]`.
2. Start it with `preview_start`, sanity-check that the changed page loads, then
   give the user concrete click-through steps for each scenario.
3. Name the scenarios only automated tests cover.

## 5. Merge

Only on the user's say-so:

1. Check `gh pr checks` and `gh pr view --json mergeable,mergeStateStatus,baseRefName`.
2. Merge with a merge commit (`gh pr merge --merge`).
3. Stacked PR: after its base merges, retarget it to `main`. Retargeting does not
   trigger `pull_request` CI, so step 5's `main` run is its only CI signal.
4. Parallel PRs sharing an integration point: merge one; have the other session
   rebase, reconcile, get re-reviewed and pass CI before it merges.
5. Check `main`'s CI on the merge commit. Rerun a job that failed for runner or
   infrastructure reasons, such as Docker failing to bind a port
   (`gh run rerun <run-id> --failed`) once; a repeat or any other failure is a
   blocker for step 7, and new work waits until `main` is green.
6. Before proposing the next slice, offer the user one cleanup of the merged
   issue, and act only on their yes. Offer only what you manage: sessions you
   started and their side sessions (find them with `list_sessions` with
   `linked: true`, skipping the session that started you and its other
   children), previews you started (`preview_list` and your section 4
   `launch.json` entries), local stacks your
   children started, and worktrees you created for your issues. Never offer to
   remove other sessions, servers or worktrees, even merged and clean ones; at
   most name them as out of scope.
   - Archive its implementation and review sessions and their side sessions.
     Archiving takes a session's side sessions along, so archive a parent only
     when its side sessions have no work in flight.
   - Stop its previews and any local stack it started, such as
     `pnpm supabase:stop` in its worktree.
   - Remove its harness-managed worktree and local branch per
     [session lifecycle](../../docs/agents/session-lifecycle.md): first run
     `git -C <worktree> fetch origin`, then confirm the branch is in
     `origin/main` (`git -C <worktree> merge-base --is-ancestor <branch> origin/main`)
     and the worktree has no uncommitted or unpushed work
     (`git -C <worktree> status --porcelain` is empty); preserve and report
     anything else. Flag any project worktree inside the harness's
     `.claude/worktrees/`.
7. Report to the user without being asked: what was cleaned up and what is
   left, the state of every session you manage (as scoped in step 6),
   its open PR and CI, and anything waiting on the user; then whether there is
   capacity and unblocked work, naming the next
   [backlog-select](../backlog-select/SKILL.md) candidate.

## 6. What's next

Run [backlog-select](../backlog-select/SKILL.md) for the project and propose its
slice; start each issue through section 1 once the user picks. When top-ranked work
is ineligible, offer to triage the epic. Write missing Gherkin only after the user
approves the wording.

## Publishing through `gh`

The harness git-guard hook checks `gh issue|pr create|edit|comment` bodies:

- Give `--body-file` a literal, readable path; a path containing a shell variable, or `-` (stdin), is rejected.
- Write issue references inline (`Closes #123`); a line that starts with `#123`
  reads as a markdown heading and is rejected.
