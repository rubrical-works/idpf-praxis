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
2. **Disk usage multiplies.** The framework includes 25 domain specialists, 38 skills, and hundreds of files. Duplicating this per project wastes space.
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

**On Windows:** Symlinks are implemented as NTFS junctions, which work without administrator privileges.

**In `.gitignore`:** Symlinked directories are excluded from version control because they're machine-specific. Your teammate's hub might be at a different path.

### Copied (Project-Owned)

These resources are customized per project. The hub provides the template; the project owns the copy:

| Directory | Content | Why Copied |
|-----------|---------|------------|
| `.claude/commands/*.md` | Slash command specifications | Projects add custom extension blocks |
| `.claude/extensions/` | Project-specific extension files | Entirely project-owned |
| `.claude/skills/<name>/` | Skill packages selected for this project (TDD, BDD, etc.) | Each project chooses its own skills |

**Skills are copied but not committed.** Each skill you add is copied into `.claude/skills/<name>/` and its name is recorded in `framework-config.json` `projectSkills`. Only `framework-config.json` is committed; `.claude/skills/` is in `.gitignore`. So when a teammate adds a skill, a pull brings you the name but not the directory. Two checks catch this: `/sync-branch` stops before integrating such commits, and the session startup block shows a `Project Skills Missing:` row naming each skill whose directory is absent. In both cases the fix is to run Repair on the project in Praxis Hub Manager.

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
- `/extensions --list` — Show all extension points across commands
- `/extensions --edit` — Modify an extension block in a command
- `/extensions --recipes` — Pre-built extension templates for common needs

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
| `.claude/skills/` | Copied per skill (names in `projectSkills`) | No (`.gitignore`) |
| `run_claude.cmd` / `.sh` | Copied from hub | Optional |
| `runp_claude.cmd` / `.sh` | Copied from hub | Optional |

---

## Worktrees and the `WorktreeCreate` Hook

A `/work --concurrent` run creates a git worktree per member under the project root (`.tmp-wt-<name>`, branch `wt/<name>`). A plain `git worktree add` would give that checkout none of the hub links above — `.claude/rules/`, `hooks/`, `scripts/shared/`, `metadata/` are gitignored links, so they do not exist in a fresh worktree and every framework script would fail to resolve.

The framework replaces Claude Code's default worktree creation with its own `WorktreeCreate` hook (`.claude/hooks/worktree-create-hook.js`). On each creation it: adds the worktree; **recreates every hub link** inside it by reading the parent checkout's links and re-pointing each at the same target (junctions on Windows, symlinks elsewhere), never copying the hub; registers the `json-merge` driver in the repository's local git config so `.gitattributes` accumulator entries mean something; and hands the path back. Teardown reverses it safely — unlink every link first, verify, then `git worktree remove` without `--force` — because removing through a junction deletes the hub it points at.

**Dependencies on Praxis Hub Manager.** In this repository the hook is installed by hand (`.claude/settings.json`). In a deployed project two Praxis Hub Manager items must ship before concurrent runs work: **px-manager#1414** (hook commands written in the `${CLAUDE_PROJECT_DIR}` form, so a hook invoked inside a worktree resolves against the project rather than the worktree) and **px-manager#1415** (installing the `WorktreeCreate` entry at project setup and upgrade). Until both land, worktree creation, link recreation and teardown work in the dev repository only; see [Claude Code Dependencies](Claude-Code-Dependencies.md) for the tracked status.

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
