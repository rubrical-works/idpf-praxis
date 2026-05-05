# Tutorial 2: Your First Issue, Start to Finish

**Level:** Intermediate — you have a project and a charter, now drive a real piece of work
**Time:** ~40 minutes (most of it is Claude working; you are checking in)
**Outcome:** A purpose-built charter for a small Node.js web app, plus one enhancement filed, planned, branched, worked, and closed — leaving a working app on a feature branch for Tutorial 3 to extend.

---

## Before You Start

You finished Tutorial 1. That means:

- A project (`my-first-idpf-project`) exists on disk, linked to a hub via Praxis Hub Manager
- A GitHub repository was created by the wizard and the project board is live
- A generic `CHARTER.md` is in place — you will replace it in Step 1
- The session banner reads `GitHub Workflow: Active via gh pmu ...`

If any of those are not true, go back and finish Tutorial 1 first.

Launch a session via the **Claude** button on your project's card in Praxis Hub Manager. Wait for the **Session Initialized** block, then continue.

---

## What You Are About to Do

In Tutorial 1 the charter the wizard generated was a generic placeholder. In this tutorial you will:

1. **Reset the charter** so it describes a real, narrow project: a small **local Node.js web app**.
2. **Pick a stack** (Express, Fastify, Hono, or plain `http`) and accept it into the new charter.
3. **Take one round trip through the IDPF loop** — file an enhancement, review it, branch it, work it, close it — using the commands the framework is built around.

The core loop has six phases, separated by **STOP boundaries**:

| Phase | Command | What it does |
|---|---|---|
| 1 | `/enhancement` | Files a GitHub issue with the right template |
| 2 | `/review-issue` | Reads it, flags missing acceptance criteria or scope, applies a `reviewed` label |
| 2b | `/resolve-review` | (Only if review found problems) walks the findings, fixes the issue body |
| 3 | `/create-branch` + `/assign-branch` | Creates a working branch and attaches the issue |
| 4 | `/work` | Implements the issue using TDD, one acceptance criterion at a time |
| 5 | `/done` | Verifies all ACs are checked, pushes the branch, moves the issue to Done |

Between each phase Claude stops. Nothing advances without you typing something. STOPs are where you catch a misunderstood criterion before it becomes a misunderstood diff.

You will end with a real, tiny, working app — a Node web server that responds to one route — on a feature branch. Tutorial 3 picks up the same project and expands it.

---

## Step 1: Reset the Charter

The charter the wizard generated is a placeholder. For a tutorial you want a real, scoped charter that subsequent commands can validate against.

Type:

```
reset the charter
```

Claude will confirm before deleting (`CHARTER.md` is overwritten by `/charter` after a reset, but it asks once). Confirm with **yes**. Claude removes `CHARTER.md` and runs `/charter`. Because the project has no application code yet, `/charter` enters **Inception Mode** and asks a short series of questions.

Answer them with the values below — adapt the wording to your taste.

| # | Question | Suggested answer |
|---|---|---|
| 1 | What are you building? | *"A small local Node.js web app I can run on `localhost` to learn IDPF end-to-end."* |
| 2 | What problem does it solve? | *"It is a learning sandbox — the goal is to exercise the IDPF loop on real (if tiny) code."* |
| 3 | What technology/language? | **Node.js**. When Claude asks which framework, see the table below. |
| 4 | What is in scope for v1? | *"One HTTP endpoint that returns a JSON health response. Tests for the endpoint. Local-only — no deployment."* |
| 5 | What testing framework? | **Jest** (default for Node) |

When Claude asks which Node framework, pick from these four. Any of them works for the rest of the tutorial; **Express is the safe default** because Tutorial 3 assumes it.

| Option | When to pick it |
|---|---|
| **Express** *(recommended)* | Mature, biggest ecosystem, easiest to extend in later tutorials |
| **Fastify** | Faster than Express; built-in schema validation |
| **Hono** | Lightweight, web-standard `fetch`-style API; good for edge runtimes |
| **Plain `http` module** | Zero dependencies; you want to see the raw machinery |

When asked about deployment, choose **Self-hosted/Not applicable** — this is a local-only learning project.

Claude writes the new `CHARTER.md`, updates `framework-config.json` (recording the stack and any deployment-target skills), commits both with a message like *"Initialize project charter and lifecycle structure"*, and **STOPS**. Read the charter before continuing — it is the document every later command will check work against.

---

## Step 2: Take Stock of Your Skills

