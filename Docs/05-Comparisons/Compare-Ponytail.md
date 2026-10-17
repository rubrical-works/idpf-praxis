# IDPF and Ponytail: Process Framework vs. Code-Restraint Prompt

**Date:** 2026-10-17
**Compared against:** Ponytail `DietrichGebert/ponytail` 5.3.2 at `16352ac2` (README, `skills/`, `hooks/`, `benchmarks/`) and the project site, ponytail.dev; IDPF framework 0.107.1
**Counts verified:** 2026-10-17 (IDPF counts from disk; Ponytail figures as displayed on its GitHub page that day)
**Topic:** What each project governs, where they overlap, where they disagree, and whether they can run together

---

## The Short Answer

They work at different layers, so it is a mistake to treat them as competitors.

- **Ponytail governs the diff.** It is one prompt that changes *what code the agent writes*: less of it, reuse first, no speculative abstractions, and a short note on what was skipped.
- **IDPF governs the work.** It is a process framework that controls *how a piece of work moves*: issue, review, branch, TDD per acceptance criterion, commit attribution, review, release. Beyond the GREEN phase's YAGNI guidance, it says little about how much code to write.

Ponytail is about how big a change should be. IDPF is about how a change should move from start to finish. Each has a small, real overlap with the other and one real point of conflict (testing), covered below.

---

## What Ponytail Is

Ponytail calls itself a skill that "makes your AI agent think like the laziest senior dev in the room." Its core is a single file, `skills/ponytail/SKILL.md`, plus a compact `AGENTS.md` for agents that only read a rules file. In the README's words, everything else in the repository "loads that prompt into different agents."

**The decision ladder.** Before writing code, the agent takes the first option that fully works:

1. Does it need to exist? Skip features nobody asked for, and name them in one line.
2. Does the codebase already have a helper, component or pattern? Use it.
3. Is there a standard-library or platform feature? Use it.
4. Is there an installed dependency? Use it. Never add a dependency to save a few lines.
5. Can it be one line a reader understands at a glance?
6. Otherwise, write the minimum code that works.

The project's own sources disagree on the count. ponytail.dev describes **seven** steps: "use the platform" is separate from "use the standard library", and the last step reads "the minimum, plus a test if there is logic". The six rungs above are from `SKILL.md`, the prompt the agent actually loads. The order and intent are the same in both.

**Never cut:** validation at trust boundaries, error handling that prevents data loss, security, accessibility, and anything the user asked for. The stated principle is "Lazy, not negligent."

**Levels:**
- `lite` builds what was asked and names a smaller option.
- `full` (the default) applies every rule.
- `ultra` also challenges the request before building.

**Other surfaces:**
- Commands: `/ponytail-review` for a diff, `/ponytail-audit` for a whole repository, `/ponytail-debt`, `/ponytail-gain` and `/ponytail-help`.
- Lifecycle hooks, with configurations for Claude Code, Codex, Cursor, Copilot and Qoder. In Claude Code they inject the prompt at session start, track the active level on each prompt, and inject it again into every spawned subagent through a `SubagentStart` hook, because session-start context reaches only the parent thread.
- A Claude Code status band showing cost, tokens, reuse and test status.
- A local board that shows sessions across projects.

**Reach.** Ponytail ships as a Claude Code and Codex plugin marketplace entry, an npm package (`@dietrichgebert/ponytail`), and per-tool rules files. The README claims support for 20 agents, including Cursor, Windsurf, Cline, Copilot, Gemini, OpenCode and Kiro. It is MIT-licensed, with roughly 165.6k stars and 355 commits on `main` as displayed on 2026-10-17.

**Reported results.** These are the author's numbers and have not been reproduced here. The method is in `benchmarks/results/2026-10-07-agentic.md`: 39 agentic tasks on Opus 5.5 at default effort, in Claude Code CLI 2.1.288, with 5 runs per task and arm, for 585 sessions in total. Compared with no skill, Ponytail 5 reports:
- 53% less code, 45% fewer tokens, 26% lower cost and 41% less time
- hidden checks passed: 97% vs. 96%
- risky logic shipped with a test: 98% vs. 68%

Against the previous version (v4.13), the gains are smaller: 10.8% lower cost and 8.6% less code. The token and time differences have confidence intervals that include zero. A blind judge of reply quality preferred Ponytail 5 to v4.13, but found no significant difference against no skill.

