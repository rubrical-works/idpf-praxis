# Organizational Expectations
**Version:** 1.0
**Source:** Reference/Organizational-Expectations.md
**Purpose:** Define the convention for `.claude/Organizational-Expectations.md` — a small, project-owned file carrying team-local rules no model can infer. Addresses #2506 (PRD #2488).
## Why This Channel Exists
Three channels shape how Claude works in a project; only the third carries team-local rules:
- **Base model** (Anthropic) — general engineering competence
- **Domain specialist** (framework maintainer, `System-Instructions/Domain/`) — enumerable domain payload: WCAG SC numbers, cipher allow-lists, platform policy
- **Organizational expectations** (project owner) — **team-local rules true only here**
A specialist can tell Claude what WCAG 1.4.3 requires. It cannot know that *your* team blocks merges under 80% branch coverage or requires two approvals on anything touching billing.
## The Convention
| Property | Value |
|----------|-------|
| Path | `.claude/Organizational-Expectations.md` — in the project, not the hub |
| Writer | Project owner / tech lead — hand-authored |
| Format | Plain Markdown; short sections or a table |
| Size | **1–2 KB** (see Size Budget) |
| Git | **Commit it.** Teammates must get it on clone — see `Reference/Project-Artifact-Lifecycle.md` |
Write rules, not rationale. The file is read into a working session, so every sentence competes for context with the work itself.
### What Belongs
Review depth; test-pyramid expectations; blessed/forbidden tech; deploy gates; naming and branching deviations. Written as rules, e.g. *"Two approvals on anything under `billing/`; one elsewhere."* / *"Blessed: `date-fns`, `zod`, Postgres. Forbidden: `moment`, `lodash`."*
The test: **would a competent engineer new to this team get it wrong by default?** If yes it belongs; if the base model already does it unprompted, it does not.
### What Does Not Belong
Domain knowledge (specialist channel, or a domain library under `Domains/`); process framework rules (IDPF-Agile/Vibe ship those); architecture narrative, ADRs, onboarding docs (link, do not inline); secrets, credentials, or internal URLs that should not sit in a context window.
### Size Budget
Keep to **1–2 KB**. It is Tier 1 — a directive-based read competing with the specialist channel (~10–18 KB) for the same session budget, and the PRD's combined-load ceiling assumes it stays small. Exceeding 2 KB signals it has absorbed something belonging in a linked document.
## Tier 1 Delivery — and Its Known Consequence
**Tier 1 (shipping now):** the CLAUDE.md PHM emits carries a conditional Read directive — "if `.claude/Organizational-Expectations.md` exists, read it."
**Stated explicitly so it is not rediscovered later as a bug:** per `.claude/rules/03-startup.md` §Post-Compact Behavior, `.claude/rules/` reload after compaction but the startup hook does **not** re-run. A CLAUDE.md-referenced Read is neither — it is ordinary conversation content, which compaction can drop.
| Channel | Survives compaction |
|---------|--------------------|
| `.claude/rules/*.md` | Yes — auto-reloaded |
| Startup-hook `additionalContext` | No — hook does not re-run |
| **CLAUDE.md Read directive (Tier 1, this convention)** | **No — weakest of the three** |
**Practical effect:** expectations drop mid-session after a compaction and nothing announces it, so late work may not be governed by the file that governed early work. Re-state the rule or start a fresh session.
**Tier 2 (deferred, out of scope):** startup-hook Memory injection, which would survive compaction. Deferred per PRD #2488 until the Tier 1 vulnerability proves a practical problem — accepted cost, not an open defect.
## PHM-1 Contract (Praxis Hub Manager)
What PHM owns, framework-side; implementation tracked in `rubrical-works/px-manager#988`. Both halves are required — template-only leaves every existing project unserved, backfill-only leaves every new one unserved.
**1. New projects — template directive.** PHM's bootstrap CLAUDE.md template includes the conditional Read directive. Conditional, because most projects lack the file: a directive pointing at a missing path must be a no-op, never an error or a fabricated read.
**2. Existing projects — backfill flow.** Projects bootstrapped before this convention have no such directive, and a template-only change never reaches them. PHM's hub-update path must offer to add it — idempotently, so repeat updates do not duplicate it, and non-destructively, so hand-edited CLAUDE.md survives.
## Related
- `Reference/Project-Artifact-Lifecycle.md` — classification row: commit-vs-ignore for this file
- `Overview/Framework-Overview.md` §System Instructions — where the channel sits relative to domain specialists
**End of Organizational Expectations**