Every IDPF project starts with the same 11 **default skills** under `.claude/skills/` — declared in `.claude/metadata/skill-keywords.json` (`defaultSkills`). Ask Claude:

```
list my installed skills
```

You should see exactly these 11. They cluster into three groups:

**TDD enforcement (six skills)** — these are what `/work` leans on most heavily.

| Skill | What it is |
|---|---|
| `tdd-process` | The orchestrator — RED/GREEN/REFACTOR phase enforcement checklists (`tdd-checklist.json`) consumed by `/work` |
| `tdd-red-phase` | Reference for writing a failing test correctly and verifying it fails for the right reason |
| `tdd-green-phase` | Reference for the minimum production change to make the failing test pass |
| `tdd-refactor-phase` | Reference for the cleanup pass after green while keeping tests green |
| `tdd-failure-recovery` | Diagnostic playbook when a test fails for an unexpected reason |
| `tdd-refactor-coverage-audit` | Advisory audit that checks newly-added source files have paired tests (advisory only, never blocks the gate) |

**Test authoring (one skill).**

| Skill | What it is |
|---|---|
| `test-writing-patterns` | Test structure, assertion shape, naming, and test-double patterns |

**General code quality (four skills).**

| Skill | What it is |
|---|---|
| `codebase-analysis` | Extracts structure, tech stack, and patterns from an existing codebase (used by `/charter` Extraction Mode) |
| `anti-pattern-analysis` | Systematic detection of anti-patterns during code review with refactoring guidance |
| `error-handling-patterns` | Consistent error handling — error hierarchies, API responses, logging integration |
| `command-spec-audit` | Evaluates command specifications for quality, completeness, and extension-point coverage |

You do **not** need to install anything else for this tutorial. The TDD-cluster skills are what `/work` will lean on for Step 6; the rest are reference material Claude consults when relevant.

---

## Step 3: File the Enhancement

You are going to add the first piece of real functionality: a `/health` endpoint that returns a JSON response. Tiny, testable, and a natural seed for Tutorial 3 to extend.

Type:

```
/enhancement Add /health endpoint that returns server status
```

Claude walks the `/enhancement` template. When it asks for body detail, give it acceptance criteria like:

```
Description:
The server should expose GET /health that returns {"status":"ok","timestamp":"<ISO 8601>"}
with HTTP 200 and content-type application/json.

Motivation:
Foundation for monitoring and the first real route on the server.

Scope:
- In:  GET /health route, JSON response, Jest test that hits the route.
- Out: authentication, persistent storage, additional routes.

Acceptance Criteria:
- [ ] GET /health responds with HTTP 200
- [ ] Response body is valid JSON containing "status":"ok" and an ISO 8601 "timestamp"
- [ ] A Jest test boots the server (or app) and asserts both fields
- [ ] Server starts via `npm start` and listens on port 3000
```

Claude runs `gh pmu create` with the right flags (`--label enhancement --status backlog --priority p2 --assignee @me`) and reports:

```
Created: Issue #1 — [Enhancement]: Add /health endpoint that returns server status
Status: Backlog
Label: enhancement

Say "/review-issue #1" then "/assign-branch #1" then "/work #1" to start working on this enhancement.
```

Then it **STOPS**. Notice what did *not* happen: no code was written, no branch was created, no commits were made. The whole effect of `/enhancement` is one GitHub issue on the project board.

> **First-time `gh pmu` prompt.** If this is the first time `gh pmu` has been used in this project, you may see a one-time **terms acceptance** prompt. Read the terms in the output, then say **yes** when Claude asks for consent — Claude will run `gh pmu accept --yes` for you and retry.

Confirm the issue landed by opening the Kanban board: in Praxis Hub Manager, expand your project's card, click **Links → Kanban**. (The same dropdown has **Links → Repo** for the GitHub repository itself.) Issue #1 should be in the **Backlog** column.

---

## Step 4: Review the Issue

Before working it, ask Claude to review:

```
/review-issue #1
```

`/review-issue` reads the issue, classifies its type (enhancement), loads the enhancement-review criteria from `.claude/metadata/review-criteria.json`, and posts a structured review comment to the issue. For each criterion it emits ✅, ⚠️, or ❌ with evidence. It also applies a `reviewed` label and ends with one of:

- **Ready for work**
- **Needs minor revision**
- **Needs revision**
- **Needs major rework**

For a well-filled issue you should see **Ready for work**. Claude **STOPS** after reporting.

### If the review found problems

If the recommendation is anything *other* than Ready for work, run:

