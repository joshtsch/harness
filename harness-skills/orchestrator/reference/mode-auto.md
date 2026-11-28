# Auto mode: run an epic in stacked slices

In auto mode the user hands you a whole epic and steps away. You
take each slice of parallel issues through implementation and paired review,
stack the next slice on the branches it depends on, and keep going until every
PR is ready for the user's review. The [main skill](../SKILL.md) still applies,
with these changes:

- The user's request authorizes the session starts, go messages, pushes and PRs
  of this run. Merging, archiving and cleanup still wait for the user.
- Tracker writes still need the user's say-so. One request covering a class of
  writes, such as filing follow-ups as sub-issues, covers that class for the
  rest of the run.
- Open questions become backlog items (step 5), so the run keeps moving
  without waiting for the user or guessing for them.

The run is done when every issue you started has an open PR with a clean
paired review, or is held on an open question listed in the final report, and
that report (step 8) is sent.

## 1. Plan the slices

1. Run [backlog-select](../../backlog-select/SKILL.md) scoped to the epic.
2. Slice 1 is the ready issues that share no files and no contracts (tokens,
   exported types, shared CSS, a schema). Each starts from `main`.
3. Put an issue coupled to a slice-1 issue in a later slice, based on the branch
   it depends on. For example, a page-frame issue that uses another issue's
   width tokens is based on that issue's branch.
4. Leave out issues that are blocked, `needs-triage` or `ready-for-human`, and
   name each one with its reason in the notes file and the final report.
5. Pick a Storybook port for every reviewer, distinct from each other and from
   the implementers' ports, and put it in that reviewer's brief.
6. Run step 5 now for any question an issue already leaves open, so its
   implementer starts with only the unblocked parts.

## 2. Pre-start every session

The app refuses `start_session` on a turn that another session's message or an
automated event began. `SendMessage` and shell commands still work on those
turns. So, on the user's turn, start every session the run needs: slice 1's
implementers and reviewers, and each later slice's implementers and
reviewers. Only slice 1's implementers start working. Every reviewer and every
later-slice implementer starts **parked**. Open each parked brief with:

```text
Wait first: do nothing until a go message arrives; reply in one line that you're waiting, then end your turn.
```

The rest of the brief is the usual section 1 or paired-review brief, with
these changes:

- Implementer: its last line becomes "Commit, then send the ready-for-review
  message to the reviewer whose id I send you, and tell me. Do not propose a
  review session yourself. Open the PR only after a clean review, against the
  base I name. Never merge."
- Reviewer: it names its implementer's `local_…` id and its Storybook port, and
  says "Start on my go message or on a ready-for-review message from your
  implementer."

Start each implementer before its reviewer, then send the implementer the
reviewer's id. A later slice's worktree may not exist yet: name the path and
branch it will have, and send the base in the go message. If a start is
refused, propose it as an `own_initiative` card with the same brief and tell
the user that the run waits on that card.

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
4. When a base gains commits, push them (`git -C <base worktree> push`), then
   have each stacked session run
   `git merge origin/<base>`, rerun its gates, and ask its reviewer for a
   re-review.

## 4. Review loop

1. Each implementer has its reviewer's `local_…` id (step 2) and sends the
   ready message to its reviewer directly.
2. Every fix commit gets a re-review, nit fixes included.
3. You choose each PR's base and tell the implementer. It opens the PR only
   after a clean review.

## 5. Turn open questions into backlog items

The run never guesses. An open question is anything an issue leaves unsettled
that a child asks about, or a pre-existing problem a reviewer finds.

1. If the answer is a fact you can look up (the code, the project docs, the
   issue thread, a sibling PR), look it up and send it. It was never open.
2. Otherwise file it as a `ready-for-human` sub-issue of the epic, shaped per
   [Shaping tracker work](../../../docs/agents/triage-labels.md#shaping-tracker-work).
   Its body names the issue it blocks and the options you see. Without the
   user's authorization to file, record it in the notes file as a proposed
   sub-issue instead.
3. Have the child finish the parts of its issue the question does not block,
   and name the sub-issue, or the proposed question, in its PR body as an open
   dependency. When nothing is left unblocked, hold that issue: its sessions
   stop after a one-line report, and the run moves on to other ready work.
4. Work that depends on the answer waits for the user: leave it out of later
   slices and list it in the final report.

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
- open questions and follow-ups: each one filed (with its number) or proposed,
  and what it blocks
- PR numbers and their bases

## 8. Continue or finish

When a slice's PRs are open with clean reviews, send go messages to the next
slice. When no eligible epic work is left:

1. If the project has run a UI consistency audit before, rerun it with the
   same procedure and scope; the project's docs and the epic it fed say how it
   ran. Otherwise skip the audit and say so in the report.
2. File what it finds under the epic each finding belongs to, when the user
   has authorized filing; otherwise list the drafts in the report.

Then send the final report:

- each PR: link, base, the PR it stacks on, review status and CI state
- open questions and follow-ups: each one filed or proposed, and what it blocks
- skipped issues and why
- blockers, such as a stuck runner, a refused start or a failing check
