# /qa

Verify one `qa-required` issue through a bounded set of outcomes and offer to close it with the evidence recorded. Not the same thing as `review #N --with qa`, which loads QA-automation review criteria for a review; `/qa #N` verifies a QA gate.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | The `qa-required` issue to verify (e.g., `#42` or `42`). One per invocation |
| `--assign` | No | Direct invocation only: assign the issue to the current branch first, with no prompt |

## Usage

```
/qa #42
/qa #42 --assign
```

`/work #42` on a `qa-required` issue hands off here automatically. Inside an epic or branch-tracker run, `/work` skips `qa-required` sub-issues and points at this command instead.

## Key Behaviors

- **A QA issue is a gate, not a story.** Its parent carries `- [ ] … → QA: #N` and cannot reach `done` until the QA issue closes and that box is checked. `/qa` performs the verification and, on acceptance, releases the gate.
- **Gate decisions.** The Pre-Work Status Gate applies — `/qa` moves the issue from `qa_required` or `backlog` to `in_progress`. The Review-State Gate does not fire: `never-reviewed` is a QA issue's normal and permanent state, and a check to run is not a deliverable to review.
- **Branch assignment** delegates to `assign-branch.js`. Already assigned is left alone and reported (the common case). `--assign` assigns to the current branch with no prompt. Unassigned without the flag asks which open branch, current one recommended. With no open branch tracker the verification is reported as unattributed — `/qa` never creates a branch.
- **Prior-art sweep first.** Before any outcome is chosen, `/qa` sweeps for prior art using the parent's title, its Files Changed section and the QA steps as terms, and records the result under `**Prior Art:**` in the issue body. The sweep is always on; only `reviewSweep: off` suppresses it, and that refusal is reported rather than silent. An `obsolete` verdict, meaning the check no longer describes the code, offers to close the issue as not planned and strikes the parent's gate line so it reads as released, not verified. An `already-shipped` verdict means the check was already performed and closes through the normal terminal state citing that evidence.
- **Prior evidence is read next.** A `**QA Evidence:**` comment left by a human after an earlier manual-only run decides the outcome: `PASS` offers to close on it, `FAIL` reports and stops, absent proceeds to the outcomes.
- **Three outcomes, in preference order:**
  1. **Existing coverage** — a test already exercises the described steps. It is found through the parent's `### Files Changed` section and the `tdd-refactor-coverage-audit` skill's pairing, never by an open-ended search, and the match is justified by naming the test, the assertion, and why it covers the steps. Green proceeds to closure; a failure is a real finding and stops.
  2. **No coverage, automatable** — `/qa` names what a test would assert and offers to author it. Accepting runs the story pipeline (rule 08 Steps 3, 3b, 4c, 4d, 4e, 4f) unchanged, RED first; the test is committed with a `Refs #N` message and an in-file comment naming the QA issue and parent AC. Declining reports the gap and stops, changing nothing.
  3. **Manual-only** — stops with a structured report: the steps needing a person and why, the environment, the evidence that would close the issue, and a ready-to-paste `**QA Evidence:**` comment template for the human to fill in after performing the check.
- **Recording the verdict on a re-invocation.** On a direct `/qa #N` run where the check has already been performed, `/qa` offers to record the verdict instead of leaving you a comment to paste: one question with *Record PASS*, *Record FAIL* and *Not yet performed*, defaulting to *Not yet performed*. The verdict and the observation still come from you — the steps you performed and what you saw are collected as free text in your own words, never offered as pre-written options describing what happened. `/qa` composes the same `**QA Evidence:**` comment, posts it, and on a `PASS` carries straight on to the closure condition in that same run. A `FAIL` posts the comment too, then reports and stops, leaving any fixtures standing. The offer does not appear on the fixtures hand-off path, where nothing is left running to ask it and the pasted comment is still how the evidence carries across, nor under `--nonstop`, where nobody is present to answer.
- **Declared board fixtures (manual-only checks).** When the QA body carries a `### Fixtures` section — `- <type>: "<title>" [label:<name>] [reviewed]`, one root with indented children, or siblings with no root — `/qa` offers to create that board state itself through `qa-fixtures.js`. The offer names every issue it would create (title, labels, branch, parent), defaults to creating nothing, never fires without the section, never under `--nonstop`, and asks a second time when another session is live in the working directory. Accepting can hand straight off to `/work` on the scratch epic (or the scratch selection) so the prompt under test appears in the same session; the observation and the `PASS` verdict stay with the person. Every created number is recorded under `**Fixtures created:**` in the QA body, and a `fixtures-provisioned` announcement tells peers to leave them alone.
- **Teardown is its own gate.** After a `PASS` is found, or on an accepted close, `/qa` lists every recorded fixture by number and title and asks before deleting them. It never deletes on a `FAIL` — the fixtures are the reproduction — and never derives a deletion set from titles, only from the recorded line.
- **Closure condition.** Closing requires the project's full declared verification set (`verificationCommands`, falling back to `testCommand`) green, not just the target test. Any red — including a pre-existing failure — stops. Nothing declared stops too; an undeclared suite is not evidence.
- **Offer, never auto-close.** An all-green run reports the evidence and asks whether to close and release the parent gate. It never closes automatically and never parks the issue in `in_review`. `/qa` always halts for this prompt, in every run shape.
- **On acceptance** the QA issue is closed with the evidence recorded — command invoked, test or evidence-comment URL, correspondence, sweep result — and the parent's `→ QA: #N` line is ticked, matched on the marker rather than on the AC text.
- Everything `/qa` creates or modifies is committed before the close offer, checked against the paths this run touched — never a clean-tree assertion, since sessions share a working directory.
- `/qa` commits; `/done` pushes.
