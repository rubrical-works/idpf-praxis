# IDPF Project Workflow Guide

**Audience:** New users of the IDPF Framework
**Scope:** Full project lifecycle from `/charter` to `/prepare-release`

---

## Overview

The IDPF (Interactive Development Process Framework) provides a structured, AI-assisted workflow for software development. Every project follows the same lifecycle:

```
Charter → Proposal → PRD → Backlog → Work → Release
```

Each stage has a dedicated slash command. You interact with these commands through Claude Code, and the AI assistant handles the technical execution — writing code, running tests, managing Git operations — on your behalf.

**Your role throughout this guide is: decide, direct, review, approve.** The AI's role is: analyze, implement, test, commit. For a full explanation, see `02-Your-Role.md`.

This guide walks through each stage in order, showing what you run, what happens, and what to do next.

---

## GitHub Is Required

IDPF is built on GitHub. This is not an optional integration — it is the foundation that every workflow stage depends on.

**Why:** The framework needs a place to track issues, manage status transitions, coordinate branches, and produce releases. Rather than inventing its own tracking system, IDPF uses GitHub Projects as its single source of truth. Every slash command that creates, moves, assigns, or closes work does so through GitHub.

**`gh-pmu`** (Project Management Utility) is a GitHub CLI extension that bridges the gap between GitHub's native capabilities and what IDPF needs. It was itself built using IDPF. The extension provides issue lifecycle management, branch tracking, Kanban boards, and bulk operations that the framework's slash commands call behind the scenes.

You don't need to learn `gh pmu` commands to use IDPF — the slash commands abstract them away. But it helps to know that when `/work #42` moves an issue to `in_progress`, or `/create-backlog` generates a dozen stories, those operations are flowing through `gh pmu` into your GitHub Project.

**What this means for you:**
- Your project must be a GitHub repository
- You need a GitHub Project (created during setup via `gh pmu init`)
- Issues, epics, stories, branches, and releases all live in GitHub

**Not on GitHub?** IDPF currently requires GitHub, but the architecture is portable. The slash commands call `gh pmu` as an abstraction layer — they don't use raw GitHub APIs directly. A `glab-pmu` equivalent for GitLab (which has comparable issues, boards, merge requests, and releases) would let the same workflow run there. If GitLab support matters to you, a port of `gh-pmu` is the path forward.

---

## Prerequisites

Before starting, ensure you have:

1. **Claude Code** installed and running
2. **GitHub CLI** (`gh`) installed and authenticated
3. **px-manager** (Praxis Hub Manager) — handles hub installation, project linking, `gh-pmu` extension setup, and GitHub Project initialization

---

## The Workflow at a Glance

```
 Stage 1: CHARTER          Define project vision, scope, tech stack
    │
 Stage 2: PROPOSAL         Capture an idea or enhancement
    │
 Stage 3: REVIEW           Evaluate proposal quality
    │
 Stage 4: PATHS (optional) Discover scenarios collaboratively
    │
 Stage 4b: UI DESIGN (opt) Catalog screens and create mockups
    │
 Stage 5: PRD              Transform proposal into requirements
    │
 Stage 6: BACKLOG          Create epics and stories from PRD
    │
 Stage 7: BRANCH           Create a working branch
    │
 Stage 8: WORK             Implement stories with TDD
    │
 Stage 9: DONE             Complete stories
    │
 Stage 10: RELEASE         Merge, tag, and publish
```

Not every project uses every stage. Small fixes can skip straight to a `/bug` or `/enhancement` issue and go directly to work. But for planned features, the full pipeline ensures nothing is missed.

---

## Stage 1: Project Charter (`/charter`)

**What it does:** Establishes your project's identity — vision, tech stack, scope boundaries, and lifecycle structure.

**Run:**
```
/charter
```

**What happens:**
- If your project has existing code, the assistant analyzes it (**Extraction Mode**) to detect your tech stack, architecture, and patterns
- If starting fresh, the assistant asks 5 essential questions (**Inception Mode**): what you're building, the problem it solves, your tech stack, scope boundaries, and testing approach
- For complex projects, up to 4 follow-up questions are asked based on what it detects (e.g., multi-service architecture, compliance needs)