**Review claims.** ponytail.dev reports that `/ponytail-review` found 100% of planted problems, against 87% without Ponytail, and 100% of problems outside the diff, against 78%. These figures appear on the site but not in the agentic benchmark file above, so their method is not documented in the sources reviewed here.

The benchmark notes (`benchmarks/README.md`) are unusually candid about their limits. They call the earlier single-shot figures an overstatement, say to treat cost as "generation numbers, not a session-cost promise," and report that Ponytail "can also raise tool calls and cost on completion-forced tasks."

---

## What IDPF Is

IDPF is a process framework for Claude Code, distributed through Praxis Hub Manager. As of this writing it ships:
- 1 process framework (IDPF-Agile)
- 58 slash commands, 46 of them deployed to user projects
- 9 auto-loaded rules
- 11 domain knowledge libraries
- 17 domain specialist files

All work flows through GitHub issues on a project board managed by `gh pmu`. Work is gated: review state is checked before work begins, there is a TDD cycle and a commit for each acceptance criterion, scope drift is checked against the files the issue declared, acceptance criteria are verified from file state, and a STOP boundary means the issue closes only when the user says "done."

The philosophy is documented in [Intentional Friction](../03-Philosophy/Intentional-Friction.md), [Finite Context Windows](../03-Philosophy/Finite-Context-Windows.md) and [Why Task Lists](../03-Philosophy/Why-Task-Lists.md).

---

## Side by Side

| Dimension | Ponytail | IDPF |
|---|---|---|
| **Governs** | The size and shape of the code the agent writes | The lifecycle of a unit of work, from issue to release |
| **Core artifact** | One prompt (`SKILL.md`) | Rules, command specs, scripts, metadata registries |
| **Unit of work** | One reply or diff | One GitHub issue and its acceptance criteria |
| **State** | Status band and session board (`~/.config/ponytail/band/`) | GitHub project board, issue bodies, `Refs #N` commits, task list |
| **Testing stance** | "One small test" for risky logic (branches, loops, parsers, money, security); trivial changes need none | TDD RED-GREEN-REFACTOR for every acceptance criterion, plus a full-suite sweep before `in_review` |
| **Scope stance** | Build the smallest thing that fully solves the task; skip anything unrequested | Implement **all** specified requirements; no unilateral reduction (STOP → REPORT → ASK → WAIT) |
| **Disclosure** | Every reply ends with what was skipped or unchecked | Claim labeling: state what you deliberately did not check |
| **Review** | `/ponytail-review` (the code a change touches, not only the diff) and `/ponytail-audit` (repository), ranked by priority | `/review-issue` (the issue *before* work), `/code-review` (the code) |
| **Tech debt** | `shortcut: <limit>, <when to upgrade>` comments in the code; `/ponytail-debt` lists them and flags any with no upgrade trigger | Offer to record it in `Construction/Tech-Debt/`, a document separate from the code |
| **Subagents** | Prompt injected into every spawned subagent | No subagent hook; if Ponytail's finding holds, subagents start without IDPF's session-start context (not yet verified for IDPF) |
| **Context cost** | Small: `SKILL.md` is about 3.5 KB | Substantial: the 9 auto-loaded rules total about 147 KB in the development repository (deployed variants differ), plus per-command specs |
| **Agent reach** | 20 agents claimed | Claude Code |
| **Distribution** | Plugin marketplace, npm, copied rules files | Hub install through Praxis Hub Manager, with symlinked and copied directories |
| **Evidence offered** | Published A/B benchmarks with stated limits | Process guarantees, enforced by scripts and tests in the framework |

---

## Where They Agree

**Disclosing what was skipped.** Ponytail ends every reply with "what was skipped or not checked." IDPF's anti-hallucination rules require the same thing: "Verified A and B; did not check C is complete; mentioning only A and B is not." The two projects arrived at this independently, and both reason the same way: a silent omission looks the same as having checked.

**Reuse before writing.** Ponytail's ladder rungs 2–4 (existing helper, standard library, installed dependency) match IDPF's rule to check existing skill and script coverage before writing new automation. IDPF's runtime dependency contract, which forbids undeclared npm packages, is a stricter form of "never add a dependency for a few lines."

**Scope discipline.** Both resist building things nobody asked for. IDPF enforces this mechanically: `scope-drift-check.js` compares the files a change touched against the files the issue declared. Ponytail enforces it in the prompt.

