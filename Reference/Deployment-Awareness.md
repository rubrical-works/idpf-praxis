# Deployment Awareness
**Version:** v0.89.0

**Source:** Reference/Deployment-Awareness.md

**Purpose:** Document the deployment chain from development to distribution.

---

## Overview

`idpf-praxis-dev` is the **development environment**. Changes must be evaluated for deployment impact to `idpf-praxis` (distribution repo users install from).

---

## Deployment Architecture

### Source of Truth Chain

```
idpf-praxis-dev (Development)           idpf-praxis (Distribution)
Source Files (IDPF-*, Reference/, etc.)
    ↓ /fw-minimize-files
.min-mirror/                     ────→  Deployed via deploy-dist.yml (on git tag push v*)
    ↓ /prepare-release
.claude/rules/                          Users get rules via Praxis Hub Manager
```

### Command Template Chain (Two-Stage Pipeline — #2264)

Commands flow through a **two-stage minimization pipeline** with `CommandsSrc/` as the single source of truth:

```
CommandsSrc/*.md (SOURCE)  →  .claude/commands/*.md               →  .min-mirror/Templates/commands/*.md
                              (STAGE 1 OUTPUT, not hand-edited)      (STAGE 2 OUTPUT — shipped to users)
                              Token-reduced, whitespace-cleaned,     FRAMEWORK-ONLY stripped +
                              FRAMEWORK-ONLY markers PRESERVED       path remapping applied
```

**Stage 1** reads every `.md` in `CommandsSrc/` and writes to `.claude/commands/` — token reduction and whitespace cleanup, but NOT stripping FRAMEWORK-ONLY. Dev repo reads `.claude/commands/` at runtime, so markers must remain.

**Stage 2** reads every `.claude/commands/` file NOT excluded by either mechanism and writes to `.min-mirror/Templates/commands/`:
- **(a) `excludedCommands` array** in `minimize-config.json` — `fw-*` maintainer commands plus `evaluate`
- **(b) Whole-file `<!-- FRAMEWORK-ONLY -->` marker** detected by `minimize-helper.js:147-154` — `fw-*` + `audit-core-docs` + `evaluate`

Sets overlap; a file in either set is excluded. `audit-core-docs.md` is unique to mechanism (b).

