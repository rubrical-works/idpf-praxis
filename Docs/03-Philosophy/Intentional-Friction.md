# IDPF Intentional Friction

**Date:** 2026-02-08
**Topic:** Why every gate, boundary, and checkpoint in IDPF exists — and what goes wrong without them

---

## The Objection

> This is too many steps. I just want to write code. Why do I need a proposal, a review, a PRD, a backlog, a branch, an assignment, *and then* permission to start working? Why can't I just tell the AI what to build?

This is a reasonable reaction. The IDPF pipeline — charter, proposal, review, PRD, backlog, branch, assign, work, done, release — looks heavy. Seventeen steps from idea to shipped code. Every command ends with STOP. Every issue needs a branch assignment. Every review asks subjective questions one at a time.

The friction is real. It is also deliberate.

---

## The Core Problem IDPF Solves

AI assistants are eager. Given an idea, they will immediately begin implementing it. Given a half-formed requirement, they will fill in the gaps with plausible-sounding assumptions. Given an ambiguous instruction, they will pick the interpretation that lets them produce the most output.

This eagerness is the AI's greatest strength and its most dangerous quality. An AI assistant can write 500 lines of code in seconds — but if those 500 lines implement the wrong thing, or implement the right thing in the wrong way, or implement something nobody asked for, the speed becomes a liability. You now have 500 lines to review, debug, and potentially revert.

**Without friction, the cost of starting work is near zero. But the cost of *wrong* work is not.**

IDPF's friction exists to make the cost of starting work non-zero — specifically, to force clarity, verification, and explicit human consent before the AI's eagerness is unleashed on your codebase.

---

## Every Friction Point Prevents a Specific Failure

### 1. Mandatory Charter

**The friction:** You cannot start a session without a charter. If `CHARTER.md` is missing or contains template placeholders, the assistant will not proceed until you configure one.

**What it prevents:** Building without knowing what you're building. Without a charter, the assistant has no vision statement to check proposals against, no tech stack to constrain architecture decisions, no scope boundaries to prevent feature creep. Every subsequent command becomes unanchored — the assistant will make reasonable-sounding decisions that may contradict your actual intent, and you won't notice until much later.

**The expensive alternative:** Discovering after three sprints that the AI chose a database you didn't want, structured the project around assumptions you never validated, or built features outside your intended scope.

---

### 2. Proposal Before Implementation

**The friction:** Ideas go through `/proposal` before anyone writes code. The proposal creates a document and a tracking issue, then STOPs.

**What it prevents:** Premature implementation. An AI assistant given "add dark mode" will immediately start writing CSS variables, theme providers, and toggle components. But you may have meant "evaluate whether dark mode is feasible given our design system." Or "write up what dark mode would require so I can estimate it." Or "add a dark mode setting that saves to user preferences but doesn't actually theme anything yet."

The proposal forces the idea into a written form that can be reviewed, questioned, and refined *before* a single line of code exists. This is cheap. Rewriting a paragraph costs nothing. Rewriting an implementation costs everything.

**The expensive alternative:** The AI builds dark mode over 4 hours. You review the PR and realize it doesn't match your design system, uses the wrong theming approach, and touches files you didn't want modified. The AI "helpfully" refactors — introducing new assumptions — and you spend another 2 hours reviewing the revision.

---

### 3. Review Gates

**The friction:** Proposals go through `/review-proposal`. PRDs go through `/review-prd`. Issues go through `/review-issue`. Each asks subjective evaluation questions one at a time, produces structured findings, and recommends whether the artifact is ready.

**What it prevents:** Garbage in, garbage out. A poorly-defined proposal becomes a vague PRD becomes ambiguous acceptance criteria becomes code that technically passes its tests but doesn't solve the actual problem.

Reviews catch this at the cheapest possible moment. Finding that a proposal has unclear scope costs 5 minutes of Q&A. Finding that an implementation has unclear scope costs hours of rework.

**Why one question at a time:** AI assistants, when given a list of subjective questions, will answer all of them without pausing. They'll rate their own work favorably, skip past ambiguity, and produce a clean-looking review that masks real issues. Asking one at a time forces the human into the evaluation loop at each decision point. The human is the quality gate; the review process ensures they actually engage rather than rubber-stamp.

**The expensive alternative:** The PRD says "the system should handle edge cases appropriately." This becomes an acceptance criterion. The AI writes edge case handling that seems reasonable to it but doesn't match what you meant. The tests pass. The behavior is wrong. Nobody catches it until production.

---

### 4. Branch Assignment Before Work

**The friction:** You cannot `/work` an issue until it is assigned to a branch via `/assign-branch`. The assistant will refuse and tell you to assign first.

**What it prevents:** Orphaned work. Code written without a branch assignment has no release vehicle. It sits on whatever branch the developer happened to be on, disconnected from any tracker. When release time comes, there's no way to know which issues belong to which branch, which work is complete, or what should be included.

