---
version: "v0.119.0"
description: View, create, or manage this project's charter, using the IDPF framework.
argument-hint: "[--update | --refresh [--dry-run] | --testing [--dry-run | --check] | --sweep-e2e on|off [--sweep-scope all|touched] [--dry-run] | --sweep-scope all|touched [--dry-run] | --register-proj | --deregister-proj <owner/name> | --list-proj] [--help]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /charter
Context-aware. Shows summary if exists, starts creation if missing.
## Arguments
| Argument | Description |
|----------|-------------|
| *(none)* | Show summary, or start creation when there is no charter |
| `--update` | Update specific sections through the section menu |
| `--refresh` | Re-extract from code, merge, show derived counts, repair a legacy shape, reshape. Takes `--dry-run` |
| `--testing` | Harness selection per language and role. Takes `--dry-run` or `--check` |
| `--dry-run` | Report what would change, write nothing. Applies to `--refresh`, `--testing`, `--sweep-e2e`, `--sweep-scope` |
| `--check` | With `--testing`: non-interactive CI audit of the testing declaration → `clean` or `drift` |
| `--sweep-e2e on\|off` | Set whether every gate `e2e` suite joins the `/work` Step 4f sweep, without re-running selection |
| `--sweep-scope all\|touched` | Set whether the Step 4f sweep runs every gate suite or only those whose files changed, without re-running selection |
| `--register-proj` | Register a companion repository or board. Runs only the companion step |
| `--deregister-proj <owner/name>` | Remove a companion registration; asks for `<owner/name>` when it is omitted. Runs only the companion step |
| `--list-proj` | List registered companions with capability flags. Runs only the companion step |
| `--help` | Open this command's docs page. Takes precedence over every other argument and performs no action. |

**`--help` takes precedence over every other argument and performs no action:** run `node .claude/scripts/shared/command-help.js charter`, report its output, and STOP.

