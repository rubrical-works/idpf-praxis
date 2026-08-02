# Why gh-pmu Is a CLI Extension, Not an MCP Server

**Date:** 2026-08-02
**Topic:** The context economics of tool exposure, and why GitHub project management in IDPF lives behind a shell command rather than a Model Context Protocol server

---

## The Question

MCP is the obvious-looking answer to "how should an AI assistant talk to GitHub." It is the sanctioned integration path, it returns structured data, and it removes shell quoting from the equation. So the question comes up repeatedly:

> Why is `gh pmu` a GitHub CLI extension instead of an MCP server?

The short answer is that MCP charges rent on the context window, and a project-management surface as broad as gh-pmu's cannot pay it. The longer answer involves four separate problems, only one of which is about tokens — and the last one, workflow policy, is the deepest.

This document records the reasoning so the decision does not get relitigated every time MCP comes up.

---

## What gh-pmu Actually Is

Measured against `gh-pmu` v1.5.1 (`rubrical-worker/gh-pmu`):

| Layer | Scale | Character |
|-------|-------|-----------|
| `internal/api/` — GraphQL queries + mutations | ~5,500 lines | ProjectsV2 fields, sub-issue hierarchy, batch item fetch, pagination, retry, cached-field fallback |
| `cmd/` — 24 cobra commands | ~10,000 lines | Flag parsing, table rendering, validation, output shaping |
| `internal/config`, `ui`, `integrity`, `framework` | ~1,500 lines | Config discovery, terms gate, checksum integrity |
| **Total (non-test)** | **~22,000 lines** | 123 Go files |

The API layer is already a library with a CLI on top — `GraphQLClient` is an interface, there is transport injection for tests, and git operations reach through a `GitOperations` interface rather than raw `exec.Command`. **A port is not blocked by bad layering.** It is blocked by economics and by ambient state.

The exposed surface is **34 leaf operations**:

| Command | Leaves | Command | Leaves |
|---------|:------:|---------|:------:|
| `branch` (add, close, current, list, remove, reopen, start) | 7 | `field` (create, list) | 2 |
| `label` (add, delete, list, sync, update) | 5 | `config` (verify) | 1 |
| `sub` (add, create, list, remove) | 4 | `accept`, `board`, `close`, `comment`, `create`, `edit`, `filter`, `history`, `init`, `intake`, `list`, `move`, `split`, `triage`, `view` | 15 |

---

## The Context Tax

This is the decisive argument, and it is worth being precise about the mechanism.

**A shell command costs nothing until it is called.** Claude Code already knows how to run bash. `gh pmu move 90 --status in_progress` consumes context only in the moment it is written and only as the ~12 tokens it occupies. The other 33 operations cost zero. Discovery happens on demand — `gh pmu branch --help` when and only when branches are relevant.

**An MCP tool costs its full schema on every single request.** Tool definitions are resident. They are re-sent with each turn, whether or not the conversation has anything to do with GitHub. There is no lazy path: a server advertising 34 tools advertises all 34 to a conversation about CSS.

The arithmetic, as an estimate rather than a measurement — a tool definition carries a name, a prose description, and a JSON Schema for its parameters. For commands with real flag surfaces (`create` takes title, body, labels, status, priority, assignee, body-file; `move` takes status, priority, branch, force, json) that lands around 150–400 tokens each:

```
34 operations × ~300 tokens ≈ 10,000 tokens, permanently resident
```

And 34 is the **floor**, not the ceiling. A faithful MCP mapping inflates it:

- Mutually exclusive CLI flags become separate tools, because a schema cannot express "this flag is valid only with that one."
- Project selection needs its own tools (see the next section), adding several more.
- Commands with dual modes — `list --json` versus table, `branch close --tag` versus plain — often split rather than carry a mode parameter.

Which is how a measured 34 becomes a realistic 40+.

Ten to fifteen thousand tokens of permanently resident schema is not a rounding error. It is a meaningful fraction of the working budget, spent before the assistant has read a single file. And it compounds: MCP servers are additive, so a project running three of them can surrender a substantial share of its context to tool definitions that will go untouched for the entire session.

