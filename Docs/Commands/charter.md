# /charter

View, create, or manage the project charter.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | | Show charter summary if complete, or start creation if missing/template |
| `--update` | No | Update specific charter sections interactively |
| `--update --register-proj` | No | Register a companion repository or board |
| `--update --deregister-proj` | No | Remove a companion registration by `owner/name` |
| `--update --list-proj` | No | List registered companions with their capability flags |
| `--refresh` | No | Re-extract charter from the codebase and merge with existing |
| `--validate` | No | Check current work against charter scope |
| `--create-domain-entities` | No | Regenerate `domain-entities.json` from the current charter |
| `--testing` | No | Run harness selection per language and role, writing `testing.suites[]` |
| `--dry-run` | No | With `--testing` only: run selection and show what would be written, writing nothing |
| `--check` | No | With `--testing --dry-run` only: non-interactive audit for CI, ending in a `clean` or `drift` verdict |
| `--sweep-e2e on\|off` | No | With `--testing` only: set whether every e2e suite runs in the full test sweep `/work` runs before review, without re-running selection |
| `--sweep-scope all\|touched` | No | With `--testing` only: set whether the full test sweep runs every suite or only the suites whose files changed, without re-running selection |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

**Retired forms:** `update`, `refresh` and `validate` typed bare are no longer accepted; use `--update`, `--refresh` or `--validate`.

## Usage

```
/charter
/charter --update
/charter --update --list-proj
/charter --refresh
/charter --validate
/charter --create-domain-entities
/charter --testing
/charter --testing --dry-run
/charter --testing --dry-run --check
/charter --testing --sweep-e2e off
/charter --testing --sweep-e2e on
/charter --testing --sweep-scope all
/charter --testing --sweep-scope touched
```

## Key Behaviors

- **Charter is mandatory.** If `CHARTER.md` is missing or still contains template placeholders, creation starts automatically — there is no skip option. Placeholders are `{Capitalized Words}`, `{lowercase-kebab}`, `{{UPPER_SNAKE}}`, or `TODO: Fill in`; braces that appear only inside code blocks or inline code (JSON examples, `{frameworkPath}`) are not treated as placeholders. The placeholders found are listed when creation starts.
- **Inception mode** (new project): asks questions covering vision, problem, tech stack, scope, testing harnesses, deployment platform, review mode, and active review domains. Generates `CHARTER.md` plus a full `Inception/` directory structure.
- **Inception artifacts are written in intent voice.** No code exists yet on this path, so no `Inception/` artifact may claim to have detected anything — each one records what the project *will* use, sourced from your answers. `Inception/Tech-Stack.md` comes from the tech-stack answer alone and uses `TBD` for any detail that answer did not supply (version, package manager, runtime, build tool). This is separate from the `TBD` used for questions you skipped: that covers an unanswered question, this covers a detail that is unobservable because nothing is installed yet.
- **Extraction mode** (existing project): loads the `codebase-analysis` skill, analyzes source code, presents findings for confirmation, then generates charter artifacts from the analysis. Artifacts here are observations, so a "detected" or "found via `<file>`" claim is permitted — each must trace back to a file that was actually read. Test commands found in `package.json` scripts, `Makefile`, `pyproject.toml` or CI workflows are shown with the file they came from and pre-filled into harness selection. If the skill is not installed the command stops and tells you to install it via Praxis Hub Manager rather than proceeding without analysis.
- After charter creation, suggests relevant skills from `.claude/metadata/skill-keywords.json` (default skills are pre-selected) and installs confirmed selections. Also suggests matching extension recipes.
- `/charter --validate` compares current work (issue, recent commits, staged changes) against `CHARTER.md` scope boundaries and flags anything potentially out of scope.
- Tech stack changes in `/charter --update` trigger additive skill and recipe suggestions for newly relevant items only.
- **Project `.npmrc` offer.** When the stack includes JavaScript or TypeScript and the project root has no `.npmrc`, `/charter` offers to copy the framework's project template. The template sets a `min-release-age` cooldown for new package versions and turns on `ignore-scripts`. The offer is made during Inception, during Extraction, and on `/charter --refresh` for charters created before the offer existed. The file is written only if you accept, and declining is not asked again in the same run. An existing `.npmrc` is never overwritten: `/charter` reports it and names the two keys so you can merge them by hand.
- `domain-entities.json` is always written beside `CHARTER.md` at the project root. If that path would resolve outside the project (for example through a linked directory), the error is reported and nothing is written.

