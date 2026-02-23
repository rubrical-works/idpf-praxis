# Deployment Awareness
**Version:** v0.49.0

**Purpose:** Document the deployment chain from development to distribution

---

## Overview

This repository (`idpf-praxis`) is the **development environment**. Changes made here must be evaluated for deployment impact to the **distribution repository** (`idpf-praxis-dist`) which users install from.

---

## Deployment Architecture

### Source of Truth Chain

```
idpf-praxis (Development)              idpf-praxis-dist (Distribution)
──────────────────────────              ─────────────────────────────────────
Source Files (IDPF-*, Reference/, etc.)
    │
    ↓ /minimize-files
    │
.min-mirror/                     ────→  Deployed via deploy-dist.yml
    │                                   (on git tag push v*)
    ↓ /prepare-release
    │
.claude/rules/                          Users get rules via hub installer
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
- Rules (auto-update with hub)
- Hooks (auto-update with hub)
- Scripts/shared (auto-update with hub)
- Metadata (skill registry, extension recipes, extension points)
- Skills (extracted packages)

### Hub Installers

| Installer | Purpose |
|-----------|---------|
| `install-hub.js` | Create/update central hub from `-dist` repo |
| `install-project-new.js` | Create new project with IDPF integration |
| `install-project-existing.js` | Add IDPF to existing codebase |

---

## File Classification

### Deployed FROM `.min-mirror/`

These directories are minimized and deployed to the distribution repo:

| Directory | Content |
|-----------|---------|
| `IDPF-*` | All framework directories (10 total) |
| `Overview/` | Framework summaries and references |
| `Reference/` | GitHub Workflow, Session Startup, etc. |
| `System-Instructions/` | Core instructions and Domain Selection Guide |
| `Assistant/` | Anti-hallucination rules (user-facing only) |
| `Templates/` | Command templates and lifecycle artifacts |

### Deployed DIRECTLY (Not Minimized)

| Directory | Source | Notes |
|-----------|--------|-------|
| `Skills/Packaged/` | `Skills/Packaged/*.zip` | Skill zip files for installation |
| `.claude/metadata/` | `.claude/metadata/*.json` | Registry files (skill, extension points, recipes) |

**Note:** Skills are distributed as zip files only. The installer extracts skills on demand from `Skills/Packaged/`. The source skill directories (`Skills/[name]/`) are NOT minimized or deployed. Metadata registries are generated JSON — not minimized, deployed as-is.

### Deployed AS-IS (Not Minimized)

These files are copied directly without minimization:

| File/Directory | Notes |
|----------------|-------|
| `README-DIST.md` | Becomes `README.md` in -dist |
| `CHANGELOG.md` | Release history |
| `LICENSE` | MIT license |
| `install-hub.js` | Hub installer (central installation) |
| `install-project-new.js` | New project installer |
| `install-project-existing.js` | Existing project installer |
| `fetch-updates.js` | Update checker |
| `framework-manifest.json` | Framework metadata |

### Dev-Only (Never Deployed)

These stay in the development repo only:

| Category | Examples |
|----------|----------|
| **Excluded Directories** | `Archive/`, `Proposal/`, `PRD/`, `Guides/`, `Market-Analysis/`, `Draft-Diagrams/` |
| **Excluded Files** | `Assistant/Anti-Hallucination-Rules-for-Framework-Development.md` (framework maintainers only) |
| **Excluded Commands** | `/prepare-release`, `/minimize-files`, `/skill-validate`, `/audit-*`, `/gap-analysis` |
| **Skill Sources** | `Skills/[name]/` directories (only `Skills/Packaged/*.zip` is deployed) |
| **Build Artifacts** | `.claude/rules/` (generated by hub installer for users) |

---

## Issue Workflow Integration

### When Working on Issues

Before implementing changes, consider:

1. **Does this change affect user-facing files?**
   - Files in deployed directories (IDPF-*, Reference/, Skills/, etc.)
   - Templates or install scripts
   - Framework manifest or documentation

2. **Is this dev-only?**
   - Proposals, PRDs, or Archive content
   - Maintainer commands or scripts
   - Internal tooling

### Pre-Commit Checklist for User-Facing Changes

- [ ] Source files updated
- [ ] Run `/minimize-files` to update `.min-mirror/`
- [ ] Verify minimized output preserves functionality
- [ ] Check if hub installers need updates (for new features)
- [ ] Check if `deploy-dist.yml` needs updates (for new directories)

---

## Quick Reference

### Minimization Scope

Defined in `.claude/scripts/framework/minimize-config.json`:

```json
{
  "includedDirectories": [
    "IDPF-*", "Overview", "Reference",
    "System-Instructions", "Assistant", ".claude/commands",
    "Templates"
  ],
  "excludedFiles": [
    "Assistant/Anti-Hallucination-Rules-for-Framework-Development.md"
  ],
  "excludedDirectories": [
    "Archive", "Proposal", "PRD", ".claude/rules",
    "Guides", "Market-Analysis", "Templates/commands"
  ],
  "pathRemappings": {
    ".claude/commands": "Templates/commands"
  }
}
```

**Notes:**
- `.claude/commands/` is the source for command templates, remapped to `.min-mirror/Templates/commands/`
- `Templates/commands/` is excluded (no longer exists - commands sourced from `.claude/commands/`)
- `FRAMEWORK-ONLY` tagged content is stripped during minimization
- Skills is NOT in `includedDirectories` because skill source files are not minimized

### Key Commands

| Command | Purpose |
|---------|---------|
| `/minimize-files` | Update `.min-mirror/` from source files |
| `/minimize-files orphans` | Find orphaned files in `.min-mirror/` |
| `/minimize-files reset` | Force full rebuild of `.min-mirror/` |
| `/prepare-release` | Full release preparation including minimization |

---

## Related Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy-dist.yml` | Deployment workflow |
| `.claude/scripts/minimize-config.json` | Minimization scope |
| `.claude/commands/minimize-files.md` | Minimization command |
| `.claude/commands/prepare-release.md` | Release preparation |
| `install-hub.js` | Hub installer (central installation) |
| `install-project-new.js` | New project installer |
| `install-project-existing.js` | Existing project installer |

---

**End of Deployment Awareness**
