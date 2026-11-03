# ADR-0019: Secret custody tiers

**Status:** accepted
**Date:** November 2, 2026
**Authors:** User and Claude
**Tags:** security, secrets, mcp, infrastructure
**Builds on:** ADR-0018, hardware-held continuation identity ([#152](https://github.com/joshtsch/harness/issues/152))
**Originating issue:** [#155](https://github.com/joshtsch/harness/issues/155)

## Context

The harness-root `.env` holds API keys and tokens for Attio, Granola, Backblaze
B2, HCP Terraform, Vercel, and Supabase. Claude Code denies `Read(**/.env)`, but
Bash can still read the file unless the Bash sandbox is enabled. Some CLIs load
`.env` from the working directory on their own: a stale `SUPABASE_ACCESS_TOKEN`
there makes the Supabase CLI fail with `401`. "Never expose it to agents" is a
rule, not a boundary.

ADR-0018 showed that a harness broker does not fix this. Its code lives in the
repository that agents edit, so a value it holds can be exfiltrated by changing
that code. Real protection comes from where the key lives: a non-exportable
hardware key, a token the MCP client holds, or a credential whose provider-side
scope makes exposure acceptable.

## Decision

Every harness secret is assigned one custody tier. Secrets in tiers 1, 2, and 4
are never stored in the harness `.env`.

| Tier | Custody | Exposure if an agent misbehaves |
| --- | --- | --- |
| 1. Hardware-bound | Non-exportable key in the Secure Enclave; each use needs Touch ID. | None without a user-visible prompt. |
| 2. Vendor OAuth MCP | The MCP client holds the OAuth token; agents call tools. | The tools' scope for that session. The token value is not visible. |
| 3. Scoped token | A provider-restricted token in an owner-only file outside the repository. | Accepted: limited to the scope the provider enforces. |
| 4. Human-only | The user supplies it for one command they run themselves. | None; agents never receive it. |

### Assignments

| Secret | Tier | Agent path |
| --- | --- | --- |
| Continuation age identity | 1 | `harness-continuation` MCP server (ADR-0018). |
| Continuation scoped database key and HMAC key | 3 | Broker secrets file (ADR-0018). |
| `ATTIO_API_KEY` | 2 | Attio hosted MCP server. The API key is human-only. |
| `GRANOLA_API_KEY` | 2 | Granola hosted MCP server. The API key is human-only. |
| `VERCEL_API_TOKEN` | 2 | Vercel plugin MCP server. Deploys run through the Git integration. |
| `SUPABASE_ACCESS_TOKEN` | 2 for agent work, 4 for account management | Supabase plugin MCP server, scoped to one project and read-only by default. |
| `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY` | 3 | An application key restricted to one bucket and name prefix, with only the capabilities the workflow needs. |
| HCP Terraform agent token | 3 | A team token whose workspace access allows plans, not applies. |
| `TFE_TOKEN` user token | 4 | None. Onboarding, rotation, and applies are run by the user. |
| `BW_SESSION`, `HARNESS_BITWARDEN_SESSION*` | 4 | None. Bitwarden unlock is interactive. |
| `NOTION_EXPERIENCE_TOKEN` | 3 | An isolated Notion integration shared only with the approved pages, loaded by the operator-run gateway. |
| Supabase service-role key, project JWT secret, database password | 4 | None. Kept in Bitwarden and HCP. |

Tier 3 files live under `~/.config/harness/`, not in the repository tree, so
CLIs that read `.env` from the working directory never load them. Claude Code
denies reads of that directory. This is defense in depth: the tier 3 scope is
what limits the damage.

### Brokers

A harness broker, following the `scripts/continuation-broker.ts` pattern, is
used only when no vendor MCP server fits and the operation needs client-side
cryptography or input validation. Each broker covers one integration. There is
no general secrets broker: it would hold every value in agent-editable code.

### Fallbacks

A vendor API-key fallback for a tier 2 service is human-only. When an MCP tool
cannot perform an operation, the agent reports the limitation. It does not look
for the key. The user can run the operation themselves or supply the key in the
process environment for that one session. The key is never added to `.env`.

## Consequences

### Positive

- The `.env` file stops being a single file that exposes every integration.
- Removing `SUPABASE_ACCESS_TOKEN` from `.env` fixes the Supabase CLI `401`s.
- Each new secret gets a tier when it is introduced, so reviewers can check
  where it lives.

### Negative

- Attio and Granola move from API-first to MCP-first. Workflows that need an
  operation the MCP server lacks now need the user.
- OAuth MCP sessions expire and need the user to reauthorize through the MCP
  client.
- Terraform applies, Supabase account changes, and Bitwarden unlocks always
  need the user.
- Tier 3 tokens remain readable by an agent that can run Bash outside the
  sandbox. Their blast radius is accepted, not removed.
- Codex and Claude Code hold OAuth tokens separately, so each client signs in
  separately.

## Alternatives Considered

### One harness broker for every secret

Rejected. It moves every value into one agent-editable process and recreates
the problem ADR-0018 rejected.

### Enable the Bash sandbox and keep `.env`

Rejected as the boundary. The sandbox is client-specific, can be turned off in
the same editable settings, and does not stop CLIs that load `.env` in a
permitted process. It stays useful as defense in depth.

### Keychain or 1Password injection for every command

Deferred. Injecting values into an agent-run command still exposes them to the
agent. It may replace the tier 3 file later; it does not replace tiers 1, 2,
or 4.
