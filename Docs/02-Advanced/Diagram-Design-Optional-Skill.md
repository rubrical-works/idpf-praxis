# The Optional diagram-design Skill

**Date:** 2026-09-21
**Topic:** Why a project might install the third-party `diagram-design` skill, how `/create-prd` detects it, and how to install it

---

## What It Is

[`diagram-design`](https://github.com/cathrynlavery/diagram-design) is a third-party Claude Code skill by Cathryn Lavery, published under the MIT licence. It draws architecture, flowchart, sequence, state machine, UML class and many other diagram types as self-contained HTML with inline SVG, following an editorial design system.

**It is optional.** IDPF does not bundle, vendor or require it. Without it, `/create-prd` offers the two built-in diagram styles, drawio and ASCII, exactly as before. With it, `/create-prd` offers a third style.

---

## Why Install It

| | drawio | ASCII | diagram-design |
|---|---|---|---|
| Output | `.drawio.svg` | Inline text in the PRD | `.html` source + exported `.svg` |
| Diffs in review | Hard — the SVG carries embedded draw.io XML | Clean | Clean — hand-readable SVG |
| Visual quality | Rich | Plain | Editorial, brandable |
| Extra dependency | The drawio skill | None | This skill, installed by you |

The diagram-design style fills the gap between the two built-in styles: it produces diagrams that look finished and still diff cleanly.

**Why not Claude Code's built-in diagramming?** Claude Code has a built-in diagramming skill for its hosted artifacts, but it only works with some plans and some sign-in methods. It does not work with an API key, Bedrock, Vertex, Foundry, the Agent SDK or CI. A framework command that ships to every project cannot depend on something that disappears under those configurations. `diagram-design` is a plain skill that works wherever Claude Code does.

---

## How /create-prd Detects It

At Phase 5.5a, `/create-prd` runs `.claude/scripts/shared/diagram-design-detect.js`. It checks three places, in this order, and the first match wins:

1. **Project skill:** `.claude/skills/diagram-design/SKILL.md` in your project
2. **User skill:** `~/.claude/skills/diagram-design/SKILL.md`
3. **Plugin:** a `diagram-design@…` entry in Claude Code's plugin registry, `~/.claude/plugins/installed_plugins.json`. A project-scope install for this project is preferred over a user-scope install.

When nothing is found, `/create-prd` says so in one line and names this page. It then offers drawio and ASCII only. Detection never stops the command.

**The plugin registry is undocumented Claude Code internal state.** If a Claude Code update changes its format, detection reports that it could not read the registry and falls back to the two built-in styles. Installing the skill as a project or user skill (checks 1 and 2) does not depend on the registry at all.

---

## How to Install

As a Claude Code plugin, from inside Claude Code:

```
/plugin marketplace add cathrynlavery/diagram-design
/plugin install diagram-design@diagram-design
```

Alternatively, copy the skill's `skills/diagram-design/` directory into your project's `.claude/skills/`, or into `~/.claude/skills/` for every project. See the project site for current instructions: https://github.com/cathrynlavery/diagram-design

---

## What Happens on First Use

The first time the skill draws a diagram in a project whose style guide is still the default, it stops and asks whether to customize it. You can give it a website URL, point it at a design system, paste tokens, load a saved profile, or keep the default. `/create-prd` passes that question to you once. Your answer is remembered, so later runs skip it.

`/create-prd` loads the skill by reading its files rather than invoking it as a command. It exports SVG only, with no Playwright required, and keeps each `.html` beside its `.svg` as the editable source. Use Case diagrams have no diagram-design equivalent, so they are drawn in ASCII even when this style is selected.