## Harness Selection

Harness selection replaces the old "testing framework" and "test command" questions. It runs during charter creation for every code project, and on demand with `/charter --testing`.

- **One question per language or platform, per role.** For each detected language (and each detected platform, such as `mobile`) and each role it has options for (`unit`, `e2e`), you pick from the merged harness registry — the shipped registry plus your project's local one. Locally contributed options are labeled `local`; platform rows are labeled as platforms. A platform is only asked about for the roles it declares.
- **Mobile is only offered when there is evidence of a mobile project**: at Inception, a tech-stack answer naming React Native, Flutter, Expo, iOS, Android or "mobile app"; otherwise an `app.json`, `pubspec.yaml` or `AndroidManifest.xml` on disk. Mobile options are never pre-selected.
- **Selection is mandatory.** An empty answer is rejected and the question is asked again. Accepted answers are a listed harness, **None of these**, or **none applicable**. "None applicable" is recorded as a manual, not-run suite so the answer is kept rather than lost. A role with no known harness still asks, offering only the last two choices.
- **Defaults are armed only on clear evidence** — when exactly one harness matches a detect signal (for example `pytest.ini`), and the evidence is shown beside the default.
- **"None of these"** asks for the assurance tier — `script`, `golden` (both run at the verification gate, with the command you supply) or `manual` (declared but not run) — and offers to save the harness to `.claude/local-metadata/test-harnesses.json` for reuse.
- Answers are written to `framework-config.json` `testing.suites[]`. `/charter` no longer writes `verificationCommands`; an existing key is left in place and still read.
- **Each suite is written with a `concurrency` field** — `exclusive` for an `e2e` suite, `parallel` for every other role. It says where `/work --concurrent` may run the suite: `parallel` suites run inside each member's worktree, `exclusive` suites wait and run once on your branch after the group has merged back, so a browser-bound or port-bound suite never runs twice at once and is never skipped. Selection never asks; edit the value by hand if an e2e suite really can run in parallel.
- Skipped selection is reported with its reason: a non-code project (documentation, config, terraform, ansible), or a detected language with no harness available for a role.
- **`Inception/Test-Strategy.md`'s Framework table is generated from `testing.suites[]`** — one row per suite with role, harness, command and execution — and marked as generated. A suite left out of the full sweep is shown as *not swept*, or as *never runs during `/work`* when it is also skipped for changed files.

### E2e Suites and the Full Sweep

Before an issue moves to review, `/work` runs every test suite in full (the "full sweep"). End-to-end suites are usually the slowest tests and often need a browser, device or emulator, so running them for every issue is expensive.

- **After you pick an e2e harness, `/charter` asks whether its suite joins the full sweep**, recommending **Don't sweep**. The question states what each answer costs, and that the suite still runs whenever its own files change.
- **Some e2e harnesses never run for changed files** (WebdriverIO, Detox, Appium, Maestro, and the Java, Kotlin and .NET e2e harnesses). Under "Don't sweep" they would never run during `/work`, and the question says so.
- Your answer is saved on the suite as `sweep: true` or `sweep: false`. Harnesses for other roles don't ask.
- **`/charter --testing --sweep-e2e on` or `off`** changes the answer for every e2e suite at once, without re-running selection.
  - Running it again changes nothing, and each suite is reported by id as changed or unchanged.
  - Manual-only e2e records are left alone and named.
  - With no e2e suites it writes nothing and says so.
  - With `--dry-run` it shows what would change.
  - A missing or unknown value, or use without `--testing`, is rejected with the valid form.
