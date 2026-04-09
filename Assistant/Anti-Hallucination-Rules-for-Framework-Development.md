# Anti-Hallucination Rules for Framework Development
**Version:** v0.85.0

## Core Principle

**Accuracy over speed. Verification over assumption.** Framework errors multiply — a wrong version number, missing CHANGELOG entry, or inconsistent registry affects every user who installs the framework. When in doubt, read project state.

------

## Information Source Hierarchy

When information is needed, prefer sources in this order:

| Priority | Source | Use For |
|----------|--------|---------|
| 1 | Git history and tags | Versions, change sets, release boundaries |
| 2 | Existing framework files (manifests, registries, CHANGELOG, directory contents) | Current state, counts, deployment mappings |
| 3 | Issue tracker (GitHub issues, PRs) | Intent, requirements, in-flight work |
| 4 | Documentation (Overview, README, guides) | Reference only — may be stale |

Documentation is the *last* source consulted, not the first. If docs and git disagree, git wins.

------

## Absolute "Never" Rules

### NEVER Invent (must be verified against project state before stating)

- Version numbers — verify via `git describe --tags --abbrev=0` + commit analysis
- CHANGELOG entries — review actual `git log <last-tag>..HEAD`
- Skill counts — list `Skills/Packaged/*.zip` and `Skills/*/SKILL.md`
- Specialist counts — list `System-Instructions/Domain/*.md`
- Framework features — verify against code, not proposals or plans
- File paths — confirm the file exists
- Registry entries — read the registry JSON
- CLI commands, npm packages, tool names — confirm the executable or package exists
- URLs or endpoints — use only if supplied by the user or a known local file

### NEVER Assume

- That a patch version is appropriate without commit analysis
- That CHANGELOG is complete without diffing against commits
- That install scripts or deployment mappings are synchronized without comparing both sources
- That skill packages match source directories without listing both
- That counts in documentation match actual files
- That a proposal was moved to `Proposal/Implemented/` without verifying the directory
- That all changes were committed — run `git status` before claiming completion

### NEVER Defer or Reduce Scope Without Confirmation

When implementing any bug, enhancement, proposal, or PRD: implement ALL specified requirements. Unilateral scope decisions are prohibited.

- Do not mark any requirement as "optional" or defer it to "future work" without explicit user approval
- Do not remove, skip, or simplify acceptance criteria without user consent
- Do not declare something "out of scope" that was in the original specification
- Do not replace a requirement with a "simpler alternative" without approval

**When scope concerns arise: STOP → REPORT → ASK → WAIT.** Ask: "Should I proceed as specified, or would you like to adjust the scope?" Do not proceed until explicit decision.

------

## STOP Boundary Enforcement

Command specs with a `## STOP — Workflow Boundary` section are a **hard stop**, not a suggestion.

- **STOP means STOP.** Do not proceed past the boundary.
- **No "helpful continuation."** Logical next steps, helpfulness, apparent incompleteness do not authorize crossing the boundary.
- **User instruction required.** Only explicit user instruction crosses a STOP boundary.
- **Re-verify after compaction.** After context loss, re-read the command spec before continuing; verify current position relative to STOP boundaries before acting.

STOP boundaries exist to separate workflow phases, permit user review before critical operations, and prevent cascading or destructive actions.

------

## Version Management

### Verify-Before-Version (mandatory)

Run this sequence before stating any new version number:

```bash
# 1. Last release
git describe --tags --abbrev=0

# 2. Commit count and log since last release
git log <last-tag>..HEAD --oneline
git log <last-tag>..HEAD --oneline | wc -l

# 3. Categorize
git log <last-tag>..HEAD --pretty=format:"%s" | grep -E "^(Add|Implement)"  # Features
git log <last-tag>..HEAD --pretty=format:"%s" | grep -E "^Fix"              # Fixes
```

### Version Decision Matrix

| Commit Contains | Version Type |
|-----------------|--------------|
| ANY new framework (IDPF-*) | MINOR or MAJOR |
| ANY new domain specialist | MINOR |
| ANY new skill | MINOR |
| ANY new feature or capability | MINOR |
| ONLY bug fixes | PATCH |
| ONLY documentation updates | PATCH |

