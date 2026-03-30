# /charter

View, create, or manage the project charter.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | | Show charter summary if complete, or start creation if missing/template |
| `update` | No | Update specific charter sections interactively |
| `refresh` | No | Re-extract charter from the codebase and merge with existing |
| `validate` | No | Check current work against charter scope |

## Usage

```
/charter
/charter update
/charter refresh
/charter validate
```

## Key Behaviors

- **Charter is mandatory.** If `CHARTER.md` is missing or still contains template placeholders (`{like-this}`), creation starts automatically — there is no skip option.
- **Inception mode** (new project): asks 4-8 questions covering vision, problem, tech stack, scope, testing framework, deployment platform, review mode, and active review domains. Generates `CHARTER.md` plus a full `Inception/` directory structure.
- **Extraction mode** (existing project): loads the `codebase-analysis` skill, analyzes source code, presents findings for confirmation, then generates charter artifacts from the analysis.
- After charter creation, suggests relevant skills from `.claude/metadata/skill-keywords.json` (default skills are pre-selected) and installs confirmed selections. Also suggests matching extension recipes.
- `/charter validate` compares current work (issue, recent commits, staged changes) against `CHARTER.md` scope boundaries and flags anything potentially out of scope.
- Tech stack changes in `/charter update` trigger additive skill and recipe suggestions for newly relevant items only.
