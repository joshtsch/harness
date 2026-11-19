# Self-hosted GitHub Actions runner for private projects. Adds the Node toolchain
# that ubuntu-latest preinstalls, so project setup scripts behave the same.
FROM ghcr.io/actions/actions-runner:2.338.2
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && corepack enable \
  && rm -rf /var/lib/apt/lists/*
USER runner
