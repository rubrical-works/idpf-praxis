# Code vs Commands: Two Approaches to LLM Orchestration

**Date:** 2026-02-27
**Topic:** How IDPF's preamble pattern compares to Cloudflare's codemode thesis, and why the answer isn't either/or

---

## The Same Problem, Opposite Solutions

Every AI development framework faces a core orchestration question: when a workflow requires multiple steps — API calls, file reads, data comparison, conditional branching — who writes the glue?

Two approaches have emerged:

1. **Let the LLM reason through each step** (the default). The model reads instructions, makes tool calls one at a time, interprets results, decides what to do next.

2. **Let code handle the mechanical parts** (the optimization). Move deterministic work out of the model's reasoning loop and into executable code.

Both approaches agree that pure step-by-step LLM reasoning is expensive and error-prone. They disagree about who should write the code.

---

## Cloudflare's Codemode: The LLM Writes Code

Cloudflare's `@cloudflare/codemode` package (2025, experimental) inverts the standard tool-calling model. Instead of making individual tool calls, the LLM writes a JavaScript function that orchestrates multiple tools in a single execution:

```javascript
// Traditional: 3 round-trips, LLM reasons between each
tool_call: getWeather({ location: "London" })  → LLM thinks →
tool_call: getWeather({ location: "Paris" })   → LLM thinks →
tool_call: sendEmail({ body: "..." })          → done

// Codemode: 1 round-trip, code handles composition
async () => {
  const [london, paris] = await Promise.all([
    codemode.getWeather({ location: "London" }),
    codemode.getWeather({ location: "Paris" }),
  ]);
  if (london.includes("sunny")) {
    await codemode.sendEmail({ subject: "Nice day!", body: `${london}` });
  }
  return { london, paris };
}
```

The thesis is pragmatic: LLMs have trained on millions of lines of real-world code but comparatively few tool-calling examples. They are better programmers than tool-callers.

The generated code runs in an isolated Cloudflare Worker sandbox with no network access. Tool calls route back to the host via RPC. The LLM can compose — conditionals, loops, `Promise.all`, error handling — but can't escape the sandbox.

---

## IDPF's Preamble Pattern: The LLM Writes Code Under Direction

IDPF arrived at a similar optimization from the opposite direction — but with an important wrinkle. The JavaScript in IDPF was not hand-coded by a human developer. It was **written by an LLM (Claude) at the direction of the framework author.** The human provided the intent, architecture, and review; the LLM produced the code.

This means IDPF already relies on LLM-generated code — just at *design time* rather than *runtime*. The code is reviewed, tested, committed, and versioned. It becomes deterministic infrastructure. But its origin is the same as codemode's: an LLM writing JavaScript.

But the code is only the final artifact. Before the LLM writes a line of JavaScript, the feature goes through IDPF's full design pipeline:

1. **Proposal** (`/proposal`) — The idea is documented with rationale, scope, and trade-offs.
2. **Proposal Review** (`/review-proposal`) — Structured review against criteria: feasibility, alignment, risk. Findings are tracked.
3. **Resolve Findings** (`/resolve-review`) — Review findings are addressed, deferred, or accepted before proceeding.
4. **PRD** (`/create-prd`) — Acceptance criteria, user stories, and technical requirements are formalized.
5. **PRD Review** (`/review-prd`) — The PRD is reviewed for completeness, testability, and scope creep.
6. **Backlog + Work** — Stories are created, assigned to branches, and worked under TDD.

Importantly, these reviews can be — and often are — performed by **different Claude instances**. The LLM that writes the proposal is not the same session that reviews it. The reviewer brings fresh context, no sunk-cost bias, and applies the review criteria without knowledge of the author's shortcuts or assumptions. This is adversarial quality assurance between LLM sessions, mediated by structured review criteria and tracked findings — closer to a code review between two engineers than a model checking its own output.

The code itself is developed under **TDD (Red-Green-Refactor)** discipline. Tests are written first, the LLM writes code to pass them, and the code is refactored under the safety net of those tests. The result is LLM-generated code that went through the same lifecycle as code in a well-run engineering team: requirements → independent review → design → test-first development → regression protection.

The preamble pattern, used by `/work`, `/done`, and other core commands, replaces 7-9 sequential LLM tool calls with a single script execution:

```bash
node .claude/scripts/shared/work-preamble.js --issue 42
```

The script handles the deterministic work — GitHub API calls, label detection, sub-issue ordering, branch validation, framework routing — and returns a structured JSON envelope:

