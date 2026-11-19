# Self-hosted GitHub Actions runner for private projects. Adds the Node toolchain
# that ubuntu-latest preinstalls, so project setup scripts behave the same, and the
# Docker CLI with buildx for runners started with --docker.
FROM docker:28.5.2-cli AS docker-cli
FROM ghcr.io/actions/actions-runner:2.338.2
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && corepack enable \
  && rm -rf /var/lib/apt/lists/*
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
COPY job-started.sh /home/runner/hooks/job-started.sh
USER runner
# Owned by the runner so a fresh volume mounted here stays writable.
RUN mkdir -p /home/runner/_work
