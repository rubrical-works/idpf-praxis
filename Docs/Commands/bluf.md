# /bluf

Emits a short, conclusion-first brief for one or more issues — what each does, why, and where it stands — so a backlog can be triaged without opening every issue.

Not the same thing as an output style. `/bluf` digests *issues* on demand; an output style shapes *every* response in a session at the system-prompt layer.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | One or more issue numbers (e.g. `#42`, or `42 43 44`). A leading `#` is optional |

## Usage

```
/bluf 2563
/bluf 42 43 44
/bluf #2820
```

An epic among the arguments expands to the epic plus its children.

## Key Behaviors

- **Read-only, without exception.** `/bluf` changes no label, no status, no body and no comment on any issue it reads, including issues it reaches by epic expansion. It is a triage aid run across issues you have not opened, so a write from it would mutate the board from a command nobody thinks of as a write. Two test suites sweep every command the fetch half issues and fail on anything that is not `gh pmu view` or `gh pmu sub list`.
- **Per type, not one uniform line.** Issue bodies are not interchangeable — a bug guarantees Steps to Reproduce / Expected / Actual, an enhancement Motivation / Proposed Solution, a story acceptance criteria, an epic children. Each type gets a format drawn from the fields its template guarantees, because a single "summarize the body" prompt reads inconsistently across the mixed set triaging always produces.

  ```
  #2563 [Enhancement] TLDR output style
    Does:  adds .claude/output-styles/tldr.md, conclusion-first responses
    Why:   responses bury the conclusion
    State: Backlog / P2 / never reviewed
  ```

- **A generic fallback covers everything else** — an issue with none of the four type labels, and also a `prd`, `proposal` or `test-plan` issue. Those three resolve to a null type rather than a brief-able one, and they are common in a backlog, so they are briefed generically rather than skipped. `/bluf` routes nowhere regardless of label.
- **Review state comes from labels already fetched** — `reviewed` reads as *reviewed clean*, `pending` as *findings pending*, neither as *never reviewed*. No extra call is made to establish it.
- **Epic expansion is capped at 6 children**, matching `/review-issue`. Children beyond the cap are reported as not reached, in number order, so the same six are reached on each run until the rest are briefed. Only an epic you type expands: a child that arrived by expansion is briefed as one issue even if it carries the `epic` label.
- **Nothing is dropped silently.** An issue number that cannot be read is reported by number with its reason, and the remaining issues are still briefed — a triage pass over a stale list is exactly where a deleted issue turns up. Children beyond the cap are listed individually. Both lists are reported in full rather than as a count, because a number you cannot see is one you will assume was briefed and clean.
- **A failed epic enumeration briefs the epic alone** and says so. Such an epic is never reported as having no children: "`gh` could not be reached" and "this epic has no children" are different facts, and acting on the second when the first is true is the error that reporting prevents.
- **A field with no honest answer reads `not stated`** rather than a plausible invention. An invented motivation is worse than an absent one, because you cannot tell it was invented.

## How it is verified

The command splits along the line that decides what can be tested. The **fetch** half — resolving numbers, classifying types, enforcing the cap, naming what could not be read — is a script covered by ordinary unit tests. The **brief** half, the prose you read, is composed from that data and is asserted nowhere: no mechanism available here can check that generated prose is accurate or well written, and a test that claimed to would be checking its own fixture. Brief quality is a named manual step in the release checklist instead.

## See Also

- `/review-issue` — reviews an issue against type-specific criteria, and is where the six-child expansion cap originates
- `/work` — starts work on an issue once you have decided from the brief