**Combinations — stated here once; every other section defers to this list (#3651).** No argument parser exists: a combination left unstated is undefined behavior.
- **`--update`, `--refresh` and `--testing` are mutually exclusive.** Two together are rejected with a message naming the three valid forms — `/charter --update`, `/charter --refresh`, `/charter --testing` — and nothing runs.
- **`--dry-run` applies to `--refresh`, to `--testing` and to either sweep setter**, and is rejected anywhere else with a message naming those forms: `/charter --refresh --dry-run`, `/charter --testing --dry-run`, `/charter --sweep-e2e on|off --dry-run`, `/charter --sweep-scope all|touched --dry-run`.
- **`--sweep-e2e` and `--sweep-scope` may be given together**, both applied; **neither combines with `--check`**.
- **Standalone forms and aliases.** `/charter --testing --check` runs the CI audit; `--testing --dry-run --check` is an accepted alias. `/charter --sweep-e2e on|off` and `/charter --sweep-scope all|touched` stand without `--testing`, neither running selection; the `--testing`-prefixed forms are accepted aliases. `/charter --register-proj`, `/charter --deregister-proj <owner/name>` and `/charter --list-proj` run only the companion step (`--update` step 5), never the `--update` section menu; the `--update`-prefixed forms are accepted aliases and behave identically. `--deregister-proj` takes its value on the command line and asks for `<owner/name>` when it is omitted.
- **Any other token is an unrecognized argument**, reported as one — a bare `update` or `refresh` included.
## Usage
| Command | Description |
|---------|-------------|
| `/charter` | Show summary or start creation |
| `/charter --update` | Update specific sections through the section menu |
| `/charter --refresh` | Re-extract from code, merge, show derived counts, repair a legacy shape, reshape |
| `/charter --refresh --dry-run` | Run every `--refresh` analysis step, shape step included; write nothing |
| `/charter --testing` | Harness selection per language and role → `testing.suites[]` |
| `/charter --testing --dry-run` | Run selection to completion; write nothing |
| `/charter --testing --check` | Non-interactive CI audit; `--testing --dry-run --check` is an accepted alias |
| `/charter --sweep-e2e on` · `--sweep-e2e off` | Set whether every `e2e` suite joins the `/work` Step 4f sweep, without re-running selection |
| `/charter --sweep-scope all` · `--sweep-scope touched` | Set whether the `/work` Step 4f sweep runs every gate suite or only those whose files changed |
| `/charter --register-proj` | Register a companion repository or board |
| `/charter --deregister-proj <owner/name>` | Remove a companion registration; asks for `<owner/name>` when omitted |
| `/charter --list-proj` | List registered companions with capability flags |
## Execution
**REQUIRED:** Parse workflow steps, use `TaskCreate` to create tasks. Mark `in_progress`→`completed`. After compaction, re-read spec and call `TaskList` to resume from first incomplete task.
## framework-config.json — Use the Helper
ALL writes to `framework-config.json` — `deploymentTarget`, `projectSkills`, `reviewMode`, `activeDomains`, `verificationCommands`, any field — MUST go through `framework-config.js`. Raw `fs.writeFileSync` forbidden — helper validates against `.claude/metadata/framework-config.schema.json` (ajv draft-07), rejects invalid output.
```javascript
const fwconfig = require('./.claude/scripts/shared/lib/framework-config.js');
const config = fwconfig.read(process.cwd());
config.deploymentTarget = 'vercel';
config.projectSkills = [...new Set([...(config.projectSkills || []), ...newSkills])].sort();
fwconfig.write(process.cwd(), config); // throws on validation failure
```
If `fwconfig.write` throws, surface error and stop — do NOT retry with raw file I/O.
## Project `.npmrc` Offer (#3016)
**Trigger:** stack includes JavaScript or TypeScript (a `testing.suites[]` entry for either, or `package.json` on disk) and no `.npmrc` at the project root. **Offer** to copy `{frameworkPath}/Templates/project/.npmrc` there — the `min-release-age` cooldown and `ignore-scripts` block the framework adopted for itself (#2481). Write **only on acceptance**; on decline change nothing and do not re-ask in the run. An existing `.npmrc` is **never overwritten** — report it, name the two keys for a hand merge, move on. Rule 06: offer, never force. This offer is the only path a project gets the file — Praxis Hub Manager does not write it and a hub upgrade does not install it (`Templates/project/.npmrc` is a project file). The startup Supply Chain row (#3313) names the gap in a project chartered before the offer and points here via `/charter --refresh`.
## Retired File Removal (#3420)
**Every mode, first, before anything else runs:** delete a retired `domain-entities.json` at the project root — mandatory, not an offer, no prompt.
```javascript
const { removeRetiredEntitiesFile } = require('.claude/scripts/shared/charter-entities.js');
const { removed, path } = removeRetiredEntitiesFile(process.cwd());
```
`removed: true` → report `Retired file removed: domain-entities.json — commit the deletion` (an unstaged change the user commits; under `--refresh`, step 7's commit offer lists it). `removed: false` → say nothing. Derived from CHARTER.md and read by nothing, so deleting it loses nothing; the startup hook makes the same call, this one catches a file that reappears. A link is removed itself, never followed.
## Template Detection
**One rule (#2893):** `.claude/scripts/shared/lib/charter-template.js`, shared with the startup hook and `Reference/Charter-Enforcement.md`. NEVER copy its pattern into this spec — three restated copies drifted until none matched the Praxis Hub Manager bootstrap charter, which then read as complete.
`node .claude/scripts/shared/lib/charter-template.js CHARTER.md` → `{"exists", "template", "placeholders": [...]}`; report the `placeholders` when routing to Step 3.
ANY placeholder (`{Capitalized Words}`, `{lowercase-kebab}`, `{{UPPER_SNAKE}}`, `TODO: Fill in`) → template. Braces only inside fenced blocks or inline code (JSON examples, `{frameworkPath}`) → ignored. No placeholders → complete.
## Workflow
### /charter (No Args)
1. `test -f CHARTER.md`
2. If exists, check placeholders via the shared rule: `node .claude/scripts/shared/lib/charter-template.js CHARTER.md`
   - **TEMPLATE (`template: true`):** → Step 3
   - **COMPLETE (`template: false`):** Display `CHARTER.md` as written, then the Key Entities counts derived now (#3644):
```javascript
const { extractEntities, deriveEntityCounts, formatCountsBlock } = require('.claude/scripts/shared/charter-entities.js');
const block = formatCountsBlock(deriveEntityCounts(extractEntities(fs.readFileSync('CHARTER.md', 'utf8'))));
```
     Show `block` (`Key Entities — counts (derived now, not stored)`); a row whose path is missing is shown as not counted, with its reason, never as zero. **Nothing writes the block to a file.** Mention `/charter --update` and `/charter --refresh`.
3. **No charter OR template:** Charter mandatory. Has code → extraction; empty → inception. Proceed directly (no skip).
### Extraction Mode
1. Verify `.claude/skills/codebase-analysis/SKILL.md` exists, then load it. **Missing:** `codebase-analysis skill not installed. Install via Praxis Hub Manager or ask user to install.` -> **STOP**
2. Analyze codebase (tech stack, architecture, tests, NFRs)
3. Present findings, ask user to confirm/adjust
4. Generate CHARTER.md and the `Project/` documents
4a. Offer the project `.npmrc` per **Project `.npmrc` Offer** (#3016) — the manifest is on disk, so the trigger is observed, not declared.
3a. **Companion pre-fill:** propose candidates from disk, never open-ended — `git remote -v`; `.gh-pmu.json` `repositories[]`; the CHARTER.md Companion Repositories table is the source of truth for what is registered. Confirm with `searchable`/`fileIssues` defaulting false, ask each companion's **direction** (see Companion Projects); register via `registerCompanion`. Asking open-ended here would assert something no file was read for — the failure the artifact-voice rule below governs.
**Artifact voice — extraction:** artifacts here are **observations**. "detected" / "found via `<file>`" claims are permitted *because a file was read*; each must be traceable to the file supporting it.
**Step 2a — Verification commands from the manifest script block.** Read the script declarations here, in this spec:
| Source | What to read |
|---|---|
| `package.json` | the `scripts` object — test, lint, build, typecheck entries |
| `Makefile` | target names and their recipe lines |
| `pyproject.toml` | `[tool.poetry.scripts]`, `[project.scripts]`, tox/pytest config |
| CI workflow (`.github/workflows/*.yml`) | run steps of the test job — usually the most complete set, since CI must name every command |
**Propose each candidate with its provenance** — the file it was read from — and carry it into harness selection as the pre-filled `full` for the matching role. **Nothing here writes `verificationCommands` (#2850):** the per-suite `full` replaces it, and selection is the only writer of a command. Confirmed nothing → propose nothing; selection asks.
**Step 2b — Confirming a detected e2e harness routes through Tooling Verification (#2859).** When detection proposes an e2e harness — from spec files (`*.spec.ts`, `*.cy.js`, `tests/e2e/**`) or from the dependency manifest — the confirmation step is **followed by** the **Tooling Verification and Guided Install** section below, as a fresh Inception selection is. Confirming a detection selects a harness; it does not verify one.
**Spec files are NOT evidence of installed tooling, and detection cannot tell the difference.** A repository can carry a full `tests/e2e/` tree with `@playwright/test` in `devDependencies` and no browsers at all — package and binaries install separately. A manifest entry is evidence the project *intends* that harness; neither it nor a spec file is evidence it *runs*. Treating either as proof is the defect this closes: the charter records a `gate` suite and the first `/work` Step 4f finds the driver missing.
**Show the detection evidence beside the confirmation prompt**, per the **pre-selection evidence rule** of Harness Selection — the globs that matched and the manifest entries that named the harness, quoted as read. That rule already requires an armed default to display what armed it; this is the same requirement reached by the extraction path, not a second rule.
**The outcome is the same disposition set**: verified tooling keeps a `gate` suite; missing tooling enters the guided install; a failed or declined install writes `manual-only` with `note: install pending`, which `/charter --refresh` re-checks.
**Read the manifests here, not in `codebase-analysis`.** That skill is imported from `idpf-praxis-skills` and `/fw-import-skills` replaces imported skills wholesale, so logic added there reverts at the next import. `tech-stack-detection.md` already opens `package.json`, but only as an ecosystem marker — it never reads the `scripts` block, which is why the data was never collected. Same reasoning that placed `verificationMode` in `framework-config.json` rather than the imported `tdd-process` checklist (#2556).
### Inception Mode
**Artifact voice — inception (#2591):** no code exists on this path (Process step 1 creates the tree against an empty project), so **no artifact here may assert a detection.** Every inception artifact — `CHARTER.md` and the `Project/` documents — is a **declaration of intent** — what the project *will* use, sourced from answers, never from a filesystem read.
- **The charter's `## Tech Stack` table is written in intent voice from the Q3 (technology) answer** (#3650). It must not contain "detected", "found", or "via `<file>`" claims, nor name a technology, framework, or version the answers did not supply. No manifest was consulted; none exists yet.
- **The Tech Stack table holds technology names only — never a version** (#3643): "Electron", not "Electron 41"; "GitHub Actions", not "GitHub Actions (5 workflows)". Not even `TBD`: versions live in the manifest that owns them (`package.json`, `go.mod`, …).
- **`TBD` is required for any stack detail no answer supplied** (package manager, runtime, build tool). Distinct from Process step 6's unanswered-question rule: that covers questions the user skipped, this covers detail **unobservable** at inception because nothing is installed. A stack answered at Q3 but not yet scaffolded falls here — expanding one short answer into a detailed table is fabrication, not a default.
- Restated inline on purpose: extraction gets this from the `codebase-analysis` skill it loads; inception loads no skill, so without it the guard is absent exactly where a greenfield artifact is written.
#### Essential Questions
| # | Question | Maps To |
|---|----------|---------|
| 1 | What are you building? (1-2 sentences) | CHARTER.md Vision |
| 2 | What problem does it solve? | CHARTER.md Problem Statement |
| 3 | What technology/language? | CHARTER.md Tech Stack |
| 4 | What's in scope for v1? (3-5 items) | CHARTER.md In Scope |
**Note:** harness selection (below) replaces the retired Q5/Q5b pair, asked for every code project.
#### Harness Selection (replaces Q5 and Q5b — #2850)
**Q5 and Q5b are RETIRED, and the reason is the point.** Q5 asked a framework *name*, Q5b the *command* — two answers to one question, and the name half reached no gate: nothing executes a framework name, one of which nothing executes. Selection collects command and role together, once.
**`/charter` no longer writes `verificationCommands` in any mode** — not Inception, not the Extraction manifest read, not refresh. The per-suite `full` replaces it. An **existing** key is **left in place and read as legacy** by `test-runner.js` `resolveSuites` (#2852), which desugars it into suites; retiring the writer must not orphan a project that already declared one.
**The loop runs once per *(key × role present)*, across BOTH registry groups — `languages` and `platforms` (#2900).** Present the option list from the **merged** registry — `harness-registry.js` `loadMergedRegistry()` (#2848), which has always returned both groups. Locally-contributed entries are **labeled `local`**; entries the local file marks `hidden` are **omitted**.
**A platform key is labeled as a platform in the prompt** — without it a platform row and a language row are indistinguishable, and `mobile` sits beside `typescript` answering a different question about the same project.
**A platform is offered only for the roles it declares.** `platforms.mobile` ships `e2e` and no `unit`, so a mobile project is never asked a mobile unit question. Deliberately unlike a language, which **still prompts** at zero harnesses (below): "no harness exists for this language" is a real answer; a role the platform never declares is an inapplicable question, not a gap.
**Mobile triggers — the platform has no detect signal, so the trigger is named, not inferred (#2900).**
| Mode | Trigger |
|---|---|
| **Inception** | No code to analyze, so the **Q3 answer** is the only signal: **React Native**, **Flutter**, **Expo**, **iOS**, **Android**, or "mobile app" |
| **Extraction / refresh** | A mobile manifest: **`app.json`**, **`pubspec.yaml`**, **`AndroidManifest.xml`** — `detect-tech-stack.js` reports these as the `mobile` tech and checks the Android manifest at `app/src/main/` and `android/app/src/main/` as well as the root |
**Prompting `mobile` on every project is the failure this avoids** — three mobile harnesses in front of every backend developer — so the negative case is asserted as well as the positive.
**Mobile options are offered with NO pre-armed default.** Pre-selection arms only on an unambiguous single claimant, and the mobile set has no `detect` signal comparable to `pytest.ini` — Detox, Appium and Maestro claim the same project equally. PRD line 662 left this open; this is the answer.
**Selection is MANDATORY wherever at least one option applies.** An **empty answer is rejected** and re-asked. Accepted answers are exactly three: a listed harness, **None of these**, or **none applicable**.
**"none applicable" is a record, not a silence** — `kind: manual`, `execution: manual-only`, `note: none applicable`. It **carries no `match[]` and no `full`** (no command, no file set), which #2849 permits because both are required only when `execution` is `gate`. `manual-only` is load-bearing: `normalizeSuite` would otherwise default it to `gate` and #2852's sweep would try to run a suite with no command.
**Its `id` is `none-<key>-<role>` (#2900)** — `none-javascript-e2e`, `none-mobile-e2e`. A suite records **no key** (`testing.suites[]` is `additionalProperties: false`, with no `language` or `platform` field), so a `none-<role>` record cannot say which pair it answered and `charter-testing-audit.js` cannot credit it to one. The key is known here, where the loop asks. A legacy `none-<role>` record keeps repository-wide suppression rather than silently ceasing to work.
**A role with zero shipped and zero local harnesses still prompts**, offering only **None of these** and **none applicable** — skipping silently makes "none exists" indistinguishable from "nobody asked".
**Skip Detection — two reasons, reported separately.** *Non-code project type* (Q3 contains documentation, docs, config, terraform, ansible) skips selection. *No possibility for this stack* is a detected code language with no harness in any registry for a role. Report **which fired**. A **code project never skips a role**.
**Pre-selection arms a default only on an unambiguous single claimant** — **exactly one** harness matching a detect signal (`pytest.ini` present, only pytest claiming it) — and an armed default **always displays the evidence**. Ambiguous or absent evidence **arms nothing**.
**"None of these" asks the assurance tier:** `script` and `golden` keep the `gate` default and capture a command; `manual` is written `kind: manual`, `execution: manual-only`, reported declared-but-not-run. Then **offer to persist** the harness into `.claude/local-metadata/test-harnesses.json`.
**Writes go exclusively through `framework-config.js`**, never a raw `fs` write; `role` is **copied** from the selected harness onto the suite at write time. `concurrency` is written at write time as the role default — `exclusive` for `e2e`, `parallel` for every other role (#3132) — the default `resolveConcurrency` in `test-runner.js` applies to a suite carrying none, written out so the declaration says where its suites may run. Edit an e2e suite to `parallel` afterwards if it may run inside concurrent worktrees; selection never asks, since a wrong `parallel` costs a collided run.
**`--testing --dry-run` and `--testing --check` audit the declaration and write nothing (#2854).** Two forms, differing in kind.
**`--testing --check` never prompts** (`--testing --dry-run --check` is an accepted alias) — the CI form: #2850 made selection mandatory with a re-asked prompt, and CI cannot answer one. It compares the `testing` declaration against the merged registry and detected *(language × role)* pairs, reporting newly-gained pairs with no suite, orphaned suites and each entry's provenance, ending in a verdict of `clean` or `drift` with **every difference named**.
**The `--check` audit is computed by `.claude/scripts/shared/charter-testing-audit.js`**, which prints a JSON envelope and **exits 0 on `clean`, 1 on `drift`** (2 on bad arguments). `--check` delegates to it and reports its verdict; CI may call the helper directly — the point of a verdict in an exit status rather than in prose.
**Report the envelope's `ciGaps` warnings beside the verdict (#3026)** — a gate `e2e` suite with `sweep: false` that no `.github/workflows/` file runs runs neither in the `/work` sweep nor in CI. Advisory: never changes the verdict or exit code; only GitHub Actions is checked.
**Interactive `--dry-run` makes no exit-code claim.** It writes nothing, and a model-executed spec has no exit status of its own, so promising one would be a promise nothing can keep. Hence the machine-checkable half lives in the helper.
**Interactive `--testing --dry-run` runs selection to completion and emits four sections:**
1. **The exact `testing` block as JSON** — what would be written, verbatim.
2. **A diff against the current `framework-config.json`**, so changes to an existing declaration are visible rather than implied.
3. **Every suppressed write, named individually** — the config write, the local registry write, and the `.claude/local-metadata/` directory creation. "Nothing was written" is not auditable; three named writes are.
4. **The merged-registry provenance** — **shipped**, contributed **local**ly, **hidden**, **shadowed** by id, and any **unknown** keys or roles the permissive local schema preserved (#2848).
**Where `--dry-run` is accepted is stated once, in `## Arguments`** — a rejection names the valid forms; one that does not say what to type instead is a dead end.
**Render the `## Framework` table of `Project/Test-Strategy.md` from `testing.suites[]` (#2851).** One row per suite — `role`, harness name, `full`, `execution` — and mark the section **generated**, so a reader knows it is derived, not authored. A `sweep: false` suite shows **not swept**; one also scoped-skip (`scoped.mode: none`, `onScoped: skip`) shows **never runs during `/work`** (#3026). The config is the authority; the prose artifact is a view of it. This gives the framework ONE answer to "what runs this project's tests" instead of three: `/add-story` and `/create-backlog` read the declaration, `/bad-test-review` resolves it first, and this table renders from the same place.
**A hand-edit to the generated section is detected at `/charter --refresh`, never silently overwritten.** Compare the rendered table against `testing.suites[]`; on a difference report it naming `framework-config.json` as the authority, and re-render **only on confirmation**. Silently re-rendering discards a deliberate edit; silently keeping it leaves two disagreeing answers — the defect this closes.
**Record the selection in `Project/Test-Strategy.md`** beside the declaration, so prose and config agree at creation. **Never derive a command from a framework name** — a name (`Jest`) is not an invocation (`npx jest --no-coverage`); expanding one into the other is a fabrication under the Artifact voice rule above, since nothing is installed at inception. Ask, which that rule permits.
#### E2e Sweep Question (#3026)
**After an `e2e` harness is selected, ASK whether its suite joins the `/work` Step 4f full sweep**, via `AskUserQuestion`, once per selected harness. Trigger: the harness's `sweep` field in the merged registry (every shipped `e2e` harness carries `sweep: false`). **A harness without a `sweep` field asks nothing**; its suite is written as before, with no `sweep` key.
| Option | Written as | When the harness's `sweep` is |
|---|---|---|
| **Don't sweep (Recommended)** | `sweep: false` | `false` — the recommendation comes from the registry, never from this spec |
| **Sweep every issue** | `sweep: true` | — |
**The question states:** the **cost** of sweeping (the whole e2e suite at every sub-issue boundary — slowest tier, often a browser, device or emulator; a flaky failure blocks `in_review` on unrelated work); the **coverage loss** of not sweeping (a regression outside the touched files surfaces only where e2e runs elsewhere, such as CI, possibly nowhere — the suite still runs scoped when its files change); for a **scoped-skip** harness (`scoped.mode: none`, `onScoped: skip` — WebdriverIO, Detox, Appium, Maestro, Java/Kotlin/.NET e2e) that under "Don't sweep" it **never runs during `/work`**; and how to change it later, `/charter --sweep-e2e on|off`.
**Write the answer onto the suite as an explicit `sweep: true` or `sweep: false`** through `framework-config.js`. Never omit the key once asked — an absent key is what the Step 5c refresh offer looks for. **The registry value is a recommendation, never a silent write.**
**`/charter --sweep-e2e on|off` sets `sweep` on every existing `e2e` suite without re-running selection** — the supported way to opt back in or out without hand-editing `framework-config.json`.
- **A value-setter, not a toggle.** `on` writes `sweep: true` and `off` writes `sweep: false` on every **gate** `e2e` suite. Running it twice gives the same config; mixed suites all end in the requested state.
- **`on` writes `sweep: true` explicitly rather than deleting the key**, so the Step 5c offer never re-offers to undo the choice.
- **Writes go through `framework-config.js`.** **Report each `e2e` suite by id** as **changed** or **unchanged**.
- **`manual-only` e2e records are left untouched and named** as not applicable (`none-<key>-e2e`, `install pending` — no command to sweep).
- **No `e2e` suites declared** → report that and **write nothing**.
- **A missing or unrecognized value is rejected**, naming the valid form, `/charter --sweep-e2e on|off`. `/charter --testing --sweep-e2e on|off` is an accepted alias (`## Arguments`).
- **With `--dry-run`**, report the suites that would change and **write nothing**.
#### Sweep Scope (#3178)
**`/charter --sweep-scope all|touched` sets `testing.sweepScope` without re-running selection** — which suites the `/work` Step 4f sweep runs: `all` every gate suite, `touched` only those whose `match[]` covers a changed file. Absent means `all`.
- **A value-setter, not a toggle.** Running it twice gives the same config. **`all` is written explicitly rather than by deleting the key**, as `--sweep-e2e on` writes `sweep: true`.
- **Writes go through `framework-config.js`**, schema-validated — never a raw file write. **Report the previous and new value**, or `unchanged` when already set.
- **Before writing `touched`, name by id every gate suite whose `match[]` patterns are all test-only**, and say a source-only change would skip it at the sweep. A suite is test-only when every `match[]` pattern is test-only: it lies under a `test/` or `tests/` directory, or matches a `*.test.*` or `*.spec.*` filename. This is a warning: it does not block the write. Such a suite still runs scoped when its own files change.
- **A missing or unrecognized value is rejected**, naming the valid form, `/charter --sweep-scope all|touched`. `/charter --testing --sweep-scope all|touched` is an accepted alias (`## Arguments`).
- **With `--dry-run`**, report the value that would change and any test-only warning, and **write nothing**.
#### Tooling Verification and Guided Install (#2858)
**Runs once, after selection completes, over every selected suite.** Not per answer, not mid-loop: a harness the user replaces on the next question would have had its tooling checked — and possibly installed — for nothing.
**The requirement set comes from the registry, never from this spec.** A harness entry may carry `requires[]` — the packages, browsers, drivers and system libraries it needs (#2858) — each naming an `id`, a `kind` (`package`, `browser`, `driver`, `system`), and optionally a `check` and an `install` command. Resolve `requires[]` for every selected suite through the **merged** registry, so a local harness declares its tooling like a shipped one.
**An absent `requires[]` means there is nothing to check — it is NOT an all-clear.** Most unit harnesses are already a project dependency and imply nothing extra, so absence is the common case; report it as *no requirements declared*, never as *verified*. Same distinction the Review-State Gate draws for `indeterminate` (#2577) and Step 3 for an empty AC section (#2614): a vacuous pass must not read like a verified one.
**Verification delegates; it does not re-implement detection.**
| Harness | Check |
|---|---|
| **Playwright-family** (any entry whose `id` names Playwright) | Invoke `/playwright-check`. On a reported problem **offer** `/playwright-check --fix`, run it **only on acceptance** |
| Every other harness | **Generic presence check**: run each requirement's `check`; zero exit is present, non-zero is missing |
**`/playwright-check` reads `package.json`, and the boundary matters.** It answers for the npm-based ports (`ts-playwright`, `js-playwright`) and reports `NO_PACKAGE_JSON` for the Java, Kotlin, .NET and pytest ports — a graceful non-answer, **not** a clean result. Where it cannot answer, fall through to the generic presence check over that entry's `requires[]` and say which path produced the verdict. Reporting `NO_PACKAGE_JSON` as *checked, nothing missing* is the silent-skip this section prevents.
**A requirement with no `check` is reported UNVERIFIED, never assumed present.** Absence of a command is absence of information.
**Guided install — one confirmed step at a time.** Per missing requirement: show the **exact command** from `install` **verbatim** — never paraphrased, never reconstructed — take **one confirmation per step** via `AskUserQuestion`, run it, then **re-check** that requirement before the next. The user **may decline any step**; a decline is a choice, not a failure.
**A requirement with no `install` is handed to the user.** Report `id` and `kind`, state that no install command is declared, and **never invent one** — a fabricated command is run and fails, worse than naming what is needed. A system library from the platform package manager is the standing case.
**Install failure disposition — the harness stays declared.** Network failure, permission denial or a blocked download does **not** undo the selection.
1. Report the failure with the **exact retry command** — the same `install` string, so re-running is a copy, not a reconstruction.
2. Write the suite `execution: "manual-only"` with `note: install pending` naming the requirement that failed.
3. The rendered `## Framework` table of `Project/Test-Strategy.md` **shows it as pending**.
**Why `manual-only` rather than a `gate` suite:** #2852's sweep runs every `gate` suite at **Step 4f**, so a suite whose binary never installed fails **every sub-issue** of every epic until someone notices — a charter-time problem surfacing as a test failure on unrelated work. `manual-only` keeps the declaration visible (declared-but-not-run) while leaving the gate green. Declining a step reaches the same disposition: nothing was installed, so the suite cannot gate.
**The pending state is temporary by construction** — `/charter --refresh` re-checks it (Step 5c) and offers to restore `gate`.
#### Deployment Platform (Q3a — conditional)
**Trigger:** Deployable from Q3 — web framework, frontend build tool, Docker, or "web app"/"API"/"service"/"site".
**Skip:** CLI, libraries, docs-only, infra repos.
**ASK USER (single-select):**
```
Where will this project be deployed?
- Vercel — Best for frontend, Next.js, static sites
- Railway — Best for full-stack apps, background workers
- DigitalOcean (App Platform) — Best for multi-component apps with databases
- Render — Best for web services with managed infrastructure
- Other/Not decided — No deployment skill installed
- Self-hosted/Not applicable — No deployment skill installed
```
**After answer:**
1. Write `deploymentTarget`: Vercel→`"vercel"`, Railway→`"railway"`, DigitalOcean→`"digitalocean"`, Render→`"render"`, Other→`"other"`, Self-hosted→`null`.
2. If platform selected (not "other"/null), copy skill: `cp -r {frameworkPath}/.claude/skills/<skill-name>/ .claude/skills/<skill-name>/`
   | Platform | Skill |
   |----------|-------|
   | Vercel | `vercel-project-setup` |
   | Railway | `railway-project-setup` |
   | DigitalOcean | `digitalocean-app-setup` |
   | Render | `render-project-setup` |
   Add skill to `projectSkills` (additive, sorted).
3. Query `recipe-tech-mapping.json` for matching deployment recipes; display.
#### Complexity-Triggered
| Trigger | Follow-Up |
|---------|-----------|
| **Web app** | "Will users need to log in?" / "What data will you store?" |
| **API service** | "Who will consume this API?" |
| **Multi-user** | "What access levels are needed?" |
| **Data handling** | "Any sensitive/personal data?" / "Compliance requirements?" |
| **External integrations** | "What external services?" / "Any constraints?" |
Max 1-2 to avoid overwhelm.
#### Companion Projects (Conditional — ask only on a signal)
**Ask only on a trigger signal.** Competes for a 4-8 question budget against the 1-2 complexity cap; always asking displaces something that matters more for the single-repo case, which is most projects.
| Signal | Check |
|---|---|
| `.gh-pmu.json` lists >1 repository | `repositories[]` length > 1 |
| Multiple git remotes | `git remote` returns >1 name |
| Sibling project named in Q1/Q3 | Answer names another repo or product |
**No signal → ask nothing** — not a softened or optional version. Silence is the specified behavior.
**On a signal, ask:** *"Are there companion repositories or project boards this project works alongside — worth searching for context, or filing issues against?"* Record via `registerCompanion`, never by hand-writing the table.
`searchable` and `fileIssues` are asked separately and default **false**. Searchable-but-not-filable is the common case; nothing becomes filable by omission.
**Direction is asked alongside them (#3422):** `upstream` (this project consumes it), `downstream` (it consumes this project) or `bidirectional` (both), passed as `entry.direction`. A skipped answer leaves the cell **empty** — never write a default; empty reads as `bidirectional` and `/charter --refresh` asks again. The prior-art sweep uses it (`prior-art-sweep.json` `companionRepos.directionTreatment`): upstream hit = evidence, downstream hit = impact.
#### Dynamic Follow-Up
- Analyze baselines for gaps/ambiguities
- Simple: 0-1; Complex: 2-4; skip questions answered indirectly

| Complexity | Total Questions |
|------------|-----------------|
| Simple (CLI, utility) | 4 essential only |
| Medium (web app, API) | 4-6 |
| Complex (multi-service) | 6-8 |
#### Review Mode (always)
**ASK USER (single-select):**
```
What review mode should be used for this project?
- Solo: Single developer - skip team-oriented criteria
- Team (Recommended): 2-10 developers - include priorities, dependencies
- Enterprise: Large teams - all criteria plus risk assessment and compliance
```
**Default:** "team" if not selected. Write `reviewMode` (lowercase). Show mode-specific confirmation.
#### Domain Profiling (conditional)
**Trigger:** Any except documentation-only.
**Step 1: Auto-detect** from tech stack:
| Project Signal | Pre-check Domains |
|----------------|------------------|
| Web app / frontend / API | Security, Accessibility, SEO, API-Design |
| Multi-service / distributed | Observability, Contract-Testing |
| Stores personal data / compliance | Privacy |
| Multi-language / international | i18n |
| Performance-sensitive | Performance |
| Chaos/resilience mentioned | Chaos |
| Automated testing mentioned | QA-Automation |
**Step 2: ASK USER (multi-select):** Present all 11 domains pre-checked per detection.
**Step 3:** Write `activeDomains` (lowercase IDs: `"security"`, `"accessibility"`, `"seo"`, `"privacy"`, `"observability"`, `"i18n"`, `"api-design"`, `"performance"`, `"chaos"`, `"contract"`, `"qa"`). Report the active list, naming where it applies: these auto-apply to `/review-issue`; `/code-review` applies them only when `--with` is passed. **Name the commands (#2810)** — "auto-apply to review commands" was false for `/code-review`, which reads the key only inside its `--with` path, so a user believing it got no domains and no reason why.
**Step 4 (`/charter --refresh`):** Re-evaluate vs auto-detection from updated tech stack.
**Step 5 (`/charter --update`):** Allow add/remove via multi-select.
#### Artifact Generation
**Answer-to-Artifact Mapping:**
| Answer | Primary Artifact |
|--------|------------------|
| What building? | CHARTER.md → Vision |
| What problem? | CHARTER.md → Problem Statement |
| What technology? (Q3) | CHARTER.md → `## Tech Stack` table, technology names in intent voice, no version |
| What's in scope? | CHARTER.md → In Scope |
| Testing framework? | Project/Test-Strategy.md → Framework |
| Harness selection (per language × role) | framework-config.json → `testing.suites[]` via `framework-config.js`, and Project/Test-Strategy.md beside it. Retired Q5/Q5b; `verificationCommands` no longer written |
| Review mode? | framework-config.json → reviewMode |
| Active domains? | framework-config.json → activeDomains |
**Process:**
1. Create lifecycle dirs, each with a `.gitkeep` — git does not track an empty directory (#3678): `mkdir -p Project Construction/Test-Plans Construction/Design-Decisions Construction/Tech-Debt Construction/Reports/Daily-Logs Construction/Reports/Stats Transition`, then `touch Project/.gitkeep Construction/Test-Plans/.gitkeep Construction/Design-Decisions/.gitkeep Construction/Tech-Debt/.gitkeep Construction/Reports/Daily-Logs/.gitkeep Construction/Reports/Stats/.gitkeep Transition/.gitkeep`
2. Generate CHARTER.md. **Required (#2379, #3643):** title from `.claude/metadata/charter-contract.json` `title` block (#3515) — `title.form` with `{name}` = the `name` answer, line 1 matching `title.pattern`; read from the contract, never memory. A generation requirement only (`title.role`), never an input to whether a charter is filled.
   - **Exactly these sections, in order:** Vision, Problem Statement, Target Users, Tech Stack, Key Entities, In Scope, Out of Scope and Companion Repositories (contract `requiredSections`, then `optionalSections`). **No section the contract lists in `retiredSections`** — the board, not the charter, holds current work.
   - `## Tech Stack`: a `| Layer | Technology |` table of technology **names** from Q3, no version.
   - `## Key Entities`: an `| Entity | Location |` table (`keyEntities.tableHeader`), ≥1 row, Location = the path(s) counted. **No Count column** — counts are derived when shown (`charter-entities.js`), never stored. Never omit the section.
   - **No count and no version anywhere** — contract `storedValues`, applied by `charter-template.js` `checkContractShape()`.
   - **Never in a charter: board and VCS state** — issue counts, board column membership, issue-number lists, commit counts relative to a base branch, and branch-tracker sub-issue state. The board is the live system of record, and a copy is stale within a day (#2931).
3. Generate the `Project/` documents — `Architecture.md`, `Constraints.md`, `Test-Strategy.md` — **in intent voice per the Artifact voice rule at the head of Inception Mode**; no other lifecycle directory (#3650). Problem Statement and Target Users go into CHARTER.md; its Tech Stack table is sourced from the Q3 answer alone.
4. Construction/README.md (step 1 placed the `.gitkeep` files)
5. Transition/ artifacts (Deployment-Guide, Runbook, User-Documentation)
   - Offer the project `.npmrc` per **Project `.npmrc` Offer** (#3016), before the step 7 commit; at inception the trigger is the Q3 answer or a selected suite, never a filesystem read.
6. Use "TBD" where unanswered. **Separately**, use `TBD` for detail no answer supplied that cannot be observed because nothing is installed yet (see Artifact voice). Skipped question and unobservable detail are distinct cases.
7. Commit: "Initialize project charter and lifecycle structure"
**Note:** Dirs created after questions to avoid orphans if user abandons.
### /charter --update
1. Read CHARTER.md (it holds Problem Statement and Target Users)
2. Ask what to update (Vision, Problem Statement, Target Users, Tech Stack, Scope, Active Domains, Deployment Target); Active Domains as the Domain Profiling flow describes (its Step 5).
3. Apply, sync CHARTER.md if vision changes, update Last Updated. **An update keeps the contract shape (#3643):** it writes no count, no version and no removed section — no Count column or number in Key Entities, Tech Stack as names only, no `retiredSections` entry. **Never in a charter: board and VCS state** — issue counts, board column membership, issue-number lists, commit counts relative to a base branch, and branch-tracker sub-issue state. The board is the live system of record, and a copy is stale within a day.
4. If Tech Stack modified: trigger skill/recipe suggestions (NEW only). Detect new default skills not in `projectSkills` (from `skill-keywords.json` `defaultSkills`) — copy from `{frameworkPath}/.claude/skills/`, add additively.
4b. If Deployment Target changed: remove old deployment skill, copy new from `{frameworkPath}/.claude/skills/<skill-name>/`. Update `deploymentTarget` and `projectSkills`. No prior target → fresh install.
5. **Companion management (`--register-proj`, `--deregister-proj`, `--list-proj`):** each flag runs **only this step** — never the step 2 menu — alone or after `--update` (`## Arguments`). `--deregister-proj <owner/name>` takes the repo on the command line; omitted → **ASK USER**. Delegate to `.claude/scripts/shared/lib/companion-projects.js`. Read `CHARTER.md`, call the helper, write returned content back — the helper never writes; the caller persists.
| Argument | Helper | Behavior |
|---|---|---|
| `--register-proj` | `registerCompanion(content, entry)` | `action: "added"`/`"updated"`; duplicate `repo` **updates in place** |
| `--deregister-proj` | `deregisterCompanion(content, repo)` | `action: "removed"`, or `ok:false` + `"not-found"` |
| `--list-proj` | `formatCompanionList(listCompanions(content))` | Prints registry; explicit empty-registry line when none |
**`--register-proj` asks for direction (#3422)** — `upstream`, `downstream` or `bidirectional` — when registering a companion and when updating one, passed as `entry.direction`; re-registering updates it in place. Unchanged rows keep their cell: empty stays empty, never a written default.
**Do NOT restate the helper's validation, dedupe, or removal rules here** — spec prose is LLM-executed and untestable, and a second statement drifts from the module enforcing it. Report `errors[]` verbatim and stop; `ok:false` means nothing was written.
**Reachability:** call `verifyReachability(repo)` before registering. `verified:false` → register anyway and report the `label` (`unverifiable — <reason>`). NEVER drop the registration because the check failed; NEVER report an unchecked repo as reachable (rule 01 claim labeling).
### /charter --refresh
**`--dry-run`:** run every analysis step below (codebase comparison, derived counts, legacy-shape repair via `--plan`, shape step, harness-selection delta), report what each would change, and **write nothing** — no merge, commit, CHARTER.md or `Project/` edit, or applied offer.
1. Verify `.claude/skills/codebase-analysis/SKILL.md` exists, then load it. **Missing:** `codebase-analysis skill not installed. Install via Praxis Hub Manager or ask user to install.` -> **STOP**
2. Analyze codebase
3. Compare with CHARTER.md and the `Project/` documents, identify differences; locate each with `node .claude/scripts/shared/lib/charter-shape.js --locate <Architecture.md|Constraints.md|Test-Strategy.md>` — `legacy: true` → report its `message` (names `/charter --refresh`), never read the old path
4. Present diff, ask for confirmation
5. Merge changes into CHARTER.md — no commit here; step 7 offers one commit for the whole run (#3659)
5a. **Derived counts (#3644)** — the block bare `/charter` shows, from the refreshed charter:
```javascript
const { extractEntities, deriveEntityCounts, formatCountsBlock } = require('.claude/scripts/shared/charter-entities.js');
const block = formatCountsBlock(deriveEntityCounts(extractEntities(fs.readFileSync('CHARTER.md', 'utf8'))));
```
Show `block` (`Key Entities — counts (derived now, not stored)`). Information, not a check: the charter stores no count, so nothing is compared or updated; a not-counted row names its reason. **Nothing writes the block to a file.** **#2379:** CHARTER.md keeps its contract title (`title.form`, matching `title.pattern`) and `## Key Entities` table; no table → nothing to count.
5a-ii. **Legacy-shape repair: the lossless steps (#3648)** — run **without a prompt**; nothing is lost, so nothing to consent to:
```bash
node .claude/scripts/shared/lib/charter-shape.js --repair
```
Runs `LOSSLESS_STEPS` in order, reporting each step's `message` by id: `charter-sections` (Problem Statement, Target Users copied from `Inception/Charter-Details.md` into CHARTER.md after Vision; Companion Repositories promoted to `##`), `project-documents` (`Architecture.md`, `Constraints.md`, `Test-Strategy.md` moved `Inception/` → `Project/` — `git mv` if tracked, else plain move), `inventory-notes` (every explanatory note in a Key Entities or Tech Stack cell copied to `Project/Architecture.md § Inventory Notes`, keyed by entity or layer — a copy, tables untouched), `key-decisions` (Charter-Details.md Key Decisions copied to `Construction/Design-Decisions/`). Each step checks before acting: on a repaired project every step is `already` and the summary is `already repaired`; a stopped repair resumes at the first step not done. **`missing`** (no Charter-Details.md, or it lacks the section): neither section written; report both missing and name `/charter --update`. **`collision`**: a `Project/` file is never overwritten; **ASK USER** for another destination inside the project, re-run with `--destination <file>=<path>` (e.g. `--destination Architecture.md=Project/Architecture-Inception.md`); `inventory-notes` reports `blocked` until `Architecture.md` has moved; a `key-decisions` collision takes `--destination Key-Decisions=<path>`; `--today` accepts only `YYYY-MM-DD`. These steps rewrite no table and delete nothing. Under `--dry-run`, run `--plan` instead (5a-iii) — `--repair` writes.
5a-iii. **Legacy-shape repair: table rewrite and deletions, on consent (#3654)** — after the lossless steps, read the plan (writes nothing):
```bash
node .claude/scripts/shared/lib/charter-shape.js --plan
```
- **Table rewrite** (`rewrite`): when `rewrite.changed`, show each table's `before` / `after` as **BEFORE / AFTER** — Key Entities → `Entity | Location` (counted paths and any exclusion kept; Count column and cell prose removed), Tech Stack cells → technology names. Name vs version is a judgment: proposed, never applied silently. **ASK USER**; only on consent run `charter-shape.js --rewrite-tables` (copies cell notes to Inventory Notes first; `blocked` when it cannot → report, rewrite nothing). A declined rewrite leaves both tables as they are; detection keeps reporting them.
- **Deletions** (`deletions.items`): list every item — each legacy charter section and remaining `Inception/` file — with its **length** (`lines`, `bytes`) and destination, `derived`, `moved` or `nowhere`, with its `detail`. A file the disposition table does not name has **no destination**: name it, never drop it silently. **ASK USER** which to delete (one multi-select, nothing pre-selected), then `charter-shape.js --delete <id,id,…>` with exactly the consented ids. Report `deleted`, `kept`, each `refused` reason (id not in the plan; `moved` item not yet at its destination). A declined item is left in place; `Inception/` is removed only when empty (`inceptionRemoved`).
Under `--dry-run`, report the whole `--plan` output — `lossless.steps` (`would` / `already`), the BEFORE / AFTER, every deletion item — ask nothing, write nothing.
5b. **Charter shape (#3418)** — bring an over-grown CHARTER.md back to summary shape. Measure, then propose; never write before consent:
```bash
node .claude/scripts/shared/lib/charter-shape.js --propose
```
Target shape is `TARGET_SHAPE` in that helper — the contract's `requiredSections`, one declared place. **`inShape: true` or no CHARTER.md:** report the one-line `summary`, write nothing. Otherwise report each finding: In Scope bullets over `SHAPE_THRESHOLDS.inScopeBulletWords` or longer than one sentence, exclusion phrases inside In Scope bullets, a Current Focus version older than the latest tag (`staleness.verifiable: false` → say no tag could be read, never "stale"). Current Focus is retired (#3643): its history and board findings are retired; the legacy-shape repair removes the section on consent. The In Scope item count is **informational, never a finding**.
**Proposal** (`proposal`): each In Scope bullet cut to one line naming its capability — a short list of broad founding capabilities, written for a reader; exclusions moved to Out of Scope, where the scope call reads them as exclusions. Report every cut's disposition:
| Disposition | Meaning |
|---|---|
| `pointer` | Already held by CHANGELOG.md, a PRD, a design decision, a proposal or a `Project/` document — named, **nothing copied** |
| `relocate` | Found nowhere else — moved to its named destination (rationale → `Construction/Design-Decisions/charter-scope-notes.md`, history → `Construction/Design-Decisions/charter-history-notes.md`) |
| `moved` | An exclusion, moved to the charter's Out of Scope |
**Pinned cuts (#3456):** each cut carries `pinnedBy` — tests whose leading comment block declares `@subject CHARTER.md` and that hold an unescaped string literal (≥ `MIN_PINNED_LITERAL` chars) found in the removed text. Non-empty → report the warning **beside the cut's disposition**, naming each test and literal (`pointer · ⚠ pinned by <test>: "<literal>"`), so the user can decline, retarget the test (e.g. at the destination) or accept knowingly. **Advisory:** a pinned cut is still proposed; nothing blocks on it; an empty `pinnedBy` prints nothing.
You may tighten a capability line further; keep every cut accounted for. **`proposal.audit.unaccounted` must be empty before anything is offered** — a non-empty list is a silent drop; restore it or give it a destination, then re-run.
**Show the diff** of CHARTER.md and every file in `proposal.relocations`, then **ASK USER** to apply. Apply only on confirmation; decline changes nothing. Under `--dry-run` report and stop. No regeneration step: the scope check reads CHARTER.md directly, so an applied change takes effect at once.
5c. **Re-apply selection against the delta (#2853).** Refresh acts on what *changed*, never the whole declaration.
**Newly-gained pairs only.** Compare detected *(language × role)* pairs against the suites in `testing.suites[]`. A pair with no suite triggers selection **for that pair alone**; a pair that already has one is **never re-prompted and never overwritten** — re-asking an answered question is how a refresh silently discards a deliberate choice.
**Orphaned suites are reported, never removed.** A suite whose `match[]` matches zero files is reported by `id`, `role`, and the `match[]` globs that matched nothing — the fields the declaration holds. **No language field is read or derived**: #2849 puts none on a suite, and inferring one from a glob reports a field the config does not carry. A suite matching nothing today may match after the next branch, and only the user knows which.
**A record with no `match[]` is excluded** — the "none applicable" record selection writes, valid because #2849 requires `match[]` only of `gate` suites. It declares no files to match, so flagging it would orphan the record that states an absence.
**An absent role is reported, and selection runs for it.** A language whose `unit` or `e2e` role has neither a suite nor a "none applicable" record is named and **selection runs** for that pair. Silence is indistinguishable from a role nobody needed.
**Suites marked `install pending` are re-checked; success OFFERS the flip back (#2858).** Such a suite was written `manual-only` because its tooling would not install at charter time, not because the user wanted it un-gated. Re-run that harness's verification — `/playwright-check` for the Playwright family, the generic `requires[]` presence check otherwise:
- **Now present** → **offer** to flip `execution` back to `gate` and clear the note. Offer, never apply: restoring a suite to the gate set changes what fails `/work` Step 4f on every later sub-issue — the user's call, not a refresh's.
- **Still failing** → the suite **remains `manual-only`**, the note is kept, and the still-missing requirement is named with its retry command. Reporting nothing makes a still-broken install indistinguishable from one never pending.
This is the only step that clears a pending suite; selection never revisits an answered pair, so without it the suite stays out of the gate set permanently.
**An existing `e2e` suite with no `sweep` key is OFFERED `sweep: false` (#3026)** — it predates the E2e Sweep Question and still runs at every Step 4f sweep. **Offer, never apply**, via `AskUserQuestion`, stating the same cost and coverage loss (including the never-runs-during-`/work` case for a scoped-skip harness). **Only on confirmation** write `sweep: false` through `framework-config.js`; **declining changes nothing**. A suite that already carries `sweep` (`true` or `false`) is never offered — the key records that the question was answered. Without this, existing projects keep paying: refresh never re-prompts an answered pair.
**The diff is four-way; every difference names the source that disagrees.** Compare `testing.suites[]` against the rendered `## Framework` table of `Project/Test-Strategy.md`, any legacy `verificationCommands`, and the manifest script block of Extraction Step 2a (`package.json` `scripts`, `Makefile`, `pyproject.toml`, CI workflow).
- A manifest command **no suite declares** is an **undeclared candidate**, reported and **never written automatically** — a command in CI is evidence, not a decision.
- **An alias is a difference, not a duplicate.** `npm run e2e` and `npx playwright test` may name one suite two ways; adding the second declares a suite the project does not have.
- Writes happen **only on confirmation**, to `testing.suites[]` through the helper — **never to `verificationCommands`**, a **read-only comparison** source here (#2850 retired every `/charter` write of it; an existing key is read as legacy by `resolveSuites`).
- **A difference whose only disagreeing source is the legacy `verificationCommands` key is reported in one line, naming the key as legacy and read-only, and is never offered via `AskUserQuestion` (#3448)** — nothing to decide: refresh never writes it and `resolveSuites` reads it as legacy.
- **Refresh prompts only for the differences this section names:** an undeclared candidate, an alias, an `e2e` suite with no `sweep`, an `install pending` suite that now installs. Every other difference is reported, not asked.
**This is the only hook reaching an already-complete charter.** `/charter` with no arguments shows a summary and never re-runs generation, so neither Inception nor Extraction reaches a project past its first session — refresh is where an existing project acquires a declaration, and where drift between the two hand-authored surfaces is caught. Not hypothetical: this repository's Test-Strategy document and its `framework-config.json` disagreed about what runs, with nothing checking them.
5f. **Companion table gaps (#3422):** **every run**, prompt for **every empty cell in the companions table, in any column** (Direction, Board, Responsibility, Relationship, …) — from the helper, never by parsing the table here:
```javascript
const { emptyCompanionCells } = require('.claude/scripts/shared/lib/companion-projects.js');
const gaps = emptyCompanionCells(fs.readFileSync('CHARTER.md', 'utf8')); // [{repo, name, column}]
```
A filled cell (`bidirectional` included) is **never prompted**. Ask one companion at a time via `AskUserQuestion`, naming its empty columns. **Write only on acceptance**, via `registerCompanion`; a **declined cell is left empty**, so it is prompted again next `--refresh`. Accepted: a board-less companion is asked for Board every refresh. Under `--dry-run`, list gaps, ask nothing.
5d. **Report directories (#2925):** when `Construction/Reports/Daily-Logs` or `Construction/Reports/Stats` is absent, offer to create the absent ones (`/idpf-stats --daily-log` and `--save` write there); create only on acceptance, each with its `.gitkeep` (`Construction/Reports/Daily-Logs/.gitkeep`, `Construction/Reports/Stats/.gitkeep`) so the empty directory can be committed (#3678); change nothing on decline — `/idpf-stats` also creates its directory on demand, so declining never breaks a later report. Pre-#2925 charters reach these directories only through this step.
5e. **Project `.npmrc` (#3016):** when the trigger in **Project `.npmrc` Offer** holds and the file is absent, make the offer; an existing file is left alone. Pre-#3016 charters reach the offer only here.
6. Trigger skill/recipe suggestions. Detect new default skills not in `projectSkills` — copy from `{frameworkPath}/.claude/skills/`, add additively, report. Tech stack changed → keyword-based suggestions (NEW only).
7. **Commit offer (#3659):** the last refresh step — after step 6's skill and recipe suggestions finish, before **Closing Cleanup**. List every path this run changed: CHARTER.md, each file the legacy-shape repair, the shape step or an accepted offer wrote, moved or deleted, `framework-config.json`, each skill copied into `.claude/skills/`, an accepted `.npmrc`, each `.gitkeep` 5d created (so a created directory is committed, #3678), and the retired `domain-entities.json` deletion. Take the list from the paths this run wrote, never the whole tree — a peer session's edit is not this run's.
- A run that changed nothing reports `nothing to commit` and asks nothing.
- Otherwise **ASK USER** via `AskUserQuestion` whether to commit the listed paths as `Charter refresh`. Accept → `git add -- <paths>`, then `git commit -m "Charter refresh" -- <paths>`; never `git add -A` or `git add .`, so a peer's edits are never swept in. Decline → commit nothing and list the uncommitted paths.
- Under `--dry-run`, list the paths that would be offered and commit nothing — no question.
## Project Skills Selection
After charter creation, suggest skills via `.claude/metadata/skill-keywords.json`.
1. Re-read `.claude/metadata/skill-keywords.json` from disk — `defaultSkills`, `skillKeywords`, `groupKeywords`. Re-read `.claude/metadata/skill-registry.json` for descriptions. **Missing → warn, skip.**
1b. Read `defaultSkills` — universally applicable. Add to candidates before keyword matching. Missing/empty → continue.
2. Match tech stack vs skillKeywords (case-insensitive, whole-word, no partial matches). Match groupKeywords → add ALL group.skills. Merge with defaults. Deduplicate against existing `projectSkills`. **Unknown stack → present defaults. Zero matches → defaults only.**
3. Present via `AskUserQuestion` multi-select with name/description. **Defaults pre-selected** (can deselect), marked `[default]`.
3b. **Existing project:** Filter already-present. All relevant enabled → report, skip. Present only NEW. Merge additively.
4. Store in `projectSkills`, sorted alphabetically. Additive merge.
4b. Deploy: `cp -r {frameworkPath}/.claude/skills/<skill-name>/ .claude/skills/<skill-name>/` — COPIED not symlinked. Existing dir → skip.
5. Report installed skills.
## Extension Recipe Suggestions
After skill selection, suggest relevant recipes.
**Triggers:** `/charter` (creation), `/charter --update` (Tech Stack modified), `/charter --refresh`
**Skip if:** `"extensionSuggestions": false` or no release commands
1. Re-read `.claude/metadata/recipe-tech-mapping.json` from disk
2. Match tech stack against indicators and groupMappings
3. Filter already-installed (check extension points)
4. **ASK USER:** Present available recipes with descriptions. `Install? (y/n/select)`
5. Insert template between `USER-EXTENSION-START/END` markers
6. Report

| Edge Case | Handling |
|-----------|----------|
| Extension point has content | Skip: "{point} already configured" |
| No release commands | Skip: "Extension recipes require release commands" |
| All installed | Report: "Extension recipes are up to date" |
### Step 3: Closing Cleanup
The prune is **part of** this step, and this step is **numbered** — what makes the claim hold. `One task per numbered step` now covers it, so an unpruned list surfaces as an unfinished task like any other step. The same claim as prose alone was overridden by the rules beside it (#2641).

**Prune the task list** (unconditional — every path, including early-exit paths where Phase 1 created tasks and later phases never ran):
1. `TaskList` — enumerate all tasks.
2. For every task owned by this `/charter` invocation, `TaskUpdate status=deleted`.
3. Do **not** delete tasks created outside this invocation (user TODOs).

**End of /charter Command**