```
/resolve-review #1
```

`/resolve-review` parses the latest review comment, splits findings into auto-fixable (e.g., missing priority, missing label) and needs-user-input (e.g., a vague AC). It applies the auto-fixes, walks you through the user-input findings one at a time (Accept suggestion / Provide alternative / Skip), then re-runs `/review-issue` to confirm. When the recommendation flips to **Ready for work**, the command reports and STOPs.

For this tutorial, if the issue body you wrote in Step 3 was reasonably complete, you likely will not need `/resolve-review` at all — the review will say Ready for work the first time.

---

## Step 5: Place It on a Branch

IDPF never commits to `main` directly. Every piece of work lands on a branch, and every branch has a **tracker** — a parent GitHub issue that groups the work on that branch.

Create a branch:

```
/create-branch feature/health-endpoint
```

`/create-branch` creates the git branch (`git checkout -b`), pushes it (`git push -u origin`), and files a **branch tracker** issue on the project board with the `branch` label. The tracker holds metadata — which sub-issues live on this branch, which release track it targets, whether it merges into main or stays as a side branch.

Naming convention: `feature/` for new functionality, `patch/` for bug fixes, `release/` for release branches, `hotfix/` for urgent main-branch patches. Convention only — not enforced.

Now attach your issue to the branch:

```
/assign-branch #1
```

Claude detects the current branch, assigns issue #1 to it (the issue body gets a *"Branch: feature/health-endpoint"* line, the branch tracker gets #1 added to its sub-issues, the issue moves from Backlog to Ready), and **STOPS**.

---

## Step 6: Work the Issue

```
/work #1
```

`/work` is the biggest command in IDPF and the one you will invoke most. For your single enhancement it will:

1. Run a **preamble** — verify the issue exists, is on a branch, parse the acceptance criteria.
2. Load the **TDD checklist** from the `tdd-process` skill — this is what enforces the RED → GREEN → REFACTOR phases.
3. Move the issue to **In Progress**.
4. For each acceptance criterion, run a **TDD cycle**:
   - **RED:** Write a failing Jest test that asserts the AC.
   - **GREEN:** Write the minimum production code to make it pass. For a brand-new project, this is where Claude will run `npm init -y`, install Express (or whatever you chose) + Jest, and scaffold a project structure (`src/server.js`, `tests/health.test.js`, `package.json` scripts).
   - **REFACTOR:** Clean up duplication or naming if any exists; re-run tests.
   - **COMMIT:** `Refs #1 — <AC description>`.
5. Run the **full Jest suite** once the last criterion is checked.
6. Move the issue to **In Review**.
7. **STOP** and wait for you to say *done*.

Expect ten to thirty minutes of activity — most of that is the first-AC cycle where Claude is also setting up `package.json` and dependencies. Claude narrates each phase: *"Writing failing test... test fails as expected... installing express, jest... implementing GET /health... test passes... committing..."*.

Two things to notice:

**Tests come first.** For each AC, Claude writes a failing test before writing production code. The test must fail for the right reason before any implementation lands. This is the `tdd-red-phase` gate from your skills.

**Commits are scoped.** One commit per AC deliverable, message `Refs #1 — ...`. The `Refs` keyword (not `Fixes` or `Closes`) is deliberate: GitHub will not auto-close the issue when these commits land on `main`. Closure happens in `/done`.

When `/work` finishes, Claude prints:

```
Issue #1: Add /health endpoint that returns server status — In Review
Say "done" or run /done #1 to close.
```

And **STOPS**. Do not close yet.

---

## Step 7: Smoke-Test the App

Before closing the issue, confirm the app actually runs and the new endpoint actually responds. Tests cover behavior in isolation; a smoke test confirms the boot path, the port binding, and the end-to-end JSON response. Pick one of two approaches.

### Approach A — run it yourself in a project terminal

In Praxis Hub Manager, on your project card, click **Open → Terminal**. PHM opens a terminal already pointed at the project directory. Then:

```bash
npm start
```

Wait for *"listening on port 3000"* (or similar). In another terminal — **Open → Terminal** again on the same card opens a second window — run:

```bash
curl http://localhost:3000/health
```

Expected response (formatting may vary):

```json
{"status":"ok","timestamp":"2026-04-25T19:43:12.118Z"}
```

Stop the server with Ctrl+C in the first terminal when you are done.

### Approach B — ask Claude to do it

Back in your Claude session, just say:

```
smoke-test the /health endpoint — start the server, hit it with curl, then stop the server
```

