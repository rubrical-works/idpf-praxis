---
version: "v0.101.0"
description: Resolve review findings for an issue (project)
argument-hint: "#issue [--prior-art]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /resolve-review
Parse the latest review findings and resolve each one. Delegates parsing/classification to `resolve-preamble.js`. Works with findings from `/review-issue`, `/review-proposal`, `/review-prd`, `/review-test-plan`.
---
## Prerequisites
- `gh pmu` installed
- `.gh-pmu.json` configured
- Issue has ≥1 review comment
---
## Arguments
| Argument | Description |
|----------|-------------|
| `#issue` | Issue number (e.g., `#42`) |
| `--prior-art` | Forwarded verbatim to the Step 4 re-review, which runs the sweep. No sweep is performed here (#2725) |
---
## Execution
**REQUIRED — routed command, two-phase task creation:**
1. **Phase 1 — Preamble task only:** `TaskCreate` single preamble/setup task. Do NOT create subsequent tasks yet.
2. **Phase 2 — Bulk after routing:** After preamble confirms path (no redirect, no early exit), bulk-create remaining workflow tasks.
3. **Redirect or early exit:** Mark preamble done, stop. Do NOT create remaining tasks.
4. **Include Extensions:** Active `USER-EXTENSION` block → Phase 2 task
5. Mark `in_progress` → `completed`
6. **Post-Compaction:** Re-read, resume from first incomplete — no re-routing.
---
## Execution Logic
Follow `.claude/rules/09-review-execution.md` (auto-loaded at session start). It defines the Workflow for this command and for `/review-issue`:
- Step 1 setup and early-exit check, Step 1a `review-resolved` announcement
- Step 1b AC feasibility on authored ACs
- Step 2 Pass 1 auto-fix, Step 3 Pass 2 user input, Step 3a suggestion reporting
- Step 4 re-review via `Skill("review-issue", "#$ISSUE --force")`
`/resolve-review` is `<!-- MANAGED -->` with no `USER-EXTENSION` blocks, so nothing is retained here for extensibility.
---
## Error Handling
| Situation | Response |
|-----------|----------|
| Preamble `ok: false` | Report error → STOP |
| No review comment | Preamble errors → STOP |
| Already ready | "Already ready — no action needed." → STOP |
| `gh pmu` fails | Report error → STOP |
| User declines all | "No changes made." → STOP |
| Re-review finds new issues | Report — user can re-run |
---
**End of /resolve-review Command**
