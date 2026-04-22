# Session Startup Instructions
**Version:** v0.90.0

**Purpose:** AI-facing reference material for session work after startup.

---

## Startup is Hook-Driven

Session startup is performed deterministically by `.claude/hooks/startup-hook.js`. The hook gathers session info, runs the four check scripts (upgrade, statusline, config-integrity, branch-sync) in parallel with a staged 15s/30s/45s/60s timeout ladder, and emits the **Session Initialized** block to:

- **stderr** — visible to the user in the Claude Code UI (with ANSI colors)
- **`additionalContext`** — injected into Claude's context as plain text, plus explicit instructions for any post-hook content reads (CHARTER.md summary, domain specialist file load, `/charter` invocation if pending)

This document is reference material only — it does not contain a procedural startup checklist. See the hook source for procedure details. The Session Initialized block format and interpretation are documented in the hook's render function.

---

## Post-Compact Behavior

**No re-reading required.** Rules in `.claude/rules/` are automatically reloaded after compaction. The startup hook does not re-run on compaction — Claude resumes from in-memory context.

---

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
| PRD work | `{frameworkPath}/Assistant/Anti-Hallucination-Rules-for-PRD-Work.md` |

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

**End of Session Startup Instructions**
