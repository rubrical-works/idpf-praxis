# Deployment Awareness
**Version:** v0.88.0
**Source:** Reference/Deployment-Awareness.md
**Purpose:** Document the deployment chain from development to distribution.

---

## Overview
`idpf-praxis-dev` is the **development environment**. Changes must be evaluated for deployment impact to the **distribution repository** (`idpf-praxis`).

## Deployment Architecture

### Source of Truth Chain
```
idpf-praxis-dev (Development)           idpf-praxis (Distribution)
─────────────────────────────           ─────────────────────────────────────
Source Files (IDPF-*, Reference/, etc.)
    │
    ↓ /fw-minimize-files
.min-mirror/                     ────→  Deployed via deploy-dist.yml
    │                                   (on git tag push v*)
    ↓ /prepare-release
.claude/rules/                          Users get rules via Praxis Hub Manager
```

### Command Template Chain (Two-Stage Pipeline)
`CommandsSrc/` is the single source of truth:
```
CommandsSrc/*.md (SOURCE)  ────→  .claude/commands/*.md          ────→  .min-mirror/Templates/commands/*.md
                                  (STAGE 1 — token-reduced,            (STAGE 2 — FRAMEWORK-ONLY stripped +
                                   markers PRESERVED)                    path remapping applied)
```
- **Stage 1:** Reads `CommandsSrc/`, writes `.claude/commands/` -- token reduction + whitespace cleanup, FRAMEWORK-ONLY markers preserved
- **Stage 2:** Reads `.claude/commands/` (excluding files per `excludedCommands` in minimize-config.json and whole-file `<!-- FRAMEWORK-ONLY -->` markers), writes `.min-mirror/Templates/commands/`
- **Editing rule:** Only edit `CommandsSrc/*.md`. `.claude/commands/*.md` is regenerated on every `/fw-minimize-files` run.

Scope helpers:
```bash
node .claude/scripts/framework/minimize-helper.js stage1-scope
node .claude/scripts/framework/minimize-helper.js stage2-scope
node .claude/scripts/framework/minimize-helper.js stage2-excluded
node .claude/scripts/framework/minimize-helper.js validate-single-file CommandsSrc/work.md
```

### Trigger
Deployment to `-dist` triggered by pushing a git tag matching `v*`.

## Hub Architecture

### Central Hub Model
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

| Command Type | Marker | Project Behavior |
|--------------|--------|------------------|
| **Extensible** | `<!-- EXTENSIBLE -->` | **Copied** to project (enables customization) |
| **Managed** | `<!-- MANAGED -->` | **Copied** as-is |

**Symlinked:** Rules, Hooks, Scripts/shared, Metadata (auto-update with hub)
**Copied:** Skills (extracted from hub packages), Commands (extensible with user extension blocks)

Hub creation and project setup handled by **Praxis Hub Manager**.

## File Classification

### Deployed FROM `.min-mirror/`

| Directory | Content |
|-----------|---------|
| `IDPF-*` | Framework directories |
| `Overview/` | Framework summaries |
| `Reference/` | GitHub Workflow, Session Startup, etc. |
| `System-Instructions/` | Core instructions and Domain Selection Guide |
| `Assistant/` | Anti-hallucination rules (user-facing only) |
| `Domains/` | Domain knowledge libraries and review criteria |
| `Skills/` | Skill metadata (review criteria only) |
| `Templates/` | Command templates, lifecycle artifacts, start scripts |

### Deployed FROM `.claude/` to `dist/Templates/`

| Dev Source | Dist Destination | Content |
|-----------|-----------------|---------|
| `.claude/scripts/shared/` | `Templates/scripts/shared/` | Shared utility scripts |
| `.claude/scripts/shared/lib/` | `Templates/scripts/shared/lib/` | Shared library files |
| `.claude/hooks/` | `Templates/hooks/` | Hook scripts |

### Deployed DIRECTLY (Not Minimized)

| Directory | Notes |
|-----------|-------|
| `Skills/Packaged/` | Skill zip files for installation |
| `.claude/metadata/` | Registry files (skill, extension points, recipes) |

### Deployed AS-IS

| File/Directory | Notes |
|----------------|-------|
| `README-DIST.md` | Becomes `README.md` in -dist |
| `CHANGELOG.md` | Release history |
| `LICENSE` | MIT license |
| `framework-manifest.json` | Framework metadata |

### Dev-Only (Never Deployed)

| Category | Examples |
|----------|----------|
| **Excluded Directories** | `Archive/`, `Proposal/`, `PRD/`, `Guides/`, `Market-Analysis/`, `Draft-Diagrams/` |
| **Excluded Files** | `CHANGELOG.md`, `README.md`, `Skills/MAINTENANCE.md`, `System-Instructions/Domain-Selection-Guide.md` |
| **Excluded Commands** | `/fw-add-recipe`, `/fw-audit-commands`, `/fw-audit-extensions`, `/fw-audit-hallucination`, `/fw-audit-minimization`, `/fw-gap-analysis`, `/fw-minimize-files`, `/fw-self-diag`, `/fw-skill-validate`, `/fw-transform-gemini` |
| **Skill Sources** | `Skills/[name]/` directories (only `Skills/Packaged/*.zip` deployed) |
| **Build Artifacts** | `.claude/rules/` -- two generation paths, see below |