[Finite Context and Framework Discipline](Finite-Context-Windows.md) makes the point that effective working context is always smaller than advertised, and that IDPF's answer is tiered loading — permanent residence is a privilege granted only to what is always relevant. A GitHub project-management API does not qualify. It is exactly the kind of capability that should be retrieved on demand, which is precisely what a CLI does by construction.

---

## The Working-Directory Problem

The second obstacle is not about tokens at all.

gh-pmu's entire notion of *which project am I talking about* is: walk up the directory tree from the current working directory until `.gh-pmu.json` appears. That file carries the project owner and number, the repository list, the field alias map that makes `--status in_progress` resolve to the "Status" field's "In progress" option, cached field and option IDs, triage rules, release configuration, and terms-acceptance state.

`os.Getwd()` appears at **37 call sites across essentially every command**. Even the API layer's cached-field fallback calls it.

An MCP server is a long-lived process with no meaningful working directory. It is typically started once per client and is frequently not on the same machine as the repository. So the implicit answer to "which project" evaporates and must become explicit:

- Every tool call needs a project-root parameter — adding tokens to all 34 schemas, on top of the tool count.
- Or a stateful "select project" call, which introduces hidden session state and a whole class of "wrong project" failures that the cwd model makes structurally impossible.

Today only 2 of 24 commands (`accept`, `config`) offer a `--dir` escape hatch. Threading an explicit root through the other 22 is mechanical, but it touches everything — and it converts an invariant the filesystem enforces for free into one the caller must get right every time.

The CLI does not have this problem because the shell's working directory *is* the answer. That is not an accident of implementation; it is the correct model for a per-repository tool.

---

## What Does Not Survive Translation

Five operations cannot be ported without redesign, because they act on the local filesystem or git worktree:

| Operation | Obstacle |
|-----------|----------|
| `filter` | Exists solely to consume piped `gh issue list` JSON. With no pipes it has no reason to exist — it collapses into parameters on `list`. |
| `history` | Nine `exec.Command` git calls reading local `git log` for issue references. Requires the actual worktree. |
| `branch start` / `close --tag` | Performs `git checkout -b` and `git tag` in your working tree. A remote server cannot do this at all. |
| `init` | Writes `.gh-pmu.json` into a specific repository on disk. |
| `accept` / `integrity` | Per-repository on-disk state (`.gh-pmu.json`, `.gh-pmu.checksum`, `.gh-pmu-integrity-check.json`) with throttled re-checks. |

A port would cover roughly two-thirds of the surface. The remaining third is the part welded to the developer's machine — and in a framework whose workflows are built around branches, commits, and tags, that third is not peripheral.

---

## The Business Logic Problem

The three arguments above are about cost and mechanics. This one is about correctness, and it is the reason the decision is not close.

**gh-pmu is not a GitHub API wrapper. It is an IDPF workflow policy engine that happens to speak GraphQL.**

`cmd/validation.go` opens with `if !cfg.IsIDPF() { return nil }` and then enforces three rules that exist nowhere in GitHub's data model:

| Rule | Enforcement |
|------|-------------|
| Body required for `in_review` / `done` | Refuses the transition. **Not** bypassable by `--force`. |
| All acceptance-criteria checkboxes checked for `in_review` / `done` | Refuses the transition. Bypassable by `--force`, with a loud warning. |
| Branch assignment required for `backlog` → `ready` / `in_progress` | Refuses, and validates the branch against active trackers discovered by parsing `Branch: <name>` from issues labeled `branch`. |

The care in the implementation shows what kind of code this is. `stripCodeBlocks()` removes fenced and indented blocks before counting checkboxes, so an example checklist inside a code fence in an issue body is not mistaken for acceptance criteria. `internal/framework/detect.go` knows `IDPF-Agile`, `IDPF-Structured`, and `IDPF-LTS` by name. This is domain logic about *how this framework runs projects*, encoded deterministically.

