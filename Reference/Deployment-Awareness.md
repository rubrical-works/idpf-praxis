# Deployment Awareness
**Version:** v0.84.0

**Purpose:** Document the deployment chain from development to distribution

---

## Overview

This repository (`idpf-praxis-dev`) is the **development environment**. Changes made here must be evaluated for deployment impact to the **distribution repository** (`idpf-praxis`) which users install from.

---

## Deployment Architecture

### Source of Truth Chain

```
idpf-praxis-dev (Development)           idpf-praxis (Distribution)
─────────────────────────────           ─────────────────────────────────────
Source Files (IDPF-*, Reference/, etc.)
    │
    ↓ /fw-minimize-files
    │
.min-mirror/                     ────→  Deployed via deploy-dist.yml
    │                                   (on git tag push v*)
    ↓ /prepare-release
    │
.claude/rules/                          Users get rules via Praxis Hub Manager
```

### Command Template Chain

```
.claude/commands/*.md (SOURCE)    ────→  .min-mirror/Templates/commands/*.md
    │                                     (via path remapping in minimize-config.json)
    │                                     │
    │ FRAMEWORK-ONLY content              │ FRAMEWORK-ONLY stripped
    │ (e.g., validation file refs)        │ (users get empty extension blocks)
    ↓                                     ↓
Framework uses full commands              Users get clean templates
```

**Note:** `Templates/commands/` no longer exists. Commands are sourced from `.claude/commands/` with path remapping.

### Trigger

Deployment to `-dist` is triggered by pushing a git tag matching `v*` (e.g., `v0.15.0`).

---

## Hub Architecture

### Central Hub Model

Users install IDPF to a **central hub** that serves multiple projects:

