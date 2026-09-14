---
version: "v0.103.0"
description: View, create, or manage project charter
argument-hint: "[update [--register-proj|--deregister-proj|--list-proj]|refresh|validate|--create-domain-entities|--testing [--dry-run [--check]]]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /charter
Context-aware. Shows summary if exists, starts creation if missing.
## Usage
| Command | Description |
|---------|-------------|
| `/charter` | Show summary or start creation |
| `/charter update` | Update specific sections |
| `/charter refresh` | Re-extract from code, merge |
| `/charter validate` | Check current work against scope |
| `/charter update --register-proj` | Register a companion repository or board |
| `/charter update --deregister-proj` | Remove a companion registration by `owner/name` |
| `/charter update --list-proj` | List registered companions with capability flags |
| `/charter --create-domain-entities` | Regenerate `domain-entities.json` |
| `/charter --testing` | Harness selection per language and role → `testing.suites[]` |
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
## Template Detection
**One rule (#2893):** `.claude/scripts/shared/lib/charter-template.js`, shared with the startup hook and `Reference/Charter-Enforcement.md`. NEVER copy its pattern into this spec — three restated copies drifted until none matched the Praxis Hub Manager bootstrap charter, which then read as complete.
`node .claude/scripts/shared/lib/charter-template.js CHARTER.md` → `{"exists", "template", "placeholders": [...]}`; report the `placeholders` when routing to Step 3.
ANY placeholder (`{Capitalized Words}`, `{lowercase-kebab}`, `{{UPPER_SNAKE}}`, `TODO: Fill in`) → template. Braces only inside fenced blocks or inline code (JSON examples, `{frameworkPath}`) → ignored. No placeholders → complete.
## Workflow
### /charter (No Args)
1. `test -f CHARTER.md`
2. If exists, check placeholders via the shared rule: `node .claude/scripts/shared/lib/charter-template.js CHARTER.md`
   - **TEMPLATE (`template: true`):** → Step 3
   - **COMPLETE (`template: false`):** Display summary (name, vision, focus, tech stack). Mention `/charter update` and `/charter validate`.
3. **No charter OR template:** Charter mandatory. Has code → extraction; empty → inception. Proceed directly (no skip).
### Extraction Mode
1. Verify `.claude/skills/codebase-analysis/SKILL.md` exists, then load it. **Missing:** `codebase-analysis skill not installed. Install via Praxis Hub Manager or ask user to install.` -> **STOP**
2. Analyze codebase (tech stack, architecture, tests, NFRs)
3. Present findings, ask user to confirm/adjust
4. Generate CHARTER.md and Inception/ artifacts
3a. **Companion pre-fill:** propose candidates from disk, never open-ended — `git remote -v`; `.gh-pmu.json` `repositories[]`; existing `external: true` entities in `domain-entities.json` (read from the `resolveEntitiesWriteTarget()` path). Confirm with `searchable`/`fileIssues` defaulting false; register via `registerCompanion`. Asking open-ended here would assert something no file was read for — the failure the artifact-voice rule below governs.
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
**The outcome is the same disposition set**: verified tooling keeps a `gate` suite; missing tooling enters the guided install; a failed or declined install writes `manual-only` with `note: install pending`, which `/charter refresh` re-checks.
**Read the manifests here, not in `codebase-analysis`.** That skill is imported from `idpf-praxis-skills` and `/fw-import-skills` replaces imported skills wholesale, so logic added there reverts at the next import. `tech-stack-detection.md` already opens `package.json`, but only as an ecosystem marker — it never reads the `scripts` block, which is why the data was never collected. Same reasoning that placed `verificationMode` in `framework-config.json` rather than the imported `tdd-process` checklist (#2556).
### Inception Mode
**Artifact voice — inception (#2591):** no code exists on this path (Process step 1 creates the tree against an empty project), so **no artifact here may assert a detection.** Every Inception/ artifact is a **declaration of intent** — what the project *will* use, sourced from answers, never from a filesystem read.
- **`Inception/Tech-Stack.md` is intent voice from the Q3 (technology) answer.** It must not contain "detected", "found", or "via `<file>`" claims, nor name a technology, framework, or version the answers did not supply. No manifest was consulted; none exists yet.
- **`TBD` is required for any stack detail no answer supplied** (version, package manager, runtime, build tool). Distinct from Process step 6's unanswered-question rule: that covers questions the user skipped, this covers detail **unobservable** at inception because nothing is installed. A stack answered at Q3 but not yet scaffolded falls here — expanding one short answer into a version-pinned table is fabrication, not a default.
- Restated inline on purpose: extraction gets this from the `codebase-analysis` skill it loads; inception loads no skill, so without it the guard is absent exactly where a greenfield artifact is written.
#### Essential Questions
| # | Question | Maps To |
|---|----------|---------|
| 1 | What are you building? (1-2 sentences) | CHARTER.md Vision |
| 2 | What problem does it solve? | Inception/Charter-Details.md Problem Statement |
| 3 | What technology/language? | CHARTER.md Tech Stack |
| 4 | What's in scope for v1? (3-5 items) | CHARTER.md In Scope |
**Note:** harness selection (below) replaces the retired Q5/Q5b pair, asked for every code project.
#### Harness Selection (replaces Q5 and Q5b — #2850)
**Q5 and Q5b are RETIRED, and the reason is the point.** Q5 asked a framework *name*, Q5b the *command* — two answers to one question, and the name half reached no gate: nothing executes a framework name, one of which nothing executes. Selection collects command and role together, once.
**`/charter` no longer writes `verificationCommands` in any mode** — not Inception, not the Extraction manifest read, not refresh. The per-suite `full` replaces it. An **existing** key is **left in place and read as legacy** by `test-runner.js` `resolveSuites` (#2852), which desugars it into suites; retiring the writer must not orphan a project that already declared one.
**The loop runs once per *(key × role present)*, across BOTH registry groups — `languages` and `platforms` (#2900).** Present the option list from the **merged** registry — `harness-registry.js` `loadMergedRegistry()` (#2848), which has always returned both groups. Locally-contributed entries are **labelled `local`**; entries the local file marks `hidden` are **omitted**.
**A platform key is labelled as a platform in the prompt** — without it a platform row and a language row are indistinguishable, and `mobile` sits beside `typescript` answering a different question about the same project.
**A platform is offered only for the roles it declares.** `platforms.mobile` ships `e2e` and no `unit`, so a mobile project is never asked a mobile unit question. Deliberately unlike a language, which **still prompts** at zero harnesses (below): "no harness exists for this language" is a real answer; a role the platform never declares is an inapplicable question, not a gap.
**Mobile triggers — the platform has no detect signal, so the trigger is named, not inferred (#2900).**
| Mode | Trigger |
|---|---|
| **Inception** | No code to analyse, so the **Q3 answer** is the only signal: **React Native**, **Flutter**, **Expo**, **iOS**, **Android**, or "mobile app" |
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
**Writes go exclusively through `framework-config.js`**, never a raw `fs` write; `role` is **copied** from the selected harness onto the suite at write time.
**`--testing --dry-run` audits the declaration and writes nothing (#2854).** Two forms, differing in kind.
**`--testing --dry-run --check` never prompts** — the CI form: #2850 made selection mandatory with a re-asked prompt, and CI cannot answer one. It compares the `testing` declaration against the merged registry and detected *(language × role)* pairs, reporting newly-gained pairs with no suite, orphaned suites and each entry's provenance, ending in a verdict of `clean` or `drift` with **every difference named**.
**The `--check` audit is computed by `.claude/scripts/shared/charter-testing-audit.js`**, which prints a JSON envelope and **exits 0 on `clean`, 1 on `drift`** (2 on bad arguments). `--check` delegates to it and reports its verdict; CI may call the helper directly — the point of a verdict in an exit status rather than in prose.
**Interactive `--dry-run` makes no exit-code claim.** It writes nothing, and a model-executed spec has no exit status of its own, so promising one would be a promise nothing can keep. Hence the machine-checkable half lives in the helper.
**Interactive `--testing --dry-run` runs selection to completion and emits four sections:**
1. **The exact `testing` block as JSON** — what would be written, verbatim.
2. **A diff against the current `framework-config.json`**, so changes to an existing declaration are visible rather than implied.
3. **Every suppressed write, named individually** — the config write, the local registry write, and the `.claude/local-metadata/` directory creation. "Nothing was written" is not auditable; three named writes are.
4. **The merged-registry provenance** — **shipped**, contributed **local**ly, **hidden**, **shadowed** by id, and any **unknown** keys or roles the permissive local schema preserved (#2848).
**`--dry-run` is accepted only alongside `--testing`.** Other combinations are rejected with a message naming the **valid form**, `/charter --testing --dry-run [--check]` — a rejection that does not say what to type instead is a dead end.
**Render the `## Framework` table of `Inception/Test-Strategy.md` from `testing.suites[]` (#2851).** One row per suite — `role`, harness name, `full`, `execution` — and mark the section **generated**, so a reader knows it is derived, not authored. The config is the authority; the prose artifact is a view of it. This gives the framework ONE answer to "what runs this project's tests" instead of three: `/add-story` and `/create-backlog` read the declaration, `/bad-test-review` resolves it first, and this table renders from the same place.
**A hand-edit to the generated section is detected at `/charter refresh`, never silently overwritten.** Compare the rendered table against `testing.suites[]`; on a difference report it naming `framework-config.json` as the authority, and re-render **only on confirmation**. Silently re-rendering discards a deliberate edit; silently keeping it leaves two disagreeing answers — the defect this closes.
**Record the selection in `Inception/Test-Strategy.md`** beside the declaration, so prose and config agree at creation. **Never derive a command from a framework name** — a name (`Jest`) is not an invocation (`npx jest --no-coverage`); expanding one into the other is a fabrication under the Artifact voice rule above, since nothing is installed at inception. Ask, which that rule permits.
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
3. The rendered `## Framework` table of `Inception/Test-Strategy.md` **shows it as pending**.
**Why `manual-only` rather than a `gate` suite:** #2852's sweep runs every `gate` suite at **Step 4f**, so a suite whose binary never installed fails **every sub-issue** of every epic until someone notices — a charter-time problem surfacing as a test failure on unrelated work. `manual-only` keeps the declaration visible (declared-but-not-run) while leaving the gate green. Declining a step reaches the same disposition: nothing was installed, so the suite cannot gate.
**The pending state is temporary by construction** — `/charter refresh` re-checks it (Step 5c) and offers to restore `gate`.
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
**No signal → ask nothing** — not a softened or optional version. Silence is the specified behaviour.
**On a signal, ask:** *"Are there companion repositories or project boards this project works alongside — worth searching for context, or filing issues against?"* Record via `registerCompanion`, never by hand-writing the table.
`searchable` and `fileIssues` are asked separately and default **false**. Searchable-but-not-filable is the common case; nothing becomes filable by omission.
#### Dynamic Follow-Up
- Analyze baselines for gaps/ambiguities
- Simple: 0-1; Complex: 2-4; skip questions answered indirectly

| Complexity | Total Questions |
|------------|-----------------|
| Simple (CLI, utility) | 4 essential only |
| Medium (web app, API) | 4-6 |
| Complex (multi-service) | 6-8 |
#### Schema-Driven Domain Questions
```javascript
const { generateQuestions } = require('.claude/scripts/shared/lib/schema-driven-questions.js');
const schemaQuestions = generateQuestions(answersCollectedSoFar);
```
Use `AskUserQuestion` with each question's `header`/`question` fields. Answers feed `domain-entities.json` (Step 7). Schema not found / no questions → skip silently.
**During `/charter update`:** Read `currentDomainEntities` from the `resolveEntitiesWriteTarget()` path — where the write lands — and use `generateUpdateQuestions(currentDomainEntities)` — only missing/empty fields; existing values preserved.
#### Review Mode (always)
**ASK USER (single-select):**
```
What review mode should be used for this project?
- Solo: Single developer - skip team-oriented criteria
- Team (Recommended): 2-10 developers - include sizing, priorities, dependencies
- Enterprise: Large teams - all criteria plus effort estimation and risk assessment
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
**Step 4 (`/charter refresh`):** Re-evaluate vs auto-detection from updated tech stack.
**Step 5 (`/charter update`):** Allow add/remove via multi-select.
#### Artifact Generation
**Answer-to-Artifact Mapping:**
| Answer | Primary Artifact |
|--------|------------------|
| What building? | CHARTER.md → Vision |
| What problem? | Inception/Charter-Details.md → Problem Statement |
| What technology? (Q3) | CHARTER.md → Tech Stack |
| What technology? (Q3) | Inception/Tech-Stack.md → whole artifact, intent voice, `TBD` for anything Q3 did not supply |
| What's in scope? | CHARTER.md → In Scope |
| Testing framework? | Inception/Test-Strategy.md → Framework |
| Harness selection (per language × role) | framework-config.json → `testing.suites[]` via `framework-config.js`, and Inception/Test-Strategy.md beside it. Retired Q5/Q5b; `verificationCommands` no longer written |
| Review mode? | framework-config.json → reviewMode |
| Active domains? | framework-config.json → activeDomains |
**Process:**
1. Create lifecycle dirs: `mkdir -p Inception Construction/Test-Plans Construction/Design-Decisions Construction/Tech-Debt Transition`
2. Generate CHARTER.md (Vision, Tech Stack, In Scope, Status: Draft). **Required (#2379):** title exactly `# Project Charter: {name}`; include `## Key Entities` table `| Entity | Count | Location |` with ≥1 row (use `TBD` for unknown Count). Wrong title or missing section → generator returns structured `{error, hint}` / `{warning, entities:{}}`.
3. Generate Inception/ artifacts (Charter-Details, Tech-Stack, Scope-Boundaries, Constraints, Architecture, Test-Strategy, Milestones) — **in intent voice per the Artifact voice rule at the head of Inception Mode.** `Tech-Stack.md` is sourced from the Q3 answer alone.
4. Construction/ structure with .gitkeep and README.md
5. Transition/ artifacts (Deployment-Guide, Runbook, User-Documentation)
6. Use "TBD" where unanswered. **Separately**, use `TBD` for detail no answer supplied that cannot be observed because nothing is installed yet (see Artifact voice). Skipped question and unobservable detail are distinct cases.
7. Generate `domain-entities.json` beside `CHARTER.md` at project root, to the path **domain-entities.json Write Target** (below) resolves:
   ```javascript
   const { generateFromCharter, resolveEntitiesWriteTarget } = require('.claude/scripts/shared/generate-domain-entities.js');
   const charter = fs.readFileSync('CHARTER.md', 'utf8');
   const entities = generateFromCharter(charter, version);
   const target = resolveEntitiesWriteTarget(process.cwd()); // throws ENTITIES_TARGET_OUTSIDE_PROJECT — report it, do not write
   // Validate against .claude/metadata/domain-entities-schema.json before writing to `target`
   // If validation fails, warn and skip (non-blocking)
   ```
8. Commit: "Initialize project charter and lifecycle structure"
9. Hint: `"Tip: Run /charter --create-domain-entities to regenerate domain-entities.json after manual charter edits."`
**Note:** Dirs created after questions to avoid orphans if user abandons.
### /charter update
1. Read CHARTER.md and Inception/Charter-Details.md
2. Ask what to update (Vision, Current Focus, Tech Stack, Scope, Milestones, Deployment Target)
3. Apply, sync CHARTER.md if vision changes, update Last Updated
3a. Regenerate `domain-entities.json` via `generateFromCharter()`. **Destination:** beside `CHARTER.md` at project root — from `resolveEntitiesWriteTarget()` per **domain-entities.json Write Target**, never a composed path. Validate before writing. If missing, generate (migration). Include `"$schema"` first property → `.claude/metadata/domain-entities-schema.json`. **#2379:** if helper returns `{error, hint}` or top-level `warning`, surface both and do not write a partial file. **This step does not verify counts against disk** — `verifyEntityCounts()` is called by `/charter refresh` 5a and `/charter --create-domain-entities` Step 2b, which own the mismatch-versus-unverifiable contract (#2597).
3b. Hint: `"Tip: Run /charter --create-domain-entities to regenerate domain-entities.json after manual charter edits."`
4. If Tech Stack modified: trigger skill/recipe suggestions (NEW only). Detect new default skills not in `projectSkills` (from `skill-keywords.json` `defaultSkills`) — copy from `{frameworkPath}/.claude/skills/`, add additively.
4b. If Deployment Target changed: remove old deployment skill, copy new from `{frameworkPath}/.claude/skills/<skill-name>/`. Update `deploymentTarget` and `projectSkills`. No prior target → fresh install.
5. **Companion management (`--register-proj`, `--deregister-proj`, `--list-proj`):** delegate to `.claude/scripts/shared/lib/companion-projects.js`. Read `CHARTER.md`, call the helper, write returned content back — the helper never writes; the caller persists.
| Argument | Helper | Behaviour |
|---|---|---|
| `--register-proj` | `registerCompanion(content, entry)` | `action: "added"`/`"updated"`; duplicate `repo` **updates in place** |
| `--deregister-proj` | `deregisterCompanion(content, repo)` | `action: "removed"`, or `ok:false` + `"not-found"` |
| `--list-proj` | `formatCompanionList(listCompanions(content))` | Prints registry; explicit empty-registry line when none |
**Do NOT restate the helper's validation, dedupe, or removal rules here** — spec prose is LLM-executed and untestable, and a second statement drifts from the module enforcing it. Report `errors[]` verbatim and stop; `ok:false` means nothing was written.
**Reachability:** call `verifyReachability(repo)` before registering. `verified:false` → register anyway and report the `label` (`unverifiable — <reason>`). NEVER drop the registration because the check failed; NEVER report an unchecked repo as reachable (rule 01 claim labelling).
**After register/deregister, regenerate `domain-entities.json`** per 3a — entities derive from this table, so skipping leaves the two views disagreeing.
### /charter refresh
1. Verify `.claude/skills/codebase-analysis/SKILL.md` exists, then load it. **Missing:** `codebase-analysis skill not installed. Install via Praxis Hub Manager or ask user to install.` -> **STOP**
2. Analyze codebase
3. Compare with Inception/ artifacts, identify differences
4. Present diff, ask for confirmation
5. Merge changes, commit "Charter refresh"
5a. Regenerate `domain-entities.json` via `generateFromCharter()`. Run `verifyEntityCounts()` — report mismatches (`match: false`) and unverifiable entities (`resolved: false`) **separately** per Step 2b; only mismatches feed the consent prompt (#2597). Ask before updating charter counts. Then run **Out-of-Table Count Reconciliation** (below) — `verifyEntityCounts()` sees only the Key Entities table, so prose counts need their own pass (#2636). Validate and write **beside `CHARTER.md` at project root**, to the `resolveEntitiesWriteTarget()` path per **domain-entities.json Write Target**. Include `"$schema"` first property. **#2379:** helper may return `{error, hint}` or `{warning, entities:{}}` if refreshed charter lost title or Key Entities table — surface to user and restore required sections before overwriting.
5c. **Re-apply selection against the delta (#2853).** Refresh acts on what *changed*, never the whole declaration.
**Newly-gained pairs only.** Compare detected *(language × role)* pairs against the suites in `testing.suites[]`. A pair with no suite triggers selection **for that pair alone**; a pair that already has one is **never re-prompted and never overwritten** — re-asking an answered question is how a refresh silently discards a deliberate choice.
**Orphaned suites are reported, never removed.** A suite whose `match[]` matches zero files is reported by `id`, `role`, and the `match[]` globs that matched nothing — the fields the declaration holds. **No language field is read or derived**: #2849 puts none on a suite, and inferring one from a glob reports a field the config does not carry. A suite matching nothing today may match after the next branch, and only the user knows which.
**A record with no `match[]` is excluded** — the "none applicable" record selection writes, valid because #2849 requires `match[]` only of `gate` suites. It declares no files to match, so flagging it would orphan the record that states an absence.
**An absent role is reported, and selection runs for it.** A language whose `unit` or `e2e` role has neither a suite nor a "none applicable" record is named and **selection runs** for that pair. Silence is indistinguishable from a role nobody needed.
**Suites marked `install pending` are re-checked; success OFFERS the flip back (#2858).** Such a suite was written `manual-only` because its tooling would not install at charter time, not because the user wanted it un-gated. Re-run that harness's verification — `/playwright-check` for the Playwright family, the generic `requires[]` presence check otherwise:
- **Now present** → **offer** to flip `execution` back to `gate` and clear the note. Offer, never apply: restoring a suite to the gate set changes what fails `/work` Step 4f on every later sub-issue — the user's call, not a refresh's.
- **Still failing** → the suite **remains `manual-only`**, the note is kept, and the still-missing requirement is named with its retry command. Reporting nothing makes a still-broken install indistinguishable from one never pending.
This is the only step that clears a pending suite; selection never revisits an answered pair, so without it the suite stays out of the gate set permanently.
**The diff is four-way; every difference names the source that disagrees.** Compare `testing.suites[]` against the rendered `## Framework` table of `Inception/Test-Strategy.md`, any legacy `verificationCommands`, and the manifest script block of Extraction Step 2a (`package.json` `scripts`, `Makefile`, `pyproject.toml`, CI workflow).
- A manifest command **no suite declares** is an **undeclared candidate**, reported and **never written automatically** — a command in CI is evidence, not a decision.
- **An alias is a difference, not a duplicate.** `npm run e2e` and `npx playwright test` may name one suite two ways; adding the second declares a suite the project does not have.
- Writes happen **only on confirmation**, to `testing.suites[]` through the helper — **never to `verificationCommands`**, a **read-only comparison** source here (#2850 retired every `/charter` write of it; an existing key is read as legacy by `resolveSuites`).
**This is the only hook reaching an already-complete charter.** `/charter` with no arguments shows a summary and never re-runs generation, so neither Inception nor Extraction reaches a project past its first session — refresh is where an existing project acquires a declaration, and where drift between the two hand-authored surfaces is caught. Not hypothetical: this repository's `Inception/Test-Strategy.md` and its `framework-config.json` disagreed about what runs, with nothing checking them.
5b. Hint: `"Tip: Run /charter --create-domain-entities to regenerate domain-entities.json after manual charter edits."`
6. Trigger skill/recipe suggestions. Detect new default skills not in `projectSkills` — copy from `{frameworkPath}/.claude/skills/`, add additively, report. Tech stack changed → keyword-based suggestions (NEW only).
### /charter validate
1. Load CHARTER.md and Inception/Scope-Boundaries.md
2. Identify current work (issue, recent commits, staged changes)
3. Compare against in-scope/out-of-scope
4. Report:
| Finding | Action |
|---------|--------|
| Aligned | Proceed normally |
| Possibly out of scope | Ask user to confirm intent |
| Clearly out of scope | Suggest updating charter or revising work |
### /charter --create-domain-entities
Standalone regeneration of `domain-entities.json` from current charter.
**Step 1:** Check `CHARTER.md`
- **Exists:** Read, → Step 2
- **Missing:** Trigger full inception (`/charter` no args). After completion, `domain-entities.json` generated in Step 7. Report and **STOP**.
**Step 2:** Generate
```javascript
const { generateFromCharter, verifyEntityCounts, resolveEntitiesWriteTarget } = require('.claude/scripts/shared/generate-domain-entities.js');
const charter = fs.readFileSync('CHARTER.md', 'utf8');
const entities = generateFromCharter(charter, version);
const target = resolveEntitiesWriteTarget(process.cwd());
```
Write to `target` (beside `CHARTER.md` at project root, per **domain-entities.json Write Target**) with `"$schema"` first property → `.claude/metadata/domain-entities-schema.json` (a relative **reference**, not a location).
**Step 2b:** Verify counts vs filesystem: `verifyEntityCounts(entities.entities)`.
Each result carries a **tri-state** `match` (#2597): `true` confirmed, `false` a real disagreement, `null` no count derived. `resolved: false` names the third case; `unresolved[]` gives one `{location, reason}` per unreadable location.
**Report the three states separately. An unresolvable entity is not a mismatch** — it is an absence of evidence, and presenting it as drift is the defect #2597 fixed in the helper. For each `match: false` report `⚠️ {entity}: charter says {charterCount}, found {actualCount} on disk`. For each `resolved: false` report under a **separate heading**, never in the mismatch list: `❓ {entity}: count not verified — {unresolved[].location}: {unresolved[].reason}`.
**Only `match: false` feeds the consent prompt.** Ask: `"Update charter counts? (y/n)"`. Yes → update CHARTER.md, re-run generate. No → proceed as-is. **Never auto-modify charter without consent.**
**Never offer to rewrite a charter count from an unresolved result** — `actualCount` is `null` there, so the only number available is one the verifier declined to derive (rule 01 Claim Labeling: an unverifiable count is labeled, never silently rendered as a figure).
Then run **Out-of-Table Count Reconciliation** (below); report its candidates alongside the table mismatches, same consent contract (#2636).
**Step 3:** Validate — schema exists → validate, write to `target` (warn if invalid, non-blocking). Missing → warn, write to `target`.
**Step 4:** Report: `Generated domain-entities.json ({count} entities)`. If verification ran: `"Count verification: {N} checked, {M} mismatches, {U} unverifiable"` — **the unverifiable tally is unconditional**: `0 unverifiable` is a result, and omitting the field at zero makes a run that could read nothing look clean (#2597). If the out-of-table scan ran: `"Out-of-table claims: {N} found ({D} drift, {A} counting-rule artifact, {U} unclassified)"` — a scan finding nothing reports `0 found`, so a skipped scan is never mistaken for a clean one (#2636)
### domain-entities.json Write Target (#2894)
Shared by the four writers — Process step 7, update 3a, refresh 5a, `--create-domain-entities` Step 2 — and every step reading it back.
**One path, every layout:** beside `CHARTER.md` at project root. Obtain from `resolveEntitiesWriteTarget(projectRoot)` in `.claude/scripts/shared/generate-domain-entities.js`; never compose it, never branch on deployed vs self-hosted.
```javascript
const { resolveEntitiesWriteTarget } = require('.claude/scripts/shared/generate-domain-entities.js');
const target = resolveEntitiesWriteTarget(process.cwd());
```
**On `ENTITIES_TARGET_OUTSIDE_PROJECT`: report the error verbatim and do not write.** The resolver compares real paths, so it throws when the target resolves through a link out of the project. In a deployed project `.claude/metadata/` is a junction into the shared hub: a write there succeeds silently into machine-wide state every project shares.
**`.claude/metadata/` is a reference, never a destination.** `$schema` points at `.claude/metadata/domain-entities-schema.json` and validation reads it; neither makes that directory a place to write the generated entities.
### Out-of-Table Count Reconciliation (#2636)
Shared by `/charter refresh` 5a and `/charter --create-domain-entities` 2b. Both report identically; edit here, not in either caller.
`verifyEntityCounts()` reads only the `## Key Entities` table, so counts in charter **prose** (Vision, In Scope, Architecture) are never verified and drift silently. This covers them. Reports only; never rewrites on its own.
**Step A — scan:**
```javascript
const { scanOutOfTableCounts } = require('.claude/scripts/shared/generate-domain-entities.js');
const candidates = scanOutOfTableCounts(charter, entities.entities, results);
```
Pass `results` from `verifyEntityCounts()` — supplies `diskCount`. Omit it and every candidate classifies on prose-vs-table alone, silently collapsing the Step B artifact distinction.
**Step B — report.** Candidate fields: `entity`, `statedCount`, `tableCount`, `diskCount`, `line`, `lineText`, `matchedText`, `otherCountsOnLine`, `classification`. Group by classification; show line number and both values.
| `classification` | Meaning | Recommendation |
|---|---|---|
| `drift` | Prose and table state different numbers — both live in the charter, so a real disagreement needing no filesystem check | Offer repair; table is the guarded copy |
| `agrees-with-table` | Prose matches table | No action |
| `counting-rule-artifact` | Prose matches table; only **disk** differs, and the count is qualified (declared exclusions, or a location with a parenthetical). `verifyEntityCounts()` counts immediate children with a name-based exclude list and no extension filter, so the gap is that rule's artifact | **Do NOT offer to rewrite.** Report as artifact |
| `unclassified` | Prose matches table but disk disagrees with nothing explaining the gap | Report; recommend nothing |
An entity whose result is `resolved: false` is **never** `counting-rule-artifact` or `unclassified` — both assert disk disagrees, and an unresolved location asserts nothing. It reports `agrees-with-table` with a note saying disk neither confirms nor contradicts (#2597).
**Why the artifact row exists:** this repo's `Scripts` row counts `.js` only across four dirs; `Domain Knowledge Libraries` excludes `Guides/` and `Templates/`. Both report a disk mismatch that is not drift. Without the distinction the report reads as mostly wrong and gets rejected whole, real findings included. `unclassified` fails open as `sectionFound` (#2614) and Review-State Gate `indeterminate` (#2577) do — named in the verdict, not guessed.
`otherCountsOnLine` lists in-range integers not selected — one line often carries several counts for one entity (`53 JSON files ... 24 schema/data pairs`). Report them; same repair candidates.
`diskCount` of `0` means **an empty resolved location** and is reported as the count it is; an unreadable location reports `diskCount: null` and is described as unresolved. Pre-#2597 the two were indistinguishable, so every `0` carried a hedge; the hedge is gone because the distinction is now in the data.
**Step C — consent gate.** Report-only by default. **Never auto-modify the charter without user consent.** Any `drift` candidate → **ASK USER** via `AskUserQuestion`:
- **Update charter prose to match the table (recommended)** — apply only `drift` corrections, reported lines only
- **Report only, change nothing**
Accept → edit reported lines, re-run `generateFromCharter()`. Decline → change nothing. **Never blocks** — unreconciled prose counts still regenerate `domain-entities.json`; a decline is not recorded, so the next run reports again.
False positives (an integer near an entity word that is not a count of it) are expected and acceptable. The consent gate makes that safe. Do NOT tighten the matcher into fragility to chase them.
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
**Triggers:** `/charter` (creation), `/charter update` (Tech Stack modified), `/charter refresh`
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