### The two-layer enforcement model

That policy does not live in one place. It is deliberately split:

| Layer | Governs | Nature | Size |
|-------|---------|--------|------|
| **gh-pmu** (`validateStatusTransition`) | Mechanical invariants — is the body empty, are the boxes checked, is a branch assigned | Deterministic; refuses at the API boundary | ~5,500 lines of Go behind a config-driven gate |
| **`GitHub-Workflow.md`** → `.claude/rules/02-github-workflow.md` | Judgment — *when* to close, `Refs #` versus `Fixes #`, analysis-versus-work STOP, the pre-work status gate | Prose; auto-loaded into every session | 213 lines of source, 95 minimized |

Neither layer is sufficient alone, and **they reference each other explicitly.** When gh-pmu refuses a move with unchecked boxes, its suggestion text reads:

> `Complete these items before moving to in_review, or use --force to bypass.`
> `Claude: Review GitHub-Workflow rules before using --force.`

The tool knows it is being driven by an LLM and hands control back to the prose rules. And the prose rules answer: `.claude/rules/08-work-execution.md` Step 4b enumerates exactly which `--force` uses are legitimate — epic parents, external closures, branch trackers, test-plan approvals, and the two intentionally-open gate markers (`→ QA: #N`, `→ GATE: review|release`) — and forbids the rest.

`--force` is calibrated friction. It exists, it warns, and a separate reviewed document says when you may reach for it.

### What MCP does to this arrangement

An MCP server faces a fork, and both branches are bad:

**Carry the policy.** The IDPF rules move into the server binary — versioned, released, and installed independently of the framework whose rules reference them. `GitHub-Workflow.md` says one thing; a server built three releases ago enforces another. The framework loses the ability to change its own workflow rules by editing a markdown file, which is presently how every other rule in the system works.

**Omit the policy.** The server becomes a thin GraphQL proxy, the deterministic gate disappears, and the LLM must re-derive from prose that an empty body blocks `in_review`. That is precisely the class of check that should never depend on the model remembering.

There is a third problem that applies either way. **Alias indirection is policy, not convenience.** `--status in_progress` resolves to the "Status" field's "In progress" option through the `fields:` map in `.gh-pmu.json` — the *project* owns its vocabulary. An MCP schema must either hardcode the enum (breaking per-project configuration) or accept free strings (discarding validation at the only layer that can perform it).

### Tool schemas argue with STOP boundaries

The subtlest cost is behavioral.

A CLI invocation must be **composed**. The model writes `gh pmu move 90 --status in_review` as a string, in a turn governed by the workflow rules it loaded at session start. Nothing about the shell suggests the command exists or that now is the moment to run it.

An MCP tool is **selected from a menu that is always present**. A tool named `close_issue`, with a filled-in schema and a description explaining its parameters, is a standing invitation — and it is a closer, louder signal than a rule file read forty turns ago.

IDPF's central discipline runs the other way. Issues close **only** when the user says "Done." Commits use `Refs #` and never `Fixes #` until then, specifically so a merge cannot bypass the checkpoint. Analysis keywords hard-stop before implementation. [Intentional Friction](Intentional-Friction.md) argues that these boundaries are load-bearing rather than ceremonial.

Publishing the mutation surface as always-visible tools works against that design. It lowers the activation energy for exactly the actions the framework has deliberately made expensive.

---

## Being Fair: What MCP Would Genuinely Buy

The case is not one-sided, and pretending otherwise would make this document useless.

**Structured errors.** MCP returns typed failures. The CLI returns exit codes and stderr prose that commands must parse. IDPF works around this with the JSON envelope convention (`{ ok, context, warnings, errors }`) in its preamble scripts — a convention that exists partly *because* shell tools do not provide it natively.