**What it creates:**
```
CHARTER.md                     ← Main charter (vision, tech, scope)
Inception/
  ├── Charter-Details.md       ← Detailed vision and problem statement
  ├── Tech-Stack.md            ← Languages, frameworks, dependencies
  ├── Scope-Boundaries.md      ← In-scope and out-of-scope items
  ├── Constraints.md           ← NFRs, compliance, security
  ├── Architecture.md          ← System structure
  ├── Test-Strategy.md         ← TDD approach, coverage targets
  └── Milestones.md            ← Delivery milestones (TBD)
Construction/
  ├── Test-Plans/
  ├── Design-Decisions/
  └── Tech-Debt/
Transition/
  ├── Deployment-Guide.md
  ├── Runbook.md
  └── User-Documentation.md
```

**The charter is mandatory.** Every session checks for it. If it's missing or incomplete, the assistant will prompt you to create one before doing anything else.

**Next step:** Start capturing ideas with `/proposal`, or jump to `/bug` or `/enhancement` for immediate issues.

### Updating Later

As your project evolves:
- `/charter update` — Modify specific sections (vision, scope, tech stack)
- `/charter refresh` — Re-analyze the codebase and merge findings
- `/charter validate` — Check if current work aligns with charter scope

---

## Stage 2: Proposal (`/proposal`)

**What it does:** Captures an idea or enhancement as a structured document with a tracking issue.

**Run:**
```
/proposal Add Dark Mode Support
```