Claude will spawn `npm start` in the background, wait for the listen log, hit `/health` with `curl`, report the response back to you, and shut the server down. This is faster but you are trusting Claude's read of the response — for a brand-new project, doing it yourself once (Approach A) builds the muscle memory of *"yes the app actually runs."*

### What to look for either way

- HTTP 200 status
- A JSON body with `"status":"ok"` and a parseable `timestamp`
- The server process exits cleanly when stopped

If anything is off — wrong port, wrong shape, missing field, server crashes on boot — tell Claude what you saw. It will commit a fix on the same branch before you move on.

---

## Step 8: Close the Issue

```
/done #1
```

`/done` does the verification work for you — its preamble (`done-preamble.js`) runs `done-verify.js` against the diff, checks acceptance-criteria checkoff, validates the tracker link, and checks for unpushed CI workflows. The full Jest suite already ran at the end of `/work` (Step 4f), so tests are confirmed green before you ever get here.

What `/done` does, in order:

1. **AC verification** — every acceptance-criteria checkbox on the issue must be `[x]`. If any is unchecked, `/done` STOPs and tells you which.
2. **Diff verification** — `done-verify.js` examines the commits since the branch diverged from `main` and flags anomalies (unexpected file changes, suspiciously small diffs, commits that don't reference `#1`, etc.). If it returns warnings, `/done` STOPs and asks: *"Continue? (yes/no)"* — read the warnings, decide, and answer.
3. **Post a summary comment** on the issue listing files changed and a link to the latest commit.
4. **Push the branch** to the remote.
5. **Move the issue to Done** on the project board, linked to the branch tracker.
6. **Start CI monitoring in the background** (if push-triggered workflows exist on the repo). A pass/fail report comes back later.

If `/done` flags warnings you do not understand, say *"explain warning #2"* before answering yes/no — it is much cheaper to ask than to revert later.

When `/done` finishes you will see something like:

```
Closed: Issue #1 — Add /health endpoint that returns server status
Branch: feature/health-endpoint pushed to origin
```

On your project board the issue card moves to the Done column. The branch is on GitHub with each commit referencing `#1`.

You are leaving the work **on the branch**, not merged to `main`. That is intentional — Tutorial 3 picks up this same project, on this same branch, and adds more functionality before any merge.

---

## What You Just Did

You drove a full enhancement through the IDPF pipeline:

1. **Reset the charter** to describe a real Node web-app project
2. **Inspected the 11 default skills** — TDD phase enforcement, test-writing patterns, and code-quality references
3. `/enhancement` filed a real piece of work
4. `/review-issue` validated the issue body before touching code
5. `/create-branch` + `/assign-branch` placed it on a working branch
6. `/work` implemented it under TDD, one AC at a time, with focused commits
7. **You smoke-tested the running app** (terminal yourself, or asked Claude to do it)
8. `/done` closed it on the board and pushed

That is the core IDPF loop. Every bug, every small enhancement runs through these same commands. The only thing changing is what you put in the issue body.

---

## When to Use Which Command

| Situation | Start with |
|---|---|
| Something is broken | `/bug` |
| I want a small improvement to something that exists | `/enhancement` |
| I have a big idea that needs planning first | `/proposal` (leads into `/create-prd` and `/create-backlog`) |
| An issue exists and I want to work it | `/work #N` |
| The review flagged problems on an issue | `/resolve-review #N` |
| An issue is finished and I want to close it | `/done #N` |
| I need a working branch for new code | `/create-branch <name>` then `/assign-branch #N` |
| The charter no longer describes the project | *"reset the charter"* or `/charter update` |

---

## STOP Boundaries — Why Everything Pauses

Every IDPF command ends by waiting for you. STOPs are checkpoints where a small problem can be caught before it grows. Rewinding from In Review costs one sentence; rewinding from Done costs a revert; rewinding after a merge costs a PR.

Resist the urge to autopilot past STOPs. If you catch yourself typing *"continue"* without reading what Claude wrote, slow down and read.

---

## What to Try Next

Tutorial 3 (`03-Your-First-Epic.md`) picks up your `feature/health-endpoint` project and expands it into a small epic — two stories filed with `/add-story`, grouped under one epic, branched, reviewed, and worked end-to-end with `/work {epic#} --nonstop`.

If you want to practice the loop first, file another enhancement on the same branch right now — *"add a `/version` endpoint that returns the package version"* is a natural follow-up. The second time through, the commands feel routine.

---

**End of Tutorial 2**
