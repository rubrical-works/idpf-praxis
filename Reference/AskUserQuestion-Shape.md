# AskUserQuestion Shape
**Version:** v0.121.0
**Source:** Reference/AskUserQuestion-Shape.md
**Purpose:** How a prompt sent through `AskUserQuestion` is laid out. On demand; rule `06-runtime-triggers.md` points here, and every `.claude/hooks/ask-question-shape-hook.js` correction closes with a pointer here (#3233, #3440).
## Why
`question` renders **bold**, so packed context becomes a wall of bold text; prose printed just before the call stays visible while the prompt is open (confirmed 2026-10-25, #3233 AC2).
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
**BEFORE / AFTER** blocks, never diff `-`/`+` markers, which collide with `- [ ]` checkboxes:
```
BEFORE
- [ ] AC names the old path
AFTER
- [ ] AC names the new path
```
## Several questions in one call
**One option table per question**, under a bold heading matching its `header`, numbering restarting at 1.
## Where
Every `AskUserQuestion` call; `/resolve-review` Step 3, `/prepare-release`, `/prepare-beta` and § Release Review Gate also state it; `/qa` carries steps and PASS/FAIL in previews (#3233).
**End of AskUserQuestion Shape**
