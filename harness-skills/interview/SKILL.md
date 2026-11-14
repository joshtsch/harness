---
name: interview
description: Interview the user one question at a time, tracking the decision tree in a scratch file and recording domain docs as terms settle. Use when the user asks to be grilled, interviewed, or interrogated; when triaging an underspecified issue or request; or when work needs two or more linked decisions only the user can make. For one clarifying question, just ask it.
---

# Interview the user

Load the `domain-modeling` skill first and follow it for the whole session: it owns the glossary and ADRs.

Interview the user until you reach a shared understanding. Map this as a **decision tree**: every decision branches into the decisions that hang off it. If mapping shows only one open decision, ask it directly and skip the tree file.

## The tree file

Before the first question, write the tree to `docs/.scratch/<topic>-decision-tree.md` at the harness root, or another git-ignored directory; never a tracked path or a default clone. If the file already exists, resume from it. Keep it the single source of truth for where the interview stands:

```md
# <Topic>

Goal: <one sentence>

- [x] **<Decision>**: <answer>. _Why_: <reason>
  - [ ] **<Dependent decision>**
- [~] **<Decision in question now>**
- [ ] **<Open decision>**
  - [ ] **<Blocked on parent>**
- [?] **<Fact being looked up>**: <who/what is finding it>

## Changed

- <Decision>: was <old answer>, now <new answer>, because <reason>
```

`[x]` settled, `[~]` asking now, `[ ]` open, `[?]` waiting on a fact. Update the file after every answer or returned fact, before asking the next question: mark it settled, add the branches it opens, prune branches it closes. When an answer overturns an earlier decision, reopen everything that hung off it and log the change under **Changed**.

## Asking

Ask **one question per message**. Pick it from the **frontier**: decisions whose prerequisites are all settled. Among those, ask first the one that unblocks the most of the tree. Format:

```
❓ **<question title>** (<n> open after this)

<question body, including the choices>

➡️ <your recommended answer>
```

`<n>` counts every unsettled decision in the tree. Word the question so "yes" accepts your recommendation.

When the host has an interactive question tool (Claude Code: `AskUserQuestion`; Codex: `request_user_input_async`), also call it after the full message so the user can click an answer or type their own. Ask the same question, offer the message's choices (Claude Code: 2–4; Codex: 1–3; if there are more, offer the strongest and leave the rest to free text), and list your recommendation first with "(Recommended)" in its label. Keep free text available: Claude Code always offers it, so do not add an "Other" option there.

Then wait for the answer.

## Facts vs decisions

Finding _facts_ is your job, never the user's. When a decision needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it (or look it up inline if you cannot), mark it `[?]` in the tree, and keep asking other frontier questions meanwhile. The _decisions_ are the user's: put each to them and wait.

## Done

The session is done when the frontier is empty: every branch visited, nothing left silently assumed. Show the final tree, and do not act on it until the user confirms you have reached a shared understanding.