Or without a title (you'll be prompted):
```
/proposal
```

**What happens:**
1. Creates a proposal document from your description
2. Creates a GitHub issue labeled `proposal` linking to the document
3. **STOPS** — does not proceed to implementation

**What it creates:**
- `Proposal/Add-Dark-Mode-Support.md` — Structured document with Problem Statement, Proposed Solution, Implementation Criteria, Alternatives, and Impact Assessment
- GitHub issue with `proposal` label and `**File:** Proposal/Add-Dark-Mode-Support.md` in the body

**The STOP boundary is important.** The assistant will never start implementing after creating a proposal. You decide what happens next.

**Next step:** Review the proposal with `/review-proposal`, then promote to PRD with `/create-prd`.

### Revising a Proposal (`--update`)

A proposal rarely survives review untouched. To revise one in place instead of recreating it:

```
/proposal Add Dark Mode Support --update
```

The assistant offers the document's sections, asks what to change in each one you pick, and applies the edits. On a direct slash-command invocation you can also state the change inline:

```
/proposal Add Dark Mode Support --update rename the risk section to Trade-offs
```

The tracking issue's summary is rewritten to match the revised document; nothing else in the issue changes. The document's tracking-issue link, diagram paths and any prior-art section are preserved unless your instruction names them. If no document exists under that title the command stops rather than creating one, so a mistyped title cannot silently spawn a second proposal.

### Quick Issues (Skipping Proposals)

Not everything needs a proposal. For focused work:

| Command | Use When |
|---------|----------|
| `/bug Fix login timeout` | Reporting a bug with repro steps |
| `/enhancement Add CSV export` | Small, well-defined feature |

Both create a GitHub issue and **STOP**. You work on them later with `/work #N`.

---

## Stage 3: Review (`/review-proposal`)

**What it does:** Evaluates a proposal for completeness, consistency, feasibility, and quality before it becomes a PRD.

**Run:**
```
/review-proposal #42
```

Where `#42` is the proposal's tracking issue number.

**What happens:**
1. Reads the proposal document linked from the issue
2. Asks subjective evaluation questions **one at a time** — your answers shape the review
3. Produces a structured finding with Strengths, Concerns, and Recommendations
4. Determines a recommendation level:
   - **Ready for implementation** — No blocking concerns
   - **Ready with minor revisions** — Small issues, non-blocking
   - **Needs revision** — Significant concerns to address first
   - **Needs major rework** — Fundamental issues
5. Updates the proposal file (increments `Reviews` count, appends to Review Log)
6. Posts a review comment on the GitHub issue

**If revisions are needed:**
```
/resolve-review #42
```
This reads the latest review findings and systematically resolves each one in the proposal document, then triggers a re-review.

**Next step:** Once the review says "Ready for implementation", optionally run `/paths` for scenario discovery, then promote to PRD with `/create-prd #42`.

---

## Stage 4: Path Analysis (`/paths`) — Optional

**What it does:** Collaboratively discovers scenario paths for a proposal or enhancement before requirements are elaborated. You and the AI take turns identifying paths across six categories.

**Run:**
```
/paths #42
```

Where `#42` is a proposal or enhancement issue.

**What happens:**
1. Loads the proposal document (or issue body)
2. Walks through **6 scenario categories** in order, with turn-based discovery:
   - **Nominal Path** — The expected happy path
   - **Alternative Paths** — Valid but non-primary flows
   - **Exception Paths** — Error conditions and system responses
   - **Edge Cases** — Boundary conditions with unusual but valid inputs
   - **Corner Cases** — Combinations of edge cases or rare intersections
   - **Negative Test Scenarios** — Intentionally invalid inputs or states
3. For each category, the AI generates 2–5 candidate scenarios, then asks you to select which apply and add any it missed
4. Consolidates the confirmed paths and writes a `## Path Analysis` section to the proposal document (or posts as an issue comment)
5. On an **enhancement**, additionally generates acceptance criteria from the confirmed paths and appends them to the issue body — grouped by category once six or more paths are confirmed, with paths that duplicate existing criteria skipped

**Useful flags:**

| Flag | Effect |
|------|--------|
| `--quick` | Runs only the first three categories (Nominal, Alternative, Exception). |
| `--dry-run` | Generates all candidates as a non-interactive summary — no prompts, no file changes. |
| `--categories <ids>` | Re-runs selected categories only. Valid: `nominal`, `alternative`, `exception`, `edge`, `corner`, `negative`. |
| `--from-code [path]` | Discovers paths from source code instead of the proposal text. |

**Why use it:** Path analysis front-loads scenario thinking before the PRD stage. When `/create-prd` later generates acceptance criteria and test plans, the path analysis gives it a richer set of scenarios to draw from — reducing the chance of gaps in requirements.

**When to skip it:** For small enhancements, bug fixes, or proposals where the paths are obvious. This step is most valuable for complex features with many interaction modes or error conditions.

**Re-running:** If the proposal evolves, run `/paths` again. It detects an existing `## Path Analysis` section and loads it as a starting point — you can add, remove, or modify paths.

**Next step:** For UI-heavy features, optionally run `/design-system`, `/catalog-screens`, and `/mockups` to design screens before the PRD. Otherwise, promote to PRD with `/create-prd #42`.

---

## Stage 4b: UI Design (`/design-system`, `/catalog-screens`, `/mockups`) — Optional

**What it does:** Establishes a design foundation — tokens, screen specs, and reviewable mockups — before requirements are elaborated. Most valuable when a proposal or enhancement involves user interface changes.

These three commands form a pipeline:

| Command | Purpose | Output |
|---------|---------|--------|
| `/design-system` | Defines or extracts your visual language | DTCG tokens in `Design-System/idpf-design.tokens.json` |
| `/catalog-screens` | Creates screen specs — described manually, discovered from source, or extracted from screenshots | Screen specs in `Mockups/{Name}/Specs/`, registry in `Mockups/screen-catalog.json` |
| `/mockups #42` | Creates reviewable mockups styled with your design tokens | Mockups in `Mockups/{Name}/Screens/` or `AsciiScreens/` |

**Run:**
```
/design-system             ← Establish design tokens (once per project)
/catalog-screens           ← Create or discover screen specs
/mockups #42               ← Create mockups for the proposal/enhancement
```

**What happens:**

**`/design-system`** defines your visual language — palette, spacing scale, typography, border radius — and writes DTCG-compliant tokens. It can also extract tokens from an existing codebase (`--discover`) or from a reference image (`--from-screenshot`).

**`/catalog-screens`** produces structured screen specs with element inventories (inputs, buttons, selects). It works in both directions: choose "Create new screen specs" to describe screens manually for greenfield work, or "Initialize full screen catalog" to bulk-discover them from existing source (React, Vue, Electron, vanilla HTML, React Native) as an "as-built" snapshot. Either way, every screen is registered in `Mockups/screen-catalog.json`.

**`/mockups`** creates the visual representation. Choose one of four output formats:

- **Interactive HTML mockups** → `Screens/*.html` — self-contained pages you open in a browser, showing each UI state with implementation notes attached
- **ASCII/text mockups** → `AsciiScreens/`
- **Interactive UI mockups (drawio.svg)** → `Screens/`
- **Both ASCII + drawio.svg** → written to both directories

and one of six content sources:

- From existing screen specs (produced by `/catalog-screens`)
- From source code discovery
- Describe screens manually
- From issue `#NN` description (offered only when you passed `#NN`)
- From screen catalog
- From reference image

When design tokens exist at `Design-System/idpf-design.tokens.json`, mockups are styled with your actual colors, typography, and spacing; without them, built-in defaults are used. The command reports which applied.

All three commands are fully interactive, asking questions via prompts to guide you through discovery and creation.

**Useful flags:**

| Flag | Command | Effect |
|------|---------|--------|
| `--serve [{Name}]` | `/mockups` | Starts a local static server over `Mockups/` (or a single set) so you can browse the mockups in a browser. Add `--port <N>` to pin the port and `--open` to launch your browser automatically. |
| `--showcase` | all three | Launches the Living Style Guide — a browser review surface where you Approve, Reject, or Annotate each item. Decisions are captured to `Design-System/showcase/decisions.json` and applied on the next run of the same command. |
| `--apply-decisions` | all three | Applies pending showcase decisions without launching a browser. |
| `--from-image <path>` | `/mockups` | Uses a reference image as the visual baseline for the mockup. |

**When to use it:**
- A proposal introduces new screens — run `/design-system` to establish tokens, `/catalog-screens` to describe the screens, then `/mockups` sourcing "From screen catalog"
- An enhancement or proposal changes existing UI — run `/catalog-screens` first to establish the as-built baseline, then `/mockups` to design the changes
- A bug report involves a screen — `/mockups` can visualize the current vs expected state

**When to skip it:** For backend-only changes, API work, CLI tools, or features with no UI component.

**Pipeline awareness:** When `/paths` has been run on the same proposal, `/mockups` can detect the `## Path Analysis` section and offer to create scenario-driven mockups (nominal flow, error states, edge cases). `/paths` can also detect existing screen specs and use element details (validation rules, input ranges, dependencies) to generate more precise scenario candidates.

**What it creates:**
```
Mockups/
  ├── screen-catalog.json     ← Screen registry, shared across all sets
  ├── NAVIGATION.md           ← Auto-generated navigation graph
  └── {Name}/
      ├── Specs/              ← Screen specs (from /catalog-screens)
      ├── AsciiScreens/       ← Text mockups (from /mockups)
      ├── Screens/            ← HTML and drawio.svg mockups (from /mockups)
      ├── AC/                 ← Acceptance criteria JSON (when #NN was passed)
      └── README.md           ← Auto-generated index
```

`screen-catalog.json` and `NAVIGATION.md` live at the `Mockups/` root, not inside a set — they span every mockup set in the project.

**Writeback and commit:** When you pass `#NN`, `/mockups` appends a `## Mockups` section listing the created files back to the proposal document, or to the enhancement or bug issue body. Before finishing it asks whether the mockups are satisfactory, then offers to stage and commit `Mockups/{Name}/` with a `Refs #NN` message.

**Next step:** Promote to PRD with `/create-prd #42`. The screen specs and mockups provide concrete UI detail that enriches the PRD's acceptance criteria and test plan.

---

## Stage 5: PRD (`/create-prd`)

**What it does:** Transforms a reviewed proposal into a complete Product Requirements Document with user stories, acceptance criteria, diagrams, and a TDD test plan.

**Run:**
```
/create-prd #42
```

Where `#42` is the proposal's tracking issue.

**What happens:**
1. Fetches the proposal and validates it against your charter scope
2. Analyzes gaps (missing user stories, acceptance criteria, technical requirements)
3. Asks clarifying questions based on what's missing
4. Generates user stories grouped into epics with acceptance criteria
5. Creates UML diagrams (use case, activity)
6. Generates a TDD test plan from acceptance criteria
7. Moves the proposal to `Proposal/Implemented/`
8. Creates a PRD tracking issue (labeled `prd`)

**What it creates:**
```
PRD/Dark-Mode-Support/
  ├── PRD-Dark-Mode-Support.md     ← Requirements document
  ├── Test-Plan-Dark-Mode-Support.md  ← TDD test plan
  └── Diagrams/                    ← UML diagrams
```

**Next step:** Review the test plan, approve it, optionally review the PRD, then create the backlog.

### Review Order: Test Plan First, Then PRD

Review the **test plan before the PRD**. This is counterintuitive — the PRD generates the test plan, so why not review the PRD first? Because test plans expose PRD gaps concretely. A vague requirement like "preserve existing configuration" looks fine in a PRD. When you try to write test cases for it, you realize: preserve what exactly? Comments? Ordering? Anchors?

```
/review-test-plan #56        ← Review test plan first — findings reveal PRD gaps
                              ← Approve: close #56 (check boxes + move to done)
/review-prd #55              ← Review PRD second (optional, non-blocking)
/create-backlog #55          ← Blocked until #56 is closed
```

The **test plan approval issue** (labeled `test-plan` + `approval-required`) is the blocking gate — `/create-backlog` will not proceed until it is closed. This is an approval gate issue, not a work item: close it by checking its checklist boxes and moving it to `done` directly (no `/work` needed).

The PRD review is recommended but optional. It does not block `/create-backlog`. However, reviewing the PRD second lets you incorporate test plan findings, making the requirements as clean as possible before generating stories.

---

## Stage 6: Backlog (`/create-backlog`)

**What it does:** Converts a PRD into GitHub epics and stories, ready for development.

**Run:**
```
/create-backlog #55
```

Where `#55` is the PRD tracking issue.

**What happens:**
1. Validates the PRD issue has the `prd` label
2. Checks that the test plan approval issue is closed (the test plan must be approved before stories are created)
3. Parses the PRD for epics and stories
4. Creates epic issues (labeled `epic`) with sub-issue story links
5. Creates story issues (labeled `story`) with TDD test skeletons embedded in the body
6. All issues start in `backlog` status
7. Optionally suggests relevant skills to install based on story content

**What it creates:**
- Epic issues: `Epic: Theme Management`, `Epic: User Preferences`
- Story issues under each epic: `Story: Implement CSS variable system`, `Story: Add toggle component`
- Each story contains acceptance criteria checkboxes and test case skeletons

**Next step:** Create a branch and start working on stories.

---

## Stage 7: Branch (`/create-branch`)

**What it does:** Creates a Git branch and a tracker issue to manage the work.

**Run:**
```
/create-branch release/v1.0.0
```

Branch naming uses a `{prefix}/{name}` format. Common prefixes:

| Prefix | Convention |
|--------|-----------|
| `release/` | Version releases |
| `patch/` | Hotfixes |
| `feature/` | Feature work |
| `hotfix/` | Urgent fixes |

**What happens:**
1. Creates the Git branch
2. Creates a tracker issue titled "Branch: release/v1.0.0" (labeled `branch`)
3. Pushes the branch to the remote with upstream tracking
4. Switches your working directory to the new branch

**Next step:** Assign issues to the branch, then start working.

### Assigning Issues to a Branch

Before you can `/work` an issue, it must be assigned to a branch:

```
/assign-branch #60 #61 #62 release/v1.0.0
```

Or let the assistant detect the current branch:
```
/assign-branch #60 #61 #62
```

Or assign all reviewed/ready issues at once:
```
/assign-branch --add-ready
```

The `--add-ready` flag finds every issue in "Ready" status that isn't yet assigned to a branch and assigns them all to the current branch in one shot. This pairs well with any workflow that moves multiple issues to Ready at once — batch reviews via `/review-issue`, dragging cards to the Ready column on your project board, or backlog grooming. Once issues reach Ready status, `--add-ready` scoops them all up without listing or prompting.

**Branch names are checked before anything is written.** If you name a branch that isn't an open branch tracker — a typo like `relese/v1.0.0`, or a branch that was already closed — the command rejects it and tells you it is not an open branch. It no longer accepts any slash-containing token on the assumption that it must be a branch name, which used to let a typo record silently and only surface later when the issue could not be found on the branch it was supposedly assigned to.

Naming the same issue twice assigns it once, including when you list an issue explicitly *and* name an epic that already contains it.

---

## Stage 8: Work (`/work`)

**What it does:** Starts implementation on an issue using TDD methodology. This is where code gets written — by the AI, not by you.

**Run:**
```
/work #60
```

**What happens:**
1. Validates the issue exists and is assigned to a branch
2. Detects issue type (story vs. epic)
3. Checks whether the issue has been reviewed — an unreviewed issue, or one with unresolved review findings, prompts you to run `/review-issue` or `/resolve-review` first (you can decline and proceed)
4. Moves the issue to `in_progress`
5. Extracts acceptance criteria into a todo list
6. Loads the process framework (IDPF-Agile dispatches to TDD: RED-GREEN-REFACTOR)
7. The AI implements the work, checking off acceptance criteria as they're met
8. Runs every verification command your project declares (see below) — all must pass
9. When all criteria pass, moves the issue to `in_review`
10. **STOPS** — waits for you to say "done"

**Declaring your verification commands:** `/work` never guesses how to test your project. It runs the commands listed under `verificationCommands` in `framework-config.json`, in order, and reports each result separately, so one passing command cannot hide another that failed:

```json
"verificationCommands": ["npm run lint", "npx jest"]
```

A project that declares nothing is told so — the sweep is skipped and the move to `in_review` proceeds unverified. Declare at least one command to make this gate real.

**The TDD cycle (IDPF-Agile):** The assistant performs this autonomously — you don't need to understand TDD to use the framework. For reference, the cycle is:
```
RED     → Write a failing test for the acceptance criterion
GREEN   → Write the minimum code to make it pass
REFACTOR → Clean up without changing behavior
```

Each acceptance criterion goes through this cycle. You'll see progress as it works.

**Your role during `/work`:** Wait. The AI is implementing. Your turn comes when it stops and presents the result for review. If you're technically inclined, you can watch the output and intervene ("that's the wrong approach — try X instead"), but this is optional.

**For epics:** Before the first story is touched, the assistant checks the review state of the epic and every story it will work and asks one question if any are unreviewed or carry unresolved findings. It then works through the stories one at a time, with a STOP boundary after each story reaches `in_review`. You review and approve each story before the next one begins.

**Next step:** Review the work, then complete it with `/done`.

---

## Stage 9: Done (`/done`)

**What it does:** Completes an issue by moving it from `in_review` to `done`. This is where you exercise your role as quality gate operator.

**Run:**
```
/done #60
```

Or complete multiple:
```
/done #60 #61 #62
```

Or let the assistant find issues in review:
```
/done
```

**Before running `/done`, review the work:**
- At minimum: Are the acceptance criteria checkboxes checked? Does the summary match what you asked for?
- With technical background: Scan the diff. Did the AI change only what it should have? Are there any surprises?
- With deep expertise: Evaluate the implementation approach. Is the architecture sound? Any performance or security concerns?

All three levels of review are valid. The depth of your review is a quality multiplier, not a requirement.

**What happens:**
1. Validates the issue is in `in_review` status
2. Moves to `done` (auto-closes the issue)
3. Offers to document design decisions in `Construction/Design-Decisions/`
4. Commits and pushes changes

**Design decisions** are optional but valuable. If the work involved trade-offs, non-obvious choices, or lessons learned, documenting them helps future contributors understand why things were built a certain way.

**Next step:** Repeat `/work` and `/done` for remaining stories. When all work is done, prepare the release.

---

## Stage 10: Release (`/prepare-release`)

**What it does:** Full release preparation — version analysis, changelog, PR to main, merge, tag, and publish.

**Run:**
```
/prepare-release
```

**What happens (5 phases):**

### Phase 1: Analysis
- Analyzes all commits since the last tag
- Recommends a version number based on changes (MINOR for features, PATCH for fixes)
- You confirm or override the version

### Phase 2: Validation
- Validates framework files and scripts
- Checks for incomplete issues on the branch

### Phase 3: Prepare
- Updates version files: `CHANGELOG.md`, `README.md`, `framework-config.json`
- Generates a test plan in `Construction/Test-Plans/`
- Commits the version bump
- Waits for CI to pass

### Phase 4: Git Operations
- Creates a PR to `main`
- You approve and merge the PR
- Closes the branch tracker issue
- Tags the release on `main` (e.g., `v1.0.0`)
- Pushes the tag
- Updates GitHub Release notes

### Phase 5: Cleanup
- Deletes the working branch (remote and local)
- Posts a deployment comment to the tracker issue
- Reports completion

**What it produces:**
- Merged PR to `main`
- Git tag (e.g., `v1.0.0`)
- GitHub Release with generated notes
- Updated `CHANGELOG.md`

---

## Putting It All Together

Here's a complete example of building a feature from idea to release:

```
1.  /charter                              ← Define project (once)
2.  /proposal Add User Authentication     ← Capture the idea
3.  /review-proposal #10                  ← Evaluate quality
4.  /resolve-review #10                   ← Fix any concerns
5.  /paths #10                            ← Discover scenarios (optional)
5b. /design-system                        ← Establish design tokens (optional, UI projects)
5c. /catalog-screens                      ← Create or discover screen specs (optional, UI projects)
5d. /mockups #10                          ← Design screen mockups (optional, UI projects)
6.  /create-prd #10                       ← Generate requirements + test plan
7.  /review-test-plan #16                 ← Review test plan (exposes PRD gaps)
8.  Close #16                             ← Approve test plan (check boxes + done)
9.  /review-prd #15                       ← Review PRD — optional (incorporate findings)
10. /create-backlog #15                   ← Create epics + stories (blocked until #16 closed)
11. /create-branch release/v1.0.0         ← Create working branch
12. /assign-branch #20 #21 #22           ← Assign stories to branch
13. /work #20                             ← Implement first story (TDD)
14. /done #20                             ← Complete first story
15. /work #21                             ← Implement second story
16. /done #21                             ← Complete second story
17. /work #22                             ← Implement third story
18. /done #22                             ← Complete third story
19. /complete-prd #15                     ← Close PRD tracker
20. /prepare-release                      ← Merge, tag, publish
```

Steps 13-18 repeat for each story. The framework tracks status transitions, enforces TDD, and prevents skipping steps.

---

## Shortcuts and Variations

### Quick Bug Fix (No Proposal/PRD)

For isolated bugs that don't need formal planning:

```
/bug Fix login timeout after 30 seconds   ← Creates issue, STOPS
/create-branch patch/v1.0.1               ← Create patch branch
/work #30 --assign                        ← Assign to branch + fix with TDD
/done #30                                 ← Complete it
/prepare-release                           ← Release the patch
```

### Small Enhancement (No PRD)

For well-defined enhancements that don't need a full PRD:

```
/enhancement Add CSV export to reports     ← Creates issue, STOPS
/create-branch feature/csv-export
/work #35 --assign                        ← Assign to branch + implement
/done #35
/merge-branch                              ← Merge without release tagging
```

### Review Any Issue

You can review any issue type for quality:
```
/review-issue #30                          ← Reviews bugs, enhancements, stories, epics
```

### Batch Reviews

When you have multiple issues to review, batching all reviews and resolutions together before starting implementation is significantly faster. Instead of reviewing one issue, resolving findings, then working it — repeat — you run all the reviews first, resolve all findings, then start implementation as a separate pass.

```
# Pass 1: Review everything
/review-issue #30
/review-issue #31
/review-issue #32

# Pass 2: Resolve any findings
/resolve-review #30
/resolve-review #31

# Pass 3: Assign all reviewed issues to the branch
/assign-branch --add-ready

# Pass 4: Implement (only after all reviews are clean)
/work #30
/done #30
/work #31
...
```

**Shortcut:** Skip Pass 3 entirely by using `--assign` on `/work`, which auto-assigns the issue to the current branch before starting:

```
# Passes 3+4 combined: assign and implement in one step
/work #30 --assign
/done #30
/work #31 --assign
...
```

This works especially well after `/create-backlog` generates a batch of stories — review them all at once rather than one-at-a-time between implementation cycles. The review pass enriches every issue with proposed solutions and dependency annotations, so when you start the work pass, each `/work` has everything it needs from the start.

---

## Key Concepts

### STOP Boundaries

Many commands end with a **STOP** — the assistant will not continue past that point without your explicit instruction. This prevents accidental implementation, premature closure, or unauthorized changes.

| Command | STOP After |
|---------|------------|
| `/proposal` | Issue created |
| `/bug`, `/enhancement` | Issue created |
| `/work` | Issue moved to `in_review` |
| `/done` | Issue moved to `done` |

### Status Flow

Issues move through a defined lifecycle:

```
backlog → in_progress → in_review → done
```

- `/work` handles: `backlog` → `in_progress` → `in_review`
- `/done` handles: `in_review` → `done`

### Branch Rules

- All work happens on branches (never push to `main` directly)
- Every issue must be assigned to a branch before `/work`
- `main` receives code only through merged PRs
- Any branch can produce a release (not just `release/` prefixed ones)

### Commit Messages

During active work, use non-closing references:
```
Refs #42 — Implement theme toggle component
```

Only after `/done` are closing keywords used:
```
Fixes #42 — Implement theme toggle component
```

This prevents issues from closing before they're truly complete.

---

## Command Quick Reference

| Stage | Command | Purpose |
|-------|---------|---------|
| Charter | `/charter` | Define project vision, scope, tech stack |
| Idea | `/proposal <title>` | Create proposal document + tracking issue |
| Revise | `/proposal <title> --update` | Revise an existing proposal in place |
| Quick Issue | `/bug <title>` | Create bug report |
| Quick Issue | `/enhancement <title>` | Create enhancement request |
| Review | `/review-proposal #N` | Evaluate proposal quality |
| Review | `/review-prd #N` | Evaluate PRD quality |
| Review | `/review-issue #N` | Evaluate issue quality |
| Fix | `/resolve-review #N` | Apply review findings |
| Path Analysis | `/paths #N` | Collaborative scenario discovery (optional) |
| Design Tokens | `/design-system` | Define or extract DTCG design tokens (optional) |
| UI Discovery | `/catalog-screens` | Create screen specs, manually or discovered from source (optional) |
| UI Mockups | `/mockups #N` | Create HTML, ASCII, or drawio.svg mockups (optional) |
| Requirements | `/create-prd #N` | Transform proposal into PRD |
| Backlog | `/create-backlog #N` | Create epics + stories from PRD |
| Branch | `/create-branch name` | Create branch + tracker |
| Assign | `/assign-branch #N...` | Assign issues to branch |
| Implement | `/work #N` | Start TDD implementation |
| Complete | `/done #N` | Finish issue |
| Close PRD | `/complete-prd #N` | Verify all stories done, close PRD |
| Release | `/prepare-release` | Full release workflow |
| Merge | `/merge-branch` | Merge branch without release tagging |
| Coordinate | `/x-session-config` | Control what concurrent sessions announce to each other |
| Observe | `/hall-monitor` | Dedicate a session to watching cross-session activity |

---

**End of IDPF Project Workflow Guide**
