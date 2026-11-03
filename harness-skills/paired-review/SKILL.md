---
name: paired-review
description: Run the paired review loop between an implementation session and a separate review session. Use right after opening or pushing to a pull request (change request), when preparing a PR, when asked to review a PR as the paired review session, or when review findings arrive from another session.
---

# Run the paired review loop

This skill executes [the paired review loop](../../docs/agents/session-completion.md#5a-run-the-paired-review-loop),
which defines the rules. An implementation session and a review session are
defined in [Agent Context](../../CONTEXT.md#agent-context). It does not replace
the pre-PR `code-review` gate in [contributing](../../docs/agents/contributing.md).

## As the implementation session

1. Immediately after the change request opens, before reporting the turn
   complete, offer the user a paired review session. Do not wait for them to ask.
   In Claude Code, propose it with `start_session` (`initiation: "own_initiative"`,
   `context: "fresh"`) using the review prompt below; it starts only when the user
   accepts. Other providers: ask in chat and start it only on the user's yes.
2. If the user declines, say so in the completion report; the pre-PR review gate
   still applies.
3. When findings arrive, fix or explicitly accept each one. After each push, send
   the same review session a re-review request that lists accepted findings with
   their reasons. In Claude Code, use `SendMessage` with its `local_…` session id,
   never a new session.
4. Stop when the review session reports no unresolved findings. Record accepted
   findings in the change request.

## As the review session

1. Review the change request on both [review axes](../../docs/agents/architecture.md):
   repository standards and the originating issue or specification. Read the linked
   code, not only the diff. Do not edit the implementation branch.
2. Send findings to the originating implementation session without asking the
   user; in Claude Code, use `SendMessage` to the session that started you. Each
   finding names a location, the problem, and the expected fix. Treat
   findings the implementation session accepted with reasons as resolved.
3. On each re-review request, review the new head and send only unresolved
   findings, or state that none remain.

## Review prompt

Fill every field; the review session starts cold.

```text
Run $paired-review as the review session.
Change request: <link>
Originating issue: <link>
Standards: repository standards (docs/agents/architecture.md) and the issue's acceptance criteria.
Send findings to: <"the session that started you", a local_… session id, or "relay to the user">
```

When the provider cannot start or message sessions, give the user this prompt
with "relay to the user" and relay findings manually.
