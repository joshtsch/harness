#!/usr/bin/env bash
# Run a self-hosted GitHub Actions runner in Docker for one private repository.
# Usage: pnpm ci-runner start|stop <owner/repo>
set -euo pipefail

action="${1:-}"; repo="${2:-}"
[[ "$action" =~ ^(start|stop)$ && "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "usage: pnpm ci-runner start|stop <owner/repo>" >&2; exit 2; }

# Fork pull requests could run untrusted code on this host; public repos run free on hosted runners anyway.
visibility="$(gh repo view "$repo" --json visibility -q .visibility)"
[[ "$visibility" == "PRIVATE" ]] || { echo "refusing $repo: self-hosted runners are for private repositories only (visibility: $visibility)" >&2; exit 1; }

name="ci-runner-${repo//\//-}"
image="harness-ci-runner:2.338.2"

if [[ "$action" == stop ]]; then
  token="$(gh api -X POST "repos/$repo/actions/runners/remove-token" -q .token)"
  docker exec "$name" ./config.sh remove --token "$token" || echo "runner was not registered; removing container" >&2
  docker rm -f "$name" >/dev/null
  echo "stopped $name"
  exit 0
fi

docker image inspect "$image" >/dev/null 2>&1 || docker build -t "$image" "$(dirname "$0")/../infrastructure/ci-runner"
if docker container inspect "$name" >/dev/null 2>&1; then docker start "$name" >/dev/null; echo "started existing $name"; exit 0; fi

token="$(gh api -X POST "repos/$repo/actions/runners/registration-token" -q .token)"
# The token is single-use for registration and expires in an hour; restarts reuse the stored registration.
docker run -d --name "$name" --restart unless-stopped -e RUNNER_TOKEN="$token" -e REPO_URL="https://github.com/$repo" -e RUNNER_NAME="$name" "$image" \
  bash -c '[ -f .runner ] || ./config.sh --unattended --url "$REPO_URL" --token "$RUNNER_TOKEN" --name "$RUNNER_NAME" --labels self-hosted,linux --replace; exec ./run.sh' >/dev/null
echo "started $name; set the repository variable CI_RUNNER=self-hosted to route jobs to it"
