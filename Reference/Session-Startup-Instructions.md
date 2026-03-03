# Session Startup Instructions
**Version:** v0.56.0
**Purpose:** Standard initialization procedure for AI assistant sessions
---
## Startup Sequence
**Run all startup steps sequentially — never in parallel.** Parallel tool calls cascade: if one fails, all siblings abort.
### 1. Gather Session Information
| Field | Source | Tool |
|-------|--------|------|
| Date | Current date | `node -e "console.log(new Date().toISOString().slice(0,10))"` or environment date |
| Repository | Git repo name | `git rev-parse --show-toplevel` (parse last path segment) |
| Branch | `git branch --show-current` + clean/dirty status | Bash |
| Process Framework | `framework-config.json` → `processFramework` | Read tool |
| Framework Version | `framework-config.json` → `frameworkVersion` | Read tool |
| Active Role | `framework-config.json` → `domainSpecialist` | Read tool |
| Review Mode | `framework-config.json` → `reviewMode` | Read tool |
| Charter Status | `Active` or `Pending` | Glob tool |
| GitHub Workflow | `gh pmu --version` | Bash |
**Do not use shell builtins** (`date`, `basename`, `echo`, `test -f`, `pwd`) — blocked in sandbox.
### 3. Check Project Charter
**Charter is mandatory.**
1. Check CHARTER.md exists
2. Check for template placeholders: `/{[a-z][a-z0-9-]*}/`
3. Charter Status:
   - **Active** (exists, no placeholders): Proceed
   - **Pending** (missing or template): Auto-run `/charter` command
**BLOCKING:** Session startup does not complete until charter is configured.
### 3a. Upgrade Check (Non-Blocking)
**Applies when:** Not self-hosted (`selfHosted` is false or absent in `framework-config.json`)
Run `node .claude/scripts/shared/upgrade-check.js` and parse JSON:
- `data.skipped: true` → cooldown active, skip
- `data.outdated` non-empty → prompt user for details
- Empty or error → continue silently (non-blocking)
### 3b. Report Project Skills
Check `framework-config.json` for `projectSkills` array. If non-empty, report: "Project Skills: {skill-list}"
### 4. Display Session Initialized Block
**Date appears ONLY here.** Format:
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
**Review Mode:** Omit if `reviewMode` is not set in config.
Ask user what they would like to work on.
---
## Post-Compact Behavior
**No re-reading required.** Rules in `.claude/rules/` auto-reload after compaction.
---
## On-Demand Documentation Loading
Paths use `frameworkPath` from `framework-config.json` (resolve relative to project root).
| When Working On | Load File |
|-----------------|-----------|
| IDPF frameworks | `{frameworkPath}/Overview/Framework-Development.md` |
| Testing frameworks | `{frameworkPath}/Overview/Framework-Testing.md` |
| System Instructions or Domain Specialists | `{frameworkPath}/Overview/Framework-System-Instructions.md` |
| Skills (creating, updating, reviewing) | `{frameworkPath}/Overview/Framework-Skills.md` |
| Framework transitions or hybrid usage | `{frameworkPath}/Overview/Framework-Transitions.md` |
| Complete reference | `{frameworkPath}/Overview/Framework-Overview.md` |
| Skill creation rules | `{frameworkPath}/Assistant/Anti-Hallucination-Rules-for-Skill-Creation.md` |
| PRD work | `{frameworkPath}/Assistant/Anti-Hallucination-Rules-for-PRD-Work.md` |
---
**End of Session Startup Instructions**
