# IDPF /code-review and Thermos: Manifest-Tracked Review vs. Two-Reviewer Diff Audit

**Date:** 2026-10-17
**Compared against:** Thermos in `cursor/plugins` at `0317eb8b` (all 8 files); IDPF `/code-review` (`CommandsSrc/code-review.md`) and `.claude/metadata/review-extensions.json`
**Topic:** How each reviews code, what Thermos checks that `/code-review` does not, and what would transfer

---

## The Short Answer

Thermos reviews a branch diff with two harsh reviewers in parallel and merges what they find. IDPF's `/code-review` reviews whole files, tracks which ones were approved in a manifest, and files approved findings as issues. Thermos has the sharper rubric; `/code-review` has the durable tracking and filing. They are complementary.

---

## What Thermos Is

A Cursor plugin (MIT, Cursor) of three skills and two subagents. The orchestrating skill gathers `git diff main...HEAD` and the full contents of changed files, starts both reviewers in one message with identical context, then deduplicates, weights findings both reviewers raised, and settles disagreements itself.

- **Deep review** (`thermo-nuclear-review`): only code the diff adds or changes; cross-package side effects; **developer-experience breakage** (secret reads, renamed or new environment variables, port remaps, new scripts people must run); **feature-gate leaks**; intended breakage not flagged when contained; a warning against over-rating; "no unfinished research" (if the backend is reachable, check it rather than writing "ok if the backend handles it"); and reconciliation with PR bot and human comments only after an independent pass.
- **Code quality** (`thermo-nuclear-code-quality-review`): eight standards, including "code judo" (restructure to delete complexity, not move it), the **1,000-line rule** (a PR must not take a file from under 1,000 lines to over without strong reason), no spaghetti-condition growth, type and boundary hygiene, and logic in its canonical layer; plus an approval bar and six presumptive blockers.

There is no code: deduplication, overlap weighting and the line count are all left to the model. The deep reviewer is called a "security audit" in the README but carries no concrete security checklist, and `plugin.json` advertises merge-ready flows no file implements.

---

## Side by Side

| Dimension | Thermos | IDPF /code-review |
|---|---|---|
| **Scope** | The branch diff | Whole files, chosen by glob and content hash |
| **Reviewers** | Two in parallel, merged | One pass; `--with` adds domain criteria |
| **Severity** | None shared; quality reviewer ranks by category | high / medium / low / info, mapped to issue priority |
| **State** | None | Manifest of approved and flagged files; incremental runs |
| **Output** | A merged report | A report file plus issues filed through a queue |
| **Security** | A role prompt, no checklist | `Domains/Security/review-criteria.md` checklist via `--with security` |

---

## What IDPF Could Take

| Item | Where it lands | Effort |
|---|---|---|
| A `--diff [base]` mode reviewing only lines the branch adds or changes | New `/code-review` mode; needs its own manifest semantics | M |
| A mechanical 1,000-line crossing check (before and after line counts) | Standard check, medium severity | S |
| Developer-experience breakage (secrets, env vars, ports, required scripts) | Standard check or `--with devex` | S |
| Feature-gate leak check | Same, or a Security criteria question | S |
| Severity calibration: don't over-rate; don't flag contained intended breakage | Severity guidance | S |
| "No unfinished research" | Severity guidance; matches IDPF's claim labeling | S |
| The code-quality rubric (standards, approval bar, blockers) | A `--with quality` domain extension | M |
| Two reviewers in parallel with overlap weighting | A `--deep` mode, formalizing how the 2026-10-17 lean audit was run by hand | L |

IDPF's own per-diff review now exists in one place: the Merge-Back Review Gate of `/work --concurrent` runs a single independent reviewer (the `diff-review` skill) over each member's branch before it merges, never handed the implementer's summary. It is one reviewer, not two, and it gates a merge rather than auditing a branch after the fact — which is why Thermos's two-reviewer overlap weighting is listed above as something still to take rather than something IDPF has.

## What Would Not Transfer

- Cursor's plugin manifest, subagent types and BugBot.
- "Ignore existing code" conflicts with the manifest's whole-file approve/flag model unless the diff mode skips manifest updates.
- "Push for restructuring" must surface as a recommendation or issue, never an edit: IDPF forbids unilateral scope changes.

**Found along the way:** `CommandsSrc/code-review.md:100` says `--with all` loads 8 extensions; `review-extensions.json` registers 11.

---

**End of Comparison**
