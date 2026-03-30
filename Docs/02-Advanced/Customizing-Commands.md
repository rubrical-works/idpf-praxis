# Customizing Commands with Extensions

**Date:** 2026-02-09
**Topic:** How to add custom steps to IDPF slash commands using the extension system

---

## The Problem Extensions Solve

IDPF commands follow a fixed workflow: `/prepare-release` runs five phases in order, `/work` validates the issue and dispatches to TDD, `/done` verifies criteria and commits. These workflows are the same for every project. But every project is different.

Your Node.js project needs `npm test` before every release. Your Go project needs `go vet`. Your team requires Slack notifications when a release is tagged. Your compliance process requires a sign-off checklist item before merging. None of this is in the default commands — and it shouldn't be, because it's project-specific.

Extensions let you inject custom steps into any command's workflow **without editing the command spec itself**. You add your steps at designated extension points, and the framework treats them as first-class workflow items — including generating todo list entries for them.

---

## How It Works

Every extensible command contains **extension points** — marked locations in the workflow where you can insert custom steps. These are HTML comments in the command's markdown file:

```markdown
<!-- USER-EXTENSION-START: pre-validation -->
<!-- USER-EXTENSION-END: pre-validation -->
```

When this block is empty (as above), the extension point is inactive. No todo is generated, no step is executed. It's a placeholder waiting for content.

When you add content between the markers, it becomes an active workflow step:

````markdown
<!-- USER-EXTENSION-START: pre-validation -->
### Run Tests

```bash
npm test
```

**If tests fail, STOP and fix before continuing.**
<!-- USER-EXTENSION-END: pre-validation -->
````

Now every time `/prepare-release` runs, it will execute your test step before the validation phase. The todo list will include it as a step. The assistant will run it and report the results.

---

## The Extension Registry

IDPF tracks all extension points across all commands in a registry:

**Registry file:** `.claude/metadata/extension-points.json`

The registry contains:
- Every extensible command and its extension points
- Metadata for each point: name, location in the workflow, and purpose

You never need to edit the registry directly. It's a read-only reference that the `/extensions` command uses for discovery and validation.

---

## The /extensions Command

The `/extensions` command is your interface to the extension system. It has seven subcommands:

### Discovery

**`/extensions list`** — Show all extension points across all commands.

```
/extensions list
```

Output shows each command, its extension points, and whether they have content.

**`/extensions list --command prepare-release`** — Show extension points for a specific command.

```
/extensions list --command prepare-release
```

This is the starting point when you want to customize a command: see what hooks are available, where they fire in the workflow, and what they're for.

### Inspection

**`/extensions view prepare-release:post-validation`** — Show the current content of a specific extension point.

```
/extensions view prepare-release:post-validation
```

Shows what's currently in that extension block — either empty or your custom content.

**`/extensions matrix`** — Show a cross-command comparison of all extension points.

```
/extensions matrix
```

This produces a grid showing which commands have which extension point types (pre-create, post-create, pre-validation, etc.), making it easy to see patterns across the system.

### Editing

**`/extensions edit prepare-release:post-validation`** — Add or modify content in an extension point.

```
/extensions edit prepare-release:post-validation
```

