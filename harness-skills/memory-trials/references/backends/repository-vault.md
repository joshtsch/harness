# Repository-vault procedure

Use only when the selected memory backend is a repository vault. Read the
selected guide and route operations through
[`harness-memory`](../../../harness-memory/SKILL.md). Its evaluator prepares
isolated fixtures and checks preservation; it does not run agent trials.

The default suite is `tests/fixtures/harness-memory-evals.json`. For a reported
failure, create a small synthetic representation file in a unique temporary
directory. Its entries have `id`, `task`, `readOnly: true`, `files` (relative
path to contents), and a withheld `rubric` array. Optional `vaultSelection` is
`unselected` or `notion`; a synthetic `forbiddenGeneratedText` marker checks leaks.
Paths cannot traverse outside the fixture. Initial cases are read-only.

```sh
pnpm evaluate:harness-memory prepare harness-skills/harness-memory /absolute/path/synthetic-cases.json
pnpm evaluate:harness-memory check /absolute/path/evaluation-root
```

Map the behavioral case into these files without changing its source facts,
versions, scope, or expected behavior. For version 2 reports, `suiteDigest`
identifies the shared behavioral contract; hash the representation file and
skill snapshot separately in `backend.revision`. Version 1 reports retain their
original fixture-file digest convention and remain comparable to version 1 only.

| Operation | Existing procedure |
| --- | --- |
| Prepare | Evaluator `prepare`; record fixture and skill snapshot digests |
| Ingest | Unsaved proposal through the selected memory skill, then separately approved exact application |
| Retrieve | Fresh-context query through the selected skill and configured entry point |
| Inspect | Initial evaluator `check`, plus exact authorized before/after changes, metadata, provenance, links, and reachability |
| Reset | Prepare another isolated fixture; preserve prior evidence outside its vault |

Application and rerun phases need separate before/after snapshots. Initial
read-only checks cannot certify approved application. Require unchanged accepted
sources, correct topic discovery, and no duplicate concepts/index entries or log
churn on identical reruns. Fresh recall uses the actual applied result, not a
hand-written expected page. Missing approval leaves mutation phases blocked.