**Never cutting the safety net.** Ponytail's "never cut" list (validation, error handling, security, accessibility) is the same instinct as IDPF's rule that a gate which quietly does nothing is worse than one that fails loudly.

---

## Where They Disagree

**Testing is the real conflict.** Ponytail says trivial changes need no test, and it treats "one small test" as enough for risky logic. IDPF under `verificationMode: automated-tests` requires a failing test *before* the change for every acceptance criterion, whether trivial or not. When both are loaded, the stricter rule has to win, and nothing makes it win automatically. An agent weighing two instructions could follow Ponytail's exemption for trivial changes and skip the RED phase IDPF requires.

**Error handling in the GREEN phase.** IDPF's `tdd-green-phase` guide lists "Adding Error Handling Early" as a mistake: no error handling until a test requires it. Ponytail never cuts error handling that prevents data loss. The two can be reconciled — write the failing test for the data-loss case first — but as written, an agent reading both gets opposite instructions.

**Scope reduction.** Ponytail's `ultra` level "challenges the request" and pushes back on parts the need doesn't justify. This is compatible with IDPF *only* if the challenge is a question, not a decision. IDPF forbids deciding by yourself to defer or simplify an acceptance criterion. Ponytail's `lite` behavior (name the smaller option, let the user choose) is exactly the STOP → ASK pattern IDPF requires. `full` and `ultra` need that same discipline when they run inside an IDPF issue.

**Comment and documentation density.** Ponytail limits comments to one line that explains why. IDPF often keeps long rationale blocks in its rules and reference documents on purpose, so a decision is not argued again. That is a framework-authoring convention, not a rule for user code, so the conflict is narrow. But `/ponytail-audit` run against IDPF's own sources would flag much of it.

---

## Can They Run Together?

In principle, yes. Ponytail loads as a skill or rules file, and IDPF loads as rules and commands, so nothing in either prevents installing both. **This combination has not been tested.** These points come from reading both projects, not from running them together:

- **Precedence is unstated.** Neither project says what happens when its rules collide with another framework's. Testing (above) is the collision that matters.
- **Subagents would see only one of them.** Ponytail re-injects its prompt into every subagent; IDPF does not inject its session-start context. If session-start context does not reach subagents, as Ponytail reports, a subagent spawned in a combined setup would carry Ponytail's restraint rules without IDPF's startup context.
- **Layering is natural.** IDPF decides *which* work happens and *when* it is verified. Ponytail decides *how much code* that work produces. A Ponytail-shaped diff inside an IDPF acceptance criterion is a reasonable result.
- **The benchmarks don't carry over.** Ponytail's figures measure single tasks in headless sessions. An IDPF run adds preambles, gates, board moves and a full-suite sweep, so per-session cost and time would be dominated by process overhead the benchmark never measured.

---

## What IDPF Could Learn

- **Measured claims.** Ponytail publishes A/B numbers along with their limits, and a rule change ships only after it beats the current version in paired headless runs. IDPF's value claims (fewer trainwrecks, better attribution, recoverable compaction) are argued, not measured, and its rule changes are guarded by tests that check wording, not behavior. `/idpf-measure` and `/idpf-stats` measure time and tokens; nothing yet measures whether a rule change improves behavior.
- **A small core.** Ponytail's portability comes from having one small prompt at its center. IDPF's context cost is the trade-off for its guarantees, and [Finite Context Windows](../03-Philosophy/Finite-Context-Windows.md) argues for that trade-off. Ponytail is a reminder that the trade-off is a choice — and nothing in IDPF currently stops a rule from growing.
- **Subagent context.** Ponytail's `SubagentStart` hook addresses a gap Ponytail reports — context injected at session start does not reach spawned agents — that IDPF has not yet checked for itself.
- **Debt at the site.** A `shortcut:` comment naming its limit and upgrade trigger stays with the code it describes; a separate tech-debt document can drift from it.
- **A code-restraint layer.** IDPF's GREEN phase covers YAGNI and the Fake It, Obvious Implementation and Triangulation strategies, but not the order of preference: existing helper, then standard library, then installed dependency, before new code. Ponytail's ladder would fill that gap, provided its testing stance stays out.

---

## Summary

| If you need… | Reach for |
|---|---|
| Smaller, less over-built diffs from any agent | Ponytail |
| Traceable work: issues, reviews, gated TDD, release control | IDPF |
| Both | Layer them, but make IDPF's testing rule explicitly win |

---

**End of Comparison**
