# Tutorial 3: Your First Epic

**Level:** Intermediate — you have the single-issue loop down, now group work into an epic
**Time:** ~60 minutes (most of it `/work --nonstop` chewing through both stories)
**Outcome:** A two-story epic, reviewed, branched, autonomously implemented end-to-end with `/work --nonstop`, smoke-tested, and closed in one go via `/done`.

---

## Before You Start

You finished Tutorial 2. That means:

- Your project (`my-first-idpf-project`) is a small Node.js + Express app with a working `GET /health` endpoint
- Issue #1 is **Done** on the project board
- The branch `feature/health-endpoint` is pushed but **not merged to `main`** — the work is still parked on the branch
- `CHARTER.md` describes a local Node web app with Jest as the test framework

Launch a session via the **Claude** button on your project's card in Praxis Hub Manager. After the **Session Initialized** block prints, confirm you are on `feature/health-endpoint`:

```bash
git branch --show-current
```

If you accidentally checked out `main` after Tutorial 2, switch back: `git checkout feature/health-endpoint`.

---

## What You Are About to Do

In Tutorial 2 you drove **one issue** (a `/enhancement`) end-to-end. That is the right shape for a single small change. When work has more than one moving piece — multiple endpoints, a feature with a config side-effect, anything that benefits from a shared rationale — the right shape is an **epic** with **stories** under it.

For this tutorial the epic is:

> **API Versioning & Observability** — give the API a version endpoint and add request logging across all routes.

Two stories will hang off it:

| Story | What it adds |
|---|---|
| **Story 1** | `GET /api/version` returns the version from `package.json` as JSON |
| **Story 2** | Request-logging middleware applied to every route, including `/health` and `/api/version` |

The flow you will run:

| Phase | Command | What it does |
|---|---|---|
| 1 | `/add-story` (×2) | First call creates the epic *and* the first story; second call adds another story to the existing epic |
| 2 | `/review-issue {epic#}` | Reviews the epic body and recursively reviews each sub-issue |
| 3 | `/assign-branch {epic#}` | Attaches the epic and all its sub-issues to the current branch in one go |
| 4 | `/work {epic#} --nonstop` | Processes every sub-issue end-to-end with TDD, **no STOP between stories** |
| 5 | Smoke-test | Confirm both new endpoints respond and the log line appears |
| 6 | `/done {epic#}` | Closes every sub-issue and the epic in one batch, pushes once |

The big new thing in this tutorial is `/work --nonstop`. In Tutorial 2 every command stopped and waited. Here, **only the boundary commands stop** — `/work` plows through both stories without asking. You watch.

---

## Step 1: Add the First Story (Creates the Epic Inline)

`/add-story` is built so you do not need a separate `/epic` command. If you call it without an epic to attach to, it offers to create one for you, then continues into story creation.

Type:

```
/add-story
```

Claude lists existing open epics (you have none yet) and offers a **Create new epic** option. Pick that. It then asks:

**1. Theme for the epic.** Answer with the line above:

```
API Versioning & Observability
```

Claude validates the theme against `CHARTER.md` to confirm it is in scope. Your charter scopes "one HTTP endpoint that returns a JSON health response" — adding more endpoints and middleware is a natural extension, not a scope expansion. If `/add-story` flags a charter mismatch, that is the cue to update the charter (`/charter update`) before adding stories. For this tutorial the theme is in scope.

Claude creates the epic with `gh pmu create --title "Epic: API Versioning & Observability" --label epic` and reports the epic number (e.g., `#3` — your number may differ). The epic body is the standard template: a Vision section, an empty Stories list (about to fill up), and Acceptance Criteria for the epic as a whole.

Then it moves directly into story creation. Answers for Story 1:

| Question | Answer |
|---|---|
| Story title | `Add /api/version endpoint that returns package.json version` |
| As a / I want / so that | *"As a client of the API, I want a version endpoint so I can confirm which build is running."* |
| Acceptance Criteria | (paste the three from the table below) |
| Priority | `P2` |

**Story 1 acceptance criteria:**

```
- [ ] Server reads `version` from package.json on boot (not hardcoded)
- [ ] GET /api/version returns 200 with JSON body { "version": "<x.y.z>" }
- [ ] Jest test asserts the endpoint returns the version currently in package.json
```

Claude creates the story (e.g., `#4`), links it to the epic, and reports:

```
Created Epic #3: API Versioning & Observability
Created Story #4: Add /api/version endpoint that returns package.json version
   Parent: Epic #3
   Priority: P2

Say "/add-story 3" to add another story to this epic, or
"/review-issue 3" when the epic is complete.
```

And **STOPS**.

---

## Step 2: Add the Second Story

Now that the epic exists, the second `/add-story` call attaches to it directly. Pass the epic number:

```
/add-story 3
```

(Substitute your actual epic number.)

Claude skips epic selection (you supplied it) and goes straight to story questions. Answer for Story 2:

| Question | Answer |
|---|---|
| Story title | `Add request logging middleware applied to every route` |
| As a / I want / so that | *"As a developer running the app locally, I want every request logged with method, path, and timestamp so I can see traffic in real time."* |
| Acceptance Criteria | (paste the three below) |
| Priority | `P2` |

**Story 2 acceptance criteria:**

```
- [ ] Middleware logs `[ISO 8601 timestamp] METHOD /path` to stdout for every request
- [ ] Middleware applies before the /health and /api/version handlers
- [ ] Jest test issues a request and asserts the expected log line was written
```

Claude reports the new story (e.g., `#5`) and STOPs. The epic now has two sub-issues.

Quick sanity check from PHM project card → **Links → Kanban**: you should see Epic #3 in Backlog with Story #4 and Story #5 listed underneath as sub-issues.

---

## Step 3: Review the Epic

```
/review-issue 3
```

When `/review-issue` sees the `epic` label on issue #3, it does two things differently than for a single enhancement:

1. **Reviews the epic body itself** against the epic-review criteria from `.claude/metadata/review-criteria.json` — Vision is filled, Acceptance Criteria are present, Stories are listed.
2. **Recurses into each sub-issue** (#4 and #5), running the standard story review on each. If any sub-issue is sparse, the review flags it and (if needed) auto-generates a fuller body from your acceptance criteria.

The output is a structured comment posted to the epic, plus per-sub-issue review comments. The recommendation at the end of the epic comment is one of **Ready for work / Needs minor revision / Needs revision / Needs major rework**.

If the recommendation is anything other than **Ready for work**, run:

```
/resolve-review 3
```

`/resolve-review` walks the findings on the epic and on each sub-issue, fixing what it can auto-fix and asking you about the rest, then re-runs `/review-issue` to confirm.

For the two stories you wrote in Steps 1 and 2 — well-formed ACs, clear titles — you should land on **Ready for work** the first time.

`/review-issue` STOPs when finished.

---

## Step 4: Attach the Epic to Your Branch

You are still on `feature/health-endpoint` from Tutorial 2 — no need for a new branch for this small expansion. (You *could* cut a fresh `feature/api-v1` branch with `/create-branch`; this tutorial reuses the existing one to keep the flow tight.)

```
/assign-branch 3
```

When you assign an **epic** to a branch, `/assign-branch` attaches the epic and **all of its sub-issues** in a single batch. The branch tracker on your project board picks up #3, #4, and #5 as sub-issues; each individual issue body gets a *"Branch: feature/health-endpoint"* line; statuses move from Backlog to Ready.

`/assign-branch` STOPs.

---

## Step 5: Work the Epic — `/work {epic#} --nonstop`

This is the new shape. In Tutorial 2 you ran `/work #1` and it processed one issue. Here you run:

```
/work 3 --nonstop
```

`/work` sees the `epic` label on #3 and enters **autonomous epic processing mode**. With `--nonstop`:

- Sub-issues are processed in ascending numeric order (`#4` before `#5`).
- For each sub-issue: move to In Progress → run the full TDD cycle for every AC (RED → GREEN → REFACTOR with the `tdd-process` checklist enforced, exactly as in Tutorial 2) → run the full test suite → move to In Review.
- **No STOP between sub-issues.** When `#4` reaches In Review, Claude immediately starts `#5`.
- Commits are still scoped — one commit per AC deliverable, message `Refs #4 — ...` or `Refs #5 — ...`.
- **The push is deferred** until `/done`. Commits land in your local branch only during `/work`.
- Per-sub-issue progress reports appear: `Sub-issue #4: Add /api/version endpoint → In Review (1/2 processed)`.

When both sub-issues are in In Review, `/work` evaluates the **epic's own** acceptance criteria and moves the epic to In Review. Then it STOPs:

```
Nonstop Processing Complete
  Sub-issues processed: 2
  Sub-issues skipped: 0
  Epic #3: API Versioning & Observability — In Review
Say "done" or run /done #3 to close the epic and all sub-issues.
```

Expect this to take 20–40 minutes, mostly during the GREEN phases. You can step away. If anything fails — a test does not pass for the right reason, an AC cannot be satisfied, `gh pmu` errors out — `/work --nonstop` halts immediately, reports which sub-issue and AC, and tells you the resume command. Address the failure, then re-run `/work 3 --nonstop`; it skips sub-issues already in In Review.

### What `--nonstop` is *not* for

`--nonstop` is convenience for an epic whose stories are well-specified and unlikely to surprise you. The first time you run an epic — when you do not know yet whether the stories' ACs were too sparse — drop the flag. Plain `/work 3` STOPs between sub-issues and lets you sanity-check each one before continuing. Once you have run a few epics, `--nonstop` is the default.

---

## Step 6: Smoke-Test the Two New Endpoints

Before closing, exercise both new pieces. Same two approaches as in Tutorial 2.

### Approach A — run it yourself

In Praxis Hub Manager, on your project card, click **Open → Terminal**. Then:

```bash
npm start
```

Open another terminal the same way (**Open → Terminal** again on the same card) and run:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/version
```

Look for:

- `/health` still works, same shape as Tutorial 2.
- `/api/version` returns `{"version":"<your package.json version>"}` (probably `"0.1.0"` if you have not bumped it).
- Back in the first terminal — the one running `npm start` — you should see one log line **per request** in the form `[2026-04-25T19:43:12.118Z] GET /health` and similar for `/api/version`. That is Story 2's middleware firing.

Stop the server with Ctrl+C.

### Approach B — ask Claude

```
smoke-test the new endpoints — start the server, hit /health and /api/version, show me the log output, then stop the server
```

Claude spawns the server, hits both routes, captures the request-log output, reports back, and shuts down.

If anything is off — wrong version, log line missing, log line at the wrong stage of the request — say so. Claude will fix it on the same branch (more `Refs #4` or `Refs #5` commits) before you close.

---

## Step 7: Close the Epic in One Shot

```
/done 3
```

When `/done` sees the `epic` label on #3, it enters **epic completion mode** (per `done.md` Step 1a):

1. Fetches the sub-issue list.
2. Classifies each sub-issue: `done` (skip), `in_review` (process), `in_progress` (warn), `backlog`/`ready` (warn).
3. For each `in_review` sub-issue, runs the standard `/done` preamble: AC checkoff verification, diff verification via `done-verify.js`, post a summary comment, move to Done. **No push between sub-issues** — push is deferred to a single batch push after the epic itself is closed.
4. After all sub-issues are Done, runs the preamble for the epic, evaluates epic-level ACs, and moves the epic to Done.
5. Pushes the branch once at the end.
6. Starts CI monitoring in the background if push-triggered workflows exist.

Output looks like:

```
Sub-issue #4: Add /api/version endpoint → Done
Sub-issue #5: Add request logging middleware → Done
Epic #3: API Versioning & Observability — Done
  Sub-issues completed: 2
  Sub-issues already done: 0
  Sub-issues warned (not ready): 0
  Epic: Done
Pushed.
CI monitoring started in background.
```

If `/done` flags warnings during diff verification on any sub-issue, it STOPs and asks you to confirm before continuing — same gate as Tutorial 2, just per-sub-issue.

On your project board: #3, #4, and #5 are all in the Done column. The branch on GitHub now has both stories' commits, each tagged `Refs #4` or `Refs #5` plus the epic-level metadata.

---

## What You Just Did

You drove a multi-issue epic through the IDPF pipeline:

1. **One `/add-story` call created the epic** *and* the first story
2. **A second `/add-story` call** added a second story to the existing epic
3. `/review-issue` validated the epic and **recursed into both sub-issues**
4. `/assign-branch` attached the epic plus all its sub-issues to your existing branch in one batch
5. `/work {epic#} --nonstop` autonomously processed every sub-issue end-to-end with TDD — no STOP between stories
6. You smoke-tested both new endpoints
7. `/done {epic#}` closed every sub-issue and the epic in one batch, pushed once

Compare that to Tutorial 2: same core loop, same TDD enforcement, same STOP boundaries — but now grouped under one parent issue, processed without intervention between sub-issues, closed atomically. The shape is what scales when work gets bigger.

---

## When to Use Which Shape

| Shape | When |
|---|---|
| Single `/enhancement` or `/bug`, then `/work` | One small change, one acceptance-criteria set, no shared rationale needed |
| **Epic via `/add-story` (this tutorial)** | 2–4 small stories that share a theme; you are willing to write the ACs upfront |
| `/proposal` → `/create-prd` → `/create-backlog` (heavy path) | A larger feature that needs a written rationale, scope debate, and a backlog of stories created from the PRD |

For a learning project this size, `/add-story` is the right tool. For real production work with stakeholders, the heavier path earns its keep.

---

## When to Drop `--nonstop`

`--nonstop` saves you the keystrokes between sub-issues but it also defers your sanity-checking until the end. Drop the flag when:

- The stories' ACs are vague or you suspect they will need adjustment mid-flight
- You are testing a new pattern in your codebase and want to see it land before more stories build on it
- Failure on Story 1 would change how you write Story 2

Plain `/work {epic#}` (no `--nonstop`) STOPs between sub-issues and waits for you to say *"continue"*. Same epic completion, more checkpoints.

---

## What to Try Next

You now have two endpoints, request logging, a CHARTER that still describes the project accurately, and a clean working branch with the work pushed.

A natural progression:

- **Merge the branch.** `/merge-branch feature/health-endpoint` runs the gated checks (tests pass, all issues on the branch are Done, no untracked scope) and merges to `main`.
- **Cut a release.** `/prepare-release` walks you through bumping the version in `package.json`, generating a CHANGELOG entry, and tagging.
- **File a bigger feature.** Open a `/proposal` for something with real ambiguity (auth? persistence?) and walk the heavy path: `/review-proposal` → `/create-prd` → `/review-prd` → `/create-backlog`. The PRD is where the framework's scope-control machinery is doing its hardest work.

---

**End of Tutorial 3**
