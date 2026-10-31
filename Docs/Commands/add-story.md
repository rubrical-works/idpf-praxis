# /add-story

Add a new story to an epic with charter compliance validation and automatic test plan updates.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[epic-number]` | No | Parent epic issue number (e.g., `42` or `#42`). Prompts with a list of open epics if not provided. |
| `--assignee <value>` | No | GitHub login to assign the new story to. Omitted → `@me`. |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

## Usage

```
/add-story
/add-story 42
/add-story #42
```

## Key Behaviors

- If no epics exist or you select "Create new epic", the command creates the epic first, then adds the story to it.
- Validates the story title and description against `CHARTER.md` scope before creating the issue. An aligned story proceeds without interruption. A story that matches no charter item, or matches an out-of-scope item, is reported with the matching items and you choose how to resolve it: expand the charter scope, defer to a future release, proceed anyway (logged as scope drift), or revise the story. The check is skipped, with a one-line note, when there is no `CHARTER.md` (it suggests `/charter`), when the charter is still an unfilled template, or when a `.no-charter-enforcement` file opts the project out.
- Creates the story issue with a full canonical template (Description, Relevant Skills, Acceptance Criteria, TDD Test Cases, Definition of Done). All sections are required; use "N/A" rather than omitting any.
- Requires a **Files to modify** section listing only the files this story's criteria implicate. A purely behavioral story uses the section marker with `N/A` — omitting the section entirely is not equivalent.
- The story's **E2E** line comes from the e2e suites in `framework-config.json` `testing.suites[]` — the declaration `/charter` harness selection writes. A gate e2e suite is named by its id and command; a project whose only e2e records are manual-only (none applicable, or install pending) gets `N/A`; a project that declares no e2e suite at all gets `Not declared — no e2e suite in testing.suites[]`, so the two empty cases stay distinguishable. `Inception/Test-Strategy.md` is corroboration only; no framework name is ever invented.
- Asks which stories in the epic must land first and writes a **Depends on:** line: `none`, or comma-separated `#N` references to sibling stories of the same epic. `/work --nonstop` and `/work --concurrent` order stories from this line, so its shape is fixed: an entry that is not a sibling `#N` is never treated as satisfied, and `/review-issue` flags it. `none` means there is no dependency, so it is written only when you say so.
- When an acceptance criterion is verified against a non-code artifact (a command spec, registry, manifest or workflow file), the story names that artifact as the contract test's `@subject`, following `Reference/Contract-Test-Classification.md`.
- If the epic belongs to a PRD, automatically updates the PRD tracker issue and the PRD document file with the new story.
- Optionally suggests and installs relevant skills based on technologies mentioned in the story.
- Links the new story to its parent epic as a sub-issue.
- On completion, reports the next steps in order: review the story (`/review-issue #N`), assign it to a branch (`/assign-branch #N`), work it, then check epic progress. Review and branch assignment now precede work in that sequence.

## Acceptance Criteria Feasibility Gate

Before the story is created, each acceptance criterion is checked against two questions:

**Can it be verified?** If a criterion names a verification mechanism no existing test uses, you are asked to rewrite it, commit to a feasibility spike, or accept a weaker mechanism. The story is not created until each flagged criterion is resolved.

**Can it close in this phase?** A criterion can name a real mechanism and still be unsatisfiable — "user-reviewed and approved before merge" describes a genuine review whose outcome does not exist at the moment the box must be checked. These are handled two ways:

| Situation | Result |
|---|---|
| The work belongs to another command's checklist (CHANGELOG entries, tagging, release publication) | Not authored at all; you are told which command owns it |
| The criterion restates the project's test command passing ("`npm test` passes", "the test suite passes") | Not authored; `/work` already runs the full verification sweep before review. Kept when the project declares no verification commands, since then it is the only test run the story gets |
| The gate is genuinely load-bearing, such as a required human sign-off | Authored as an explicitly-open gate rather than an ordinary checkbox |

Annotation is preferred over deletion when the requirement is real. The goal is to stop a gate deadlocking the story at review, not to drop the requirement.
