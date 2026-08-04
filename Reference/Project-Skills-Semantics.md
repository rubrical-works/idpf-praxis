# `/context` "Project" Skills Semantics
**Version:** 1.0
**Source:** Reference/Project-Skills-Semantics.md
**Purpose:** Explain why `projectSkills` (framework-config.json) and `/context`'s "Project" Skills section disagree, so the #1977 misread does not recur. Addresses #2507 (PRD #2488).
## The Distinction
| | `projectSkills` | `/context` → "Project" Skills |
|---|---|---|
| Lists | **Installed set** — everything under `.claude/skills/` | **Model-invocable subset** |
| Contract | Installation: what Praxis Hub Manager puts in the project | Invocation: what the model may call unprompted |
**The two lists are not meant to match** — `projectSkills` is typically the longer. A skill missing from `/context` is not missing from the project.
## Why Skills Are Absent
`disable-model-invocation: true` in `SKILL.md` frontmatter removes a skill from the model-invocable surface — the flag's documented purpose, so those skills are absent **by design**, not by defect. They stay installed and functional, loaded by the commands that read them (`/work` → `tdd-process` + `tdd-checklist.json` at TDD gates; `/audit-commands`, `/fw-audit-commands` → `command-spec-audit`). A skill invoked *by a command at a specific workflow moment* should not also be autonomously invocable — otherwise it fires out of sequence.
**If auditing:** compare `projectSkills` against `.claude/skills/*/SKILL.md` on disk — comparing it against `/context` measures the wrong thing.
## Observed Rule (idpf-skills-dev#264 — settled)
#1977 left a loose end: `electron-development` surfaced in neither place, raising the hypothesis that `defaultSkill: true` gated inclusion. Settled — `rubrical-works/idpf-skills-dev#264` is closed and a frontmatter audit of 15 skills resolves the rest. Observed 2026-07-30:
| Frontmatter | Skills | Invocable |
|---|---|---|
| `disable-model-invocation: true` | `ci-cd-pipeline-design`, `command-spec-audit`, `drawio-generation`, `error-handling-patterns`, `tdd-*` (6) | **None** |
| No `disable-model-invocation` | `code-path-discovery`, `common-errors`, `electron-development`, `engage-exocortex`, `test-writing-patterns` | **All** |
**Establishes:** absence of `disable-model-invocation: true` tracks invocability exactly, in both directions. **Refutes:** `defaultSkill: true` does not gate inclusion — `command-spec-audit` carries it and is *not* invocable; `code-path-discovery` and `electron-development` carry neither flag and *are*. `electron-development` now surfaces normally, so the original observation no longer reproduces.
**Upstream-owned:** `defaultSkill` governs auto-install, not invocation. The frontmatter rules live in `idpf-skills-dev`; this note records observed behavior, it does not define it.
## Related
- `framework-config.schema.json` → `projectSkills.description` — same distinction, at the field itself
- `Construction/Tech-Debt/system-instructions-specialist-architecture.md` §4, §D — the original misread
**End of `/context` "Project" Skills Semantics**
