# Context Engineering: The Thin Orchestrator Pattern

**Date:** 2026-02-23
**Counts verified:** 2026-09-10
**Topic:** How IDPF manages context budget through architectural separation, and why this matters more than compression ratios

---

## The Problem Everyone Solves Wrong

Every AI development framework faces the same constraint: the model has a finite context window, and you're competing for space in it. Your framework's instructions, the user's code, conversation history, tool outputs, and the model's own reasoning all draw from the same budget. The more framework overhead you load, the less room the model has to think.

The obvious response is compression. Make the instructions smaller. Strip whitespace. Remove examples. Several frameworks market this as a feature — "70% token reduction" sounds impressive on a README.

But compression is the wrong framing. The question isn't "how small can we make our instructions?" It's "how much of our framework actually needs to be in the model's head at all?"

---

## What Most Frameworks Do

Most AI development frameworks — BMAD, SuperClaude, RIPER, cc-sdd, and others — follow the same pattern: everything goes into markdown.

The command spec contains the workflow steps. It also contains the validation criteria, the decision logic, the configuration data, the examples, and the error handling. When the command runs, the entire markdown file lands in context. A 500-line command spec means 500 lines competing for the model's attention.

This is simple and it works. The model reads the instructions and follows them. But it's expensive, and it scales poorly. Add review criteria? More markdown. Add extension points? More markdown. Add conditional logic for different project configurations? More markdown. The file grows, the context cost grows, and the model has more text to parse before it can start reasoning about the actual task.

Some frameworks respond with compression — running the markdown through a "compression pipeline" to shrink it. This treats the symptom (files are too big) without addressing the cause (too much is in files that the model reads).

---

## What IDPF Does Instead

IDPF separates what the model needs to *think about* from what can be *computed deterministically outside the model*.

### The Three Layers

```
Layer 1: Markdown Command Specs (loaded into context)
  Thin orchestrators. Workflow steps, STOP boundaries,
  decision points, judgment calls.

Layer 2: JavaScript Scripts (executed at runtime, zero context cost)
  Deterministic logic. Git operations, file validation,
  CI monitoring, branch detection, version analysis.

Layer 3: JSON Metadata (structured, queried on demand)
  Configuration data. Review criteria, extension points,
  skill registries, mode mappings.
```

When a command runs, the model loads a lean orchestration spec that says *what to do and when to stop*. The heavy lifting — parsing git history, detecting branch trackers, validating file synchronization, watching CI pipelines — happens in JavaScript. The model doesn't need to reason about how to parse a JSON file or iterate through a directory listing. It tells a script to do it and reads the result.

### A Concrete Example

Consider what happens when the user says `done #42`:

**What most frameworks would put in the command spec:**
- Parse the issue number from arguments
- Query the GitHub API for issue status
- Check if the issue has a branch assigned
- Validate that all acceptance criteria checkboxes are checked
- Detect if any commits reference this issue
- Count files changed and assess whether they're substantive
- Check for uncommitted local changes
- Determine if a branch tracker exists
- Link the issue as a sub-issue of the tracker