Branch assignment also prevents cross-contamination. If you're working on `release/v2.0` and pick up a bug that belongs on `patch/v1.5.1`, the assignment check catches this before you commit to the wrong branch.

**The expensive alternative:** You merge your release branch and discover it contains a half-finished feature that was never supposed to ship. Or worse: a completed feature that *was* supposed to ship on a different branch is missing, and you don't notice until after tagging.

---

### 5. STOP Boundaries

**The friction:** Most commands end with an explicit STOP. `/proposal` creates an issue and stops. `/work` moves the issue to `in_review` and stops. `/done` moves to `done` and stops. The assistant will not cross these boundaries without explicit instruction.

**What it prevents:** Runaway execution. Without STOP boundaries, an AI assistant will chain actions: create a proposal → immediately start implementing it → commit → push → create a PR → merge it. Each step seems like the "helpful next thing." The result is that the user loses control of the process.

STOP boundaries are the mechanism that keeps the human in the decision loop. After each major transition, the user decides whether to proceed, pivot, or stop entirely. This is not a formality — it is the primary control surface.

**Why this matters more for AI than for human developers:** A human developer naturally pauses between steps. They think, check their work, get coffee. An AI assistant has no natural pause points. Without explicit STOP boundaries, it will execute the entire pipeline in a single breath, producing a completed but possibly wrong result that is harder to undo than to prevent.

**The expensive alternative:** The assistant "helpfully" closes your issue because the acceptance criteria technically pass, even though you wanted to inspect the implementation first. Or it creates a PR and merges it before you've reviewed the code. Each action is individually reasonable; the chain is catastrophic.

---

### 6. Acceptance Criteria Verification

**The friction:** Before moving an issue from `in_progress` to `in_review`, the `/work` command checks every acceptance criterion. If a criterion cannot be verified by the AI, it STOPS and asks the user how to proceed.

**What it prevents:** "Done" meaning "I stopped working." Without explicit AC verification, the assistant declares completion based on its own assessment of whether the code is sufficient. But the acceptance criteria are the *user's* definition of done, not the AI's. The verification step forces alignment between what was requested and what was delivered.

The STOP on unresolvable criteria is particularly important. Some acceptance criteria require human judgment ("the UI feels responsive"), external action ("deploy to staging and verify"), or domain knowledge the AI lacks. The framework does not allow the assistant to silently skip these or mark them complete on your behalf.

**The expensive alternative:** The assistant marks all criteria as met, moves to done, and you discover during release that criterion 4 ("works with screen readers") was never actually tested — the assistant assumed its code would be accessible because it followed general patterns.

---

### 7. "Done" Requires Explicit Trigger

**The friction:** Issues do not close automatically. The assistant will not move an issue to `done` unless you explicitly say "done" or run `/done`. GitHub's auto-close on merge is deliberately bypassed during active work by using `Refs #N` instead of `Fixes #N`.

**What it prevents:** Premature closure. An issue that auto-closes when code merges may not actually be complete — the code might need verification, the documentation might need updating, or the user might want to inspect the result before calling it done. The explicit trigger ensures that "done" reflects the user's judgment, not the CI pipeline's.

**The expensive alternative:** Three issues auto-close on merge. Two of them had remaining work. The project board shows them as done. Nobody notices until the sprint retrospective, when someone asks why the feature doesn't fully work despite all issues being closed.

---

### 8. Analysis vs. Work Hard Stop

**The friction:** When you say "evaluate issue #42" or "analyze this bug," the assistant will investigate, report findings, and then STOP with "Analysis complete. Say 'work' to implement." It will not begin fixing the bug, even if the fix is obvious.

**What it prevents:** Evaluation becoming implementation without consent. "Check if this function handles null inputs" should produce an analysis, not a rewritten function. The distinction matters because analysis is read-only and reversible; implementation is not.

This is especially critical when the user is triaging multiple issues. "Evaluate #42, #43, and #44" should produce three analyses, not three implementations. Without the hard stop, an eager assistant will "helpfully" fix each issue as it evaluates it, potentially making conflicting changes across issues that haven't been prioritized.

**The expensive alternative:** You ask the assistant to "look at issue #42." It reads the issue, determines the fix is straightforward, implements it, commits, and moves the issue to in_review — all without asking. The fix introduces a regression in an area you hadn't considered. You now have to undo work you never authorized.

---

### 9. Sequential Sub-Issue Processing

**The friction:** When working an epic, each sub-issue goes through its own full cycle: in_progress, implementation, AC verification, in_review, STOP. The next sub-issue does not begin until the user says "done" for the current one.

