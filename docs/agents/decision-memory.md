# Decision memory

Decision memory stores user-confirmed preferences. A category skill may retrieve
relevant preferences and compare them with project configuration. Memory remains
suggestive; current user instructions, policy, and clear project configuration
take precedence.

## Local store

The local provider writes `~/.local/state/harness/decision-memory.json` outside
repositories. It creates the harness directory with mode `0700` and the data
file with mode `0600`, and checks that both are owned by the current user.
Writes use a temporary file and atomic rename. This provider currently requires
a POSIX filesystem; Windows ACL verification is not implemented.
The store is local plaintext; it is not encrypted or synchronized. Do not store
credentials, PII, transcripts, or project implementation details.

Writers publish complete lock metadata atomically and hold the exclusive lock
across read, validation, and write. A live lock causes the write to fail safely.
Stale and malformed locks are never reclaimed automatically. Inspect the lock,
verify its recorded process is gone, then remove it before retrying. This avoids
removing a replacement lock held by another writer.

Each record has an ID, category, user scope, optional business-line, project and
environment scope, a preference, confidence, confirmation provenance, and a
`reviewAfter` date. Keep the preference and rationale concise. The local user
scope is `local`.

## Retrieve and inspect

List all records, or filter by category:

```sh
pnpm --dir "${HARNESS_ROOT:-.}" decision-memory list
pnpm --dir "${HARNESS_ROOT:-.}" decision-memory list --category worktree-location
```

Retrieve only records applicable to the current context:

```sh
pnpm --dir "${HARNESS_ROOT:-.}" decision-memory get --category worktree-location --user local \
  --project harness --business-line harness --environment development
```

Include project configuration when checking for a deviation. Pass a decision
record path only after confirming that the project record exists and explains
the difference:

```sh
pnpm --dir "${HARNESS_ROOT:-.}" decision-memory get --category worktree-location --user local \
  --project harness --business-line harness --environment development \
  --project-actual /worktrees/harness \
  --project-root /absolute/path/to/project \
  --decision-record /absolute/path/to/docs/decisions/worktree-location.md
```

Unspecified scope fields do not match records scoped to those fields. Among
applicable preferences, a strictly narrower scope takes precedence. Conflicting
records at the same or incomparable scopes return `conflict` without selecting
a preference. A record past `reviewAfter` returns `stale` and requires user
reconfirmation. An undocumented project deviation is reported while the clear
project setting remains in effect.

## Record or replace

Prepare a reviewed JSON file outside the repository. Example fields:

```json
{
  "id": "worktree-root",
  "category": "worktree-location",
  "scope": { "user": "local", "project": "harness" },
  "preference": "<confirmed preference>",
  "rationale": "<short reason, if useful>",
  "confidence": 1,
  "provenance": {
    "authority": "user-confirmed",
    "confirmedAt": "2026-10-10T00:00:00.000Z",
    "source": "explicit-user-confirmation"
  },
  "reviewAfter": "2027-10-10T00:00:00.000Z"
}
```

Review the exact value with the user before writing it:

```sh
pnpm --dir "${HARNESS_ROOT:-.}" decision-memory record --input /path/to/preference.json --confirm
```

Replacing a record requires both its existing ID and a fresh confirmation:

```sh
pnpm --dir "${HARNESS_ROOT:-.}" decision-memory record --input /path/to/preference.json \
  --replace-id worktree-root --confirm
```

Remove one record only after reviewing its ID:

```sh
pnpm --dir "${HARNESS_ROOT:-.}" decision-memory forget --id worktree-root --confirm
```

The command refuses duplicate IDs or category/scope pairs without explicit
replacement. Repeated behavior is not consent. Do not promote memory into policy
or project configuration automatically.

## Record a project override rationale

Project overrides belong in project-owned documentation, not in the local user
memory store. Follow the destination convention in the project's instructions;
when none exists, use `docs/decisions/<category>.md`. Keep one discoverable
record per decision and include:

```markdown
# <Decision title>

- Category: <category>
- Scope: user=<id>; businessLine=<id>; project=<id>; environment=<id>
- Preferred pattern: <user-scoped preference or shared default>
- Actual pattern: <project configuration>
- Reason: <user-confirmed rationale>
- Date: <YYYY-MM-DD>
- Deciding authority: <user, team, or named project role>
- Configuration reference: <path and setting>
```

Draft the rationale and show the exact proposed project change to the user.
Create or update the project record only after the user confirms the rationale
and any configuration change. Never infer the reason from the observed setting.
When checking a deviation, pass the verified record's absolute path using
`--decision-record` and its project checkout using `--project-root`. The CLI
only treats a record as documented when it is inside that project, matches the
current project scope, and records the retrieved preferred pattern and actual
configuration. A path alone does not establish documentation.

The `worktree-location` skill is the first category skill. See
`harness-skills/worktree-location/SKILL.md` for its activation and precedence
rules. The generic record and retrieval contract lives in
`src/decision-memory.ts`.
