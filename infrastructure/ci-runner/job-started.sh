#!/usr/bin/env bash
# Runner job-started hook for --docker runners: container: jobs run as root and leave
# root-owned files in the shared _work volume, so give it back to the runner user.
set -euo pipefail
[[ -n "${DOCKER_HOST:-}" ]] || exit 0
docker run --rm -v /home/runner/_work:/work --entrypoint chown docker:28.5.2-cli -R "$(id -u):$(id -g)" /work