The assistant shows you the current content (or notes it's empty), asks what you want to add or change in natural language, then implements the edit directly. You describe your intent — "add a coverage check that fails if below 80%" — and the assistant writes the appropriate markdown into the extension block.

This is the primary way to customize commands. You don't edit the markdown file manually; you tell the assistant what you want and it handles the formatting.

### Validation

**`/extensions validate`** — Check that all extension blocks are properly formatted.

```
/extensions validate
```

Scans every command file for malformed markers (missing END tag, mismatched names, broken nesting). Run this after manual edits or hub updates to catch formatting issues.

### Recipes

**`/extensions recipes`** — Show pre-built patterns for common extension needs.

```
/extensions recipes
```

Lists all recipe categories. Currently available:

| Category | Recipes | Purpose |
|---|---|---|
| **ci** | CI gate, CI status check, Cross-OS testing | Block workflow until CI passes |
| **coverage** | Coverage gate, coverage report | Enforce test coverage thresholds |
| **docs** | Auto-changelog | Generate changelog from commits |
| **notifications** | Slack notification | Alert on release events |
| **security** | Dependency audit | Check for known vulnerabilities |
| **testing** | Node.js, Python, Go, Rust, Java, Ruby, PHP, .NET, test plan generator | Run tests for your language |

**`/extensions recipes testing`** — Show recipes for a specific category.

```
/extensions recipes testing
```

Shows the template content, prerequisites, and which `command:point` combinations each recipe applies to.

---

## Extension Point Naming Convention

Extension points follow a consistent naming pattern that tells you when they fire:

| Pattern | Meaning | Example |
|---|---|---|
| `pre-*` | Before a workflow phase | `pre-validation` — before validation runs |
| `post-*` | After a workflow phase | `post-tag` — after the git tag is created |
| `pre-commit` | Before a version commit | Generate artifacts that should be committed |
| `checklist-before-*` | Pre-action verification items | Checklist items before tagging |
| `checklist-after-*` | Post-action verification items | Checklist items after tagging |
| `checklist` | Single verification checklist | Branch creation verification |
| `gates` | Custom validation gates | Merge gate checks |
| `criteria-customize` | Review criteria injection | Add project-specific review criteria |

The naming is deliberate: if you see `pre-validation` on `/prepare-release`, you know your step runs before Phase 2 (Validation). If you see `post-tag`, your step runs after the git tag is created in Phase 4.

---

## Which Commands Are Extensible?

The following commands support extensions. Here's the full map:

### High-Extension Commands (8+ points)

| Command | Points | Key Extensions |
|---|---|---|
| **`/prepare-release`** | 13 | post-analysis, pre/post-validation, pre-commit, post-pr-create, pre/post-tag, pre/post-close, 3 checklists |
| **`/prepare-beta`** | 9 | post-analysis, pre/post-validation, post-prepare, pre-commit, pre/post-tag, 2 checklists |
| **`/create-prd`** | 9 | pre/post-analysis, pre/post-transform, pre/post-diagram, diagram-generator, pre/post-generation, quality-checklist |

These are the commands where you'll spend most of your extension effort. Release and PRD workflows have the most project-specific variation.

### Medium-Extension Commands (3-6 points)

| Command | Points | Key Extensions |
|---|---|---|
| **`/merge-branch`** | 6 | pre-gate, gates, post-gate, post-pr-create, post-merge, post-close |
| **`/work`** | 3 | pre-work, post-work-start, pre-framework-dispatch |
| **`/destroy-branch`** | 3 | pre-destroy, post-confirm, post-destroy |
| **`/review-issue`** | 3 | pre-review, criteria-customize, post-review |
| **`/review-prd`** | 3 | pre-review, criteria-customize, post-review |
| **`/review-proposal`** | 3 | pre-review, criteria-customize, post-review |

### Low-Extension Commands (2 points each)

| Command | Points | Key Extensions |
|---|---|---|
| **`/done`** | 2 | pre-done, post-done |
| **`/bug`** | 2 | pre-create, post-create |
| **`/enhancement`** | 2 | pre-create, post-create |
| **`/proposal`** | 2 | pre-create, post-create |
| **`/create-branch`** | 2 | pre-create, post-create |

---

## Practical Examples

### Example 1: Run Tests Before Every Release

You want `npm test` to run before the validation phase of `/prepare-release`. If tests fail, the release should stop.

```
/extensions edit prepare-release:pre-validation
```

Tell the assistant: "Add a step that runs npm test and stops if tests fail."

Result in the command file:

````markdown
<!-- USER-EXTENSION-START: pre-validation -->
### Run Tests

```bash
npm test
```

**If tests fail, STOP and fix before continuing.**
<!-- USER-EXTENSION-END: pre-validation -->
````

Every future `/prepare-release` now runs your tests at the right moment.

### Example 2: Coverage Gate

You want releases to fail if test coverage drops below 80%.

```
/extensions edit prepare-release:post-validation
```

Tell the assistant: "Add a coverage gate. Run nyc to check coverage. Lines and functions must be at least 80%, branches at least 70%. If below threshold, stop the release."

Or use a recipe:

```
/extensions recipes coverage
```

The `coverage-gate` recipe provides a ready-made template for this exact scenario.

### Example 3: Slack Notification on Release

You want a Slack message when a release is tagged.

```
/extensions edit prepare-release:post-tag
```

Tell the assistant: "Post a message to Slack with the version number. Use the SLACK_WEBHOOK_URL environment variable."

### Example 4: Custom Review Criteria

You want `/review-issue` to check for accessibility considerations on every story.

```
/extensions edit review-issue:criteria-customize
```

Tell the assistant: "Add a criterion that checks whether the story considers accessibility impact. Ask whether WCAG compliance was addressed."

### Example 5: Linting Before Work Starts

You want to run your linter before every `/work` cycle to start from a clean baseline.

```
/extensions edit work:pre-work
```

Tell the assistant: "Run ESLint with --fix before starting work. Report any unfixable issues but don't block."

---

## How Extensions Survive Hub Updates

This is a common concern: if the hub is updated and project commands are refreshed, what happens to your extensions?

**Extensions are preserved.** When px-manager updates commands from a new hub version:

1. It reads each command file in your project
2. It detects `USER-EXTENSION-START` / `USER-EXTENSION-END` blocks and their content
3. It copies the updated command template from the hub
4. It re-inserts your extension content at the matching extension points
5. Your customizations survive the update

This is why commands are **copied** to your project rather than symlinked — the project-owned copy is where your extensions live. The hub provides the template; your project owns the customized version.

---

## Extensions vs Direct Editing

You might wonder: why not just edit the command file directly?

You can. The command files are markdown in `.claude/commands/`. Nothing prevents you from opening one in an editor and changing whatever you want. But there are reasons to prefer the extension system:

1. **Survivability.** Content inside extension blocks survives hub updates. Content you add elsewhere in the command file will be overwritten on the next update.

2. **Discoverability.** `/extensions list` shows all customization points and their current state. Direct edits are invisible to the tooling.

3. **Validation.** `/extensions validate` checks that your blocks are properly formatted. Direct edits can break the marker syntax.

4. **Todo integration.** Non-empty extension blocks automatically become todo items during command execution. Direct edits to the workflow don't get this treatment.

5. **Intent-based editing.** `/extensions edit` lets you describe what you want in natural language. The assistant handles the markdown formatting, preserves surrounding content, and confirms the change.

---

## The FRAMEWORK-ONLY Distinction

If you're looking at command files in the IDPF development repository (not a user project), you'll see additional markers:

```markdown
<!-- FRAMEWORK-ONLY-START -->
Content only visible in the framework development environment
<!-- FRAMEWORK-ONLY-END -->
```

This content is **stripped** when commands are copied to user projects. It typically contains framework-specific validation steps, internal file references, or development-only checks that don't apply to user projects.

In your project's command files, you won't see these markers — they've already been removed during installation.

---

## Quick Reference

| Task | Command |
|---|---|
| See all extension points | `/extensions list` |
| See points for one command | `/extensions list --command work` |
| View an extension's content | `/extensions view prepare-release:pre-tag` |
| Add or edit an extension | `/extensions edit prepare-release:pre-tag` |
| Check formatting | `/extensions validate` |
| See the comparison grid | `/extensions matrix` |
| Browse pre-built patterns | `/extensions recipes` |
| Browse one category | `/extensions recipes testing` |

---

**End of Customizing Commands with Extensions**
