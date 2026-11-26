# AskUserQuestion Shape
**Version:** v0.123.0
**Source:** Reference/AskUserQuestion-Shape.md
**Purpose:** How a prompt sent through `AskUserQuestion` is laid out. On demand; rule `06-runtime-triggers.md` points here, and every `.claude/hooks/ask-question-shape-hook.js` correction closes with a pointer here (#3233, #3440).
## Why
`question` renders **bold**, so packed context becomes a wall of bold text; prose printed just before the call stays visible while the prompt is open (confirmed 2026-10-25, #3233 AC2). #3361 (2026-10-26) saw longer pre-prompt markdown scrolled out of sight — both stand, unresolved, perhaps differing only in length — so what the user decides on must also be visible in the prompt itself: for a change, its `preview` (§ Previews showing a change).
## Rules
1. **Context first, as ordinary markdown** — a table for several results, a bold-label list for one item.
2. **The question is one sentence**, naming the decision, not the evidence: `QA #3145: record the verdict?`.
3. **Long per-option content goes in that option's `preview` — single-select only.** `preview` renders only when `multiSelect` is false; for multi-select keep `description`s short.
4. **Tool limits:** at most **4 options** per question, `header` at most **12 characters** — over either is rejected as "Invalid tool parameters" without saying which (#3198).
The hook acts only on those two hard limits: a `header` over the limit is trimmed and the call goes through (#3638); more than 4 options blocks, naming the fix. Limits in `.claude/metadata/ask-question-shape.json`. Its correction names each violation, the remedy and this document, nothing more (#3440). It does not check question length or block content (#3463): the tool accepts both, and each block reached the user as a hook error. Rules 1–3 and the rest are convention, pointed to not enforced.
## What the hook rewrites and what it blocks
**An over-long `header` is rewritten (#3638).** It is only the chip label, so the hook trims it and lets the call through — no hook error, no retry: cut at the last word boundary within the limit (`Advisory path` → `Advisory`), hard cut when the first word alone is over it (`Thirteen-char` → `Thirteen-cha`); every other field unchanged. Write the header to fit anyway: the trim is mechanical and can drop the word that mattered.
**Everything else over a limit blocks:** more than 4 options (the hook cannot choose which to merge or drop), a call with both problems (naming both), and an over-long header that is whitespace throughout.
**The output shape decides whether the user sees the prompt.** Tested hands-on, user watching, each returning `hookSpecificOutput` with an `updatedInput`:
| Paired with | Result | Tested |
|---|---|---|
| `permissionDecision: "allow"` | **No prompt.** The call returned `The user did not answer the questions.` at once | 2026-10-28 (Claude Code 2.1.312, #3447), twice, rewriting the question; 2026-11-12 (2.1.323, #3638), rewriting the header |
| `permissionDecision: "ask"` | **Prompt shown with the rewritten header**; the answer came back normally | 2026-11-12 (2.1.323, #3638) |
| `permissionDecision: "ask"`, one call with two questions (one single-select, one multi-select question), both headers over the limit | **Prompt shown, both headers rewritten, nothing shown before the questions**; both answers came back normally | 2026-11-13 (2.1.323, #3638), through the shipped hook |
The hook returns `hookEventName: "PreToolUse"`, `permissionDecision: "ask"` and an `updatedInput` carrying the whole tool input. The hooks docs (https://code.claude.com/docs/en/hooks) pair `updatedInput` with `"allow"` for a hook that supplies `answers`, and do not describe the `ask` pairing — the test is the evidence. With `allow` a rewrite drops the prompt silently, worse than a visible block.
Neither test checked: a deployed project (hook run from the hub junction); `updatedInput` with no `permissionDecision`.
## Templates
A `/bluf`-shaped brief (#3440): **the question is the conclusion; support goes above it.** Fixed bold-label fields, one clause each; no honest answer → `not stated`, never inferred. `Question:` is the `question` string — one sentence naming the decision, under 200 chars (convention; no hook checks it, #3463); if it will not fit, move a clause up into a field. A hook-owned offer (startup hook) supplies `Question:` verbatim; the model writes only the fields.
### Offer
An action taken on request (reinstall dependencies, fast-forward).
```
**Found:** <the state that prompted the offer>
**If yes:** <what runs>
**If no:** <what stays as it is, and what it costs>
Question: Run <action> now?
```
### Finding resolution
One finding needing a decision; the proposed change goes in the `Accept` `preview` as BEFORE / AFTER.
```
**Issue:** #<n>
**Criterion:** <what was checked>
**Detail:** <what was found>
Question: For Issue: #<n> — <criterion>. How should this be resolved?
```
### Choice
Candidates, one (multi-select: several) proceeds; listed as a context table.
```
**Deciding:** <what the choice settles>
**Default:** <the recommended option and why, or `not stated`>
Question: Which <thing> should proceed?
```
## Context table
A table of candidates or findings printed before a prompt has **first column `{n}.{label}`, no space after the dot**: `{n}` is the number Claude Code shows beside the option, `{label}` its `options[].label` exactly.
| Option | Meaning |
|---|---|
| `1.Threshold boundary` | Test the value at the configured cap |
| `2.Off by one` | Test the cap plus one |
…paired with options `Threshold boundary` and `Off by one`. **Option labels carry no number prefix** — Claude Code numbers options in single- and multi-select prompts alike, so `1.Threshold boundary` renders `1. 1.Threshold boundary` (observed 2026-10-22).
## Single item: bold-label list, not a table
**Criterion:** files-to-modify-declared
**Detail:** the body names no Files to modify section
Tables are for rows that map to options; Claude Code draws every row with box borders and a rule.
## Previews showing a change
**Summary, then AFTER, then BEFORE** (#3909), never diff `-`/`+` markers, which collide with `- [ ]` checkboxes:
```
Changes: renames the path the AC names
Effect: the AC matches the moved file
AFTER
- [ ] AC names the new path
BEFORE
- [ ] AC names the old path
```
The summary is two `/bluf`-style one-clause lines, `Changes:` and `Effect:`; `not stated` for a clause with no honest answer, never invented. Claude writes it; `change-preview.js` builds the verbatim AFTER and BEFORE, never by hand. AFTER — the text being accepted — precedes BEFORE.
### Line budget (#3788, #3820, #3848, #3909)
The pane has a fixed height; Claude Code clips overflow behind a `✂ N lines hidden` marker, so when BEFORE came first a long BEFORE pushed AFTER — the text being accepted — below the cut (observed: full BEFORE, then `AFTER:` and `✂ 18 lines hidden`).
**Budget: 14 lines** of preview content — the figure that always fits the smaller window. Measured 2026-11-23 (Windows 11, #3909): larger window, a 40-line preview showed through line 32, a 20-line one in full; smaller window, through line 14, then `✂` (resizing reveals more). The earlier 8-line single observation is withdrawn. `change-preview.js` `DEFAULT_BUDGET` carries it; re-measure and change both together.
**Within budget:** summary, then the whole AFTER, then the whole BEFORE, as above — the whole change, on screen while deciding.
**Over budget:** the same shape clipped to the budget — summary, AFTER clipped with a `… (+N more lines)` marker, then BEFORE as exactly one clipped line under a `BEFORE (clipped)` heading; the marker and heading say what was cut, and no label points elsewhere.
**Over budget, also a scratch file:** write the complete summary, AFTER and BEFORE to `.tmp-<issue>-change-<random>.md` and name its full path in the option's `description` only, never the preview (e.g. `Clipped preview — full change in <path>`) — on a multi-issue run earlier assistant text may be collapsed; the file stays reachable. Write it to the session scratchpad, never the repository root, whenever a reviewer agent may still be running.
Text printed before the call is not visible while the dialog is open (#3233, #3361, #3788): #3820's no-preview form had the user accept a change they could not see — on #3830, "cannot see change printed above" (#3848); the condensed label's pointer to that text always failed — the user decides from the pane alone (#3909). The clipping marker and `BEFORE (clipped)` heading meet #3820's concern.
The complete BEFORE and AFTER are always printed as markdown before the call (rule 1), in the same message as the call with no other output between them — a transcript record, readable after the dialog closes, not what the user reads while deciding.
## Several questions in one call
**One option table per question**, under a bold heading matching its `header`, numbering restarting at 1.
## Where
Every `AskUserQuestion` call; `/resolve-review` Step 3, `/prepare-release`, `/prepare-beta` and § Release Review Gate also state it; `/qa` carries steps and PASS/FAIL in previews (#3233).
**End of AskUserQuestion Shape**