**No shell quoting.** This is the strongest practical argument. MCP passes strings in JSON, which would obsolete `-F file`, `--body-stdout`, `--body-stdin`, and the temp-file dance entirely. IDPF maintains roughly 200 lines of [Windows shell safety rules](../../Reference/Windows-Shell-Safety.md) — backticks in heredocs, `--flag=value` attachment, absolute-path mangling, `.tmp-{issue}.md` conventions — a large fraction of which exists purely because CLIs handle multiline text badly. That cost is real and recurring.

**Non-shell clients.** Claude Desktop and claude.ai have no bash tool. An MCP server is the *only* way to reach them. If IDPF ever targets those surfaces, this calculus changes.

**The infrastructure already exists.** 11 of 24 commands already implement `--json`. The machine-readable contract is largely designed; it simply travels over stdout instead of a protocol.

None of these outweigh a five-figure permanent context cost for the primary use case — Claude Code, in a repository, on the developer's machine, where bash is free and the working directory answers the identity question for nothing.

---

## The Shape That Would Make Sense

If MCP is pursued, the wrong move is a faithful 1:1 port. The right shape is narrow:

```
Keep on the CLI                          Expose over MCP
─────────────────────────────────        ────────────────────────────────
All mutations (create, edit, move)       A handful of read operations:
All git-local ops (branch, history)        view, list, sub list, board
init / accept / integrity                Explicit project-root parameter
filter (delete — pipes are the point)    Wrapping internal/api directly
```

Six to eight read-only tools cost perhaps 2,000 resident tokens instead of 12,000, require no rewrite of the mutation paths, and sidestep the git problem entirely — because reads do not touch the worktree. The CLI remains the complete interface; MCP becomes an accessor for clients that lack a shell.

Read-only is the load-bearing constraint, not a cautious first phase. Reads carry no IDPF policy, so nothing duplicates and nothing drifts. Reads cross no STOP boundary, so an always-visible `view_issue` invites nothing the framework wants to prevent. Every argument in this document is an argument against exposing *mutations* over MCP; none of them bites a read.

That is an additive capability, not a replacement. It is the only version of this that survives the context arithmetic.

---

## Appendix: The Narrowest Defensible Case — Prose Bodies

**Status: considered, not planned.** Recorded so the analysis is not redone.

Everything above argues against MCP on cost, ambient state, local operations, and policy. There is exactly one place where the protocol's strength lands squarely on the CLI's weakness, and it deserves to be written down rather than rediscovered.

The CLI's genuine weak spot is multiline prose. Issue bodies, comments, and acceptance-criteria rewrites are the operations that force the temp-file convention.

### The policy seam is unusually clean

`validateStatusTransition` is invoked from exactly one file: `cmd/move.go`. The text-bearing commands do not touch it.

| Operation | Carries IDPF policy? | Argument shape |
|-----------|:--------------------:|----------------|
| `move` — status transitions | Yes — all of it | Short, enum-like flags. CLIs handle this well. |
| `edit` body, `comment` | **None** | Multiline prose. CLIs handle this badly. |
| `create` | Some — gated on `--status`, not on the body | Mixed |

What MCP is good at and what it is bad at barely overlap. The policy lives in the operation that takes no prose; the prose lives in the operations that carry no policy.

### But the correctness problem is already solved

This is the part that decides it. The sanctioned flow today is:

```
Write tool → .tmp-123.md  →  gh pmu edit 123 -F .tmp-123.md  →  rm
```

The Write tool is not a shell command. Body text never passes through bash quoting at any point in that sequence. The backtick-in-heredoc and inline-`--body` failures catalogued in [Windows Shell Safety](../../Reference/Windows-Shell-Safety.md) are failures of the *forbidden* patterns — the approved path is already safe.

MCP would therefore not fix a correctness defect. It would remove **ceremony**: three tool calls collapse to one, temp files stop accumulating, and the assistant stops needing to recall a convention spread across 21 files.

That is a real but bounded gain. Roughly: three tools cost ~800–1,000 resident tokens, while each body operation currently spends ~150–250 tokens on ceremony beyond the body text itself, which transmits either way. Break-even sits around 5–8 body operations per session — a threshold a `/work` run on an epic clears easily, since Step 4 checkbox updates, Step 4c *Files Changed* appends, and QA annotations each rewrite a body once per sub-issue.

