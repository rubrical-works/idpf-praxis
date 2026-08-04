# Project Artifact Lifecycle
**Version:** 1.0
**Source:** Reference/Project-Artifact-Lifecycle.md
**Purpose:** Classify the project-level artifacts PHM-bootstrapped projects accumulate, so contributors know what to commit, what to gitignore, and who writes each file. Addresses #2382.
**Scope note:** originally the four root-level files from #2382; it now also carries project-owned files under `.claude/` that a project owner authors by hand (#2506) — the commit-vs-ignore question is identical.
## Classification Table
| File | Size | Writer | Purpose | Commit or Ignore | Rationale |
|------|------|--------|---------|------------------|-----------|
| `.gh-pmu.json` | ~4 KB | PHM (bootstrap) + `gh pmu init` | Per-project `gh pmu` config: board number, field mappings (Status/Priority), release tracks, framework declaration, repository coordinates | **Commit** | Canonical project config. Teammates cloning must get the same board integration; without it `/work`, `/done`, issue creation, and every gh pmu command break. |
| `.gh-pmu.checksum` | ~66 B | `gh pmu` CLI | SHA-256 digest of `.gh-pmu.json` — tamper-evident seal detecting out-of-band edits | **Commit** | Recomputable, so it *could* be ignored; committing promotes the seal to an audit trail. Git history shows when config was rotated, and a checksum mismatch on a teammate's clone signals an edit made outside `gh pmu`. |
| `.gh-pmu-integrity-check.json` | ~40 B | `gh pmu` CLI | `{"lastCheck": ISO8601}` — when integrity verification last ran | **Ignore** (recommended) | Marginal call. Overwritten every check; committing creates noisy diffs, ignoring loses audit value. CI and local machines write different timestamps and generate merge churn. |
| `.idpf-update-check.json` | ~45 B | `idpf` hub update-checker (PHM-side, runtime) | `{"lastCheck": ISO8601}` — when the project last polled the hub for updates | **Ignore** | Pure runtime state, rewritten by every `idpf --check-updates`. Not useful across contributors. |
| `.claude/Organizational-Expectations.md` | 1–2 KB | Project owner / tech lead — hand-authored (never generated) | Team-local rules the base model cannot know: review depth, test-pyramid expectations, blessed/forbidden tech, deploy gates, naming/branching deviations. Convention: `Reference/Organizational-Expectations.md` | **Commit** | The rules bind everyone, so every teammate must get the file on clone — a gitignored copy would govern only the author's sessions and silently diverge. Never regenerated, so git is the only backup. Unlike the runtime files above, this is hand-authored intent and its diffs are the audit trail of how team policy changed. |
## Naming: `.gh-pmu.checksum` vs `.gh-pmu-integrity-check.json`
Different concepts, not duplicates: the first holds the **digest value** (hex SHA-256 of `.gh-pmu.json`); the second holds **metadata about the check** (last-run timestamp). The checksum file is the seal, the integrity-check file is the log that a verification pass ran. `gh pmu` writes both. **No rename is required.**
## Recommended `.gitignore` Fragment
PHM's project-bootstrap template should include:
```gitignore
# Runtime state — written on every invocation; not useful to commit
.idpf-update-check.json
.gh-pmu-integrity-check.json
```
It must **NOT** include `.gh-pmu.json` or `.gh-pmu.checksum` — canonical config + seal, both committed.
It must also **NOT** ignore `.claude/Organizational-Expectations.md`. A blanket `.claude/` rule would swallow it, so any `.claude/`-wide pattern needs an explicit negation (`!.claude/Organizational-Expectations.md`). The file is hand-authored and never regenerated — ignoring it costs the team the rules and the history of how they changed.
The template lives in `rubrical-works/px-manager` (the project-create service run at PHM bootstrap); a separate px-manager issue tracks its update.
**End of Project Artifact Lifecycle**
