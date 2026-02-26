# Session Startup Instructions
**Version:** v0.53.0
**Purpose:** Standard initialization procedure for AI assistant sessions
---
## Rules Auto-Loading (v2.9+)
Essential rules auto-load from `.claude/rules/`:
| Rule File | Content | Source |
|-----------|---------|--------|
| `01-anti-hallucination.md` | Framework development quality rules | `Assistant/Anti-Hallucination-Rules-for-Framework-Development.md` |
| `02-github-workflow.md` | GitHub issue management integration | `Reference/GitHub-Workflow.md` |
| `03-session-startup.md` | Startup procedure and on-demand loading | Generated |
**Benefits:** No explicit file reads at startup, rules persist after compaction, simplified initialization.
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
### 2. Read Framework Summary (On-Demand)
```
Overview/Framework-Summary.md
```
### 2a. Load Process Framework (Self-Hosted)
**Applies when:** `framework-config.json` contains `selfHosted: true`
1. Read `framework-config.json` for `processFramework` value
2. Load core file: `IDPF-Agile` → `.min-mirror/IDPF-Agile/Agile-Core.md`, `IDPF-Vibe` → `.min-mirror/IDPF-Vibe/Vibe-Core.md`
### 3. Check Project Charter (User Projects)
**Charter is mandatory.**
1. Check CHARTER.md exists
2. Check for template placeholders: `/{[a-z][a-z0-9-]*}/`
3. Charter Status:
   - **Active** (exists, no placeholders): Proceed
   - **Pending** (missing or template): Auto-run `/charter` command
**BLOCKING:** Session startup does not complete until charter is configured.
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
Ask user what they would like to work on.
---
## Post-Compact Behavior
**No re-reading required.** Rules in `.claude/rules/` auto-reload after compaction.
---
## On-Demand Documentation Loading
| When Working On | Load File |
|-----------------|-----------|
| IDPF frameworks | `Overview/Framework-Development.md` |
| Testing frameworks | `Overview/Framework-Testing.md` |
| System Instructions or Domain Specialists | `Overview/Framework-System-Instructions.md` |
| Skills (creating, updating, reviewing) | `Overview/Framework-Skills.md` |
| Framework transitions or hybrid usage | `Overview/Framework-Transitions.md` |
| Complete reference | `Overview/Framework-Overview.md` |
| Skill creation rules | `Assistant/Anti-Hallucination-Rules-for-Skill-Creation.md` |
| PRD work | `Assistant/Anti-Hallucination-Rules-for-PRD-Work.md` |
---
**End of Session Startup Instructions**
