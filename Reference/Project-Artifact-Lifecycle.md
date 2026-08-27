# Project Artifact Lifecycle
**Version:** 1.1
**Source:** Reference/Project-Artifact-Lifecycle.md
**Purpose:** Classify the project-level artifacts PHM-bootstrapped projects accumulate, so contributors know what to commit, what to gitignore, and who writes each file (#2382). Originally the four root-level files; now also project-owned files under `.claude/` a project owner authors by hand (#2506) — the commit-vs-ignore question is identical.
## Classification Table
| File | Size | Writer | Purpose | Commit or Ignore | Rationale |
|------|------|--------|---------|------------------|-----------|
| `.gh-pmu.json` | ~4 KB | PHM (bootstrap) + `gh pmu init` | Per-project `gh pmu` config: board number, field mappings (Status/Priority), release tracks, framework declaration, repository coordinates | **Commit** | Canonical project config. Teammates cloning must get the same board integration; without it `/work`, `/done`, issue creation, and every gh pmu command break. |
| `.gh-pmu.checksum` | ~66 B | `gh pmu` CLI | SHA-256 digest of `.gh-pmu.json` — tamper-evident seal detecting out-of-band edits | **Commit** | Recomputable, so it *could* be ignored; committing promotes the seal to an audit trail. Git history shows when config was rotated, and a checksum mismatch on a teammate's clone signals an edit made outside `gh pmu`. |
| `.gh-pmu-integrity-check.json` | ~40 B | `gh pmu` CLI | `{"lastCheck": ISO8601}` — when integrity verification last ran | **Ignore** (recommended) | Marginal call. Overwritten every check; committing creates noisy diffs, ignoring loses audit value. CI and local machines write different timestamps and generate merge churn. |
| `.idpf-update-check.json` | ~45 B | `idpf` hub update-checker (PHM-side, runtime) | `{"lastCheck": ISO8601}` — when the project last polled the hub for updates | **Ignore** | Pure runtime state, rewritten by every `idpf --check-updates`. Not useful across contributors. |
| `.claude/Organizational-Expectations.md` | 1–2 KB | Project owner / tech lead — hand-authored (never generated) | Team-local rules the base model cannot know: review depth, test-pyramid expectations, blessed/forbidden tech, deploy gates, naming/branching deviations. Convention: `Reference/Organizational-Expectations.md` | **Commit** | The rules bind everyone, so a gitignored copy would govern only the author's sessions and silently diverge. Never regenerated — git is the only backup. Unlike the runtime files above, this is hand-authored intent, and its diffs are the audit trail of how team policy changed. |
| `.release-authorized` | ~60 B | `/prepare-release` (Step 4.6) and `/prepare-beta` (Step 4.2) — created immediately before the tag push, removed immediately after (#2601) | Single-use token `.claude/hooks/pre-push` requires before allowing a `v*` tag push. Unstructured; the hook only tests existence and echoes the value, so the commands write version, gates-passed state and merge SHA as the release's audit line | **Ignore** | Ephemeral single-release state, meaningless to a teammate and dangerous committed — a tracked marker would authorize every clone permanently, the opposite of a gate. Should never be seen at rest: the commands `rm -f` on both the success and failure paths, so a surviving marker means a run aborted between the two. |
| `.git/hooks/pre-push` | — | **The developer, explicitly** — no automatic installer, past or present | Not a file the framework writes. Listed because the framework ships `.claude/hooks/pre-push` and a reader reasonably assumes something installs it; nothing does (#2611) | **Cannot be committed** | `.git/` is outside the work tree; git will not track it under any setting. **Not a project artifact.** Enabled via `core.hooksPath`, not by placing a file here — see below. |
## Enabling the Tag-Authorization Hook (opt-in)
`.claude/hooks/pre-push` ships to every project but **git never runs it by default.** Git executes `.git/hooks/<name>` or the directory named by `core.hooksPath`, and the framework hook is at neither — so it is inert until a project opts in (#2611):
```bash
git config core.hooksPath .claude/hooks
```
Points git at the hub-symlinked hook directory, so the hook stays current through framework updates with nothing to re-run. Git executes only files named after git hook events, so the Claude Code hooks alongside it are never consulted.
**One caveat, load-bearing, to weigh before running it:**
1. **`core.hooksPath` replaces `.git/hooks/` wholesale** — it does not merge. Any hooks the developer installed themselves stop running, silently, from that moment.
**A second caveat no longer applies.** Until #2601 nothing created `.release-authorized`, so opting in meant the gate rejected your own release tag pushes and the hook's manual override was the only way to ship. `/prepare-release` and `/prepare-beta` now write the marker and remove it afterwards, so a project releasing through those commands pays nothing for opting in.
Still opt-in, but the reason changed: the original reason — the gate was unusable — is fixed. What remains is caveat 1: enabling `core.hooksPath` is a decision about the project's *other* hooks, which the framework should not make on its behalf (#2611).
## Naming: `.gh-pmu.checksum` vs `.gh-pmu-integrity-check.json`
Different concepts, not duplicates: the first holds the **digest value** (hex SHA-256 of `.gh-pmu.json`), the second **metadata about the check** (last-run timestamp). Seal vs log. `gh pmu` writes both. **No rename is required.**
## Recommended `.gitignore` Fragment
PHM's project-bootstrap template should include:
```gitignore
# Runtime state — written on every invocation; not useful to commit
.idpf-update-check.json
.gh-pmu-integrity-check.json

# Tag-push authorization marker — created and deleted within a single
# /prepare-release or /prepare-beta run. Committing one would authorize
# every clone permanently, which is the inverse of the gate it feeds.
.release-authorized
```
It must **NOT** include `.gh-pmu.json` or `.gh-pmu.checksum` — canonical config + seal, both committed.
It must also **NOT** ignore `.claude/Organizational-Expectations.md`. A blanket `.claude/` rule would swallow it, so any `.claude/`-wide pattern needs an explicit negation (`!.claude/Organizational-Expectations.md`) — hand-authored, never regenerated, so ignoring it costs the rules and their history.
The template lives in `rubrical-works/px-manager` (the project-create service run at PHM bootstrap); a separate px-manager issue tracks its update.
**End of Project Artifact Lifecycle**
