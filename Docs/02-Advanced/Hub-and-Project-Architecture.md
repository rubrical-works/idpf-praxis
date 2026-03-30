# Hub and Project Architecture

**Date:** 2026-02-09
**Topic:** How IDPF's central hub model connects to your projects
**Status:** Active — hub and project setup are managed by [px-manager](https://github.com/rubrical-studios/px-manager)

---

## The Model

IDPF uses a **central hub** that serves multiple projects. You install the framework once into a hub directory, then connect each of your projects to it. The hub holds the shared resources — rules, hooks, scripts, metadata, skills — and each project gets its own copy of the commands it can customize.

```
Hub (central installation)              Project A            Project B
──────────────────────────              ─────────            ─────────
.claude/                                .claude/             .claude/
  commands/*.md                           commands/*.md ←──COPIED
  rules/*.md             ←──symlink───    rules/
  hooks/*.js             ←──symlink───    hooks/
  scripts/shared/        ←──symlink───    scripts/shared/
  metadata/*.json        ←──symlink───    metadata/
  skills/                ←──symlink───    skills/
```

Project A and Project B both point to the same hub. When the hub is updated, the symlinked resources update automatically across all connected projects. Commands, however, stay project-owned — they're copies, not links.

---

## Why a Hub?

The alternative is installing the full framework into every project. That works, but:

1. **Updates are per-project.** Updating rules across 5 projects means running the installer 5 times and verifying 5 copies.
2. **Disk usage multiplies.** The framework includes 22 domain specialists, 38 skills, and hundreds of files. Duplicating this per project wastes space.
3. **Drift is inevitable.** Project A gets the latest rules, Project B doesn't. Three weeks later you wonder why Project B's assistant behaves differently.

The hub solves all three. Update once, all projects get the new rules, hooks, and scripts immediately through their symlinks.

---

## What Gets Symlinked vs Copied

The split is based on one question: **does the project need to customize this?**

### Symlinked (Hub-Managed)

These resources are identical across all projects. Changes to the hub propagate immediately:

| Directory | Content | Why Shared |
|-----------|---------|------------|
| `.claude/rules/` | Anti-hallucination rules, GitHub workflow, startup, etc. | Framework behavior should be consistent |
| `.claude/hooks/` | Workflow trigger hooks | Event handling is framework-level |
| `.claude/scripts/shared/` | Branch management, commit analysis, release tools | Scripts shouldn't diverge between projects |
| `.claude/metadata/` | Skill registry, extension recipes, extension points | Registry data is framework-level |
| `.claude/skills/` | Extracted skill packages (TDD, BDD, etc.) | Skills are framework-provided |

**On Windows:** Symlinks are implemented as NTFS junctions, which work without administrator privileges.

**In `.gitignore`:** Symlinked directories are excluded from version control because they're machine-specific. Your teammate's hub might be at a different path.

### Copied (Project-Owned)

These resources are customized per project. The hub provides the template; the project owns the copy:

| Directory | Content | Why Copied |
|-----------|---------|------------|
| `.claude/commands/*.md` | Slash command specifications | Projects add custom extension blocks |
| `.claude/extensions/` | Project-specific extension files | Entirely project-owned |

**Commands are committed to your repo.** Unlike the symlinked directories, `.claude/commands/` is tracked in git. This means your team shares the same customized commands.

**FRAMEWORK-ONLY content is stripped.** When commands are copied from the hub to a project, sections marked `<!-- FRAMEWORK-ONLY-START -->` ... `<!-- FRAMEWORK-ONLY-END -->` are removed. These are framework-internal instructions that don't apply to user projects.

**Existing extensions are preserved.** When you reinstall or update the hub, the installer detects `USER-EXTENSION` blocks in your project's commands and preserves them. Your customizations survive hub updates.

---

## The Extension System

Commands support customization through extension blocks:

```markdown
<!-- USER-EXTENSION-START: pre-work -->
Run ESLint before starting work
<!-- USER-EXTENSION-END: pre-work -->
```

Each extensible command has named extension points (like `pre-work`, `post-commit`, `pre-release-validation`). You can add custom steps at each point. The framework treats non-empty extension blocks as todo items during command execution.

The `/extensions` command manages these:
- `/extensions list` — Show all extension points across commands
- `/extensions edit` — Modify an extension block in a command
- `/extensions recipes` — Pre-built extension templates for common needs

---

## Multi-Project Setup

A typical setup with one hub and three projects:

```
~/idpf-hub/                          ← Central hub
  .claude/commands/
  .claude/rules/
  .claude/scripts/shared/
  ...

~/projects/
  frontend-app/                      ← Project 1
    .claude/commands/  (copied, customized)
    .claude/rules/     → ~/idpf-hub/.claude/rules/
    .claude/hooks/     → ~/idpf-hub/.claude/hooks/
    ...

  api-service/                       ← Project 2
    .claude/commands/  (copied, customized)
    .claude/rules/     → ~/idpf-hub/.claude/rules/
    ...

  shared-library/                    ← Project 3
    .claude/commands/  (copied, customized)
    .claude/rules/     → ~/idpf-hub/.claude/rules/
    ...
```

Each project has its own `CHARTER.md`, `.gh-pmu.json`, and command customizations. They share the same rules, hooks, and scripts through the hub.

---

## Updating the Hub

When a new framework version is released, open **px-manager** and use the hub update feature. It downloads the latest release from GitHub and replaces shared resources. Because projects use symlinks, the updates propagate automatically. Commands in projects are **not** overwritten — your extensions are safe.

To refresh a project's commands (picking up new extension points or updated managed commands), use px-manager's project update wizard. It detects existing extensions and merges them into the updated command templates.

---

## Project Files Reference

After installation, your project root contains:

| File/Directory | Source | Tracked in Git? |
|---|---|---|
| `CHARTER.md` | Created at first session | Yes |
| `CLAUDE.md` | Created by installer | Yes |
| `.gh-pmu.json` | Created by installer | Yes |
| `framework-config.json` | Created by installer | Yes |
| `.claude/commands/` | Copied from hub | Yes |
| `.claude/extensions/` | Project-owned | Yes |
| `.claude/rules/` | Symlinked to hub | No (`.gitignore`) |
| `.claude/hooks/` | Symlinked to hub | No (`.gitignore`) |
| `.claude/scripts/shared/` | Symlinked to hub | No (`.gitignore`) |
| `.claude/metadata/` | Symlinked to hub | No (`.gitignore`) |
| `.claude/skills/` | Symlinked to hub | No (`.gitignore`) |
| `run_claude.cmd` / `.sh` | Copied from hub | Optional |
| `runp_claude.cmd` / `.sh` | Copied from hub | Optional |

---

## px-manager

Hub creation and project setup are handled by **px-manager**, a cross-platform Electron desktop application. It downloads framework releases directly from GitHub and manages hub creation, project setup, and the project registry through a visual interface.

**px-manager handles:**
- Hub creation and updates from GitHub releases
- New project creation with IDPF integration
- Adding IDPF to existing projects
- Project registry — tracking and listing all managed projects
- Cross-platform symlink/junction management (Windows junctions, Unix symlinks)

The CLI installer scripts (`install-hub.js`, `install-project-new.js`, `install-project-existing.js`) were retired in favor of px-manager.

---

**End of Hub and Project Architecture**