**What IDPF's `/done` command spec actually contains:**
- Step 1: Parse arguments (the model does this — it's judgment)
- Step 2: Validate issue (one `gh` command)
- Step 3: Detect status (one `gh pmu` command)
- Step 3b: Diff verification → `node .claude/scripts/shared/done-verify.js --issue $ISSUE`
- Step 4a: Branch tracker linking → `node .claude/scripts/shared/lib/active-label.js`
- Step 5b: CI monitoring → `node .claude/scripts/shared/ci-watch.js`

The verification logic — "are the commits substantive? are there uncommitted changes? is the diff reasonable?" — lives in `done-verify.js`. That's 200+ lines of JavaScript that execute in milliseconds, return a JSON result, and consume zero context tokens. The model reads the result ("Clean: 3 commits, 5 files changed, all substantive") and makes the judgment call to proceed.

### The JSON Externalization Pattern

The same principle applies to configuration data. When `/review-issue` needs to know which criteria to evaluate, it doesn't parse a 50-line inline table from the command spec. It reads from:

- `review-criteria.json` — type-specific criteria (bug, enhancement, story, epic)
- `review-mode-criteria.json` — objective vs. subjective criteria by review mode (solo, team, enterprise)

These are structured data. The model queries what it needs, when it needs it. The rest of the registry sits on disk, not in context.

This pattern was an explicit architectural evolution. The v0.48.0 release moved review criteria out of inline command specs into JSON files. The GitHub-Workflow.md source was cut by 52% by extracting content already covered by command specs. Each extraction reduced context overhead without losing any capability.

---

## Why This Is Not Just "Minimization"

IDPF does minimize its files — the `.min-mirror/` system runs a two-pass process that removes verbose explanations, redundant examples, and formatting overhead while preserving all functional instructions. But minimization is the *least interesting* part of the context engineering.

The interesting part is the separation of concerns:

| What the model needs | Where it lives | Context cost |
|---------------------|----------------|-------------|
| Workflow steps and decision points | Command spec (.md) | ~100-200 lines |
| Deterministic validation logic | Scripts (.js) | Zero |
| Configuration and criteria data | Metadata (.json) | On-demand only |
| Framework quality rules | Rules (.claude/rules/) | Auto-loaded, minimized |
| Process framework (TDD, story lifecycle) | .min-mirror/ | Loaded once at startup |
| Full reference documentation | Overview/, Reference/ | Loaded only when relevant |

Compare this to loading a 500-line monolithic command spec every time the user says "done."

---

## The Tiered Loading Architecture

Beyond the three-layer separation, IDPF manages *when* context gets loaded:

**Always loaded** (auto-loaded by Claude Code):
- `.claude/rules/` — 9 rule files. Anti-hallucination, GitHub workflow, session startup, deployment awareness, Windows shell safety, runtime triggers, task-creation timing, and the two execution rules for `/work` and the review pair. These are the guardrails that must survive context compaction. **This layer has grown substantially — see [When the Principle Bends](#when-the-principle-bends) below.**

**Loaded at session startup:**
- Process framework core (e.g., `Agile-Core.md` from `.min-mirror/`). Loaded once, stays in context.

**Loaded on demand:**
- `Overview/Framework-Overview.md` — only when working on IDPF-Agile or the complete framework reference
- `Overview/Framework-System-Instructions.md` — only when working on system instructions or domain specialists
- `Assistant/Anti-Hallucination-Rules-for-PRD-Work.md` — only during PRD work
- `Reference/work-execution-conditional.md` — only for epics, branch trackers, `--nonstop`, or multi-issue selections

**Loaded per-command:**
- The specific command spec for the slash command being executed. A lean orchestrator, not a reference manual.

**Never loaded (executed instead):**
- All 165 scripts under `.claude/scripts/` and the 9 hooks. These run as `node` processes and return results. They are roughly 50,000 lines, and the model never sees one of them.

This is explicit context budget management. The `Finite-Context-Windows.md` philosophy doc describes the principle; the codebase implements it.

---

## When the Principle Bends

A framework document that only describes its principle working is advertising, not engineering. The always-loaded layer has grown, and it grew for a reason worth stating plainly.

Three commands — `/work`, `/review-issue`, `/resolve-review` — no longer carry their workflow in their command spec. The **hybrid shell + rule architecture** (#2329, #2368, #2737) moved those workflows into `.claude/rules/08-work-execution.md` and `.claude/rules/09-review-execution.md`, leaving the command file as a thin shell holding arguments, prerequisites and error handling.

The rules are auto-loaded. That means workflow text which used to be loaded *per invocation* is now resident *every session*:

| Rule | Size |
|---|---|
| `08-work-execution.md` | ~61 KB |
| `09-review-execution.md` | ~36 KB |
| `04-deployment-awareness.md` (dev-only variant) | ~55 KB |
| All 9 rules, this repo | ~239 KB |
| The 8 rules deployed to user projects | ~113 KB, roughly 43,000 tokens |

Forty-three thousand tokens is around a fifth of a 200K window, spent before the user's first message.

**Why it was done anyway.** `/resolve-review` invokes `/review-issue` as a nested skill, so a single resolution cycle previously injected the same command spec twice. And a workflow that lives in a rule survives compaction without being re-read, which the STOP boundaries and status gates depend on. The trade was per-invocation cost and compaction fragility against permanent residence.

**What it costs.** The tiered-loading table above is still the design, but the top tier is no longer small. A reader should understand this section as the exception that the principle now has to accommodate, not as evidence the principle was abandoned — the 165 scripts and 71 registries still carry zero context cost, and that remains the larger effect.

**The open question** is whether execution rules belong in the always-loaded tier at all, or whether a fourth tier — loaded once per command family rather than once per session — would recover most of the budget without giving back compaction survival. That question is unresolved.

---

## What Competitors Are Missing

The frameworks that claim aggressive token reduction are solving the right problem with the wrong approach. Compressing markdown is a linear optimization — you can make a 500-line file into a 150-line file, but it's still 150 lines loaded into context every time.

IDPF's approach is architectural. Move the 350 lines that don't require model reasoning into scripts and metadata files. Now the command spec is 150 lines *because that's all the model needs to see*, not because the rest was compressed away.

The difference matters at scale. IDPF has 56 commands, 77 active extension points across 18 extensible commands, 71 metadata registries, and 165 scripts. If all of that lived in command spec markdown, running `/prepare-release` (which internally invokes validation, minimization, skill packaging, and CI monitoring) would consume an enormous context budget. Instead, each phase delegates to scripts that execute deterministically, and the model focuses on the judgment calls: "Is this version number appropriate? Should we proceed past this gate? Does this CHANGELOG look complete?"

---

## The Design Principle

The principle behind all of this is straightforward:

**If a computer can do it deterministically, don't ask the model to reason about it.**

Parse git logs? Script. Validate file synchronization? Script. Count skill directories? Script. Detect branch trackers? Script. Watch CI pipelines? Script.

Decide whether the change is ready for release? Evaluate whether acceptance criteria are genuinely met? Judge whether a code review finding is blocking? *That's* what the model is for.

The model's context window is expensive reasoning space. Treat it that way.

---

**End of Context Engineering**