**Scope helpers** (#2266):
```bash
node .claude/scripts/framework/minimize-helper.js stage1-scope
node .claude/scripts/framework/minimize-helper.js stage2-scope
node .claude/scripts/framework/minimize-helper.js stage2-excluded
node .claude/scripts/framework/minimize-helper.js validate-single-file CommandsSrc/work.md
```

**Editing rule:** `CommandsSrc/*.md` is single source of truth. Do NOT hand-edit `.claude/commands/*.md` — regenerated every `/fw-minimize-files` run. See `.claude/commands/GENERATED.md`.

**Why `.claude/commands/` is still checked into git:** Generated output, but runtime location Claude Code reads. Gitignoring would break every slash command invocation between fresh checkout and first `/fw-minimize-files` run.

**Note:** `Templates/commands/` (pre-2264 intermediate dir) no longer exists.

### Trigger

Deployment to `-dist` is triggered by pushing a git tag matching `v*` (e.g., `v0.15.0`).

---

## Hub Architecture

### Central Hub Model

Users install IDPF to a **central hub** serving multiple projects:

```
Hub (central installation)           Project (user's codebase)
.claude/
  commands/*.md                      .claude/
  rules/*.md          ←──symlink───    rules/
  hooks/*.js          ←──symlink───    hooks/
  scripts/shared/     ←──symlink───    scripts/shared/
  metadata/           ←──symlink───    metadata/
                                       skills/    ← COPIED (extracted from hub)
                                       commands/  ← COPIED (not symlinked)
```

### Hybrid Command Deployment

| Command Type | Marker | Project Behavior |
|--------------|--------|------------------|
| **Extensible** | `<!-- EXTENSIBLE -->` | **Copied** to project (per-project `USER-EXTENSION` customization; committed to project repo) |
| **Managed** | `<!-- MANAGED -->` | **Symlinked** from hub (hub is single source of truth; gitignored in project; read-only on disk if present) |

**Why EXTENSIBLE commands are copied:**
- Projects can customize `USER-EXTENSION-START/END` blocks
- FRAMEWORK-ONLY content stripped during copy
- Existing extensions preserved on hub update/reinstall
- Commands committed to project repo (not in `.gitignore`)

**Why MANAGED commands are symlinked (not copied), per #2374:**
- No `USER-EXTENSION` blocks → no per-project customization surface
- Hub-owned: hub updates reach every project immediately; no stale per-project copy to drift
- Gitignored in user projects so symlink target (or accidental copy) never lands in project history
- Read-only enforcement (Windows ACL / POSIX `0444`) if a MANAGED command file ever materializes on disk in user project (legacy installs, repair flows)
- Consumable signal for PHM is `framework-manifest.json` `deploymentFiles.commands.managed` — a flat array of MANAGED command filenames. PHM branches deployment behavior on that list rather than re-parsing markers at install time.
- Upstream contract companion: `rubrical-works/px-manager#832` owns PHM-side implementation (skip-copy, `.gitignore` generation, read-only, migration of previously-copied MANAGED commands).

**What stays symlinked:** Rules, Hooks, Scripts/shared, Metadata (skill registry, extension recipes, extension points), **MANAGED commands** (per #2374 — gitignored in user projects).

**What is copied (not symlinked):** Skills (extracted from hub packages), **EXTENSIBLE commands** (with user extension blocks — committed to project repo).

### Hub Management

Hub creation and project setup handled by **Praxis Hub Manager** (Electron-based). CLI installer scripts (`install-hub.js`, `install-project-*.js`, `fetch-updates.js`) were retired in #1567 and archived to `Archive/Retired-Scripts/`.

---

## File Classification

### Deployed FROM `.min-mirror/`

| Directory | Content |
|-----------|---------|
| `IDPF-*` | Framework directories (IDPF-Agile, IDPF-Vibe) |
| `Overview/` | Framework summaries and references |
| `Reference/` | GitHub Workflow, Session Startup, etc. |
| `System-Instructions/` | Core instructions and Domain Selection Guide |
| `Assistant/` | Anti-hallucination rules (user-facing only) |
| `Domains/` | Domain knowledge libraries and review criteria |
| `Skills/` | Skill metadata (review criteria only, not source files) |
| `Templates/` | Command templates, lifecycle artifacts, start scripts |

### Deployed FROM `.claude/` to `dist/Templates/`

Scripts and hooks sourced from `.claude/` and deployed to `dist/Templates/` for PHM compatibility (#2312). `deploy-dist.yml` uses `framework-manifest.json` `deploymentFiles.scripts` file lists.

| Dev Source | Dist Destination |
|-----------|-----------------|
| `.claude/scripts/shared/` | `Templates/scripts/shared/` |
| `.claude/scripts/shared/lib/` | `Templates/scripts/shared/lib/` |
| `.claude/hooks/` | `Templates/hooks/` |

**Note:** `Templates/scripts/` and `Templates/hooks/` do NOT exist in dev repo. Created in dist repo at deploy time.

### Deployed DIRECTLY (Not Minimized)

| Directory | Source | Notes |
|-----------|--------|-------|
| `Skills/Packaged/` | `Skills/Packaged/*.zip` | Skill zip files; PHM extracts on demand |
| `.claude/metadata/` | `.claude/metadata/*.json` | Registry files (skill, extension points, recipes) |

Skill source directories (`Skills/[name]/`) are NOT deployed.

### Deployed AS-IS (Not Minimized)

`README-DIST.md` (becomes `README.md` in -dist), `CHANGELOG.md`, `LICENSE`, `framework-manifest.json`.

### Dev-Only (Never Deployed)

| Category | Examples |
|----------|----------|
| **Excluded Directories** | `Archive/`, `Proposal/`, `PRD/`, `Guides/`, `Market-Analysis/`, `Draft-Diagrams/` |
| **Excluded Files** | `CHANGELOG.md`, `README.md`, `Skills/MAINTENANCE.md`, `System-Instructions/Domain-Selection-Guide.md` |
| **Excluded Commands** | `/fw-add-recipe`, `/fw-audit-commands`, `/fw-audit-extensions`, `/fw-audit-hallucination`, `/fw-audit-minimization`, `/fw-gap-analysis`, `/fw-minimize-files`, `/fw-self-diag`, `/fw-skill-validate`, `/fw-transform-gemini` |
| **Skill Sources** | `Skills/[name]/` directories |
| **Build Artifacts** | `.claude/rules/` (two generation paths — see below) |

---

## Rule File Generation

`.claude/rules/*.md` files are derived from `Reference/*.md` and `Assistant/*.md` via two distinct paths — one for self-hosted dev (this repo) and one for PHM-deployed user projects. The two paths preserve different content for different audiences.

### The Two Paths

```
Reference/*.md, Assistant/*.md (source of truth, with FRAMEWORK-ONLY blocks)
   │
   ├─── Path A: Self-hosted dev sync (idpf-praxis-dev only) ───►
   │      node .claude/scripts/framework/minimize-helper.js sync-rules
   │      Reads source AS-IS, preserves FRAMEWORK-ONLY blocks
   │      Writes to .claude/rules/ in this repo
   │      Filters env: dev | both
   │
   └─── Path B: Release pipeline (deployed to user projects) ───►
          1. /fw-minimize-files calls stripFrameworkOnly()
             Writes stripped output to .min-mirror/Reference/
          2. deploy-dist.yml line 81: cp -r source/.min-mirror/Reference dist/
          3. PHM hub install consumes dist repo's Reference/ directly
          4. PHM hub-setup.ts generateRules() reads hub Reference/, writes to
             user project .claude/rules/ via the COPY_RULES constant
             (PHM does NOT call stripFrameworkOnly() — strip already happened
             upstream in step 1)
```

### Why two paths?

Dev repo and PHM-deployed user projects intentionally ship **different rule sets** for different audiences:

| Slot | Dev rule (this repo) | Deployed rule (PHM) |
|---|---|---|
| `01-anti-hallucination.md` | Framework Development variant | Software Development variant |
| `04` | `04-deployment-awareness.md` (dev → dist chain) | `04-charter-enforcement.md` (charter compliance) |
| `07` | `07-task-creation-timing.md` | (not shipped) |

`02`, `03`, `05`, `06` shared between both audiences (FRAMEWORK-ONLY blocks visible only in dev path).

Variant pattern encoded in `constants.js` `INSTALLED_FILES_MANIFEST.rules.registry` via `env` field: `dev`, `deployed`, or `both`. Self-hosted sync filters to `env in {dev, both}`; PHM's `COPY_RULES` corresponds to `env in {deployed, both}`. #2282 lifts this mapping to `framework-manifest.json` `deploymentFiles.rules` so all consumers read from a single declaration.

### Stable IDs

The 9 entries in `rules.registry` are keyed by stable kebab-case IDs that other consumers (notably #2280's startup-hook task pointers) reference without depending on filenames.

| ID | env | dest | platformOnly |
|---|---|---|---|
| `anti-hallucination-framework` | dev | `01-anti-hallucination.md` | -- |
| `anti-hallucination-software` | deployed | `01-anti-hallucination.md` | -- |
| `github-workflow` | both | `02-github-workflow.md` | -- |
| `session-startup` | both | `03-startup.md` | -- |
| `deployment-awareness` | dev | `04-deployment-awareness.md` | -- |
| `charter-enforcement` | deployed | `04-charter-enforcement.md` | -- |
| `windows-shell` | both | `05-windows-shell.md` | `win32` |
| `runtime-triggers` | both | `06-runtime-triggers.md` | -- |
| `task-creation-timing` | dev | `07-task-creation-timing.md` | -- |

Variant pattern: slots `01` and `04` each have two entries with the same `dest` but disjoint `env` values. Validators must allow this case while catching genuine duplicates (two entries sharing both `dest` and any `env` value).

### Pipeline Separation Contract

**The two paths must never interfere.** Self-hosted sync (`syncRulesSelfHosted()` in `minimize-helper.js`) writes only to `.claude/rules/` and never touches `.min-mirror/Reference/`. Release pipeline writes only to `.min-mirror/Reference/` (via `/fw-minimize-files`); `deploy-dist.yml` copies to dist repo. `tests/scripts/framework/sync-rules-self-hosted.test.js` verifies the non-interference property.

### Manifest Source of Truth (#2282)

The same 9 entries from `constants.js` `rules.registry` also exist in **`framework-manifest.json` `deploymentFiles.rules`** as the cross-repo contract layer. Manifest entry is the long-term canonical mapping:

- **idpf-praxis-dev** uses it for self-hosted sync (#2279) and the validator (#2282)
- **rubrical-works/px-manager#803** will eventually consume it to replace hardcoded `COPY_RULES` in `hub-setup.ts:7-14`
- **#2280** references via stable IDs in startup-hook task pointers

Dedicated CI validator at `.claude/scripts/framework/validate-rules-registry.js` enforces six invariants: schema shape, ID uniqueness, variant pattern, source file existence, `.claude/rules/dest` existence for `env in {dev, both}`, and **byte-identity with PHM's current `COPY_RULES` constant** (no-op rollout requirement from px-manager#803). Runs via Jest (`tests/scripts/framework/validate-rules-registry.test.js`).

When a rule is renamed, added, or moved between audiences, change goes in **one place**: `framework-manifest.json` `deploymentFiles.rules` array. Validator surfaces any inconsistency before CI passes.

---

## framework-config.json Schema Chain (#2292)

`framework-config.json` is a per-project configuration file at project root. Its schema (`framework-config.schema.json`) is authored here and deployed downstream so user projects can validate against it.

### Deployment chain

```
idpf-praxis-dev/.claude/metadata/framework-config.schema.json    (source — authored here)
    ↓ deploy-dist.yml  ('Copy metadata files' step, line 124)
idpf-praxis/.claude/metadata/framework-config.schema.json        (distribution repo)
    ↓ Praxis Hub Manager (consumes from dist install)
{user-project}/.claude/metadata/framework-config.schema.json     (deployed user project)
```

Same `.claude/metadata/` layout exists in dev repo and deployed user projects, so `$schema` reference inside `framework-config.json` (`".claude/metadata/framework-config.schema.json"`) resolves identically in both — no `$id` rewriting at deploy time.

### Writer matrix

Every command/script that writes `framework-config.json` MUST go through `.claude/scripts/shared/lib/framework-config.js` (helper module added in #2292 AC8). Helper validates against schema before writing — schema-invalid output rejected at write time.

| Writer | Fields written | When | Source |
|---|---|---|---|
| `/charter` (init / update / refresh) | `deploymentTarget`, `projectSkills`, `reviewMode`, `activeDomains` | Charter creation or update | `.claude/commands/charter.md` |
| `/create-prd` | `projectSkills` (extends), `suggestedSkills` | After PRD skill matching | `.claude/commands/create-prd.md` |
| `/change-domain-expert` | `domainSpecialist` (top-level — not nested) | When user changes specialist | `.claude/commands/change-domain-expert.md` |
| `/fw-import-skills` | `projectSkills` (sourced from `.claude/skills/*/SKILL.md`) | After successful skill import | `.claude/commands/fw-import-skills.md` |
| Praxis Hub Manager (install time) | `processFramework`, `frameworkVersion`, `frameworkPath`, `installedDate`, `platform`, `selfHosted`, `domainSpecialist`, `reviewMode`, `activeDomains`, `projectSkills` | Project install via PHM | `px-manager` repo (`project-create.ts`) |

See `Construction/Design-Decisions/2026-04-07-framework-config-writer-matrix.md` for full matrix and Phase 1 discrepancies (`/change-domain-expert` was writing `projectType.domainSpecialist` to a nested key no consumer read; fixed in AC9).

### Cross-repo coordination notes

- **Praxis Hub Manager** consumes schema from dist install. PHM-side coordination (copy schema from dist `.claude/metadata/` to user project `.claude/metadata/`) handled in px-manager repo, out of `idpf-praxis-dev` scope.
- **`idpf-skills-dev/framework-config-schema.json`** is a stale 4-day-old misplaced cleanup commit (`6478506`, 2026-04-03). Known stale artifact handled out-of-band; not canonical source.

### Validation

Jest test at `tests/scripts/framework/framework-config.test.js` validates this repo's `framework-config.json` against schema on every CI run (AC11) and runs bidirectional skill consistency check (AC12) — every skill listed in `projectSkills` must have a `.claude/skills/{name}/SKILL.md` directory, and every skill on disk must appear in `projectSkills`.

---

## Issue Workflow Integration

### When Working on Issues

Before implementing changes, consider:

1. **Does this change affect user-facing files?** Files in deployed directories (IDPF-*, Reference/, Skills/, etc.), templates/deployment scripts, framework manifest or documentation.
2. **Is this dev-only?** Proposals, PRDs, Archive content, maintainer commands/scripts, internal tooling.

### Pre-Commit Checklist for User-Facing Changes

- [ ] Source files updated
- [ ] Run `/fw-minimize-files` to update `.min-mirror/`
- [ ] Verify minimized output preserves functionality
- [ ] Check if Praxis Hub Manager needs updates (for new features)
- [ ] Check if `deploy-dist.yml` needs updates (for new directories)

---

## Quick Reference

### Minimization Scope

Source of truth: `.claude/scripts/framework/minimize-config.json`. Key sections:

- **`includedDirectories`:** `IDPF-Agile`, `IDPF-Vibe`, `Domains`, `Overview`, `Reference`, `System-Instructions`, `Assistant`, `Skills`, `.claude/commands`, `Templates`
- **`excludedFiles`:** `CHANGELOG.md`, `README.md`, `Skills/MAINTENANCE.md`, `System-Instructions/Domain-Selection-Guide.md`
- **`excludedDirectories`:** `Archive`, `Proposal`, `Market-Analysis`, `Draft-Diagrams`, `Guides`, `PRD`, `.claude/rules`, `Templates/commands`
- **`excludedCommands`:** Dev-only commands (see table above)
- **`excludedPatterns`:** Skill subdirectories, domain guides/templates
- **`pathRemappings`:** `.claude/commands` → `Templates/commands`

Notes: `.claude/commands/` is source for command templates, remapped to `.min-mirror/Templates/commands/`. `FRAMEWORK-ONLY` content stripped during minimization. Skill source dirs excluded via `excludedPatterns`.

### Key Commands

| Command | Purpose |
|---------|---------|
| `/fw-minimize-files` | Update `.min-mirror/` from source files |
| `/fw-minimize-files orphans` | Find orphaned files in `.min-mirror/` |
| `/fw-minimize-files reset` | Force full rebuild of `.min-mirror/` |
| `/prepare-release` | Full release preparation including minimization |

---

## Related Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy-dist.yml` | Deployment workflow |
| `.claude/scripts/framework/minimize-config.json` | Minimization scope |
| `.claude/commands/fw-minimize-files.md` | Minimization command |
| `.claude/commands/prepare-release.md` | Release preparation |

---

## Framework Path Convention

**All framework file references in command specs must use `{frameworkPath}/` prefix.**

- `{frameworkPath}` is read from `framework-config.json` → `frameworkPath`
- In self-hosted repos: `frameworkPath: "."` → resolves to project root
- In user projects: `frameworkPath` points to hub installation root (e.g., `C:\ProgramData\Praxis Hub Manager\framework_root_X.Y.Z`)

**Applies to:** `Templates/`, `Overview/`, `Reference/`, `System-Instructions/`, `Assistant/`, `IDPF-*/`, `Domains/`, `Skills/`

**Does NOT apply to:** `.claude/scripts/`, `.claude/metadata/`, `.claude/rules/`, `.claude/commands/`, `.claude/skills/` — symlinked (or copied, for skills/commands) to user projects and resolve locally.

**Example:**
```
❌ BAD:  Templates/artifacts/prd-template.md
✅ GOOD: {frameworkPath}/Templates/artifacts/prd-template.md
```

---

**End of Deployment Awareness**
