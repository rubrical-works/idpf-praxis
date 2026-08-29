---
version: "v0.99.0"
description: View, create, or manage project charter
argument-hint: "[update|refresh|validate|--create-domain-entities]"
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
| `/charter --create-domain-entities` | Regenerate `domain-entities.json` |
## Execution
**REQUIRED:** Parse workflow steps, use `TaskCreate` to create tasks. Mark `in_progress`→`completed`. After compaction, re-read spec and call `TaskList` to resume from first incomplete task.
## framework-config.json — Use the Helper
ALL writes to `framework-config.json` MUST go through `framework-config.js`. Raw `fs.writeFileSync` forbidden — helper validates against `.claude/metadata/framework-config.schema.json` (ajv draft-07), rejects invalid output.
```javascript
const fwconfig = require('./.claude/scripts/shared/lib/framework-config.js');
const config = fwconfig.read(process.cwd());
config.deploymentTarget = 'vercel';
config.projectSkills = [...new Set([...(config.projectSkills || []), ...newSkills])].sort();
fwconfig.write(process.cwd(), config); // throws on validation failure
```
If `fwconfig.write` throws, surface error and stop — do NOT retry with raw file I/O.
## Template Detection
Pattern: `/{[a-z][a-z0-9-]*}/`. ANY placeholder → template. No placeholders → complete.
## Workflow
### /charter (No Args)
1. `test -f CHARTER.md`
2. If exists, check placeholders: `grep -E '\{[a-z][a-z0-9-]*\}' CHARTER.md`
   - **TEMPLATE:** → Step 3
   - **COMPLETE:** Display summary (name, vision, focus, tech stack). Mention `/charter update` and `/charter validate`.