```json
{
  "ok": true,
  "context": {
    "issue": { "number": 42, "title": "...", "labels": ["story"] },
    "branch": { "name": "feature/auth", "tracker": 38 },
    "framework": "IDPF-Agile"
  },
  "gates": {
    "hasAcceptanceCriteria": true,
    "isBranchAssigned": true,
    "isEpic": false
  },
  "autoTask": {
    "items": ["Implement login form", "Add validation", "Write tests"]
  },
  "warnings": []
}
```

The LLM doesn't reason about *how* to gather this data. It reads the result and makes *decisions* — the part that actually requires judgment.

---

## The Numbers Tell the Story

IDPF's JavaScript layer is not incidental. It is foundational:

| Metric | Count |
|--------|-------|
| JavaScript files in `.claude/scripts/` | 50 |
| Lines of JavaScript | ~11,000 |
| Commands that invoke JavaScript | 26 of 48 (54%) |
| JSON metadata registries | 17 |
| Library modules (`.claude/scripts/shared/lib/`) | 8 |

The most JavaScript-heavy commands — `/prepare-release` (6+ invocations), `/ci` (8+), `/minimize-files` (17+) — are the most mechanically complex. The commands with minimal JavaScript — `/bug`, `/enhancement`, `/proposal` — are the simplest, doing little more than creating a GitHub issue.

This distribution is not accidental. It reflects a principle: **the more deterministic the work, the more it belongs in code, not in the LLM's reasoning loop.**

---

## Comparing the Models

| Dimension | Codemode | IDPF Preamble |
|-----------|----------|---------------|
| Who writes the code? | The LLM, at runtime | The LLM, at design-time (human-directed) |
| Who executes it? | Sandboxed Worker | `node script.js` via shell |
| Trust model | LLM writes code (unreviewed) | LLM writes code (proposal → review → PRD → TDD → versioned) |
| Quality pipeline | Sandbox containment only | Proposal → independent review → PRD → review → TDD → commit |
| Review independence | None (same execution) | Different LLM instances review each other's work |
| Composability | Any JS the LLM can write | Pre-built operations only |
| Determinism | Varies — LLM output is non-deterministic | High — same input, same output |
| Flexibility | Handles novel situations | Handles known workflows |
| Failure mode | Bad code → sandbox error | Bad script → caught by tests or review |
| Human review | Not yet supported | STOP boundaries after every phase |
| Round-trip reduction | Many tool calls → 1 code execution | Many tool calls → 1 script call |

Both approaches solve the same latency and reliability problem. The difference is where the trust boundary falls.

---

## Where Each Approach Wins

### Design-Time Code (IDPF) Wins When:

**The workflow is known and repeatable.** The `/work` preamble runs hundreds of times across projects. It handles the same checks every time. Writing it once — LLM-authored under TDD, human-reviewed, committed — means the code has test coverage, is deterministic, and never hallucinates a label check or miscounts sub-issues. The LLM's generation ability is used once; the result is reused indefinitely.

**The stakes are high.** Release preparation involves version calculation, CHANGELOG generation, cross-reference validation, and registry synchronization. These are operations where a mistake propagates to every user of the framework. Code that was developed with tests, reviewed, and versioned — regardless of whether an LLM or a human wrote it — is the appropriate trust level.

**Human checkpoints are required.** IDPF's STOP boundaries exist because some decisions should not be automated. The preamble script gathers context; the LLM presents it to the user; the user decides. Codemode's current lack of approval flows makes it unsuitable for workflows where human judgment gates progression.

### LLM-Generated Code (Codemode) Wins When:

**The operation is ad-hoc.** "Move all P2 issues assigned to this branch to backlog" is too specific for a pre-built script but too mechanical for pure LLM reasoning. Generated code against a typed API handles this naturally.

**The composition is novel.** When a user needs to combine tools in a way the framework developer didn't anticipate, pre-built scripts can't help. The LLM's ability to compose arbitrary logic from typed primitives fills this gap.

**Parallelism matters.** `Promise.all` across multiple independent operations is trivial in code and awkward in sequential tool calls. When the workflow involves many independent lookups or updates, generated code is structurally better.

---

## The Convergence

The interesting observation is not that these approaches differ — it is that they are converging.

IDPF started with pure markdown command specs (LLM reasons through everything) and progressively moved deterministic work into JavaScript. The preamble pattern, the metadata registries, the library modules — each represents a recognition that *this particular work shouldn't be in the LLM's head*.

Codemode started with pure LLM tool-calling and moved toward code generation — a recognition that the model's programming ability is more reliable than its tool-calling ability.

