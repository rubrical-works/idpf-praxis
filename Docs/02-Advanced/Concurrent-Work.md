# Concurrent Work Within One Epic

**Version:** v0.115.0
**Topic:** How `/work --concurrent` runs several sub-issues of one epic or branch tracker at the same time without giving up the gates, the attribution or the audit trail a sequential run leaves behind.

---

## Where It Sits

IDPF has three layers of parallelism, and they compose:

| Layer | Unit | Command | Who owns git |
|---|---|---|---|
| Sessions | Reviews and board work on one branch | Several sessions, one of them committing — [Concurrent Sessions](04-Concurrent-Sessions.md) | One session |
| Workstreams | Whole epics on separate branches | `/plan-workstreams` — [Concurrent Workstreams](Concurrent-Workstreams.md) | One session per workstream |
| Concurrent work | Sub-issues **within one tracker** | `/work <epic> --concurrent` (this page) | The parent session, through merge-back |

Workstreams split work across epics and sessions; `--concurrent` splits one tracker's sub-issues across worktrees the framework creates, uses and removes inside a single `/work` run. Plan workstreams first if you have several epics; run `--concurrent` inside each.

**Start with the profiler.** Before configuring anything, run `/plan-workstreams <epics> --profile` or `node .claude/scripts/shared/collision-profiler.js` directly. It replays your git history grouped by issue reference and reports how often two issues touched the same file, which files cause it, and the rate left once those files are reconciled by kind. It is the recommended entry point because it answers, from measurement, the question the rest of this page assumes: *does this repository's work actually collide, and on what?* It proposes a candidate `concurrency` block and never writes it.

---

## The Plan

`--concurrent` may run only sub-issues that **provably** cannot collide, and the only proof the framework has is what each sub-issue declares:

- **Declared scope** — the `**Files to modify:**` block of each sub-issue. Two members whose scopes share no path (and no glob covering a path) are disjoint.
- **Declared dependencies** — the `**Depends on:** #N, #M` line. A member runs only after everything it depends on has merged back. A dependency cycle halts the run before anything is created or moved; an entry the parser cannot read (`#abc`, a self-reference, a number outside the epic) is never treated as satisfied.

The preamble builds the plan once, before any status moves: processing order is a topological sort of the dependency graph (the `**Processing Order:**` section breaks ties), and the groups are the dependency layers packed by disjointness, each capped at `--agents N`. Two members whose declared scopes overlap are never in the same group: the later one in processing order is deferred to a later group, and anything that depends on it waits for that group to merge back. Under `--nonstop --concurrent` the deferral works the same way, as a dependency: the deferred member starts only after the member it overlaps has merged back. Paths declared in `framework-config.json` `concurrency` as accumulators or derived artifacts, such as `.claude/commands/**` or `minimize-targets.json`, do not count as overlap, because the merge driver or the regeneration step reconciles them; the inputs they come from still do. A member the plan cannot prove safe goes to a **sequential tail** worked as ordinary `/work` after every group: undeclared scope, an always-protected path such as `framework-config.json` that another member also declares under the same protected pattern, or a dependency on a skipped `qa-required` issue. An always-protected path that no other member declares is treated as an ordinary path. If no `WorktreeCreate` hook naming `worktree-create-hook.js` is registered in any settings layer (project, project-local or user), every member goes to the tail, because a worktree without the hook has no hub links; an unreadable settings file is named in a warning rather than silently ignored. A plan with zero groups is the sequential run, and the report says why no group formed.

Step 2c shows all three inputs together before anything runs: the declared order, the graph order the run will use, the heuristic proposal from `review-interdependence.js` (which can never place a member before what it depends on), and the groups.

---

## The Cap

`--agents N` (default 3) bounds **agents of any kind** running at once. A group has at most N members; a member's reviewer takes the slot its implementer freed; a fix cycle re-spawns the implementer into the same slot. The same number caps unit-test concurrency, because each member runs its scoped suites inside its own worktree — N members, N test runs.

---

## Parent and Members

