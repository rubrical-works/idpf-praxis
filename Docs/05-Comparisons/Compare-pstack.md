# IDPF and pstack: Process Framework vs. Engineering-Rigor Skill Pack

**Date:** 2026-10-17
**Compared against:** pstack in `cursor/plugins` at `0317eb8b` (README, `skills/`, `agents/`, `docs/harness/claude-code.md`, four `poteto-mode` playbooks); IDPF framework 0.108.0
**Counts verified:** 2026-10-17 (pstack counts from its tree at the pinned commit; IDPF counts from disk)
**Topic:** What pstack offers, where it overlaps IDPF, where the two disagree, and what IDPF has taken from it

---

## The Short Answer

pstack is a collection of habits for a single agent; IDPF is a process for a unit of work. pstack makes one agent work carefully: understand first, design twice, prove the result on the real artifact, and write less. IDPF decides which work happens, when it is reviewed, and when it is allowed to close.

The overlap is in verification and evidence, and that is where pstack is strongest. The disagreements are about human checkpoints and planning, and those are deliberate on both sides.

---

## What pstack Is

pstack is a Cursor plugin by Lauren Tan (MIT). At the pinned commit it holds about 60 skills:

- **`poteto-mode`**: a router that matches a task to one of 23 playbooks (bug fix, perf, feature, refactoring, babysit, shipping, orchestrate, session pickup, pause safely, eval and others), opens a todo list from the playbook's steps, and calls other skills as the steps need them.
- **24 principle skills**: one page each, such as Laziness Protocol, Attack the Premise, Prove It Works, Explain the Number and Encode Lessons in Structure.
- **Situational skills**: `how`, `why`, `architect`, `arena`, `swarm`, `interrogate`, `blast-radius`, `correct`, `reflect`, `recall`, `show-me-your-work`, `benchmark-checklist`, `create-verification-skill`, `unslop`, `technical-writing` and others.
- **Two subagents** (`poteto-agent`, Comment Sicko) and a dormant Cursor-only automation pack (`benny`).

Many skills route work to more than one model family (Opus for judgment, Grok for code by default). A Claude Code adapter maps Cursor tool names onto Claude Code's, but notes that non-Claude model slugs fall back to the session model.

---

## Side by Side

| Dimension | pstack | IDPF |
|---|---|---|
| **Governs** | How one agent approaches a task | How a unit of work moves from issue to release |
| **Entry point** | `/poteto-mode` picks a playbook | `/work #N` runs gates over an issue |
| **Human checkpoints** | Minimized: "never block on the human"; confirm only irreversible actions | Central: analysis STOPs, STOP boundaries, issues close only on "done" |
| **Planning** | "The best spec is code"; no planning skills by default | Proposal → PRD → backlog → stories |
| **Verification** | Prove it on the real artifact; evidence ladder in `blast-radius`; `create-verification-skill` | TDD per acceptance criterion; full-suite sweep; QA sub-issues; claim labeling |
| **Decision record** | `show-me-your-work` TSV log, audited against the transcript | `Refs #N` commits, issue bodies, Construction/ documents |
| **Comments** | `no-comments` strips them before review | Long rationale blocks kept on purpose in rules and specs |
| **Models** | Multi-vendor by design | Claude Code models only |

---

## Where They Agree

- **Encode lessons in structure.** pstack's principle says to turn a recurring correction into a lint, flag, check or script rather than more text. IDPF's guard tests and validator scripts follow the same rule.
- **Prove it on the real artifact.** pstack's Prove It Works and IDPF's "Ground in file state" (re-read each modified file before checking its criterion) both reject self-reports.
- **State what was not checked.** pstack's verdicts include `INCONCLUSIVE` and "unproven"; IDPF's claim labeling requires `unverifiable` and `skipped`.

---

## Where They Disagree

- **Never block on the human** directly contradicts IDPF's STOP boundaries and the analysis-mode halt. Inside IDPF, pstack's autonomy has to stop where an IDPF command says STOP.
- **No comments** contradicts IDPF's habit of keeping the reasoning next to the rule, so a decision is not argued again later.
- **No planning** contradicts IDPF's proposal and PRD chain. pstack's view fits small, reversible work; IDPF's fits work that crosses sessions and contributors.

---

## What IDPF Is Taking

Five enhancements were filed from this comparison:

| Issue | Taken from | What it adds |
|---|---|---|
| #3070 | `/correct` | An audit pairing every auto-loaded rule with what enforces it |
| #3071 | `blast-radius` | Evidence levels for `verified` claims (asserted → cited → reasoned → executed → reproduced) |
| #3072 | `create-verification-skill` | A generated project-local verification skill that `/qa` and host-process mode can drive |
| #3073 | `show-me-your-work` | A decision log for `/work --nonstop`, verified at Step 6a |
| idpf-skills-dev#352 | `principle-attack-the-premise` | A failure-recovery trigger after two fixes on one premise fail the same gate |

Considered and not filed: `interrogate` (multi-model review; most of its value comes from vendor diversity Claude Code does not have), `reflect`, `pause-safely` (its `wip:` commit conflicts with `Refs #N` attribution), and `unslop` (useful, but bans the em dashes IDPF's house style uses).

Not comparable rather than not taken: pstack's `swarm` skill fans a task out across agents and merges what comes back. IDPF's `/work --concurrent` also runs members in parallel, but only those with disjoint declared scopes, keeps every gate per member, and merges each back through a review gate; the orchestrator never judges, it only schedules. The two share a word and little else.

---

## Summary

| If you need… | Reach for |
|---|---|
| One agent working carefully, with minimal interruption | pstack |
| Traceable, gated work across sessions and contributors | IDPF |
| Both | IDPF's gates, with pstack's evidence habits adopted inside them |

---

**End of Comparison**
