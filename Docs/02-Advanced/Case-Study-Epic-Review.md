# Case Study: Epic Review of Seamless Deployment Platform Integration

**Date:** 2026-02-28
**Topic:** What a `/review-issue` on a 10-story epic actually looks like — the full cascade, the resolve cycle, and what the developer gets afterward

See also: [Epic Review Workflow](Epic-Review-Workflow.md) for the mechanism reference.

---

## Context

Issue #1608 — *Epic: Seamless Deployment Platform Integration* — was a PRD-derived epic that defined a three-layer integration for deploying to hosting platforms (Vercel, Railway, Render, DigitalOcean). The three layers: extension recipes for CI/CD hooks, deployment skills for platform-specific guidance, and charter inception integration for auto-discovery during project setup.

The epic contained 10 stories (#1609–#1618), ranging from "create recipe source files" through "end-to-end verification." None had been worked yet — all 10 were at 0% progress, sitting in backlog after `/create-backlog` generated them from the PRD.

This was the epic's first review. No prior Construction context existed, no proposed solutions had been written, and no review counters were set. The command was simple:

```
/review-issue 1608
```

What followed was the full review cascade.

---

## The Cascade

### Step 1: Epic-Level Evaluation

The review started by fetching the epic and evaluating it against two criteria sets:

**Common cross-cutting criteria** (applied to every issue type in solo mode):

| Criterion | Result | Detail |
|-----------|--------|--------|
| Title clear and descriptive | PASS | "Epic: Seamless Deployment Platform Integration" — specific, scoped, actionable |
| AC present and testable | PASS | 5 success criteria with measurable targets (8 recipes, 4 skills, 4 platforms) |
| Labels correct | PASS | `epic` label matches content |
| Scope boundaries defined | PASS | Explicit 4-platform scope with three-layer architecture |
| Success criteria measurable | PASS | Quantitative thresholds throughout (8, 4, end-to-end) |
| Issue actionable | PASS | 10 sub-issues decomposed with clear work boundaries |
| Test coverage proportionate | PASS | Every sub-issue includes TDD test case skeletons |

**Epic-specific criteria** (additional checks for epics only):

| Criterion | Result | Detail |
|-----------|--------|--------|
| Sub-issues exist | PASS | 10 sub-issues (#1609–#1618), 0/10 complete |
| Scope description present | PASS | Three-layer integration model documented |
| Success criteria defined | PASS | 5 bullet points under "Success Criteria" |
| Dependencies between sub-issues | FAIL | No inter-story dependency annotations found |
| Construction context | N/A | No Construction files linked to these issues |

One failure out of eleven checks. We'll come back to that.

### Step 2: Recursive Sub-Issue Review

After the epic-level evaluation, the cascade moved into each of the 10 sub-issues. Every story was fetched and evaluated against story-specific criteria:

| # | Story | Format | AC | Testable | Template | Test Coverage | Solution |
|---|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| #1609 | Recipe Category & Source Files | PASS | PASS (5) | PASS | PASS | PASS | WARN |
| #1610 | Registry Integration | PASS | PASS (5) | PASS | PASS | PASS | WARN |
| #1611 | Vercel Deployment Skill | PASS | PASS (5) | PASS | PASS | PASS | WARN |
| #1612 | Railway Deployment Skill | PASS | PASS (5) | PASS | PASS | PASS | WARN |
| #1613 | Render Deployment Skill | PASS | PASS (5) | PASS | PASS | PASS | WARN |
| #1614 | DigitalOcean Deployment Skill | PASS | PASS (5) | PASS | PASS | PASS | WARN |
| #1615 | Register Skills in Registries | PASS | PASS (7) | PASS | PASS | PASS | WARN |
| #1616 | Charter Inception | PASS | PASS (7) | PASS | PASS | PASS | WARN |
| #1617 | Update Documentation | PASS | PASS (4) | PASS | PASS | PASS | WARN |
| #1618 | E2E Verification | PASS | PASS (6) | PASS | PASS | PASS | WARN |

Every story passed its structural criteria — user story format, acceptance criteria present and testable, canonical template, test coverage. The one column lit up with warnings was "Proposed Solution": all 10 stories were missing one. This triggered the auto-generation step.

### Step 3: Codebase Exploration

Before generating proposed solutions, the review scanned the actual codebase to understand existing patterns. This wasn't template boilerplate — it was informed by reading real files:

- `.claude/recipes/ci/` — existing recipe file structure and YAML frontmatter conventions
- `Skills/codebase-analysis/` — existing skill directory layout and `SKILL.md` format
- `.claude/metadata/extension-points.json` — 72 extension points across 15 commands
- `.claude/metadata/extension-recipes.json` — recipe registry schema with 6 existing categories
- `.claude/metadata/recipe-tech-mapping.json` — tech detection mapping pattern
- `.claude/metadata/skill-keywords.json` — keyword-to-skill mapping structure
- `.claude/scripts/framework/constants.js` — `ALL_SKILLS` array (23 skills at time of review)
- `.claude/commands/charter.md` — charter inception flow, skill discovery, complexity questions
- `Skills/MAINTENANCE.md` — skill registry table format

This exploration informed every proposed solution. When the solution for #1611 (Vercel skill) said "create `Skills/vercel-project-setup/` with `SKILL.md`, `LICENSE.txt`, `resources/vercel.json`", that structure came from observing how existing skills like `codebase-analysis/` were organized — not from a generic template.

### Step 4: Auto-Generated Proposed Solutions

Each story received a concrete `### Proposed Solution (Auto-Generated)` section written directly into its issue body. These weren't vague — they specified file paths, naming conventions, registry entries, and implementation steps based on the codebase scan.

For example, #1615 (Register Skills in Registries) specified:
- Add `digitalocean-app-setup`, `railway-project-setup`, `render-project-setup`, `vercel-project-setup` to `ALL_SKILLS` in `constants.js` (alphabetical order)
- Add keyword mappings plus a `deployment-platforms` group keyword to `skill-keywords.json`
- Add 4 registry rows to `Skills/MAINTENANCE.md`
- Create 4 `.zip` packages in `Skills/Packaged/`
- Update skill counts in documentation: 23 → 27

And #1616 (Charter Inception) specified exactly where in the charter flow to add the deployment platform question, what detection heuristics to use (web framework indicators, Docker presence, project description keywords), what skip conditions to apply, and how to wire the answer to `framework-config.json`.

### Step 5: Body Updates

After generating solutions, the review updated all 11 issue bodies:

- **10 sub-issues** — each received the proposed solution section and a `**Reviews:** 1` counter
- **Epic #1608** — received a `**Reviews:** 1` counter

The body edits used the export-edit-import pattern: `gh pmu view N --body-stdout > .tmp-N.md`, modify with Write tool, then `gh pmu edit N -F .tmp-N.md`. Temp files cleaned up immediately after.

### Step 6: Review Comment and Label

A structured review comment was posted to #1608 containing:
- Review number and date
- All findings from the epic-level and sub-issue evaluations
- The sub-issue summary table (now showing all proposed solutions as "Auto-generated")
- Construction context results (none found)
- A recommendation: **"Needs minor revision"**

The `pending` label was applied, reflecting the recommendation.

---

## The Dependency Gap

The single FAIL finding — and the reason the recommendation was "needs minor revision" rather than "ready" — was about dependencies between sub-issues.

All 10 stories referenced `**Parent Epic:** #1608`, but none referenced sibling stories. No `Refs #`, `Depends on #`, or `Blocks #` patterns existed between them. The review identified three logical dependency chains that were implicit but not documented:

1. **#1609** (recipes) and **#1611–#1614** (skills) must complete before **#1610** (registry integration) and **#1615** (skill registration) — you can't register things that don't exist yet
2. **#1615** (registration) must complete before **#1617** (documentation updates) — documentation needs accurate counts
3. **All prior stories** must complete before **#1618** (E2E verification) — you can't verify end-to-end what hasn't been built

In solo mode, this is a warning rather than a blocker. The developer knows the sequence from the PRD's story numbering, and the `/work` command's epic processor defaults to ascending numeric order — which happens to be correct here. But documenting dependencies explicitly makes the ordering resilient to future story additions or reordering.

The fix is small: add `**Depends on:**` annotations to the sub-issues that have upstream dependencies. A few lines of metadata that formalize what the PRD numbering implies.

---

## The Resolution

With the review posted and the `pending` label applied, the next step was:

```
/resolve-review 1608
```

The `/resolve-review` command fetched the latest review comment, parsed its findings, and classified each one. Out of 11 criteria, only the dependency gap needed action — everything else was already passing.

**Classification:** Body-modifying auto-fix. The review comment had already identified the three dependency chains, so `/resolve-review` proposed the specific annotations:

| Sub-Issue | Annotation Added |
|-----------|-----------------|
| #1610 (Registry Integration) | `**Depends on:** #1609, #1611, #1612, #1613, #1614` |
| #1615 (Register Skills in Registries) | `**Depends on:** #1609, #1611, #1612, #1613, #1614` |
| #1617 (Update Documentation) | `**Depends on:** #1615` |
| #1618 (E2E Verification) | `**Depends on:** #1609, #1610, #1611, #1612, #1613, #1614, #1615, #1616, #1617` |

Issues #1609, #1611–#1614, and #1616 received no annotations — they're leaf work with no upstream dependencies.

After confirming the change, `/resolve-review` updated the 4 sub-issue bodies and re-ran `/review-issue 1608` automatically.

---

## Review #2: Confirmation

The re-review ran the full cascade again. This time:

- **All 11 epic-level criteria passed** — including the dependency check, which now found `**Depends on:**` annotations in 4 sub-issue bodies
- **All 10 sub-issues passed** — proposed solutions still present, story format intact, TDD skeletons unchanged
- **Review counters incremented** — all 11 issues went from `**Reviews:** 1` to `**Reviews:** 2`
- **Recommendation:** **"Ready for work"**
- **Label swap:** `pending` removed, `reviewed` applied — propagated to all 10 sub-issues

The difference between Review #1 and Review #2 was exactly what you'd expect from a follow-up review: no new proposed solutions needed (they already existed), no codebase exploration needed (patterns hadn't changed), just a clean verification pass confirming the one finding was resolved.

---

## What the Developer Gets

After two reviews, each of the 10 stories now has four things it didn't have before the review cycle:

1. **TDD test skeletons** — already present from `/create-backlog`, providing the RED phase starting point
2. **A proposed solution** — auto-generated from codebase exploration, providing file paths, naming conventions, and implementation steps grounded in existing patterns
3. **Explicit dependencies** — `**Depends on:**` annotations that formalize which stories must complete first
4. **A review counter and label** — `**Reviews:** 2` and the `reviewed` label, telling `/work` this story has been through the full review gate

When the developer runs `/work #1611`, the TDD cycle starts with a test skeleton *and* an implementation plan that already knows the skill directory should be named `vercel-project-setup`, should follow the structure of existing skills, and should include specific environment variables. The developer evaluates the proposed solution, adjusts if needed, and builds. The gap between "what should I do?" and "doing it" is nearly eliminated.

---

## The Numbers

| Metric | Review #1 | Full Cycle |
|--------|-----------|------------|
| Epic-level criteria evaluated | 11 | 11 |
| Sub-issues reviewed | 10 | 10 |
| Per-story criteria checked | 70 | 70 |
| PASS findings | 80 | 81 |
| FAIL findings | 1 | 0 |
| Proposed solutions generated | 10 | 0 (already present) |
| Issue bodies updated | 11 | 15 (4 deps + 11 counters) |
| Codebase files scanned | 10 | 0 (not needed) |
| Review recommendation | Needs minor revision | Ready for work |

---

## Takeaways

**Reviews are not just validation — they're enrichment.** The review didn't just check boxes. It explored the codebase, generated 10 concrete implementation plans, and wrote them directly into the issue bodies. The stories were better artifacts after the review than before it.

**The dependency check catches what PRD tooling doesn't encode.** A PRD naturally expresses stories in sequence, and `/create-backlog` preserves that ordering in issue numbers. But issue numbers aren't dependencies — they're accidents of creation order. The review's dependency check surfaces the gap between implicit ordering and explicit engineering.

**Auto-generated solutions are codebase-aware, not generic.** The review read actual recipe files, actual skill directories, actual registry schemas. When it said "add to `ALL_SKILLS` in `constants.js`," it knew the array existed, knew it contained 23 entries, and knew the convention was alphabetical ordering. This is the difference between a proposed solution that says "register the skill" and one that says "add `vercel-project-setup` after `typescript-setup` in the alphabetically-ordered `ALL_SKILLS` array in `.claude/scripts/framework/constants.js`."

**The resolve-review cycle closes the loop.** Review #1 found a gap. `/resolve-review` parsed the finding, classified it as an auto-fixable body modification, applied `**Depends on:**` annotations to 4 sub-issues, and triggered Review #2 — which confirmed the fix and upgraded the recommendation from "Needs minor revision" to "Ready for work." The `pending` → `reviewed` label swap happened automatically. Total human input during resolution: one confirmation click.

**Follow-up reviews are lighter by design.** Review #1 did the heavy lifting: 10 proposed solutions generated, 10 codebase files scanned, 11 bodies updated. Review #2 verified the fix and incremented counters — no codebase exploration, no solution generation. The review system is front-loaded: first reviews are exhaustive, subsequent reviews are confirmatory.
