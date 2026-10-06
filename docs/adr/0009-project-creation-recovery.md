# Project creation retains partially created repositories

**Status:** accepted

Project creation will validate all local and GitHub inputs before creating a repository, then retain that repository if a later local initialization or push step fails. The harness will record safe progress state and support explicit resumption instead of deleting a remote implicitly; this preserves user-created work and makes recovery auditable.
