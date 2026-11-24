#!/usr/bin/env bash
# Run a self-hosted GitHub Actions runner in Docker for one private repository.
# Usage: pnpm ci-runner start|stop <owner/repo> [--docker]
set -euo pipefail

action="${1:-}"; repo="${2:-}"; mode="${3:-}"
[[ "$action" =~ ^(start|stop)$ && "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && ( -z "$mode" || "$mode" == --docker ) && $# -le 3 ]] || { echo "usage: pnpm ci-runner start|stop <owner/repo> [--docker]" >&2; exit 2; }

name="ci-runner-${repo//\//-}"
engine="$name-docker"
dir="$(cd "$(dirname "$0")/../infrastructure/ci-runner" && pwd)"
# Tagged by build-context content so a changed Dockerfile or hook rebuilds.
image="harness-ci-runner:$(cat "$dir/Dockerfile" "$dir/job-started.sh" | shasum | cut -c1-12)"
exists() { docker container inspect "$1" >/dev/null 2>&1; }

# stop skips the visibility gate: a repo that turned public is exactly when the runner must come off.
if [[ "$action" == stop ]]; then
  token="$(gh api -X POST "repos/$repo/actions/runners/remove-token" -q .token)"
  if exists "$engine"; then docker start "$engine" >/dev/null 2>&1 || true; fi
  if ! { docker start "$name" >/dev/null 2>&1 && docker exec "$name" ./config.sh remove --token "$token"; }; then
    id="$(gh api "repos/$repo/actions/runners" -q ".runners[]|select(.name==\"$name\").id")"
    if [[ -n "$id" ]]; then gh api -X DELETE "repos/$repo/actions/runners/$id"; fi
  fi
  docker rm -f "$name" "$engine" >/dev/null 2>&1 || true
  docker volume rm "$engine" "$name-work" "$name-externals" >/dev/null 2>&1 || true
  echo "stopped $name"
  exit 0
fi

# Fork pull requests could run untrusted code on this host; public repos run free on hosted runners anyway.
visibility="$(gh repo view "$repo" --json visibility -q .visibility)"
[[ "$visibility" == "PRIVATE" ]] || { echo "refusing $repo: self-hosted runners are for private repositories only (visibility: $visibility)" >&2; exit 1; }

# A job may not take every core Docker has and starve the host; Docker rejects a limit above its core count.
ncpu="$(docker info --format '{{.NCPU}}')"
cpus=$(( ncpu < 4 ? ncpu : 4 ))

if exists "$name"; then
  has_engine=no; if exists "$engine"; then has_engine=yes; fi
  wants_engine=no; if [[ -n "$mode" ]]; then wants_engine=yes; fi
  [[ "$has_engine" == "$wants_engine" ]] || { echo "$name exists in the other mode; run pnpm ci-runner stop $repo first" >&2; exit 1; }
  # Runners created before the cap pick it up here.
  if [[ "$has_engine" == yes ]]; then docker update --cpus "$cpus" "$engine" >/dev/null; fi
  docker update --cpus "$cpus" "$name" >/dev/null
  if [[ "$has_engine" == yes ]]; then docker start "$engine" >/dev/null; docker restart "$name" >/dev/null; else docker start "$name" >/dev/null; fi
  echo "started existing $name"
  exit 0
fi

docker image inspect "$image" >/dev/null 2>&1 || docker build -t "$image" "$dir"
labels="self-hosted,linux"
run_args=()
if [[ -n "$mode" ]]; then
  # The runner gets its own engine, never the host socket: the host engine runs developers'
  # local stacks, which a CI job using the same project id would reuse and then wipe.
  # Shared volumes keep _work and externals at the same path for the engine, so container:
  # jobs and bind mounts resolve; sharing its network namespace makes job ports reachable on localhost.
  docker run --rm -v "$name-work:/home/runner/_work" -v "$name-externals:/home/runner/externals" "$image" true
  docker run -d --name "$engine" --privileged --restart unless-stopped --cpus "$cpus" -e DOCKER_TLS_CERTDIR= \
    -v "$engine:/var/lib/docker" -v "$name-work:/home/runner/_work" -v "$name-externals:/home/runner/externals" \
    docker:28.5.2-dind dockerd --host=unix:///var/run/docker.sock --host=tcp://127.0.0.1:2375 --tls=false >/dev/null
  run_args=(--network "container:$engine" -e DOCKER_HOST=tcp://127.0.0.1:2375 -e ACTIONS_RUNNER_HOOK_JOB_STARTED=/home/runner/hooks/job-started.sh -v "$name-work:/home/runner/_work" -v "$name-externals:/home/runner/externals")
  labels="$labels,docker"
fi

token="$(gh api -X POST "repos/$repo/actions/runners/registration-token" -q .token)"
# The token is single-use for registration and expires in an hour; restarts reuse the stored registration.
docker run -d --name "$name" --restart unless-stopped --cpus "$cpus" ${run_args[@]+"${run_args[@]}"} -e RUNNER_TOKEN="$token" -e REPO_URL="https://github.com/$repo" -e RUNNER_NAME="$name" -e RUNNER_LABELS="$labels" "$image" \
  bash -c '[ -f .runner ] || ./config.sh --unattended --url "$REPO_URL" --token "$RUNNER_TOKEN" --name "$RUNNER_NAME" --labels "$RUNNER_LABELS" --replace; exec ./run.sh' >/dev/null
echo "started $name ($labels); set the repository variable CI_RUNNER=self-hosted to route jobs to it"