**If in doubt, choose the HIGHER version type.**

### CHANGELOG Discipline

Every release MUST document ALL changes since the last release — not just the triggering issue. Review every commit, categorize (Added, Changed, Fixed, Removed), include issue numbers `(#XX)`, group related changes.

------

## Cross-Reference Validation

Before releasing, verify these equalities hold by reading current project state:

| File A | Must Match | File B |
|--------|------------|--------|
| `framework-manifest.json` version | = | `CHANGELOG.md` latest version |
| `framework-manifest.json` version | = | `README.md` version |
| Skills in `Skills/*/` (source) | = | Skills in `Skills/Packaged/*.zip` |
| Skills in `Skills/MAINTENANCE.md` | = | Skills in `Skills/*/` |
| Specialists in `System-Instructions/Domain/*.md` | = | Count in documentation |
| Frameworks in `IDPF-*/` | = | List in `framework-manifest.json` |

### Validation Commands

```bash
ls -d Skills/*/ | grep -v Packaged | wc -l       # skill source dirs
ls Skills/Packaged/*.zip | wc -l                 # skill packages
ls System-Instructions/Domain/*.md | wc -l       # specialists
ls -d IDPF-*/ 2>/dev/null                        # frameworks
```

------

## Registry Synchronization

Before release, verify `Skills/MAINTENANCE.md` against `Skills/*/` directory contents:

- Every skill directory has a registry entry
- Every registry entry has a corresponding directory
- Versions match between registry and `SKILL.md`
- Framework-Skill dependency matrix matches install scripts

------

## Proposal Workflow

1. Before starting work: verify the proposal exists in `Proposal/`.
2. After implementing: `git mv Proposal/Feature-Name.md Proposal/Implemented/Feature-Name.md`.
3. Commit message: reference the proposal file.
4. CHANGELOG: document the implementation.

Never leave a proposal in the top-level `Proposal/` directory after implementation.

------

## Externalized File References (re-read on every use)

Command specs reference externalized JSON files (configuration, criteria, templates). After compaction, their contents may no longer be in context. Do not act on stale memory — re-read from disk.

- Use the Read tool to load externalized files before using their contents.
- Treat every file reference after compaction as a fresh read.
- Use full paths (e.g., `.claude/scripts/shared/lib/doc-templates.json`) — never shorthand or paraphrase.

------

## File Operations

Before bulk updates:

1. List all files that will be affected.
2. Read each file before modifying.
3. Track progress explicitly.
4. Verify completion by listing again.

Never report "Updated all N files" from memory — re-list to confirm the count matches what was actually changed.

------

## Project-State Verification Procedures

These procedures direct Claude to read actual project state rather than rely on memory. Each is imperative and has an observable action.

### VERIFY version before proposing a bump

```bash
git describe --tags --abbrev=0
git log "$(git describe --tags --abbrev=0)..HEAD" --oneline | wc -l
```
Do not propose a version number until this sequence has been executed in the current session.

### VERIFY sub-issue count before claiming epic progress

```bash
gh pmu sub list <epic-number>
```
Do not state "N sub-issues complete" from an issue body — query the live list.

### VERIFY rule deployment before discussing `.claude/rules/` consumers

Read `framework-manifest.json` → `deploymentFiles.rules` with the Read tool. Do not paraphrase the `env` field, `dest` field, or variant pattern (`anti-hallucination-framework` vs `anti-hallucination-software`) from memory.

### VERIFY skill counts before claiming inventory

```bash
ls Skills/Packaged/*.zip | wc -l
ls Skills/*/SKILL.md | wc -l
```
If the two counts disagree, investigate before reporting — do not average or guess.

### VERIFY release contents before claiming a feature shipped

Read `CHANGELOG.md` with the Read tool. Do not state "feature X was added in vA.B.C" without confirming the entry exists under the matching version heading.

### VERIFY proposal completion before reporting closure

```bash
ls Proposal/Implemented/ | grep <proposal-name>
```
A proposal is only "complete" when its file has been moved — not when the implementing commits landed.

------

**End of Anti-Hallucination Rules for Framework Development**
