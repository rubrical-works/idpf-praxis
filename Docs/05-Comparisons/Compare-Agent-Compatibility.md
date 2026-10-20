# IDPF and Agent Compatibility: Declared Verification vs. Scored Repository Readiness

**Date:** 2026-10-17
**Compared against:** agent-compatibility in `cursor/plugins` at `0317eb8b` (all 8 files); IDPF's verification declarations, `/charter`, `/audit-core-docs`, `/fw-self-diag` and the session startup hook
**Topic:** How each judges whether a repository is ready for agents, and which parts of the plugin's rubric IDPF could use without its scanner

---

## The Short Answer

Agent Compatibility gives a repository one score for how well agents can work in it: can an agent boot it, verify a small change, and trust the docs. IDPF checks what a project *declares* (test suites, verification commands, runners on PATH, dependency freshness) but never runs a user project's bootstrap and never checks a user project's README against reality. The plugin's rubric is worth borrowing; its scanner is not.

---

## What Agent Compatibility Is

A Cursor plugin (MIT, Cursor) of one skill and four review agents, all prompts. The deterministic part is an external npm package, `agent-compatibility`, run as `npx -y agent-compatibility@latest`; its source and scoring are not in the plugin.

| Check | What the agent does |
|---|---|
| Scan | Runs the CLI and keeps its score and problem order; a scanner that cannot run is an environment problem, not a repo defect |
| Startup | Reads README, scripts, toolchain and env files, picks a bootstrap path and tries to reach first success within a time budget |
| Validation loop | Finds the test, lint and typecheck paths, decides whether a scoped loop exists for a small change, runs it, and rates it targeted, actionable, noisy or too expensive |
| Docs reliability | Follows setup docs literally and scores "the damage from the drift, not the mere existence of drift" |

Each workflow check uses fixed anchors: 93 works, 84 works after digging, 68 too manual or ambiguous, 27 no credible path, 12 blocked on secrets or infrastructure. The final score is `round(scan × 0.7 + mean(workflow checks) × 0.3)`, and by default only the final score and "top fixes" are shown.

---

## Side by Side

| Concern | Agent Compatibility | IDPF |
|---|---|---|
| Validation loop | Run and judged for cost and noise | Declared and resolved (`testing.suites`, `verificationCommands`, scoped routing); runner presence and stack drift reported at startup; never run to judge cost |
| Startup path | Attempted within a time budget | Dependency freshness, charter status and config integrity reported at startup; the bootstrap itself is never run |
| Docs reliability | User-project docs followed literally | Framework docs only (`/audit-core-docs`, `/fw-audit-hallucination`) |
| Deterministic score | Opaque external scanner, 70% weight | None |

---

## What IDPF Could Take

| Option | Where it lands | Effort |
|---|---|---|
| Static validation-loop lint: warn when suites resolve to nothing, or only to a full-repository run | `/charter` validation, or a soft startup row beside testing drift | S |
| Docs-reliability audit for user projects: compare README and CONTRIBUTING setup and run commands with `testing.suites`, package scripts and CI | `/charter refresh`, or a new user-facing audit command | M |
| Opt-in startup-path review with the 93/84/68/27/12 anchors | New command; never the startup hook, which must stay fast and read-only | M–L |
| The same rubric applied to this repository's own setup docs | `/fw-self-diag` or `/audit-core-docs` | S–M |

## What Would Not Transfer

- **The scanner.** It is unpinned and auto-confirmed (`npx -y …@latest`), which conflicts with IDPF's npm cooldown policy and its declared runtime-dependency contract, and its 70%-weighted scoring cannot be audited.
- **"Read-only" reviews that bootstrap and run tests.** In a user project that means installs, servers and side effects, which need consent and IDPF's shell-safety handling.
- **Hiding the breakdown by default.** This cuts against IDPF's practice of showing how a verdict was reached.

---

**End of Comparison**
