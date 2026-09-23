---
version: "v0.106.0"
allowed-tools: Bash, Read
description: Emit a short conclusion-first brief for one or more issues, using the IDPF framework.
argument-hint: "#issue [#issue...]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /bluf
Emits a short, conclusion-first brief per issue, so a backlog can be triaged without opening every issue.
**Not an output style.** #2563 shapes *every* response at the system-prompt layer; `/bluf` digests *issues* on demand. Both can exist; changing #2563 is out of scope here.
**Read-only, without exception.** `/bluf` changes no label, no status, no body, no comment, on any issue it reads — including issues it reaches by epic expansion. The preamble enforces this on the fetch side (two suites sweep every command it issues); this spec is bound by it on the compose side. A triage aid runs across issues the user has not opened, so a write here mutates the board from a command nobody thinks of as a write.
Design record: #2932.
## Prerequisites
`gh pmu` installed; `.gh-pmu.json` configured in repository root.
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | One or more issue numbers (`#42`, or `42 43 44`). Leading `#` optional |
An epic among the arguments expands — see § Epic expansion.
## Execution Instructions
**Task creation.** No routing decision and no gates, so create no task list: one fetch, one compose — not a step machine compaction could resume into the wrong half.
## Workflow
### Step 1: Fetch (deterministic)
```bash
node .claude/scripts/shared/bluf-preamble.js <issue> [<issue>...]
```
Parse the envelope. `ok: false` → report `errors[0].message` and **STOP**. Otherwise read `data`:
| Field | Meaning |
|---|---|
| `issues[]` | Resolved issues, in argument order: `number`, `title`, `labels`, `body`, `status`, `priority`, `state`, `type` |
| `unresolved[]` | Numbers that could not be read, each with a `reason` |
| `notReached[]` | Children beyond the expansion cap, each with a `reason` |
| `expansionCap` | The cap the envelope applied |
Relay `warnings` verbatim. **Never re-fetch an issue the preamble already resolved**, and never issue a `gh` call of your own — the envelope is the whole input.
### Step 2: Brief (generative)
**Why per type, not one uniform line.** Bodies are not interchangeable — a bug guarantees Steps to Reproduce / Expected / Actual, an enhancement Motivation / Proposed Solution, a story acceptance criteria, an epic children. One "summarize the body" prompt reads inconsistently across the mixed set triaging always produces.
Every brief opens `#<number> [<Type>] <title>` and closes with `State: <status> / <priority> / <review state>`. Review state comes from the labels already in the envelope: `reviewed` → `reviewed clean`, `pending` → `findings pending`, neither → `never reviewed`. Do not call `review-state.js`; the envelope already paid for that read.
#### `bug`
```
  Breaks: <what fails, from Steps to Reproduce / Actual>
  Wants:  <the expected behavior, from Expected>
```
#### `enhancement`
```
  Does:  <the change, from Description / Proposed Solution>
  Why:   <the motivation, from Motivation>
```
#### `story`
```
  Does:   <the deliverable, from the story body>
  Done-when: <the acceptance criteria, compressed to one clause>
```
#### `epic`
```
  Covers:   <the theme, from the epic body>
  Children: <n> (<m> briefed below)
```
#### Generic fallback
Used for an issue carrying **none** of the four type labels (`type: "generic"`) **and** for one whose `type` is `null`.
**`null` is the normal case for three label families, not an edge.** `getIssueType()` tests `REDIRECT_LABELS` first, so a `prd`, `proposal` or `test-plan` issue returns `type: null` and never reaches the four brief-able labels. Those three are common in a backlog — the mixed set this command is for. Brief them here, and **ignore any notion of redirecting** — `/bluf` reads, it never routes.
```
  About: <what the issue concerns, from its body>
```
**Compose from the envelope, never from memory of the issue** — the body is in `issues[].body`. A brief from recollection is the failure this command exists to prevent one level up.
**Say less than you could.** Two or three lines. A field with no honest one-clause answer — a bug with no Expected section — is written `not stated`, never inferred: an invented motivation is worse than an absent one, because the reader cannot tell it was invented.
### Step 3: Report what was not briefed
After the briefs, when non-empty, list every entry of `unresolved[]` (as `Not read:`, with its reason) and of `notReached[]` (as `Not reached:`, with `expansion cap (6)`).
**Both lists are reported in full, never summarized as a count.** A number the reader cannot see is a number they will assume was briefed and clean.
## Epic expansion
An epic expands to the epic plus its children, **capped at 6**, matching `/review-issue`. Children beyond it are reported as not reached, in number order, so the same six are reached each run until the rest are briefed.
**Why six, not a looser number.** A `/bluf` child costs far less than a `/review-issue` child, so a larger cap would fit. Six anyway: one number for epic expansion across the framework beats a locally optimal one, and a cap can be raised against a measurement later.
**No re-expansion.** Only an epic typed on the command line expands. A child that arrived by expansion is briefed as one issue even carrying the `epic` label; without this a nested epic recurses without bound.
**A failed enumeration briefs the epic alone**, warning relayed. Do not report such an epic as having no children: "`gh` could not be reached" and "this epic has no children" are different facts, and a reader acting on the second would be acting on the first.
## Error Handling
| Situation | Response |
|-----------|----------|
| Preamble `ok: false` | Report `errors[0].message` → STOP |
| No issue numbers given | Preamble errors (`BAD_ARGS`) → STOP. An empty argument list is never read as "every issue" |
| A number cannot be read | Reported under `Not read:`; remaining issues still briefed |
| Epic enumeration fails | Epic briefed alone; warning relayed |
| Unrecognized flag | Reported as ignored; never fatal, never silently dropped |
**End of /bluf Command**
