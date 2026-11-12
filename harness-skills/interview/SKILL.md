---
name: interview
description: Interview the user one question at a time, tracking the decision tree in a scratch file and recording domain docs as terms settle. Use when the user asks to be grilled, interviewed, or interrogated; when triaging an underspecified issue or request; or when work needs two or more linked decisions only the user can make. For one clarifying question, just ask it.
---

Load the `domain-modeling` skill first and follow it for the whole session: it owns the glossary and ADRs.

Interview the user until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

## The tree file

Before the first question, write the tree to a scratch file: `docs/.scratch/<topic>-decision-tree.md` (create the directory if missing; use the repository's ignored scratch location if it has a different one). Keep it the single source of truth for where the interview stands:

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

`[x]` settled, `[~]` asking now, `[ ]` open, `[?]` waiting on a fact. Update the file after every answer, before asking the next question: mark the decision settled, add the branches it opens, prune branches it closes. When an answer overturns an earlier decision, reopen everything that hung off it and log the change under **Changed**.

## Asking

Ask **one question per message**. Pick it from the **frontier**: decisions whose prerequisites are all settled. Among those, ask first the one that unblocks the most of the tree. Format:

```
❓ **<question title>** (<n> open after this)

<question body, including the choices>

➡️ <your recommended answer>
```

Word the question so "yes" accepts your recommendation. Then wait for the answer.

## Facts vs decisions

Finding _facts_ is your job, never the user's. When a decision needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it, mark it `[?]` in the tree, and keep asking other frontier questions meanwhile. The _decisions_ are the user's: put each to them and wait.

## Done

The session is done when the frontier is empty: every branch visited, nothing left silently assumed. Show the final tree, and do not act on it until the user confirms you have reached a shared understanding.