**What it prevents:** Batch processing that loses individual quality. An AI assistant, given 5 stories under an epic, will try to implement all 5 in a single pass. This produces code that "addresses all stories" but may cut corners on individual acceptance criteria, miss interactions between stories, or create technical debt by optimizing for batch completion rather than per-story correctness.

The per-issue STOP boundary ensures that each story receives full attention: its own TDD cycle, its own AC verification, its own user review. This is slower. It is also how you catch the story that looks complete but isn't.

**The expensive alternative:** The assistant processes 5 stories in batch. Stories 1-3 are solid. Story 4 has a subtle bug that only manifests in combination with story 3. Story 5's acceptance criteria were reinterpreted to make the batch implementation easier. You discover this after all 5 are marked done, and untangling the interleaved changes is harder than implementing them sequentially would have been.

---

### 10. Commit Message Discipline

**The friction:** During active work, commits use `Refs #N` (non-closing references). Only after `/done` are closing keywords (`Fixes #N`) permitted.

**What it prevents:** Accidental issue closure via GitHub's auto-close feature. A commit with "Fixes #42" in the message will close issue #42 when merged — even if the fix is incomplete, the PR hasn't been reviewed, or the issue has remaining work.

This seems like a minor style preference. It is not. In a project with dozens of issues across multiple branches, an accidentally-closed issue is a silent tracking failure. The project board shows it as done. The branch tracker counts it as complete. Nobody reviews it again. The gap surfaces later, usually at the worst time.

**The expensive alternative:** A mid-development commit says "Fixes #42 - add input validation." The PR is merged to close a different issue. #42 auto-closes. The remaining work on #42 (error message localization, edge case handling) is forgotten. The release ships with partial input validation.

---

## The Pattern Behind the Friction

Every friction point in IDPF follows the same structure:

1. **A natural AI behavior** (eagerness, helpful continuation, optimistic assessment)
2. **A failure mode** that behavior produces when unchecked
3. **A gate** that forces a pause, a verification, or a human decision

The gates are not designed for human developers working alone. A developer who understands their codebase, has long-term memory, and naturally pauses between steps doesn't need most of these checks. The gates are designed for **AI-assisted development**, where the assistant is powerful, fast, and context-limited — a combination that produces high-quality output when guided and expensive errors when not.

This is not a novel principle. It appears everywhere in engineering:

| Domain | Friction | Prevents |
|--------|----------|----------|
| Aviation | Pre-flight checklists | Skipping critical checks under routine familiarity |
| Surgery | Surgical timeouts | Operating on wrong site, wrong patient |
| Nuclear power | Two-person rule | Single-point-of-failure decisions |
| Software | Code review | Bugs passing from author's blind spots to production |
| Finance | Dual authorization | Unauthorized transactions |

In each case, the friction is cheap relative to the failure it prevents. A 2-minute surgical timeout versus a wrong-site operation. A branch assignment check versus orphaned code in a release. A STOP boundary versus unauthorized implementation.

---

## When to Skip the Friction

IDPF includes escape hatches. Not every piece of work needs the full pipeline:

- **`/bug` and `/enhancement`** skip the proposal/PRD stages for focused, well-defined work
- **Patch branches** skip the proposal stage for urgent fixes
- **Manual overrides** ("don't create an issue", "keep the issue open") bypass specific gates when the user explicitly instructs
- **`--force` flags** on commands like `/gap-analysis` skip staleness checks

The framework trusts the user to know when friction is unnecessary. What it does not trust is the *absence of a decision*. Skipping a gate is fine; not knowing the gate exists is where errors happen.

---

## The Real Cost of No Friction

The alternative to intentional friction is not "no friction." It is **unintentional friction** that arrives later, costs more, and is harder to diagnose:

| Intentional Friction (IDPF) | Unintentional Friction (No Framework) |
|------------------------------|---------------------------------------|
| 30-second proposal review | 3-hour rewrite of wrong implementation |
| STOP boundary after work | Debugging why auto-closed issue isn't actually done |
| Branch assignment check | Release missing features from wrong branch |
| AC verification before in_review | Production bug from unverified acceptance criteria |
| One subjective question at a time | Rubber-stamped review that missed real issues |
| Commit message discipline | Accidentally closed issue lost in project board |

The friction isn't additional cost. It is cost moved earlier in the process, where it is cheaper to pay. This is the shift-left principle applied not just to testing, but to the entire development lifecycle.

---

## Summary

IDPF is not heavy because it was designed by people who like process. It is heavy because it was designed for a collaboration model — human and AI — where the AI partner is simultaneously the fastest coder you've ever worked with and a context-limited system that will confidently do the wrong thing if you don't tell it when to stop.

Every gate exists because, at some point, an AI assistant without that gate produced an error that was more expensive to fix than the gate would have been to enforce. The framework is the accumulated result of those lessons.

The friction is the feature.

---

**End of IDPF Intentional Friction**