- **`/charter --testing --sweep-scope all` or `touched`** decides which suites the full sweep runs. `all`, the default, runs every suite. `touched` runs only the suites whose file patterns match a file the issue changed, which makes the sweep faster.
  - Before switching to `touched`, `/charter` warns about any suite whose patterns match only test files, naming it. Such a suite would be skipped when an issue changes source files but not their tests. The warning does not stop the change.
  - The previous and new value are reported, or `unchanged` if it was already set. `all` is saved explicitly rather than by removing the setting.
  - With `--dry-run` it shows what would change. A missing or unknown value, or use without `--testing`, is rejected with the valid form.

### Tooling Verification and Guided Install

After selection completes, the tooling each selected harness requires (packages, browsers, drivers, system libraries, as declared in the registry) is checked:

- Playwright harnesses are checked with `/playwright-check`, offering `/playwright-check --fix` on a problem. Where it cannot answer (non-npm Playwright ports), and for every other harness, each requirement's declared check command is run.
- A harness that declares no requirements is reported as *no requirements declared*, not as verified. A requirement with no check command is reported as unverified.
- For each missing requirement, the exact install command from the registry is shown and run only after you confirm, then re-checked. You may decline any step. A requirement with no declared install command is named for you to install yourself.
- If an install fails or is declined, the harness stays selected but is written as a manual-only suite with `note: install pending`, shown as pending in the Framework table, and the retry command is reported. This keeps a missing binary from failing unrelated work at the verification gate.
- When you confirm a harness that Extraction mode detected (from spec files or the dependency manifest), the same verification runs — spec files and manifest entries show intent, not that the tooling is installed.

### Dry Run and CI Check

- `/charter --testing --dry-run` runs selection to completion and writes nothing. It shows the `testing` block that would be written, a diff against the current `framework-config.json`, each write that was suppressed, and where each registry option came from (shipped, local, hidden, shadowed, or unknown).
- `/charter --testing --dry-run --check` never prompts. It compares the current declaration against the registry and the detected language/role pairs, reports newly gained pairs with no suite and suites that no longer match any files, and ends in a `clean` or `drift` verdict with every difference named. For CI, `.claude/scripts/shared/charter-testing-audit.js` computes the same audit and exits `0` on clean, `1` on drift.
- The check also warns, by suite name, when an e2e suite left out of the full sweep isn't run by any GitHub Actions workflow either, or when there are no workflows at all. Such a suite runs neither during `/work` nor in CI. The warning never changes the verdict or the exit code, and other CI systems aren't checked.
- `--dry-run` without `--testing` is rejected with a message naming the valid form.

## Refresh and Testing

`/charter --refresh` re-applies harness selection against what changed rather than re-asking everything:

- Only newly gained language/role pairs are asked about; an existing suite is never re-asked or overwritten. A language whose `unit` or `e2e` role has neither a suite nor a "none applicable" record is named and selection runs for it.
- Suites whose file patterns match nothing are reported, never removed.
- Suites marked `install pending` are re-checked; if the tooling is now present you are offered the option to restore them to the verification gate, otherwise the missing requirement and retry command are reported.
- An e2e suite created before the sweep question existed (it has no `sweep` setting) is offered `sweep: false`. Nothing changes unless you confirm, and a suite that already has an answer is not asked again.
- `testing.suites[]` is compared against the Framework table, any legacy `verificationCommands`, and commands found in manifests and CI workflows. Every difference names its source. Undeclared commands and aliases are reported, and nothing is written without confirmation.
- A hand edit to the generated Framework table is reported, naming `framework-config.json` as the authority, and the table is re-rendered only on confirmation.