```
Hub (central installation)           Project (user's codebase)
──────────────────────────           ────────────────────────────
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

Commands use a **hybrid model** based on extensibility:

| Command Type | Marker | Project Behavior |
|--------------|--------|------------------|
| **Extensible** | `<!-- EXTENSIBLE -->` | **Copied** to project (enables customization) |
| **Managed** | `<!-- MANAGED -->` | **Copied** as-is (no customization expected) |

**Why commands are copied (not symlinked):**
- Projects can customize extension blocks (`USER-EXTENSION-START/END`)
- FRAMEWORK-ONLY content is stripped during copy
- Existing extensions are preserved on hub update/reinstall
- Commands are committed to project repo (not in `.gitignore`)

**What stays symlinked:**
- Rules (auto-update with hub)
- Hooks (auto-update with hub)
- Scripts/shared (auto-update with hub)
- Metadata (skill registry, extension recipes, extension points)

**What is copied (not symlinked):**
- Skills (extracted from hub packages, copied to project — enables per-project customization and avoids symlink issues)
- Commands (extensible commands with user extension blocks)

### Hub Management

Hub creation and project setup are handled by **Praxis Hub Manager** (the Electron-based hub manager). CLI installer scripts (`install-hub.js`, `install-project-*.js`, `fetch-updates.js`) were retired in #1567 and archived to `Archive/Retired-Scripts/`.

---

## File Classification

### Deployed FROM `.min-mirror/`

These directories are minimized and deployed to the distribution repo:

| Directory | Content |
|-----------|---------|
| `IDPF-*` | Framework directories (IDPF-Agile, IDPF-Vibe) |
| `Overview/` | Framework summaries and references |
| `Reference/` | GitHub Workflow, Session Startup, etc. |
| `System-Instructions/` | Core instructions and Domain Selection Guide |
| `Assistant/` | Anti-hallucination rules (user-facing only) |
| `Domains/` | Domain knowledge libraries and review criteria |
| `Skills/` | Skill metadata (review criteria only, not source files) |
| `Templates/` | Command templates and lifecycle artifacts |

### Deployed DIRECTLY (Not Minimized)

| Directory | Source | Notes |
|-----------|--------|-------|
| `Skills/Packaged/` | `Skills/Packaged/*.zip` | Skill zip files for installation |
| `.claude/metadata/` | `.claude/metadata/*.json` | Registry files (skill, extension points, recipes) |

**Note:** Skills are distributed as zip files only. Praxis Hub Manager extracts skills on demand from `Skills/Packaged/`. The source skill directories (`Skills/[name]/`) are NOT minimized or deployed. Metadata registries are generated JSON — not minimized, deployed as-is.

### Deployed AS-IS (Not Minimized)

These files are copied directly without minimization:

| File/Directory | Notes |
|----------------|-------|
| `README-DIST.md` | Becomes `README.md` in -dist |
| `CHANGELOG.md` | Release history |
| `LICENSE` | MIT license |
| `framework-manifest.json` | Framework metadata |

### Dev-Only (Never Deployed)

These stay in the development repo only:

| Category | Examples |
|----------|----------|
| **Excluded Directories** | `Archive/`, `Proposal/`, `PRD/`, `Guides/`, `Market-Analysis/`, `Draft-Diagrams/` |
| **Excluded Files** | `CHANGELOG.md`, `README.md`, `Skills/MAINTENANCE.md`, `System-Instructions/Domain-Selection-Guide.md` |
| **Excluded Commands** | `/fw-add-recipe`, `/fw-audit-commands`, `/fw-audit-extensions`, `/fw-audit-hallucination`, `/fw-audit-minimization`, `/fw-gap-analysis`, `/fw-minimize-files`, `/fw-self-diag`, `/fw-skill-validate`, `/fw-transform-gemini` |
| **Skill Sources** | `Skills/[name]/` directories (only `Skills/Packaged/*.zip` is deployed) |
| **Build Artifacts** | `.claude/rules/` -- two generation paths, see "Rule File Generation" below |

---

## Rule File Generation

`.claude/rules/*.md` files are derived from `Reference/*.md` and `Assistant/*.md` source files via two distinct paths -- one for self-hosted dev (this repo) and one for PHM-deployed user projects. The two paths preserve different content for different audiences.

### The Two Paths

```
Reference/*.md, Assistant/*.md (source of truth, with FRAMEWORK-ONLY blocks)
   │
   ├─── Path A: Self-hosted dev sync (idpf-praxis-dev only) ────────────────────►
   │      node .claude/scripts/framework/minimize-helper.js sync-rules
   │      Reads source AS-IS, preserves FRAMEWORK-ONLY blocks
   │      Writes to .claude/rules/ in this repo
   │      Filters env: dev | both
   │
   └─── Path B: Release pipeline (deployed to user projects) ───────────────────►
          1. /fw-minimize-files calls stripFrameworkOnly()
             Writes stripped output to .min-mirror/Reference/
          2. deploy-dist.yml line 81: cp -r source/.min-mirror/Reference dist/
          3. PHM hub install consumes dist repo's Reference/ directly
          4. PHM hub-setup.ts generateRules() reads hub Reference/, writes to
             user project .claude/rules/ via the COPY_RULES constant
             (PHM does NOT call stripFrameworkOnly() -- the strip already
             happened upstream in step 1)
```

### Why two paths?

The dev repo and PHM-deployed user projects intentionally ship **different rule sets** for different audiences:

| Slot | Dev rule (this repo) | Deployed rule (PHM) |
|---|---|---|
| `01-anti-hallucination.md` | Framework Development variant | Software Development variant |
| `04` | `04-deployment-awareness.md` (about the dev → dist chain) | `04-charter-enforcement.md` (about charter compliance) |
| `07` | `07-task-creation-timing.md` | (not shipped) |

Plus `02`, `03`, `05`, `06` are shared between both audiences (with FRAMEWORK-ONLY blocks visible only in the dev path).

The variant pattern is encoded in `constants.js` `INSTALLED_FILES_MANIFEST.rules.registry` via the `env` field on each entry: `dev`, `deployed`, or `both`. The self-hosted sync filters to `env in {dev, both}`; PHM's `COPY_RULES` corresponds to `env in {deployed, both}`. A future enhancement (#2282) lifts this mapping to `framework-manifest.json` `deploymentFiles.rules` so all consumers read from a single declaration.

### Stable IDs

The 9 entries in `rules.registry` are keyed by stable kebab-case IDs that other consumers (notably #2280's startup-hook task pointers) can reference without depending on filenames. **The valid IDs are:**

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

The variant pattern: slot `01` and slot `04` each have two entries with the same `dest` but disjoint `env` values. Validators must allow this case while still catching genuine duplicates (two entries sharing both `dest` and any `env` value).

### Pipeline Separation Contract

**The two paths must never interfere.** The self-hosted sync (`syncRulesSelfHosted()` in `minimize-helper.js`) writes only to `.claude/rules/` and never touches `.min-mirror/Reference/`. The release pipeline writes only to `.min-mirror/Reference/` (via `/fw-minimize-files`) and the `deploy-dist.yml` workflow copies that to the dist repo. Tests in `tests/scripts/framework/sync-rules-self-hosted.test.js` verify the non-interference property.

### Manifest Source of Truth (#2282)

The same 9 entries from `constants.js` `rules.registry` also exist in **`framework-manifest.json` `deploymentFiles.rules`** as the cross-repo contract layer. The manifest entry is the long-term canonical mapping that:

- **idpf-praxis-dev** uses for the self-hosted sync (#2279) and the validator (#2282)
- **rubrical-works/px-manager#803** will eventually consume to replace its hardcoded `COPY_RULES` constant in `hub-setup.ts:7-14`
- **#2280** will reference via stable IDs in startup-hook task pointers

A dedicated CI validator at `.claude/scripts/framework/validate-rules-registry.js` enforces six invariants on the manifest entry: schema shape, ID uniqueness, variant pattern, source file existence, `.claude/rules/dest` existence for `env in {dev, both}`, and **byte-identity with PHM's current `COPY_RULES` constant** (the no-op rollout requirement from px-manager#803). The validator runs automatically via Jest test discovery in `tests/scripts/framework/validate-rules-registry.test.js`.

When a rule is renamed, added, or moved between audiences, the change goes in **one place**: the `framework-manifest.json` `deploymentFiles.rules` array. The validator then surfaces any inconsistency before CI passes.

---

## framework-config.json Schema Chain (#2292)

`framework-config.json` is a per-project configuration file that lives at the project root. Its schema (`framework-config.schema.json`) is authored in this repo and deployed downstream so user projects can validate against it.

### Deployment chain

```
idpf-praxis-dev/.claude/metadata/framework-config.schema.json    (source — authored here)
    ↓ deploy-dist.yml  ('Copy metadata files' step, line 124)
idpf-praxis/.claude/metadata/framework-config.schema.json        (distribution repo)
    ↓ Praxis Hub Manager (consumes from dist install)
{user-project}/.claude/metadata/framework-config.schema.json     (deployed user project)
```

The same `.claude/metadata/` layout exists in this dev repo and deployed user projects, so the `$schema` reference inside `framework-config.json` (`".claude/metadata/framework-config.schema.json"`) resolves identically in both environments — no `$id` rewriting needed at deploy time.

### Writer matrix

Every command/script that writes `framework-config.json` MUST go through `.claude/scripts/shared/lib/framework-config.js` (the helper module added in #2292 AC8). The helper validates against the schema before writing — schema-invalid output is rejected at write time.

| Writer | Fields written | When | Source |
|---|---|---|---|
| `/charter` (init / update / refresh) | `deploymentTarget`, `projectSkills`, `reviewMode`, `activeDomains` | Charter creation or update | `.claude/commands/charter.md` |
| `/create-prd` | `projectSkills` (extends), `suggestedSkills` | After PRD skill matching | `.claude/commands/create-prd.md` |
| `/change-domain-expert` | `domainSpecialist` (top-level — not nested) | When user changes specialist | `.claude/commands/change-domain-expert.md` |
| `/fw-import-skills` | `projectSkills` (sourced from `.claude/skills/*/SKILL.md`) | After successful skill import | `.claude/commands/fw-import-skills.md` |
| Praxis Hub Manager (install time) | `processFramework`, `frameworkVersion`, `frameworkPath`, `installedDate`, `platform`, `selfHosted`, `domainSpecialist`, `reviewMode`, `activeDomains`, `projectSkills` | Project install via PHM | `px-manager` repo (`project-create.ts`) |

See `Construction/Design-Decisions/2026-04-07-framework-config-writer-matrix.md` for the full matrix and the discrepancies discovered during #2292 Phase 1 investigation (`/change-domain-expert` was writing `projectType.domainSpecialist` to a nested key no consumer read; fixed in AC9).

### Cross-repo coordination notes

- **Praxis Hub Manager** consumes the schema from the dist install. PHM-side coordination (copy schema from dist `.claude/metadata/` to user project `.claude/metadata/`) is handled in the px-manager repo, out of `idpf-praxis-dev` scope.
- **`idpf-skills-dev/framework-config-schema.json`** is a stale 4-day-old misplaced cleanup commit (`6478506`, 2026-04-03). It is a known stale artifact handled out-of-band; not the canonical source.

### Validation

A Jest test at `tests/scripts/framework/framework-config.test.js` validates this repo's `framework-config.json` against the schema on every CI run (AC11) and runs a bidirectional skill consistency check (AC12) — every skill listed in `projectSkills` must have a `.claude/skills/{name}/SKILL.md` directory, and every skill on disk must appear in `projectSkills`.

---

## Issue Workflow Integration

### When Working on Issues

Before implementing changes, consider:

1. **Does this change affect user-facing files?**
   - Files in deployed directories (IDPF-*, Reference/, Skills/, etc.)
   - Templates or deployment scripts
   - Framework manifest or documentation

2. **Is this dev-only?**
   - Proposals, PRDs, or Archive content
   - Maintainer commands or scripts
   - Internal tooling

### Pre-Commit Checklist for User-Facing Changes

- [ ] Source files updated
- [ ] Run `/fw-minimize-files` to update `.min-mirror/`
- [ ] Verify minimized output preserves functionality
- [ ] Check if Praxis Hub Manager needs updates (for new features)
- [ ] Check if `deploy-dist.yml` needs updates (for new directories)

---

## Quick Reference

### Minimization Scope

Defined in `.claude/scripts/framework/minimize-config.json`:

See `.claude/scripts/framework/minimize-config.json` for the full configuration. Key sections:

- **`includedDirectories`:** `IDPF-Agile`, `IDPF-Vibe`, `Domains`, `Overview`, `Reference`, `System-Instructions`, `Assistant`, `Skills`, `.claude/commands`, `Templates`
- **`excludedFiles`:** `CHANGELOG.md`, `README.md`, `Skills/MAINTENANCE.md`, `System-Instructions/Domain-Selection-Guide.md`
- **`excludedDirectories`:** `Archive`, `Proposal`, `Market-Analysis`, `Draft-Diagrams`, `Guides`, `PRD`, `.claude/rules`, `Templates/commands`
- **`excludedCommands`:** Dev-only commands (see Dev-Only table above)
- **`excludedPatterns`:** Glob/regex patterns for skill subdirectories, domain guides/templates
- **`pathRemappings`:** `.claude/commands` → `Templates/commands`
- **`copyAsIsSubdirectories`:** (currently empty)

**Notes:**
- `.claude/commands/` is the source for command templates, remapped to `.min-mirror/Templates/commands/`
- `Templates/commands/` is excluded (no longer exists — commands sourced from `.claude/commands/`)
- `FRAMEWORK-ONLY` tagged content is stripped during minimization
- Skill source directories (`Skills/[name]/`) are excluded via `excludedPatterns` — only metadata files pass through

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
- In user projects: `frameworkPath` points to the hub installation root (e.g., `C:\ProgramData\Praxis Hub Manager\framework_root_X.Y.Z`)

**Applies to:** `Templates/`, `Overview/`, `Reference/`, `System-Instructions/`, `Assistant/`, `IDPF-*/`, `Domains/`, `Skills/`

**Does NOT apply to:** `.claude/scripts/`, `.claude/metadata/`, `.claude/rules/`, `.claude/commands/`, `.claude/skills/` — these are symlinked (or copied, for skills/commands) to user projects and resolve locally.

**Example:**
```
❌ BAD:  Templates/artifacts/prd-template.md
✅ GOOD: {frameworkPath}/Templates/artifacts/prd-template.md
```

---

**End of Deployment Awareness**