3. **No charter OR template:** Charter mandatory. Has code → extraction; empty → inception. Proceed directly (no skip).
### Extraction Mode
1. Verify `.claude/skills/codebase-analysis/SKILL.md` exists, then load it. **Missing:** `codebase-analysis skill not installed. Install via Praxis Hub Manager or ask user to install.` -> **STOP**
2. Analyze codebase (tech stack, architecture, tests, NFRs)
3. Present findings, ask user to confirm/adjust
4. Generate CHARTER.md and Inception/ artifacts
**Artifact voice — extraction:** artifacts here are **observations**. "detected" / "found via `<file>`" claims are permitted *because a file was read*; each must be traceable to the file supporting it.
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
| 5 | What testing framework? (conditional) | Inception/Test-Strategy.md Framework |
Q5 only for testable projects (skip docs/config repos).
#### Testing Framework (conditional)
| Tech Stack | Ask? | Options |
|------------|:----:|---------|
| TypeScript/JS/Node | Yes | Jest, Vitest, Bun test |
| Python | Yes | pytest, unittest |
| Go | Yes | testing, testify |
| Rust | Yes | cargo test |
| Java/Kotlin | Yes | JUnit, TestNG |
| C#/.NET | Yes | xUnit, NUnit, MSTest |
| Documentation-only | Skip | N/A |
**Skip:** Q3 contains "documentation"/"docs"/"config"/"terraform"/"ansible" → skip Q5, framework = "N/A - non-code project".
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
**During `/charter update`:** Use `generateUpdateQuestions(currentDomainEntities)` — only missing/empty fields; existing values preserved.
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
**Step 3:** Write `activeDomains` (lowercase IDs: `"security"`, `"accessibility"`, `"seo"`, `"privacy"`, `"observability"`, `"i18n"`, `"api-design"`, `"performance"`, `"chaos"`, `"contract"`, `"qa"`). Report active list.
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
| Review mode? | framework-config.json → reviewMode |
| Active domains? | framework-config.json → activeDomains |
**Process:**
1. Create lifecycle dirs: `mkdir -p Inception Construction/Test-Plans Construction/Design-Decisions Construction/Tech-Debt Transition`
2. Generate CHARTER.md (Vision, Tech Stack, In Scope, Status: Draft). **Required (#2379):** title exactly `# Project Charter: {name}`; include `## Key Entities` table `| Entity | Count | Location |` with ≥1 row (use `TBD` for unknown Count). Wrong title or missing section → generator returns structured `{error, hint}` / `{warning, entities:{}}`.
3. Generate Inception/ artifacts (Charter-Details, Tech-Stack, Scope-Boundaries, Constraints, Architecture, Test-Strategy, Milestones) — **in intent voice per the Artifact voice rule at the head of Inception Mode.** `Tech-Stack.md` is sourced from the Q3 answer alone.
4. Construction/ structure with .gitkeep and README.md
5. Transition/ artifacts (Deployment-Guide, Runbook, User-Documentation)
6. Use "TBD" where unanswered. **Separately**, use `TBD` for detail no answer supplied that cannot be observed because nothing is installed yet (see Artifact voice). Skipped question and unobservable detail are distinct cases.
7. Generate `domain-entities.json`:
   ```javascript
   const { generateFromCharter } = require('.claude/scripts/shared/generate-domain-entities.js');
   const charter = fs.readFileSync('CHARTER.md', 'utf8');
   const entities = generateFromCharter(charter, version);
   // Validate against .claude/metadata/domain-entities-schema.json before writing
   // If validation fails, warn and skip (non-blocking)
   ```
8. Commit: "Initialize project charter and lifecycle structure"
9. Hint: `"Tip: Run /charter --create-domain-entities to regenerate domain-entities.json after manual charter edits."`
**Note:** Dirs created after questions to avoid orphans if user abandons.
### /charter update
1. Read CHARTER.md and Inception/Charter-Details.md
2. Ask what to update (Vision, Current Focus, Tech Stack, Scope, Milestones, Deployment Target)
3. Apply, sync CHARTER.md if vision changes, update Last Updated
3a. Regenerate `domain-entities.json` via `generateFromCharter()`. Validate before writing. If missing, generate (migration). Include `"$schema"` first property → `.claude/metadata/domain-entities-schema.json`. **#2379:** if helper returns `{error, hint}` or top-level `warning`, surface both and do not write a partial file. **This step does not verify counts against disk** — `verifyEntityCounts()` is called by `/charter refresh` 5a and `/charter --create-domain-entities` Step 2b, which own the mismatch-versus-unverifiable contract (#2597).
3b. Hint: `"Tip: Run /charter --create-domain-entities to regenerate domain-entities.json after manual charter edits."`
4. If Tech Stack modified: trigger skill/recipe suggestions (NEW only). Detect new default skills not in `projectSkills` (from `skill-keywords.json` `defaultSkills`) — copy from `{frameworkPath}/.claude/skills/`, add additively.
4b. If Deployment Target changed: remove old deployment skill, copy new from `{frameworkPath}/.claude/skills/<skill-name>/`. Update `deploymentTarget` and `projectSkills`. No prior target → fresh install.
### /charter refresh
1. Verify `.claude/skills/codebase-analysis/SKILL.md` exists, then load it. **Missing:** `codebase-analysis skill not installed. Install via Praxis Hub Manager or ask user to install.` -> **STOP**
2. Analyze codebase
3. Compare with Inception/ artifacts, identify differences
4. Present diff, ask for confirmation
5. Merge changes, commit "Charter refresh"
5a. Regenerate `domain-entities.json` via `generateFromCharter()`. Run `verifyEntityCounts()` — report mismatches (`match: false`) and unverifiable entities (`resolved: false`) **separately** per Step 2b; only mismatches feed the consent prompt (#2597). Ask before updating charter counts. Then run **Out-of-Table Count Reconciliation** (below) — `verifyEntityCounts()` sees only the Key Entities table, so prose counts need their own pass (#2636). Validate and write. Include `"$schema"` first property. **#2379:** helper may return `{error, hint}` or `{warning, entities:{}}` if refreshed charter lost title or Key Entities table — surface to user and restore required sections before overwriting.
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
const { generateFromCharter, verifyEntityCounts } = require('.claude/scripts/shared/generate-domain-entities.js');
const charter = fs.readFileSync('CHARTER.md', 'utf8');
const entities = generateFromCharter(charter, version);
```
Write with `"$schema"` first property → `.claude/metadata/domain-entities-schema.json` (relative path).
**Step 2b:** Verify counts vs filesystem: `verifyEntityCounts(entities.entities)`.
Each result carries a **tri-state** `match` (#2597): `true` confirmed, `false` a real disagreement, `null` no count derived. `resolved: false` names the third case; `unresolved[]` gives one `{location, reason}` per unreadable location.
**Report the three states separately. An unresolvable entity is not a mismatch** — it is an absence of evidence, and presenting it as drift is the defect #2597 fixed in the helper. For each `match: false` report `⚠️ {entity}: charter says {charterCount}, found {actualCount} on disk`. For each `resolved: false` report under a **separate heading**, never in the mismatch list: `❓ {entity}: count not verified — {unresolved[].location}: {unresolved[].reason}`.
**Only `match: false` feeds the consent prompt.** Ask: `"Update charter counts? (y/n)"`. Yes → update CHARTER.md, re-run generate. No → proceed as-is. **Never auto-modify charter without consent.**
**Never offer to rewrite a charter count from an unresolved result** — `actualCount` is `null` there, so the only number available is one the verifier declined to derive (rule 01 Claim Labeling: an unverifiable count is labeled, never silently rendered as a figure).
Then run **Out-of-Table Count Reconciliation** (below); report its candidates alongside the table mismatches, same consent contract (#2636).
**Step 3:** Validate — schema exists → validate, write (warn if invalid, non-blocking). Missing → warn, write.
**Step 4:** Report: `Generated domain-entities.json ({count} entities)`. If verification ran: `"Count verification: {N} checked, {M} mismatches, {U} unverifiable"` — **the unverifiable tally is unconditional**: `0 unverifiable` is a result, and omitting the field at zero makes a run that could read nothing look clean (#2597). If the out-of-table scan ran: `"Out-of-table claims: {N} found ({D} drift, {A} counting-rule artifact, {U} unclassified)"` — a scan finding nothing reports `0 found`, so a skipped scan is never mistaken for a clean one (#2636)
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
