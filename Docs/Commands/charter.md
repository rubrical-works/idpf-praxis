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
- **Inception artifacts are written in intent voice.** No code exists yet on this path, so no `Inception/` artifact may claim to have detected anything — each one records what the project *will* use, sourced from your answers. `Inception/Tech-Stack.md` comes from the tech-stack answer alone and uses `TBD` for any detail that answer did not supply (version, package manager, runtime, build tool). This is separate from the `TBD` used for questions you skipped: that covers an unanswered question, this covers a detail that is unobservable because nothing is installed yet.
- **Extraction mode** (existing project): loads the `codebase-analysis` skill, analyzes source code, presents findings for confirmation, then generates charter artifacts from the analysis. Artifacts here are observations, so a "detected" or "found via `<file>`" claim is permitted — each must trace back to a file that was actually read. If the skill is not installed the command stops and tells you to install it via Praxis Hub Manager rather than proceeding without analysis.
- After charter creation, suggests relevant skills from `.claude/metadata/skill-keywords.json` (default skills are pre-selected) and installs confirmed selections. Also suggests matching extension recipes.
- `/charter validate` compares current work (issue, recent commits, staged changes) against `CHARTER.md` scope boundaries and flags anything potentially out of scope.
- Tech stack changes in `/charter update` trigger additive skill and recipe suggestions for newly relevant items only.
