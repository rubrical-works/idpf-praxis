# Session Startup Instructions
**Version:** v0.69.0

**Purpose:** Standard initialization procedure for AI assistant sessions

## Startup Sequence

**Run all startup steps sequentially — never in parallel.** Parallel tool calls cascade: if one fails, all siblings abort.

### 1. Gather Session Information

Collect the following information for the Session Initialized block. **Run each step sequentially — do not run tool calls in parallel during startup.**

| Field | Source | Tool |
|-------|--------|------|
| Date | Current date | Use `node -e "console.log(new Date().toISOString().slice(0,10))"` via Bash, or environment date |
| Repository | Git repo name | `git rev-parse --show-toplevel` via Bash (returns forward-slash path; parse last segment — do not pipe through `tr`) |
| Branch | Current branch + clean/dirty | `git branch --show-current` via Bash, then `git status --porcelain` |
| Process Framework | `framework-config.json` → `processFramework` | Read tool |
| Framework Version | `framework-config.json` → `frameworkVersion` | Read tool |
| Active Role | `framework-config.json` → `domainSpecialist` | Read tool |
| Review Mode | `framework-config.json` → `reviewMode` | Read tool |
| Charter Status | `Active` (charter complete) or `Pending` (missing/template) | Glob tool to check existence |
| GitHub Workflow | `gh pmu --version` if installed | Bash |

**⚠️ Sandbox Safety:** Do not use shell builtins (`date`, `basename`, `echo`, `test -f`, `pwd`, `printf`) — they are blocked in Claude Code's sandbox. Use dedicated tools (Read, Glob) or `node -e` instead. See `05-windows-shell.md` for the full list.

### 3. Check Project Charter

**Charter is mandatory.** All projects must have a completed charter before proceeding.

**Step 1: Check for CHARTER.md**
Use the Glob tool with pattern `CHARTER.md` to check if the charter file exists.

**If CHARTER.md exists and is filled in (Charter Status: Active):**
- Read and display a brief summary (vision, current focus)
- Continue to next step

**If CHARTER.md is template (unfilled placeholders) OR does not exist (Charter Status: Pending):**
Auto-run `/charter` command in Inception mode.

**BLOCKING:** Session startup does not complete until charter is configured.

### 3a. Upgrade Check (Non-Blocking)

**Applies when:** Not self-hosted (`selfHosted` is false or absent in `framework-config.json`)

Check for outdated third-party dependencies at session startup. This check is throttled to once every 14 days.

1. Run: `node .claude/scripts/shared/upgrade-check.js`
2. Parse JSON output:
   - If `data.skipped: true` → cooldown active, continue silently
   - If `data.outdated` is non-empty → prompt user for details
   - If `data.outdated` is empty → report "All packages up-to-date"
   - If script fails or output is not JSON → warn and continue (non-blocking)
3. This step never blocks session startup

### 3b. Report Project Skills

**Note:** This step applies to user projects with `framework-config.json`.

Check for project skills (set by `/charter` or `/create-prd`):
Use the Read tool on `framework-config.json` (already read in Step 1) and check for a `"projectSkills"` array.

**If projectSkills array exists and is non-empty:**
- Report: "Project Skills: {skill-list}"

**If no projectSkills:** Skip this report.

### 3c. Status Line Setup (Non-Blocking)

Detect whether a Claude Code status line is configured and set up a default if missing.

1. Run: `node .claude/scripts/shared/statusline-check.js` (append `--force` if user launched with `--force-statusline`)
2. Parse JSON output:
   - If `configured: true` → continue silently
   - If `configured: false` → spawn `statusline-setup` agent to configure a default status line showing model name and context usage percentage
   - If script fails or output is not JSON → warn and continue (non-blocking)
3. This step never blocks session startup

### 3d. Load Domain Specialist (Non-Blocking)

Load the domain specialist expertise profile into context so it shapes responses for the session.