## Rule File Generation
`.claude/rules/*.md` derived from `Reference/*.md` and `Assistant/*.md` via two paths:
```
Reference/*.md, Assistant/*.md (source of truth)
   │
   ├─── Path A: Self-hosted dev sync ────────────────────────────────────────►
   │      minimize-helper.js sync-rules → .claude/rules/
   │      Preserves FRAMEWORK-ONLY blocks. Filters env: dev | both
   │
   └─── Path B: Release pipeline (deployed to users) ───────────────────────►
          /fw-minimize-files → .min-mirror/Reference/ (strips FRAMEWORK-ONLY)
          deploy-dist.yml → dist repo
          PHM hub-setup.ts generateRules() → user .claude/rules/
```

### Audience Differences

| Slot | Dev rule | Deployed rule |
|---|---|---|
| `01` | Framework Development variant | Software Development variant |
| `04` | `deployment-awareness.md` | `charter-enforcement.md` |
| `07` | `task-creation-timing.md` | (not shipped) |

Variant pattern encoded via `env` field: `dev`, `deployed`, or `both`.

### Stable IDs

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

### Pipeline Separation Contract
The two paths must never interfere. Self-hosted sync writes only to `.claude/rules/`. Release pipeline writes only to `.min-mirror/Reference/`.

### Manifest Source of Truth
`framework-manifest.json` `deploymentFiles.rules` is the cross-repo contract layer. A CI validator at `.claude/scripts/framework/validate-rules-registry.js` enforces invariants (schema, uniqueness, variant pattern, source existence, byte-identity with PHM's `COPY_RULES`).

## framework-config.json Schema Chain

### Deployment chain
```
idpf-praxis-dev/.claude/metadata/framework-config.schema.json
    ↓ deploy-dist.yml
idpf-praxis/.claude/metadata/framework-config.schema.json
    ↓ Praxis Hub Manager
{user-project}/.claude/metadata/framework-config.schema.json
```

### Writer matrix
All writers MUST use `.claude/scripts/shared/lib/framework-config.js` (validates against schema before writing).

| Writer | Fields written | When |
|---|---|---|
| `/charter` | `deploymentTarget`, `projectSkills`, `reviewMode`, `activeDomains` | Charter creation/update |
| `/create-prd` | `projectSkills`, `suggestedSkills` | After PRD skill matching |
| `/change-domain-expert` | `domainSpecialist` (top-level) | When user changes specialist |
| `/fw-import-skills` | `projectSkills` | After successful skill import |
| Praxis Hub Manager | `processFramework`, `frameworkVersion`, `frameworkPath`, `installedDate`, `platform`, `selfHosted`, `domainSpecialist`, `reviewMode`, `activeDomains`, `projectSkills` | Project install |

### Validation
Jest test at `tests/scripts/framework/framework-config.test.js` validates against schema on CI and runs bidirectional skill consistency check.

## Issue Workflow Integration

Before implementing changes, consider:
1. **Does this change affect user-facing files?** (deployed directories, templates, manifest, docs)
2. **Is this dev-only?** (proposals, PRDs, archive, maintainer commands)

### Pre-Commit Checklist for User-Facing Changes
- [ ] Source files updated
- [ ] Run `/fw-minimize-files` to update `.min-mirror/`
- [ ] Verify minimized output preserves functionality
- [ ] Check if Praxis Hub Manager needs updates
- [ ] Check if `deploy-dist.yml` needs updates

## Quick Reference

### Minimization Scope
Defined in `.claude/scripts/framework/minimize-config.json`:
- **`includedDirectories`:** `IDPF-Agile`, `IDPF-Vibe`, `Domains`, `Overview`, `Reference`, `System-Instructions`, `Assistant`, `Skills`, `.claude/commands`, `Templates`
- **`excludedFiles`:** `CHANGELOG.md`, `README.md`, `Skills/MAINTENANCE.md`, `System-Instructions/Domain-Selection-Guide.md`
- **`excludedDirectories`:** `Archive`, `Proposal`, `Market-Analysis`, `Draft-Diagrams`, `Guides`, `PRD`, `.claude/rules`, `Templates/commands`
- **`pathRemappings`:** `.claude/commands` -> `Templates/commands`

### Key Commands

| Command | Purpose |
|---------|---------|
| `/fw-minimize-files` | Update `.min-mirror/` from source files |
| `/fw-minimize-files orphans` | Find orphaned files in `.min-mirror/` |
| `/fw-minimize-files reset` | Force full rebuild of `.min-mirror/` |
| `/prepare-release` | Full release preparation including minimization |

## Framework Path Convention
All framework file references in command specs must use `{frameworkPath}/` prefix.
- In self-hosted repos: `frameworkPath: "."` -> project root
- In user projects: `frameworkPath` points to hub installation root

**Applies to:** `Templates/`, `Overview/`, `Reference/`, `System-Instructions/`, `Assistant/`, `IDPF-*/`, `Domains/`, `Skills/`
**Does NOT apply to:** `.claude/scripts/`, `.claude/metadata/`, `.claude/rules/`, `.claude/commands/`, `.claude/skills/`

**End of Deployment Awareness**
