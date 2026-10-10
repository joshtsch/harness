# Personalized Agent Coding Harness

The harness coordinates agent-led work across independent Git repositories while keeping each repository's code and history separate.

## Core concepts

**Harness**:
The orchestration repository and CLI that configures projects, prepares sessions, and coordinates work. It does not own child-project code.
_Avoid_: Monorepo, parent project

**Project**:
An independent Git repository configured in the harness with its own remote, branches, issue tracker, and project-owned setup script.
_Avoid_: Package, module, child folder

**Session**:
One coordinated unit of work involving one or more configured projects and a shared purpose or coordinating issue.
_Avoid_: Run, task (when referring to the whole coordination unit)

**Worktree**:
An isolated checkout of one project created for a session, stored under the harness `.worktrees/` directory.
_Avoid_: Clone, checkout (when referring to the isolated session workspace)

**Issue**:
A record in a project's configured issue tracker that provides identity and context for tracked work.
_Avoid_: Ticket (except when naming a provider's terminology)

**Purpose**:
The short human-readable explanation of what a session or worktree is for.
_Avoid_: Description (when identity or naming is intended)

**Session goal**:
The explicit outcome the user wants one session to achieve, distinct from its issue-derived purpose.
_Avoid_: Issue title, completion status

**Change request**:
A provider-neutral proposal to integrate a project branch into its target branch, such as a GitHub pull request or GitLab merge request.
_Avoid_: MR, PR (in shared workflow language)

**Rule suggestion**:
A review-only proposal that turns a repeatable user or agent expectation into an enforceable backlog issue.
_Avoid_: Automatic issue, policy update

**Rule signal**:
A bounded user or agent statement supplied to the session adapter as evidence for a rule suggestion.
_Avoid_: Raw prompt, unbounded observation

## Lifecycle concepts

**Setup**:
Project preparation performed by `scripts/setup.sh`, designed to work both through the harness and when the project is opened independently.
_Avoid_: Bootstrap (unless referring specifically to the bootstrap phase)

**Verification**:
Checks owned by the harness that establish a project or worktree is ready for agent work.
_Avoid_: Test (verification may include tests but is broader)

**Bootstrap**:
The setup phase for dependencies and tooling that may be needed once per local project clone.

**Scratch state**:
Transient session, worktree, issue, handoff, log, and recovery metadata stored under ignored `docs/.scratch/`.
_Avoid_: Documentation (scratch state is not durable project knowledge)

**Conversational prose**:
Text exchanged inside the active agent session, including status updates and direct explanations.
_Avoid_: Human-facing prose

**Human-facing prose**:
Text intended to be read outside the active agent session, including wiki pages, emails, blog posts, issue descriptions, change requests, and durable documentation.
_Avoid_: Conversational prose

**Prose pass**:
A language-only editing step that improves human-facing prose without changing its technical meaning.
_Avoid_: Rewrite (when technical content must remain unchanged)

**Canonical configuration**:
The single human-maintained `projects.yml` source of truth for configured projects and harness defaults.
_Avoid_: Manifest (unless referring to a generated runtime representation)

**Public configuration**:
Tracked configuration that contains safe defaults and no private project inventory, account identifiers, or external records.
_Avoid_: Production configuration

**Local configuration**:
An ignored `projects.local.yml` overlay containing private project metadata for one harness installation.
_Avoid_: Secret (the file may contain sensitive metadata, but credentials remain external)

**Configuration overlay**:
The deep-merge result of public and local configuration, with local scalar values taking precedence and local lists replacing public lists.
_Avoid_: Configuration fork

**Configuration backup**:
An encrypted Bitwarden secure record containing the complete local configuration for explicit restore.
_Avoid_: Runtime configuration, plaintext backup

**Reachable history**:
Git commits, trees, and blobs accessible from refs retained for publication.
_Avoid_: Entire repository (which may include unreachable local objects)

**Active branch**:
A branch containing unmerged work that the user has explicitly chosen to preserve during branch cleanup.
_Avoid_: Recent branch, default branch

**Publication gate**:
The final set of privacy, history, tracker, verification, and documentation checks required before repository visibility changes.
_Avoid_: Review (which covers one change or diff)

**Historical archive**:
A private, read-only repository preserving prior development history and tracker records after development moves to a replacement repository.
_Avoid_: Backup (which is a separate recovery copy)

**Publication snapshot**:
Audited source content used to establish a replacement repository's initial state without inheriting historical records.
_Avoid_: History rewrite (which changes existing history)

**Project creation**:
A controlled workflow that turns a project idea into a configured Project with an initial remote repository.
_Avoid_: Initialization (ambiguous with harness initialization)

**Project creation state**:
Transient evidence of project creation progress used to resume safely after an interruption.
_Avoid_: Setup state, manifest

## Business and tool context

**Business line**:
An internal organizational or product grouping that may span one or more independent projects.
_Avoid_: Company, account, repository owner

**Business-line membership**:
The relationship between a project and zero or more business lines. A project may have no business-line membership when it is shared infrastructure or otherwise not tied to a business.
_Avoid_: Ownership, assignment

**Secure document**:
An encrypted personal, medical, financial, account, or project-sensitive document kept outside tracked repository content.
_Avoid_: Secret (too narrow), wiki page (not necessarily private)

**Secure record**:
A portable structured document containing facts and references that may be consumed by an authorized harness or project workflow.
_Avoid_: Note (too informal), memory (not necessarily encrypted or durable)

**Record scope**:
The set of harness actors eligible to request access to a secure record: project, business line, harness, or shared.
_Avoid_: Permission (authorization is separate from eligibility)

**Project scope**:
A record scope limited to one configured project.
_Avoid_: Child scope

**Business-line scope**:
A record scope available to projects currently belonging to one business line.
_Avoid_: Business scope, company scope

**Harness scope**:
A record scope available to harness-level workflows, not projects by default.
_Avoid_: Global scope

**Shared scope**:
A record scope available to all projects and business lines, restricted to sanitized non-personal operational knowledge.
_Avoid_: Harness scope

**Encryption identity**:
The externally stored private key material required to decrypt secure records.
_Avoid_: Access token, credential (unless referring to a provider credential)

**Primary encryption identity**:
The encryption identity used for ordinary secure-record operations.
_Avoid_: Main key, working password

**Recovery encryption identity**:
A distinct encryption identity that can decrypt records when the primary identity is unavailable.
_Avoid_: Backup password, spare key

**Key-custody provider**:
An external system that stores and returns encryption identities without making them harness configuration.
_Avoid_: Cloud directory, key file

**Recovery export**:
An encrypted, separately stored copy of the recovery identity used for provider or account loss.
_Avoid_: Plaintext backup, key dump

**Custody note**:
A provider-managed secure note containing one canonical encryption identity and its identifying metadata.
_Avoid_: Password-manager entry, key file

**Dual-recipient encryption**:
Encryption of one secure record to both the primary and recovery encryption identities.
_Avoid_: Double encryption, backup encryption

**Recovery drill**:
A disposable end-to-end check that proves both encryption identities can decrypt a dual-recipient secure record before real records are migrated.
_Avoid_: Smoke test, backup test

**Key rotation**:
The controlled replacement of encryption recipients while preserving and verifying prior ciphertext until cleanup is confirmed.
_Avoid_: Key replacement, rekey

**Decrypted workspace**:
Temporary non-repository space where an authorized workflow may process a secure record after decryption.
_Avoid_: Worktree (which belongs to project code)

**Tool mapping**:
The configuration that connects a business line or project to a provider-neutral tool capability.
_Avoid_: Integration (when describing the business relationship)

**Tool target**:
An opaque, stable identifier for an external resource used by a tool mapping, such as a calendar or CRM record.
_Avoid_: Credential, record data

**Project override**:
Project-specific configuration that takes precedence over inherited business-line or user-scoped configuration for that project.
_Avoid_: Fork, replacement

**Decision category**:
A bounded subject area for user preferences, project overrides, and decision records, such as infrastructure, calendars, deployment, tooling, or documentation.
_Avoid_: Universal policy, undifferentiated memory

**Decision preference**:
A user-scoped default within a decision category that a relevant skill may retrieve and use as a suggestion.
_Avoid_: Policy, infrastructure mandate

**Decision record**:
The discoverable rationale and scope for a decision preference or project override.
_Avoid_: Transcript, exception note

## Agent Context

**Context layer**:
A bounded category of instructions or facts that shapes agent work. Layers are policy, domain, workflow, mode, skill, session, and memory.
_Avoid_: Prompt layer, context blob

**Policy**:
A non-negotiable safety, permission, or workflow constraint that applies across agent work.
_Avoid_: Preference, suggestion

Context layers resolve from highest to lowest precedence: policy, domain, workflow, mode, skill, session, then memory. Higher layers constrain lower layers. A conflict within one layer is unresolved and fails closed. A lower layer cannot override or promote itself over a higher layer.

**Layer contract**:
Each context layer has one purpose and exclusion boundary:

- `policy` defines non-negotiable safety, permission, and workflow limits. It excludes preferences and task-specific facts.
- `domain` defines canonical terms and relationships. It excludes execution procedure and session state.
- `workflow` defines lifecycle steps, checkpoints, and required evidence. It excludes domain meaning and personal preferences.
- `mode` defines session-wide operating posture. It excludes task-specific procedures and cannot override policy or workflow.
- `skill` defines one bounded task procedure. It excludes unrelated task behavior and cannot widen active authority.
- `session` defines current issue, project, worktree, tools, and transient state. It excludes durable policy and global memory.
- `memory` contains evidence-backed observations and candidate improvements. It excludes secrets, PII, transcripts, and authority to change higher layers.

**Domain context**:
Canonical vocabulary and conceptual relationships for the harness and its projects.
_Avoid_: Project instructions, implementation detail

**Workflow**:
The required lifecycle and checkpoints for completing a class of work.
_Avoid_: Mode, procedure

**Routine**:
A repeatable task pattern with a stable input and output contract.
_Avoid_: Schedule, automation

**Schedule**:
The timing or event policy that determines when a routine may run.
_Avoid_: Routine, trigger (when the full timing policy is intended)

**Automation**:
An authorized execution of a routine under its schedule and approval policy.
_Avoid_: Routine (the pattern), scheduler (the host capability)

**Routine candidate**:
An observed repeatable task pattern that has not yet been approved for recurring execution.
_Avoid_: Automation, promoted routine

**Dry run**:
An execution that prepares and validates a routine's outputs without applying external side effects.
_Avoid_: Preview (when validation and side-effect guarantees are intended)

**Side effect**:
A change to an external system or durable project state caused by routine execution.
_Avoid_: Output (which may be produced without changing state)

**Execution tier**:
The authority granted to a routine: observe, suggest, draft, or execute. Autonomous execution is deferred until its safety evidence is sufficient.
_Avoid_: Permission (which describes a specific capability rather than the routine's operating level)

**Mode**:
A session-wide operating posture that controls how the agent behaves, such as research, implementation, review, or triage.
_Avoid_: Skill, personality

**Skill**:
A bounded procedure for performing a specific task within the active policy, workflow, and mode.
_Avoid_: Rule, mode

**Session context**:
Current issue, projects, worktrees, tools, and state for one coordinated unit of work.
_Avoid_: Global memory, prompt history

**Session-finalization hook**:
A harness-owned boundary that runs after a session's worktrees, artifacts, and observed state are finalized and submits structured evidence to self-optimization. It is best-effort and review-only; it cannot apply changes or enable automations.
_Avoid_: Prompt hook, project hook, automation

**Memory**:
Evidence-backed observations, decision preferences, and candidate improvements retained for possible future use. Memory may suggest context but cannot override policy, explicit project configuration, or current user instructions.
_Avoid_: Transcript, automatic truth

**Context manifest**:
An inspectable record of resolved context sources, exclusions, precedence decisions, conflicts, and estimated context cost.
_Avoid_: Prompt dump, log

**Observation**:
A structured record of an agent-work outcome, evidence, hypothesis, or repeated pattern that may support optimization.
_Avoid_: Fact, memory

**Candidate improvement**:
A proposed change derived from observations that has not yet been promoted into durable harness behavior.
_Avoid_: Automatic update, learning

**Optimization handoff**:
A review package that connects a candidate improvement to its session evidence, validation guidance, and rollback path.
_Avoid_: Promotion, applied change

**Promotion**:
The reviewed process that changes a candidate improvement into durable project or harness behavior.
_Avoid_: Deployment, self-modification

**Self-optimization**:
Evidence-based improvement of harness context, routing, workflow, or project-local guidance, subject to policy and review boundaries.
_Avoid_: Autonomous self-modification, self-learning

**Schedule adapter**:
A provider-specific translation from the harness schedule contract to a host scheduler's trigger and lifecycle controls.
_Avoid_: Scheduler (the host service itself)

## Agent capabilities

**Capability**:
A provider-neutral user intent with a defined input, output, authority, and verification contract.
_Avoid_: Skill, provider feature

**Provider skill**:
A provider-specific procedure that implements one harness capability.
_Avoid_: Capability, universal workflow

**Provider adapter**:
A translation layer that connects a provider's tools, invocation rules, and state model to a harness contract.
_Avoid_: Integration (when the provider translation boundary is intended)

**Capability policy**:
The harness-owned rules that select canonical capability implementations, permit companions, classify provider support, and reject ambiguous or retired routes.
_Avoid_: Skill registry, installation lock

## Portable sessions

**Remote continuation state**:
User-specific, durable harness state that lets work continue across sessions, machines, and agent providers.
_Avoid_: Scratch state, prompt history

**Session checkpoint**:
An explicit, resumable snapshot of a session's handoff, decisions, outputs, and related artifacts; it does not mean the work is complete.
_Avoid_: Session completion, transcript

**Session artifact**:
A typed record associated with a session, such as a handoff, decision set, evaluation, or output.
_Avoid_: Scratch file, loose attachment

**Deterministic artifact key**:
A stable, provider-neutral identifier that locates the same session artifact across machines and providers.
_Avoid_: Local filename, display name

**Active session**:
A resumable session that is not claimed by another session.
_Avoid_: Open session, available task

**In-progress session**:
A session claimed by one harness session through a time-bounded lease.
_Avoid_: Active session, locked file

**Inactive session**:
A resolved or superseded session retained as history and excluded from ordinary continuation routing.
_Avoid_: Archived scratch, deleted session

**Session claim**:
A lease identifying the session currently working on an in-progress session.
_Avoid_: Lockfile, ownership transfer

**Remote state backend**:
A durable store used through the harness continuation-state contract.
_Avoid_: Agent provider, local scratch directory
