---
version: "v0.123.0"
description: Review issues against the IDPF framework's type-specific criteria.
argument-hint: "#issue [#issue...] | --status <status> [--agents N] [--sequential] [--with ...] [--mode ...] [--force] [--prior-art] [--accept] [--help]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /review-issue
Delegates setup to `review-preamble.js`, cleanup to `review-finalize.js`.
## Prerequisites
`gh pmu` installed; `.gh-pmu.json` configured.
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes, unless `--status` | Issue numbers (`#42` or `42 43 44`) |
| `--status <status>` | No | Every open issue in a board status configured in `.gh-pmu.json`, planned as a typed multi-issue selection; typed numbers beside it deduplicated. Unconfigured status rejected, naming the configured ones; empty status → empty selection, nothing reviewed |
| `--agents N` | No | Multi-issue concurrency cap: `--agents N` > `framework-config.json` project default > 3, source reported. Positive integer; `--agents 1` = sequential path. Single issue: ignored, reported |
| `--sequential` | No | Review a multi-issue selection one at a time, inline, typed order. Boolean, takes no value |
| `--with` | No | Domain extensions (`security,performance` or `all`) |
| `--mode` | No | Review mode override: `solo`/`team`/`enterprise` |
| `--without` | No | Domain extensions to exclude, applied after `--with` (`--with all --without seo`) |
| `--force` | No | Force re-review even if `reviewed` label present |
| `--prior-art` | No | Force the 2a-iv sweep whatever the `reviewSweep` mode (except `off`) and whatever the issue type. Boolean, takes no value |
| `--accept` | No | Step 3c resolve pass: apply each Pass 2 suggestion the shared classifier accepts, ask only the held ones (always-ask criteria, unrun runtime claims, judgment holds), each with its reason. No effect with `--step-wise` (Step 3c does not run), reported. Boolean, takes no value |
| `--help` | No | Open this command's docs page. Takes precedence over every other argument and performs no action. |

**`--help` takes precedence over every other argument and performs no action:** run `node .claude/scripts/shared/command-help.js review-issue`, report its output, and STOP.

`--no-redirect` is parsed but deliberately undocumented: internal, used by redirected review commands to avoid routing loops (#2752).
Multi: `/review-issue #42 #43 #44` — 2+ issues reviewed concurrently by default when the Agent tool is available; one at a time under `--sequential`/`--agents 1`; no Agent tool → sequential, said once. `--status ready` selects a status. Contract: rule 09 § Concurrent multi-issue run.
## Execution Instructions
**REQUIRED:** Routed command — two-phase task creation:
1. **Phase 1:** Single `TaskCreate` for preamble step only.
2. **Phase 2:** After preamble confirms path (no redirect, no early exit), bulk-create tasks for all remaining steps, **emitted in one message as parallel tool calls** — not one call per message (`07-task-creation-timing.md` § Emission).
3. **On redirect/early exit:** Mark preamble completed, prune the task list per Step 4 part (2), then stop; do NOT create remaining tasks.
4. **Track Progress:** mark each task `in_progress` → `completed` as you work it.
5. **Post-Compaction:** Re-read spec; resume from first incomplete task — no re-routing.
## Execution Logic
Follow `.claude/rules/09-review-execution.md` (auto-loaded at session start). It defines the Workflow for this command and for `/resolve-review`:
- Step 1 setup via `review-preamble.js`, redirect/early-exit routing, Step 1c `review-started` announcement
- Step 2 criteria evaluation — 2a auto-evaluate, 2a-ii proposed-solution repair and files-to-modify derivation, 2a-iii epic recursion, 2a-iv prior-art sweep, 2a-v branch auto-assignment, 2b subjective, 2c extensions, 2d recommendation
- Step 3 finalize via `review-finalize.js`, Step 3b `review-passed` terminal announcement
- Step 3a interdependence analysis (multi-issue), Step 4 closing cleanup
---
## Error Handling
| Situation | Response |
|-----------|----------|
| Preamble `ok: false` | Report `errors[0].message` → STOP |
| Issue not found | Preamble error → STOP |
| Issue closed | Ask user (from preamble context) |
| Unknown label | Preamble uses generic criteria |
| Finalize fails | Report error; body may already be updated |

**End of /review-issue Command**
