# Provider-Neutral Workflow Integrations

Issue trackers and change-request systems are represented through provider-neutral interfaces. Operations try an available authenticated MCP integration first, then the configured provider CLI, while preserving explicit failure when neither is available.

## Consequences

The first implementation can prioritize the local Git lifecycle and add provider adapters incrementally without changing the session and worktree model.
