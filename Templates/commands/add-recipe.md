---
version: "v0.68.0"
description: Add extension recipes from document or interactively (project)
argument-hint: "[document-path]"
copyright: "Rubrical Works (c) 2026"
---

<!-- MANAGED -->
# /add-recipe
Add extension recipes to the framework. Two modes: **document-driven batch** from structured markdown, or **interactive single-recipe** when no document provided. Validates against `extension-points.json` before creation.
## Prerequisites
- `.claude/metadata/extension-points.json` exists (run `/extensions` if missing)
- `.claude/recipes/` directory exists
- `.claude/scripts/framework/build-extension-recipes.js` available
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `<document-path>` | No | Path to markdown file with recipe definitions |
**No arguments:** Falls back to interactive single-recipe mode.
## Workflow
### Step 1: Determine Mode
**If `<document-path>` provided:** Validate file exists -> **Batch Mode** (Step 2).
**If no arguments:** -> **Interactive Mode** (Step 6).
## Batch Mode (Steps 2-5)
### Step 2: Parse Document
Read input document, extract recipe definitions with these fields:
| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Recipe identifier (kebab-case) |
| `category` | Yes | Category directory name |
| `description` | Yes | One-line description |
| `extensionPoints` | Yes | List of extension point names |
| `appliesTo` | Yes | List of `command:point` pairs |
| `prerequisites` | No | List of prerequisites |
| `template` | Yes | Recipe template content |
| `techMapping` | No | Tech stack indicators for suggestion |
**Parsing strategy:** Look for repeated structural patterns containing the fields above. Adapt to the document's actual format.
**If no recipe definitions found:** Report and **STOP**.
### Step 3: Validate Recipes
Read `.claude/metadata/extension-points.json` from disk.
**For each parsed recipe:**
1. **Duplicate check:** Compare `name` against existing `.claude/recipes/*/`. If exists, mark `SKIP`.
2. **Extension point validation:** For each `appliesTo` entry, parse `command:point`, verify both exist in `extension-points.json`. If invalid, mark entry `INVALID`.
3. **Coverage check:** Every `extensionPoints` entry needs at least one valid `appliesTo` match. Uncovered points flagged.
**Classification:** VALID (all resolve) | PARTIAL (some invalid but all points covered) | INVALID (uncovered points) | SKIP (duplicate)
### Step 4: Report Validation Summary
Present results. Use `AskUserQuestion` to confirm. Options:
- "Create valid + partial recipes" (default)
- "Create only fully valid recipes"
- "Cancel"
### Step 5: Create Recipes
**5a:** Ensure `.claude/recipes/{category}/` exists. Create `CATEGORY.md` if new category.
**5b:** Write `.claude/recipes/{category}/{recipe-name}.md` with YAML frontmatter (name, description, extensionPoints, appliesTo, prerequisites) and template body.
**5c:** Update `recipe-tech-mapping.json` if techMapping data present.
**5d:** Regenerate registry:
```bash
node .claude/scripts/framework/build-extension-recipes.js
```
**5e:** Commit:
```bash
git add .claude/recipes/ .claude/metadata/extension-recipes.json .claude/metadata/recipe-tech-mapping.json
```
Commit with: `Refs #$ISSUE -- Add N extension recipes from {document-name}`
### Step 5f: Report
Report created/skipped counts and new recipe details.
**STOP.** Do not proceed without user instruction.
## Interactive Mode (Steps 6-9)
### Step 6: Gather Recipe Metadata
Prompt user for: name (kebab-case), category (existing or new), description (one line).
### Step 7: Select Extension Points
Read `.claude/metadata/extension-points.json`. Present available points grouped by command with `AskUserQuestion` (`multiSelect: true`). Build `appliesTo` from selections. At least one point required.
### Step 8: Build Template
Ask user to provide recipe template content (markdown body below frontmatter).
### Step 9: Create Recipe
Follow Steps 5a-5f for single recipe. Optionally ask about tech stack mapping.
## Error Handling
| Situation | Response |
|-----------|----------|
| Document path not found | Report -> STOP |
| No recipe definitions | Report parsing failure -> STOP |
| Duplicate recipe name | Mark SKIP, warn, continue |
| Invalid extension point | Mark INVALID, continue validation |
| Uncovered extension point | Mark recipe INVALID |
| Category missing | Create automatically with CATEGORY.md |
| `build-extension-recipes.js` fails | Report error, files already created |
| `extension-points.json` missing | "Run /extensions first" -> STOP |
| `recipe-tech-mapping.json` missing | Skip tech mapping, warn |
**End of /add-recipe Command**