The distinction is subtler than it first appears. Both systems use LLM-generated JavaScript. The difference is *when* the generation happens and *what review process the code undergoes*:

- **Codemode:** LLM generates code at runtime, executed immediately in a sandbox. No proposal, no independent review, no tests. One LLM session, one pass.
- **IDPF:** LLM generates code at design-time after a full pipeline — proposal, independent review (potentially by a different LLM instance), PRD, review, finding resolution, TDD — then committed and executed deterministically thereafter. Multiple sessions, adversarial quality checks.

Both are moving toward the same architecture:

```
Human Intent
    │
    ▼
Orchestration Layer (who controls the workflow)
    │
    ├── Deterministic Code (mechanical work)
    │   └── API calls, data gathering, validation, counting
    │
    └── LLM Judgment (decision work)
        └── Version decisions, user interaction, quality assessment
```

The disagreement is not about *who* writes the code — in both cases, an LLM does. The disagreement is about *what happens between the idea and the execution* — whether the code passes through a design pipeline (proposal, review, PRD, TDD) or goes straight from generation to sandbox.

---

## The Hybrid That Neither Has Built

A natural synthesis exists that neither project has fully explored:

```
Command Spec (workflow shape + STOP boundaries)
    │
    ├── Phase 1: Pre-built preamble (known, tested)
    │   └── work-preamble.js → structured JSON
    │
    ├── Phase 2: LLM judgment (requires reasoning)
    │   └── Interpret context, present to user, decide
    │
    ├── Phase 3: Generated code (ad-hoc, mechanical)
    │   └── LLM writes a function for bulk updates
    │   └── Executed in sandbox, returns JSON
    │
    └── Phase 4: LLM judgment (requires reasoning)
        └── Verify results, report to user
        └── STOP — user confirms
```

The command spec stays in control of the *workflow shape*. Pre-built scripts handle *known mechanical work*. LLM-generated code handles *novel mechanical work*. The LLM's reasoning handles *judgment*. STOP boundaries gate *irreversible actions*.

The contract between all layers is the same: **structured JSON envelopes.** Whether the code was written by a developer or generated by the LLM, the output format is identical — `{ ok, context, warnings, errors }`. The command spec doesn't need to know which produced it.

This is not a theoretical architecture. IDPF already has the command specs, the preamble scripts, and the JSON envelope contract. The missing piece is a sandboxed execution path for LLM-generated code that plugs into the same contract.

---

## Why This Matters Beyond These Two Projects

The code-vs-commands question applies to every AI agent framework:

- **Pure prompt engineering** (all reasoning in the LLM) is simple but expensive and unreliable at scale.
- **Pure code generation** (all orchestration as LLM-written code) is efficient but lacks human checkpoints and requires sandboxing.
- **Pre-built scripts** (LLM-authored at design-time, human-reviewed) are reliable but rigid and can't handle novel situations.

The frameworks that mature will likely end up with all three, applied to different parts of the workflow based on the trust level required. The interesting design question is not which approach to use, but where to draw the boundaries between them.

---

## Key Takeaways

1. **IDPF and codemode solve the same problem** — reducing LLM round-trips by moving mechanical work into code execution — from opposite directions.

2. **IDPF's bet is on design-time generation with a full quality pipeline.** The preamble scripts are LLM-written code that passed through proposal review, PRD review, finding resolution, and TDD before becoming infrastructure. They are codemode functions that went through the same lifecycle as code in a mature engineering organization. The tests remain as regression protection — if the code is modified later (by human or LLM), the tests catch breakage.

3. **Codemode's bet is on runtime generation with sandbox containment.** It is more flexible but currently lacks design review, test coverage, or regression protection. The LLM writes and executes in the same breath. The sandbox constrains *what* the code can do, but nothing verifies that it does the *right* thing. There is no `/review-proposal` for a runtime-generated function.

4. **The convergence point is a hybrid** where pre-built code handles known workflows, generated code handles ad-hoc operations, and LLM reasoning handles judgment — all speaking the same JSON envelope contract.

5. **54% of IDPF commands already invoke JavaScript.** The framework has organically arrived at the conclusion that code orchestration beats LLM reasoning for deterministic work. The open question is whether to extend that pattern to LLM-authored code for the remaining ad-hoc cases.

---

**Related:** [Context Engineering](Context-Engineering.md) — How IDPF separates what the model thinks about from what code computes. [Intentional Friction](Intentional-Friction.md) — Why STOP boundaries exist and what they prevent.
