# IDPF and Cursor Team Kit: Gated Workflow vs. Task-Level Skills

**Date:** 2026-10-17
**Compared against:** cursor-team-kit in `cursor/plugins` at `0317eb8b` (six skills read in full: `verify-this`, `control-cli`, `control-ui`, `fix-merge-conflicts`, `make-pr-easy-to-review`, `loop-on-ci`; the rest skimmed); IDPF `/qa`, `/playwright-check`, `/sync-branch`, `/merge-branch`, `/prepare-release`, `/ci`, `wait-for-ci.js`, and enhancements #3071 and #3072
**Topic:** Which of Cursor's internal team skills fill gaps in IDPF, and which conflict with its conventions

---

## The Short Answer

Cursor Team Kit is Cursor's internal toolbox: 20 skills for CI, review, shipping and verification, each a single task. IDPF already covers the workflow these skills sit inside. A few fill real gaps: comparing before and after states, driving a running CLI or UI, checks that are not GitHub Actions, and PR descriptions. Others resolve conflicts or rewrite history autonomously, which IDPF keeps behind explicit user confirmation.

---

## Skill by Skill

| Skill | What it does | IDPF's closest equivalent and the gap | Recommendation |
|---|---|---|---|
| `verify-this` | Restates a claim so it can be proven false, captures a baseline and a treatment with the same command, data and environment, returns exactly VERIFIED, NOT VERIFIED or INCONCLUSIVE, and never softens a negative | Claim labeling has no negative verdict and no before/after requirement; `/qa` verdicts are PASS/FAIL only, with no baseline | **Adapt into #3071 and #3072**: add `refuted` and `inconclusive`; require baseline and treatment for the "reproduced" level on bug and performance claims; store `baseline/` and `treatment/` in the generated skill's evidence. No separate command, which would duplicate `/qa` |
| `control-cli` | Drives a CLI or TUI through tmux or a Python pty: capture, one action, wait for a pattern (never a sleep), save the transcript, clean up | Nothing in IDPF drives a CLI interactively | **Adapt into #3072** as a reference recipe the generator reads. tmux and Python pty do not run on native Windows, so a Windows path (node-pty, or the repository's own harness) is needed |
| `control-ui` | Drives a web or Electron UI through Playwright, attaching to Electron with `connectOverCDP`; stable selectors; one action per step with a fresh snapshot | `/playwright-check` only checks the installation; the `electron-development` skill launches rather than attaches | **Adapt into #3072** as a reference recipe. Covers Praxis Hub Manager, which is an Electron app |
| `fix-merge-conflicts` | Resolves conflicts with the smallest correct edit, regenerates lockfiles, runs build and tests, stages, summarizes; never pushes | IDPF deliberately aborts and reports: `rebase-guard.js`, `/sync-branch` and `/merge-branch` all STOP on conflict | **Adapt separately** as an optional, user-confirmed resolution path after `/sync-branch` aborts. Must be rebase-only (a merge commit breaks `Refs #N` attribution), and continuing the rebase stays behind one explicit question |
| `make-pr-easy-to-review` | Lists reviewability problems, plans before rewriting history, checks tree identity after a rewrite, writes a TL;DR and separates core from mechanical files | `/merge-branch` and `/prepare-release` create PRs with a title and no generated body | **Adopt the description half**: generate a body file from the branch's `Refs #N` commits, their issues and `### Files Changed`, with generated output (`.min-mirror/`, `.claude/commands/`) as the mechanical bucket. **Skip the history half**: regrouping commits breaks the per-criterion commit sets three IDPF gates read |
| `loop-on-ci` | Uses `gh pr checks` as the source of truth, reads existing failures first, pulls `--log-failed`, applies one fix per cause, retries a flake once | `wait-for-ci.js` polls `gh run list` only, so checks that are not Actions runs are invisible; `/ci watch` reports but never fixes | **Adapt in two parts**: a `gh pr checks` mode in `wait-for-ci.js` for PR gates (S); an optional `/ci watch --fix` that commits one scoped `Refs #N` fix and STOPs before each push (M) |

## Rest of the Kit

- **Covered by IDPF already:** `new-branch-and-pr` (`/create-branch`, `/merge-branch`), `review-and-ship` (`/code-review` and `/done`), and `weekly-review` / `what-did-i-get-done` (`/idpf-stats`).
- **Possibly useful:** `get-pr-comments` (input for `/resolve-review`) and the `ci-watcher` agent (a model for running `wait-for-ci` in the background).
- **Generic or overlapping:** `deslop` (overlaps the built-in `/simplify`), `check-compiler-errors`, `run-smoke-tests`, and the two always-applied TypeScript rules.
- **Reviewed elsewhere:** `thermo-nuclear-code-quality-review` is the same rubric reviewed in [Compare-Thermos](Compare-Thermos.md).

## Conventions That Must Hold

- STOP boundaries: nothing pushes without the user; `/done` owns the push.
- Rebase, never merge, when integrating the base branch.
- History rewriting only behind an explicit question.
- Scratch files use `.tmp-` names or the session scratchpad, never `/tmp`.
- Automated verdicts are evidence for `/qa`, never the closure of a manual check.

---

**End of Comparison**