The parent session keeps every per-issue guarantee of sequential `/work`: the Review-State Gate and Pre-Work Status Gate per member, peer announcement events 1 and 2 per member, Steps 4–4f, merge-back, the `in_review` move and the STOP. A member agent, spawned with `isolation: "worktree"` and an inline brief (the issue's description, its proposed solution or fix, its declared scope, its acceptance criteria, the TDD checklist and the commit contract — a section the issue lacks is named as not found rather than omitted), owns exactly one thing: the TDD cycle, committing per acceptance criterion as `Refs #N`. It does not push, merge, move the issue or announce.

Because every member fires its gates and events once and carries its own `Refs #N` commits, the post-run audits — announcement pairing, commit density, AC checkboxes — read a concurrent run exactly as they read a sequential one. The parent's task list holds one entry per member with its group number, so compaction recovery can name the active member from `TaskList` alone; subagents have no Task tools, which is why those entries live in the parent.

**STOP cadence.** `--concurrent` STOPs once per group after that group's merge-back, with every member in `in_review`; the tail then STOPs per member as usual. `--nonstop --concurrent` never STOPs: each member is reported as it reaches `in_review`, and the nonstop summary comes at the end. Under `--nonstop` there is no per-group or per-member Step 4f sweep either — **one** full regression sweep runs after the last member, over the union of every processed member's changed files. A halt before that sweep leaves the members already in `in_review` unswept, and the halt report names them: sweep them before `/done`, because a resumed run skips `in_review` members.

---

## The Merge-Back Review Gate

Nothing reaches the shared tracker branch unreviewed. Before a member merges back, `merge-back-gate.js` runs three tiers over `<tracker-tip>..wt/<N>`:

| Tier | What | Who |
|---|---|---|
| 1 — mechanical, always | Every commit carries `Refs #N`; nothing uncommitted; the declared scope holds (`scope-drift-check.js`); the changed files are logged; the member's `parallel` suites re-run with `cwd` at the worktree | The parent |
| 2 — the read, always | The branch diff file by file against the member's acceptance criteria; the direct-work exemption never applies | The parent |
| 3 — independent review, on by default | A reviewer agent running the `diff-review` skill over the range, given the issue, its ACs and the charter — never the implementer's summary. It writes its review to `.tmp-gate-<N>-tier3.json` itself and may write nothing else | A second agent, in the implementer's slot |

`--no-review` skips Tier 3; an absent `diff-review` skill degrades to Tiers 1–2. Both are reported, never silent.

**The review reaches the gate in the reviewer's own words.** The parent never copies or re-words it. Before the reviewer starts, the parent removes any earlier cycle's review file and snapshots the working tree (`git status --porcelain --ignored`). The outcome step fails Tier 3 if the reviewer wrote no output file (`tier-3-missing`), if the file was already there before the reviewer started (`tier-3-stale-output`), or if anything changed during the review outside that member's own review and snapshot files and its running-group siblings' own gate files (`tier-3-wrote-outside-contract`, naming the paths). The snapshot's sha256 is recorded when it is taken, so a snapshot altered mid-review fails as `tier-3-snapshot-changed`. The snapshot check is the enforcement: Claude Code's Agent tool has no per-spawn setting that limits a subagent's writes to one file.

Tier 1's result is protected the same way: the gate writes it to `.tmp-gate-<N>-tier1.json` itself and reports its sha256, and the outcome step requires that hash — a Tier 1 document changed in between halts as `tier-1-document-changed` and the member is never merged.

**Outcomes.** Pass or warn merges the member and posts the findings as a comment on the sub-issue; on a Tier 3 pass, every file in the merged range is recorded in `.code-review-manifest.json` at its merge-time content hash, so a later `/code-review` treats it as already reviewed (a warn records the files as flagged; a fail or a skip records nothing). A fail buys **exactly one fix cycle**: the findings go to the same implementer agent with its worktree intact, every tier re-runs once, and a second fail halts the run with the worktree kept. Compaction during a fix cycle counts the resumed re-run as that one cycle.

**A reviewer failure is not the implementer's failure.** When Tier 1 passes but the reviewer itself misbehaved — no review file, a stale one, writes outside its contract, a changed snapshot — the outcome is **re-review**, not a fix cycle: the parent re-snapshots, re-spawns the reviewer in the same slot and re-runs the outcome, and the implementer's one fix cycle stays unspent. Any stray paths the reviewer wrote are reported and cleared first, so they never become part of the new baseline. A second reviewer failure halts, attributed to the reviewer.

**Merge-back itself** lands each member onto the tracker's *current* tip, read immediately before each merge — a peer may have pushed during the group. A residual conflict after the merge driver and reconciliation have had their say halts the run: the merge is aborted so the tracker stays clean, every worktree is kept, no later member is merged, and the report names the files, the failed member, the unmerged members and the tail that never started. Recovery is in [When Things Go Wrong](../01-Getting-Started/05-When-Things-Go-Wrong.md#when-a-concurrent-run-halts).

---

## Derived Artifacts and Accumulators

Two kinds of file collide in every project even when the stories are disjoint: **derived artifacts** (minimized mirrors, generated registries) that two members both regenerate, and **accumulators** (a JSON history file every story appends to). Declared in `framework-config.json` under `concurrency`, they are reconciled by kind rather than as text:

- `derivedArtifacts` — discard both sides, re-run the generator after merge. A string generator runs from the project root; a `{ skill }` generator is a Skill-invoked task a script cannot run, so the runner returns it as `deferred-to-session` and the parent invokes it before the group continues.
- `accumulators` — a `json-merge` driver unions keyed records, named in `.gitattributes` and registered in the local git config by the `WorktreeCreate` hook.
- `recomputed` — recomputed after regeneration and verified by a named test.

After a group's merge-back the parent runs the regeneration runner over the group's changed paths, invokes the deferred generators, runs the **post-merge pass** (Tiers 1–2 again over the members' diffs ∪ the regenerated paths, so a regenerated file no member's diff named is reviewed too), and only then Step 4f (under `--nonstop`, the single end-of-run sweep instead). The profiler is how you find out which files belong in this block for your repository.

---

## Test Execution

Each suite in `testing.suites[]` carries a `concurrency` field, written by `/charter --testing` as the role default: `exclusive` for `e2e`, `parallel` for everything else.

- Inside a member's worktree only `parallel` suites run, scoped to the member's changed files.
- `exclusive` suites — browser-bound, port-bound, host-bound — are **deferred**: the parent runs each once, serially, on the tracker branch after the group's merge-back and worktree teardown, scoped to the union of the group's changed files including regenerated paths. They are never skipped.
- `manual-only` suites are in neither set and are named as declared-but-not-run.

Neither the deferred run nor Step 4f starts while a worktree of the group still exists, for the reason the next section explains. An invalid `concurrency` value is reported as invalid and never defaulted to `parallel`.

---

## Worktrees Under the Project Root

Framework worktrees are created under the project root as `.tmp-wt-<name>` (branch `wt/<name>`), with the hub links recreated inside them by the `WorktreeCreate` hook so framework scripts resolve. That placement has one consequence you need to know about: **a test or lint run you start from the root during a concurrent run collects the worktree files too**, unless that runner ignores `.tmp-wt-*`.

The framework's own suite runs avoid this by sequencing: a group's exclusive suites and its Step 4f run only after teardown — once every worktree of the group has been removed (#3132) — and a `.tmp-wt-*` directory still present at that point is reported by path. Your own runs from the root, during a group, need the runner told. Worked examples:

**Jest** — add the pattern to *both* lists, and anchor it:

```js
// jest.config.js
module.exports = {
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/\\.tmp-wt-'],
  modulePathIgnorePatterns: ['<rootDir>/\\.tmp-wt-'],
};
```

The anchor matters. An unanchored `\.tmp-wt-` matches every path *inside* a worktree too — whose own `<rootDir>` is `.tmp-wt-<name>/` — so a member running Jest in its worktree would find no tests at all. `<rootDir>/` pins the pattern to the checkout the run started in.

**ESLint** (flat config) — ignore the directories:

```js
// eslint.config.js
module.exports = [
  { ignores: [".tmp-wt-*/**", "node_modules/**"] },
];
```

**Dependency resolution.** Member worktrees carry no `node_modules` of their own; Node resolves `require()` by walking upward from the worktree to the project root, which is why a worktree under the root works without an install. That is Node-style upward lookup, not a general property — other ecosystems (a Python virtualenv, a Go module cache, a .NET restore) need their own provisioning inside the worktree, which the `WorktreeCreate` hook does not do for them (#3123 AC7).

Never remove a worktree with `rm -rf` or `git worktree remove --force`: a hub link inside it would be followed. The framework's teardown unlinks first, verifies, then removes without `--force`; a halt keeps every worktree for inspection and `git worktree list` shows them.

---

## What Stays Sequential

Everything the disjointness check cannot prove. The sequential thesis — one issue, one commit range, every gate, state on disk — still governs the tail, the merge-back, the review gate and the audits; `--concurrent` moves only the TDD cycle of provably independent members into parallel worktrees, and brings each result back through a gate before it counts. See [Sequential Workflow vs. Agent Swarm](../03-Philosophy/Sequential-vs-Swarm.md).

---

**End of Concurrent Work Within One Epic**
