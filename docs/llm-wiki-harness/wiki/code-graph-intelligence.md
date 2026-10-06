# Code-graph intelligence

Issue #74 spike result: keep code-graph intelligence optional and project-scoped.

## Decision

Use CodeGraph as an optional accelerator behind `exploreProject`. The harness checks for a project-local `.codegraph/` index, runs one bounded `codegraph explore <query>` call, and falls back to scoped `rg` when the index or command is unavailable. Query output stays transient; the harness persists no source, index, transcript, credential, or MCP payload.

The seam accepts an injected command runner for deterministic tests. Production calls use the selected project worktree as `cwd`, a 5-second timeout, and a 256 KiB output limit. The fallback excludes `.git` and `.codegraph`.

Run prototype:

```sh
pnpm evaluate:code-graph /absolute/path/to/worktree "how does session preparation work"
```

JSON result reports provider, query, scoped project root, fallback reason, and bounded output. Missing CodeGraph remains a successful text-search workflow.

## Evaluation

| Capability | CodeGraph | SCIP | ast-grep |
| --- | --- | --- | --- |
| Agent-facing exploration | Strong: local MCP and `explore` return symbols, source, paths | Indirect: index format; needs an indexer and consumer | Limited: structural search and rewrite, not a persistent graph |
| Cross-file impact | Callers, callees, impact, affected tests | Rich semantic occurrences when an indexer exists | Not a graph or impact database |
| Harness setup | Project-local `.codegraph/`; optional CLI | Language-specific indexer/toolchain per project | CLI or Node binding; no persistent project index required |
| Freshness | File watcher plus manual sync fallback | Re-indexer lifecycle is caller-owned | Reads current files per invocation |
| Main risk | Third-party CLI/MCP lifecycle and index resource cost | High setup and language coverage burden | Cannot replace repository-wide dependency graph |

CodeGraph fits the spike because it offers the requested agent workflow, local SQLite storage, automatic sync, and broad language support. SCIP remains a future adapter boundary when projects already produce SCIP indexes. ast-grep remains a useful complementary structural-search tool, not a replacement.

## Lifecycle and boundaries

- Initialize indexes only inside project worktrees; never in the harness repository or child main clones.
- Treat `.codegraph/` as ignored, disposable session state. Rebuild after worktree recreation; remove it during worktree cleanup.
- Keep one writer per project index. Separate indexes when multiple operating systems share a tree.
- Treat the graph as stale when CodeGraph reports pending files; read the live file or use fallback search.
- Never add CodeGraph to `projects.yml` or `.codex/config.toml` by default. A later adoption issue must define explicit project capability, trust review, resource limits, and kill switch.

## Prototype evidence

Tests cover indexed exploration, absent-index fallback, timeout fallback, project-root scoping, and exclusion of index metadata from fallback search. A transient local validation with CodeGraph 1.6.0 indexed this TypeScript worktree in 1.7s: 90 files, 759 nodes, 2,217 edges, 2.90 MB SQLite index, WAL journal, and no pending files. The same query returned 14 symbols across 2 files with callers and test impact. The index was removed after validation. This is a smoke measurement, not a production benchmark; broader language and child-project comparisons require representative worktrees and redacted aggregate metrics.

Sources: [CodeGraph repository](https://github.com/colbymchenry/codegraph), [CodeGraph architecture](https://colbymchenry.github.io/codegraph/core-concepts/how-it-works/), [SCIP indexer guidance](https://sourcegraph.com/docs/code-navigation/writing-an-indexer), [ast-grep](https://ast-grep.github.io/).
