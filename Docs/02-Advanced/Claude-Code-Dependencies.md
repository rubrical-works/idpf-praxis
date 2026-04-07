# Claude Code Dependencies

**Date:** 2026-02-23
**Topic:** What IDPF depends on from Anthropic's Claude Code CLI, and what would break if it changed

---

## Overview

IDPF is built entirely on top of [Claude Code](https://claude.ai/code), Anthropic's CLI tool for working with Claude. Every slash command, every hook, every rule, and every skill flows through Claude Code's architecture. This document catalogs those dependencies so the project can track Claude Code changes and plan accordingly.

IDPF does not pin a minimum Claude Code version. There is no compatibility check at install time or session startup. If Claude Code changes its directory conventions, hook system, or command spec format, IDPF will break silently.

---

## The `.claude/` Directory Contract

Claude Code expects a `.claude/` directory at the project root. IDPF uses every supported subdirectory:

```
.claude/
├── commands/          48 markdown files → slash commands (/work, /done, /bug, etc.)
├── rules/              5 markdown files → auto-loaded at session start
├── hooks/              5 JavaScript files → event-driven automation
├── scripts/shared/    50 JavaScript files → utility scripts called by commands
├── scripts/shared/lib/ shared libraries
├── metadata/          17 JSON registries → skill, extension, review config
├── skills/             Extracted skill packages (on-demand)
├── extensions/         Project-specific extension code
└── settings.local.json Hook registration and permissions
```

If Claude Code stops recognizing `.claude/` as a special directory, or renames any subdirectory, all of IDPF stops working.

---

## Feature-by-Feature Dependencies

### 1. Slash Commands (48 commands, 38 deployed to users)

**How it works:** Claude Code discovers `.md` files in `.claude/commands/` and exposes them as `/command-name`. IDPF's entire user interface is built on this.

**What we depend on:**
- Claude Code scans `.claude/commands/` for markdown files
- File name becomes the command name (`work.md` → `/work`)
- The full markdown content is loaded as the command's instruction set
- Claude follows the instructions in the file (workflow steps, STOP boundaries, tool calls)

**Examples:** `/work`, `/done`, `/bug`, `/enhancement`, `/proposal`, `/review-issue`, `/prepare-release`, `/create-branch`, `/assign-branch`, `/merge-branch`

**What would break:** If Claude Code changed its command discovery path, stopped parsing markdown command files, or altered how command instructions are interpreted, all 48 commands become inaccessible.

### 2. Auto-Loading Rules (5 rules)

**How it works:** Claude Code automatically reads all `.md` files from `.claude/rules/` at session start and after context compaction. These files act as persistent instructions that survive the conversation lifecycle.

**What we depend on:**
- Files in `.claude/rules/` are read automatically — no explicit load needed
- Rules persist after context compaction (Claude Code re-reads them)
- Rules are treated as system-level instructions that guide assistant behavior

**Our rules:**
| File | Purpose |
|------|---------|
| `01-anti-hallucination.md` | Prevents the assistant from inventing versions, counts, or file paths |
| `02-github-workflow.md` | GitHub issue/project board integration (gh pmu commands) |
| `03-startup.md` | Session initialization procedure |
| `04-deployment-awareness.md` | Dev → distribution deployment chain |
| `05-windows-shell.md` | Windows Git Bash safety patterns |

**What would break:** If rules stopped auto-loading, the assistant would lose its quality guardrails mid-session. Anti-hallucination rules prevent version number invention during releases. GitHub workflow rules enforce STOP boundaries. Without these, the assistant becomes unreliable for framework development.

### 3. Hooks (5 hooks, 3 event types)

**How it works:** Claude Code fires JavaScript hooks in response to events. Hooks are registered in `.claude/settings.local.json` under the `hooks` key. Each hook specifies an event type, a matcher pattern, and a command to execute.

**Event types we use:**

| Event | Hook | Purpose |
|-------|------|---------|
| `PostToolUse` | `test-on-change.js` | Runs tests automatically when files are edited/written |
| `UserPromptSubmit` | `workflow-trigger.js` | Detects `bug:`, `work #N`, `done`, `review #N` and routes to commands |
| `SessionStart` | `startup-hook.js` | Initializes session state |
| `SessionStart` | `clear-hook.js` | Clears state on `/clear` |
| `SessionStart` | `resume-hook.js` | Restores state after context compaction |

**What we depend on:**
- `settings.local.json` format is stable (JSON with `hooks` key)
- Three event types exist: `PostToolUse`, `UserPromptSubmit`, `SessionStart`
- Matcher patterns work (`Edit|Write` for PostToolUse, `clear`/`startup`/`resume` for SessionStart)
- Hooks execute as `node <script>` with a configurable timeout
- Hook output is treated as feedback to the assistant

**What would break:** If the hook API changed (renamed events, different registration format, removed matcher support), all automation stops. The `workflow-trigger.js` hook is particularly critical — it's what lets users type `work #42` instead of `/work 42`. Without it, the natural-language interface degrades to explicit slash commands only.

### 4. CLAUDE.md (Project Instructions)

**How it works:** Claude Code reads `CLAUDE.md` from the project root as persistent project-level instructions.

**What we depend on:**
- `CLAUDE.md` is read automatically at session start
- Content is treated as instructions that persist across the conversation
- This is where IDPF declares itself as a self-hosted framework and points to the process framework file

**What would break:** If `CLAUDE.md` stopped being recognized, the assistant would not know this is an IDPF project, which process framework to use, or where to find on-demand documentation.

### 5. Tools (Read, Write, Edit, Bash, Glob, Grep, Skill, TodoWrite)

**How it works:** Claude Code provides built-in tools that the assistant uses to interact with the filesystem, run commands, and manage tasks. IDPF's command specs reference these tools by name.

**Tools we depend on:**

| Tool | Usage in IDPF |
|------|---------------|
| `Read` | Load files (command specs, config, issue bodies) |
| `Write` | Create files (temp files for gh commands, test plans, docs) |
| `Edit` | Modify files (update issue bodies, edit code) |
| `Bash` | Run git, gh, node scripts, CI checks |
| `Glob` | Find files by pattern (skill directories, test files) |
| `Grep` | Search file contents (version tokens, references) |
| `Skill` | Invoke slash commands from within other commands |
| `TodoWrite` | Track progress during multi-step workflows |

**What would break:** Command specs literally say things like "Use `TodoWrite` to create todos" and "Read each source file." If these tool names changed or tools were removed, commands would reference nonexistent capabilities.

### 6. Skills System

**How it works:** IDPF packages reusable capabilities as skills — zip files containing a `SKILL.md` and optional resources. The `/install-skill` command extracts these to `.claude/skills/`.

**What we depend on:**
- `.claude/skills/` directory is recognized by Claude Code
- Skill metadata (`SKILL.md` frontmatter) is parseable
- The assistant can load skill instructions on demand

**Scale:** 38 skills covering TDD phases, framework setup, testing patterns, architecture, analysis, and tooling.

**What would break:** If Claude Code changed how skills are discovered or loaded, the `/install-skill` command and all 38 packaged skills become unusable.

### 7. Settings and Permissions

**How it works:** `.claude/settings.local.json` configures hook registration, tool permissions (allow/deny lists), and output style.

**What we depend on:**
- `permissions.allow` — whitelists specific Bash commands (git add, git commit, gh commands)
- `permissions.deny` — blocks destructive commands (rm -rf /, git push --force, sudo)
- `hooks` — event registration (covered above)
- `outputStyle` — configures assistant response style

**What would break:** If the settings format changed, both the safety guardrails (deny list) and the automation (hooks) would need migration.

---

## The Hub/Symlink Model

IDPF's central hub architecture depends on filesystem symlinks — a capability that Claude Code must not interfere with.

```
Hub (central)                        Project
────────────                         ───────
.claude/rules/      ←── symlink ───  .claude/rules/
.claude/hooks/      ←── symlink ───  .claude/hooks/
.claude/scripts/    ←── symlink ───  .claude/scripts/
.claude/metadata/   ←── symlink ───  .claude/metadata/
.claude/skills/     ←── symlink ───  .claude/skills/
.claude/commands/   ──── COPIED ───  .claude/commands/  (not symlinked)
```

Claude Code must follow symlinks when reading rules, hooks, and scripts. If it resolved only files physically present in the project directory, the hub model would break for every connected project.

**Known issue:** Claude Code's Glob tool does not follow symlinks (anthropics/claude-code#27254). IDPF works around this by using `Read` for known paths and `Bash ls` for discovery in symlinked directories.

---

## What Has No Claude Code Dependency

These parts of IDPF are Claude Code-agnostic:

| Component | Why |
|-----------|-----|
| `gh pmu` CLI extension | Pure GitHub CLI extension — works independently |
| `framework-manifest.json` | Standard JSON config — read by Node.js scripts |
| `framework-config.json` | Standard JSON config |
| Node.js scripts (`.claude/scripts/shared/`) | Plain Node.js — could run outside Claude Code |
| Test suite (`tests/`) | Jest tests — run via `npx jest` |
| Markdown source files (IDPF-*, Overview/, Reference/) | Documentation — Claude Code just reads them |
| GitHub Actions workflows | CI/CD — runs on GitHub, not in Claude Code |

These components would survive a Claude Code migration, though the scripts would need a new execution context.

---

## Risk Summary

| Dependency | Severity | Mitigation |
|-----------|----------|------------|
| `.claude/commands/` discovery | Critical | None — this is the primary interface |
| `.claude/rules/` auto-loading | Critical | Could fall back to explicit reads, but loses compaction persistence |
| Hook event system | High | Natural-language triggers would break; slash commands still work |
| Tool names (Read, Write, etc.) | High | Command specs hardcode tool names |
| `CLAUDE.md` recognition | Medium | Could embed instructions in rules instead |
| Settings format | Medium | One-time migration script |
| Symlink traversal | Medium | Workaround exists (direct Read, Bash ls) |
| Skills system | Low | Skills are rarely loaded mid-session |

**No version pinning exists.** IDPF has no mechanism to detect which Claude Code version is installed or whether the current version supports the features IDPF requires. A breaking Claude Code update would affect all users with no warning.

---

## Recommendations

1. **Monitor Claude Code releases.** Subscribe to the [Claude Code changelog](https://github.com/anthropics/claude-code) for breaking changes to commands, rules, hooks, or settings.
2. **Consider a version check.** The `/charter` or startup hook could verify Claude Code version and warn if untested.
3. **Keep the agnostic layer thick.** Business logic should live in Node.js scripts (`.claude/scripts/`), not in command spec markdown. Scripts survive migration; command specs don't.
4. **Test after Claude Code updates.** Run the full test suite (`npx jest`) after updating Claude Code. The structural tests verify command specs reference real tools and follow expected patterns.

---

**End of Claude Code Dependencies**