1. Read `domainSpecialist` from `framework-config.json` (already read in Step 1)
2. If `domainSpecialist` is set:
   - Resolve file path: check `{frameworkPath}/System-Instructions/Domain/Base/{specialist}.md` using the Read tool
   - If not found: check `{frameworkPath}/System-Instructions/Domain/Pack/{specialist}.md`
   - If found: Read the file (it is now in context and will shape responses)
   - If not found in either location: Warn "Specialist file not found for {specialist}" and continue
3. If `domainSpecialist` is not set: Skip silently
4. This step never blocks session startup

### 3e. Branch Sync Check (Non-Blocking)

Detect whether the current branch is up to date with its upstream tracking branch.

1. Run: `node .claude/scripts/shared/branch-sync-check.js`
2. Parse JSON output:
   - If `data.status` is `"up-to-date"` → continue silently
   - If `data.skipped: true` (no upstream) → continue silently
   - If `data.status` is `"behind"` → use `AskUserQuestion`:
     - Question: `"Branch '{branch}' is {behind} commit(s) behind upstream. Pull to update?"`
     - Options: `"Yes, pull"` (recommended), `"No, continue as-is"`
     - If yes: run `git pull`
   - If `data.status` is `"ahead"` → report: `"Branch '{branch}' is {ahead} commit(s) ahead of upstream (unpushed)."`
   - If `data.status` is `"diverged"` → use `AskUserQuestion`:
     - Question: `"Branch '{branch}' has diverged from upstream ({ahead} ahead, {behind} behind)."`
     - Options: `"Pull with rebase"`, `"Pull with merge"`, `"Skip — continue as-is"`
     - Execute selected option if not skipped
   - If script fails or output is not JSON → warn and continue (non-blocking)
3. This step never blocks session startup

### 4. Display Session Initialized Block

Display a consolidated status block. **Date appears ONLY here** (not elsewhere in startup).

**Format (use simple dash-prefix for cross-platform compatibility):**
```
Session Initialized
- Date: {date}
- Repository: {repo-name}
- Branch: {branch} ({clean|dirty})
- Process Framework: {framework}
- Framework Version: {version}
- Active Role: {specialist}
- Review Mode: {solo|team|enterprise}
- Charter Status: {Active|Pending}
- GitHub Workflow: Active via gh pmu {version}
```

**Field notes:**
- **Repository:** Git repository name (basename of repo root)
- **Branch:** Show `(clean)` if no uncommitted changes, `(dirty)` otherwise
- **Process Framework:** From `framework-config.json`, or "Not configured" if missing
- **Framework Version:** From `framework-config.json`
- **Active Role:** Domain specialist from config, or "Not configured"
- **Review Mode:** From `framework-config.json` → `reviewMode`. Omit this line entirely if `reviewMode` is not set in the config.
- **Charter Status:** `Active` if charter complete, `Pending` if missing/template (blocks startup)
- **GitHub Workflow:** Include gh pmu version if installed

Ask user what they would like to work on.

## Post-Compact Behavior

**No re-reading required.** Rules in `.claude/rules/` are automatically reloaded after compaction.

## On-Demand Documentation Loading

After startup, load detailed documentation only when needed. Paths use `frameworkPath` from `framework-config.json` (resolve relative to project root).

| When Working On | Load File |
|-----------------|-----------|
| IDPF frameworks (Structured, Agile, Vibe, LTS) | `{frameworkPath}/Overview/Framework-Development.md` |
| Testing frameworks | `{frameworkPath}/Overview/Framework-Testing.md` |
| System Instructions or Domain Specialists | `{frameworkPath}/Overview/Framework-System-Instructions.md` |
| Skills (creating, updating, reviewing) | `{frameworkPath}/Overview/Framework-Skills.md` |
| Framework transitions or hybrid usage | `{frameworkPath}/Overview/Framework-Transitions.md` |
| Complete reference (all details) | `{frameworkPath}/Overview/Framework-Overview.md` |
| Skill creation rules | `{frameworkPath}/Assistant/Anti-Hallucination-Rules-for-Skill-Creation.md` |
| PRD work | `{frameworkPath}/Assistant/Anti-Hallucination-Rules-for-PRD-Work.md` |

**End of Session Startup Instructions**
