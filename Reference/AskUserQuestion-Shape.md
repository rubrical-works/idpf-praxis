# AskUserQuestion Shape
**Version:** v0.112.0
**Source:** Reference/AskUserQuestion-Shape.md
**Purpose:** How a prompt sent through `AskUserQuestion` is laid out. On demand; rule `06-runtime-triggers.md` points here, and `.claude/hooks/ask-question-shape-hook.js` states the convention in every correction (#3233).
## Why
Claude Code renders `question` text in **bold**, so context packed into it becomes a wall of bold text. Prose printed immediately before the call stays visible while the prompt is open (confirmed 2026-10-25, #3233 AC2), so context goes there.
## Rules
1. **Context first, as ordinary markdown** — a table for several results, a bold-label list for one item.
2. **The question is one sentence**, naming the decision, not the evidence: `QA #3145: record the verdict?`.
3. **Long per-option content goes in that option's `preview` — single-select only.** `preview` renders only when `multiSelect` is false; for multi-select keep `description`s short.
4. **Tool limits:** at most **4 options** per question, `header` at most **12 characters** — over either is rejected as "Invalid tool parameters" without saying which (#3198).
The hook blocks a question over the length threshold or carrying block content (table row, list items, several paragraphs), and either hard limit; limits in `.claude/metadata/ask-question-shape.json`. It cannot see text printed before the call, so the rest is convention, stated not enforced.
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
Every `AskUserQuestion` call. `/resolve-review` Step 3 (#3177), `/prepare-release`, `/prepare-beta` and the shared § Release Review Gate also state it locally; `/qa`'s verdict prompt carries steps and the PASS/FAIL condition in option previews (#3233, superseding #2979's in-question steps).
**End of AskUserQuestion Shape**
