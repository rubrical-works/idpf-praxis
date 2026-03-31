# Deployment Awareness
**Version:** v0.77.4
**Purpose:** Document the deployment chain from development to distribution
## Overview
This repository (`idpf-praxis-dev`) is the **development environment**. Changes made here must be evaluated for deployment impact to the **distribution repository** (`idpf-praxis`) which users install from.
## Deployment Architecture
### Source of Truth Chain
```
idpf-praxis-dev (Development)           idpf-praxis (Distribution)
─────────────────────────────           ─────────────────────────────────────
Source Files (IDPF-*, Reference/, etc.)
    │
    ↓ /minimize-files
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
  skills/             ←──symlink───    skills/
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
- Rules, Hooks, Scripts/shared, Metadata, Skills (auto-update with hub)
### Hub Management
Hub creation and project setup are handled by **Praxis Hub Manager** (the Electron-based hub manager). CLI installer scripts (`install-hub.js`, `install-project-*.js`, `fetch-updates.js`) were retired in #1567 and archived to `Archive/Retired-Scripts/`.
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
| `Templates/` | Command templates and lifecycle artifacts |
### Deployed DIRECTLY (Not Minimized)
| Directory | Source | Notes |
|-----------|--------|-------|
| `Skills/Packaged/` | `Skills/Packaged/*.zip` | Skill zip files for installation |
| `.claude/metadata/` | `.claude/metadata/*.json` | Registry files (skill, extension points, recipes) |
Skills are distributed as zip files only. Praxis Hub Manager extracts on demand. Source skill directories (`Skills/[name]/`) are NOT deployed. Metadata registries are generated JSON, deployed as-is.
### Deployed AS-IS (Not Minimized)
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
| **Excluded Commands** | `/add-recipe`, `/audit-commands`, `/audit-extensions`, `/audit-hallucination`, `/audit-minimization`, `/gap-analysis`, `/minimize-files`, `/self-diag`, `/skill-validate`, `/transform-gemini` |
| **Skill Sources** | `Skills/[name]/` directories (only `Skills/Packaged/*.zip` is deployed) |
| **Build Artifacts** | `.claude/rules/` (generated by Praxis Hub Manager for users) |
## Issue Workflow Integration
### When Working on Issues
Before implementing changes, consider:
1. **Does this change affect user-facing files?** Files in deployed directories, templates, deployment scripts, framework manifest, or documentation.
2. **Is this dev-only?** Proposals, PRDs, Archive content, maintainer commands, internal tooling.
### Pre-Commit Checklist for User-Facing Changes
- [ ] Source files updated
- [ ] Run `/minimize-files` to update `.min-mirror/`
- [ ] Verify minimized output preserves functionality
- [ ] Check if Praxis Hub Manager needs updates (for new features)
- [ ] Check if `deploy-dist.yml` needs updates (for new directories)
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
| `/minimize-files` | Update `.min-mirror/` from source files |
| `/minimize-files orphans` | Find orphaned files in `.min-mirror/` |
| `/minimize-files reset` | Force full rebuild of `.min-mirror/` |
| `/prepare-release` | Full release preparation including minimization |
## Related Files
| File | Purpose |
|------|---------|
| `.github/workflows/deploy-dist.yml` | Deployment workflow |
| `.claude/scripts/framework/minimize-config.json` | Minimization scope |
| `.claude/commands/minimize-files.md` | Minimization command |
| `.claude/commands/prepare-release.md` | Release preparation |
## Framework Path Convention
All framework file references in commands must use `{frameworkPath}/` prefix (from `framework-config.json`). Self-hosted: `.`, user projects: hub root. Applies to: `Templates/`, `Overview/`, `Reference/`, `System-Instructions/`, `Assistant/`, `IDPF-*/`, `Domains/`, `Skills/`. Does NOT apply to `.claude/scripts/`, `.claude/metadata/`, `.claude/rules/`, `.claude/commands/` (symlinked).
**End of Deployment Awareness**