### The shape, if it were ever built

```
get_issue_body(issue)        → markdown string
set_issue_body(issue, body)  → replace
add_comment(issue, body)
```

Three tools, deliberately **excluding `create_issue`** — it is the one text-bearing command that does carry IDPF policy, and issue creation is already owned by trigger-word routing (`bug:`, `enhancement:`, `proposal:`), which creates and then STOPs. Omitting it keeps the server entirely policy-free, which is what makes it immune to every argument in this document. Status transitions stay on `gh pmu move`, where the policy engine lives. Nothing duplicates; nothing drifts.

### Why it is not planned

The cost is not the server — it is the dual path. Twenty-one files (19 command specs, plus `05-windows-shell.md` and `08-work-execution.md`) hardcode the `--body-stdout` / `-F` flow. The choice is to migrate all 21 or to document two supported ways to edit a body, and an ambiguity of that kind is exactly what produces inconsistent behaviour after compaction.

So the ledger reads: a narrow, well-shaped, policy-free server that removes ceremony but fixes no defect, paid for with a 21-file migration. Worth recording as the strongest version of the idea. Not worth doing on those terms.

---

## Key Takeaways

1. **Tool definitions are resident context; shell commands are not.** A 34-operation MCP server spends ~10,000 tokens on every request whether GitHub comes up or not. `gh pmu` spends tokens only when invoked. For a broad, intermittently-relevant API this difference decides the question on its own.

2. **34 is the floor.** Mutually exclusive flags, dual-mode commands, and project-selection tools push a realistic mapping past 40 — each addition permanently resident.

3. **The working directory is load-bearing, not incidental.** 37 `os.Getwd()` sites encode a real design decision: the filesystem answers "which project" for free. MCP forces that invariant into 34 schemas or into hidden session state.

4. **A third of the surface is welded to the local machine.** Git operations, config bootstrapping, and integrity checks do not have remote equivalents. In a branch-and-commit-centric framework, that third is not optional.

5. **gh-pmu carries IDPF workflow policy, not just API calls.** `validateStatusTransition` refuses empty-bodied issues, unchecked acceptance criteria, and unassigned branches — rules with no counterpart in GitHub's data model. An MCP server must either duplicate that policy into a separately-versioned binary (drift) or drop it (losing the deterministic gate).

6. **Enforcement is deliberately split across two layers that cite each other.** gh-pmu enforces mechanical invariants; `GitHub-Workflow.md` governs judgment. gh-pmu's own error text tells Claude to consult the rules before using `--force`, and Step 4b of the work-execution rule answers with the exact list of legitimate cases. Collapsing that into tool schemas loses the half that requires judgment.

7. **Always-visible tool schemas argue against STOP boundaries.** A CLI string must be composed under the rules loaded that session; a tool is selected from a permanently-present menu. IDPF makes closing an issue deliberately expensive. Advertising `close_issue` as a tool makes it cheap again.

8. **The strongest counter-case is prose bodies, and it still does not clear the bar.** Text-bearing commands are policy-free, so a three-tool body server would be genuinely well-shaped — but the Write tool already removes the quoting risk, leaving ceremony rather than defects to fix, against a 21-file migration. Considered, not planned; see the appendix.

9. **The decision is about exposure economics and policy placement, not capability.** gh-pmu's API layer is cleanly separated and would port with little friction. Nothing here says MCP is a poor protocol — it says a broad, policy-bearing project-management surface is a poor fit for permanently-resident tool schemas.

---

**Related:** [Finite Context and Framework Discipline](Finite-Context-Windows.md) — why effective working context is smaller than advertised and how IDPF tiers what it loads. [Intentional Friction](Intentional-Friction.md) — why STOP boundaries exist and what they prevent. [Context Engineering](Context-Engineering.md) — how IDPF separates what the model thinks about from what code computes. [Code vs Commands](Code-vs-Commands.md) — the parallel question of where orchestration logic should live.
