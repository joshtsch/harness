# Run an epic unattended in stacked slices

Use this when the user asks you to work through a whole epic without them. You
take each slice of parallel issues through implementation and paired review,
stack the next slice on the branches it depends on, and keep going until every
PR is ready for the user's review. The [main skill](SKILL.md) still applies,
with these changes:

- The user's request authorizes the session starts, go messages, pushes and PRs
  of this run. Merging, archiving and cleanup still wait for the user.
- Tracker writes still need the user's say-so. One request covering a class of
  writes, such as filing follow-ups as sub-issues, covers that class for the
  rest of the run.
- You settle open questions yourself (step 5) instead of relaying them.

The run is done when every issue you started has an open PR with a clean
paired review, and the final report (step 8) is sent.

## 1. Plan the slices

1. Run [backlog-select](../backlog-select/SKILL.md) scoped to the epic.
2. Slice 1 is the ready issues that share no files and no contracts (tokens,
   exported types, shared CSS, a schema). Each starts from `main`.
3. Put an issue coupled to a slice-1 issue in a later slice, based on the branch
   it depends on. For example, a page-frame issue that uses another issue's
   width tokens is based on that issue's branch.
4. Leave out issues that are blocked, `needs-triage` or `ready-for-human`, and
   name each one with its reason in the notes file and the final report.
5. Pick a Storybook port for every reviewer, distinct from each other and from
   the implementers' ports.

## 2. Pre-start every session

The app refuses `start_session` on a turn that another session's message or an
automated event began. `SendMessage` and shell commands still work on those
turns. So, on the user's turn, start every session the run needs: slice 1's
implementers and reviewers, and each later slice's implementers and
reviewers. Sessions that cannot work yet start **parked**. Open each parked
brief with:

```text
Wait first: do nothing until a go message arrives; reply in one line that you're waiting, then end your turn.
```

The rest of the brief is the usual section 1 or paired-review brief. A later
slice's worktree may not exist yet: name the path and branch it will have, and
send the base in the go message. If a start is refused, propose it as an
`own_initiative` card with the same brief and tell the user that the run waits
on that card.

From then on, wake each session with a `SendMessage` go message.

## 3. Stack branches

1. Push the base branch before you create a stacked worktree:
   `git -C <base worktree> push -u origin <branch>`. This is a push, not a PR.
   `pnpm worktree --refresh --base <branch> <project> <issue> "<title>"` needs
   the branch on origin.
2. Slice-1 PRs target `main`. A stacked PR targets its base branch, and its
   body names the PR it stacks on.
3. A branch that another branch stacks on only gains new commits: its review
   fixes land as new commits, never as an amend, rebase or force-push. Tell its
   implementer this when the stack forms.
4. When a base gains commits, have each stacked session run
   `git merge origin/<base>`, rerun its gates, and ask its reviewer for a
   re-review.

## 4. Review loop

1. Give each implementer its reviewer's `local_…` id in the go message. The
   implementer sends the ready message to its reviewer directly.
2. Every fix commit gets a re-review, nit fixes included.
3. You choose each PR's base and tell the implementer. It opens the PR only
   after a clean review.

## 5. Settle open questions

When a child asks about something the issue leaves open, decide within the
issue's scope. Record the decision in the notes file, have the child put it in
the PR body, and list it in the final report so the user can override it.

A decision only the user can make, or a pre-existing problem a reviewer finds,
becomes a `ready-for-human` sub-issue of the epic when the user has authorized
filing those; shape it per
[Shaping tracker work](../../docs/agents/triage-labels.md#shaping-tracker-work).
Without that authorization, keep it in the notes file as a proposed follow-up
for the final report. Keep the slice going around the open question when the
issue allows it.

## 6. Watch CI

Implementation sessions whose cwd is the harness root cannot turn on Auto-fix:
the app cannot match the project repository to their folder. Each time a report
wakes you, run `gh pr checks <pr>` for every open PR in the run, and relay a
failure to the session that owns that PR. Tell the user once that they can link
each PR to its session from the PR bar. Leave CI unpolled between wakes: no
`ScheduleWakeup`, `/loop`, `Monitor` or `gh` watch.

If checks stay queued while the runner shows online and busy with nothing in
progress, report the runner as stuck to the user.

## 7. Keep the notes file

Keep one notes file in the shared side-session notes folder, or under ignored
`docs/.scratch/`. Update it as each event happens:

- the slice plan, each issue's branch, base and worktree, and skipped issues
- every session's name, `local_…` id, role and state (parked, working, done)
- Storybook ports
- decisions you took (step 5)
- follow-ups, filed (with numbers) or proposed
- PR numbers and their bases

## 8. Continue or finish

When a slice's PRs are open with clean reviews, send go messages to the next
slice. When no eligible epic work is left:

1. Rerun the project's UI consistency audit. Find how it ran before in
   `docs/.scratch/ui-consistency-audit/` and the project's docs, and use the
   same procedure and scope.
2. File what it finds under the epic each finding belongs to, when the user
   has authorized filing; otherwise list the drafts in the report.

Then send the final report:

- each PR: link, base, the PR it stacks on, review status and CI state
- decisions you took, for the user to override
- follow-ups, filed or proposed
- skipped issues and why
- blockers, such as a stuck runner, a refused start or a failing check
