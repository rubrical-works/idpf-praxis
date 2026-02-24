# Changelog

All notable changes to the IDPF Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Note:** Version numbers were reset to semantic versioning on 2025-12-24. See issue #525 for details. The v0.x.x series indicates pre-production status; v1.0.0 will mark production readiness.

---

## [0.51.0] - 2026-02-24

### Added

- **`work-preamble.js` backing script**: New Node.js script for the `/work` command that programmatically handles issue validation, branch assignment checks, epic detection with sub-issue loading, status transitions, PRD tracker auto-move, batch mode, and status-query mode — replacing inline deterministic steps with structured JSON output (#1528, #1529, #1530, #1531, #1532)
- **JSON output schema tests**: Assertion tests validating work-preamble.js structured output format (#1537)
- **Structured error handling**: Categorized error types (validation, network, state) in work-preamble.js (#1532)

### Changed

- **`/work` command spec**: Replaced deterministic setup steps with `work-preamble.js` script call (#1533)
- **Deployment chain**: Registered `work-preamble.js` in `framework-manifest.json`, `constants.js`, and `Templates/` two-file sync (#1535)
- **Minimized `/work` command**: Updated distribution copy with preamble script integration (#1534)

---

## [0.50.0] - 2026-02-23

### Added

- **`/self-diag` command backing script**: New `self-diag-checks.js` script and command spec for framework self-diagnostic auditing, with minimize exclusion for dev-only usage. Structural tests for command spec and backing script (#1498)
- **Bidirectional sync check in self-diag Phase 4**: New validation phase ensures `.claude/scripts/shared/` and `Templates/scripts/shared/` stay in sync (#1517)
- **`getAllOpenTrackers()` in `active-label.js`**: New function for querying all open branch trackers, with unit tests. Replaces `getOpenBranches`/`getTrackerForBranch` in assign-branch.js (#1515)
- **Pending label for non-approved review outcomes**: Review commands now apply a `pending` label when review criteria are not fully met (#1500)
- **Construction Context Discovery in `/review-proposal`**: New review criterion and construction-context check for epic reviews (#1497)
- **gh pmu accept gate documentation**: Documented terms acceptance flow and error recovery in GitHub-Workflow.md, propagated to .min-mirror and .claude/rules (#1499)
- **`hasPushWorkflows`/`shouldSkipMonitoring` signatures documented**: In `/done` Step 5b for correct synchronous usage (#1504)
- **Design decision**: EXTENSIBLE tag scanner avoidance in command spec prose (#1498)

### Changed

- **`/bug` default priority**: Changed from P2 to P1 for newly created bug issues (#1520)
- **`assign-branch.js` refactored**: Replaced `getOpenBranches`/`getTrackerForBranch` with `getAllOpenTrackers()`, parallelized move and sub-add calls in `assignToBranch()` (#1515, #1519)
- **Two-file sync enforcement**: Templates copies now verified to match installed scripts (#1515)
- **`gh pmu sub add` made best-effort**: Added `|| true` to prevent non-critical sub-issue linking failures from blocking workflows (#1521)

### Fixed

- **Self-diag Phase 5 domain specialist count**: Fixed to scan subdirectories (`Base/`, `Pack/`) for accurate specialist file count (#1518)
- **Self-diag Phase 3 deployment manifest check**: Fixed to skip rules section which is intentionally excluded from deployment (#1516)
- **Minimized review commands**: Updated with pending label logic (#1500)

---

## [0.49.1] - 2026-02-23

### Added

- **Command Preamble Scripts PRD**: Created PRD with 3 epics, 10 stories, 67 acceptance criteria for consolidating deterministic command setup into single Node.js invocations returning structured JSON. Includes test plan (100% AC coverage), activity diagram, and full approval pipeline (#1507, #1509, #1510)
- **Context Engineering documentation**: New philosophy doc explaining IDPF's thin-orchestrator pattern — separating what the model needs to think about from what can be computed deterministically outside the model (`Docs/03-Philosophy/Context-Engineering.md`)

### Fixed

- **`load-review-extensions.js` deployment registration**: Added missing lib script to `framework-manifest.json` deploymentFiles, `constants.js`, and `Templates/scripts/shared/lib/` two-file sync (#1511)

---

## [0.49.0] - 2026-02-23

### Added

- **`/check-upgrade` command**: New framework command for verifying hub upgrade integrity in user projects. Checks extension block preservation, custom script survival, command version drift, and symlink health. Backing script `check-upgrade.js` with structural tests (#1501)
- **`/assign-branch` tracker linking**: Issues assigned to a branch are now automatically linked as sub-issues of the branch tracker via `gh pmu sub add`. Resolves tracker once via `getTrackerForBranch()` and passes through all assignment paths including epic sub-issues. `/done` Step 4a remains idempotent (#1503)
- **PRD review gate in `/create-backlog`**: Phase 1c blocks decomposition of unreviewed PRDs. Checks for "PRD reviewed" checkbox in tracker body; offers to run `/review-prd` or bypass with annotation (#1495)
- **CI script registration**: 12 CI scripts (`ci-add.js`, `ci-analyze.js`, `ci-apply.js`, etc.) registered in `framework-manifest.json` deploymentFiles and synced to `Templates/scripts/shared/` with `constants.js` entries (#1494)

### Fixed

- **Epic sub-issue review scope**: `/review-issue` Step 3b-ii (auto-generate proposed solution/fix) and per-sub-issue body updates now correctly included in the `sub-issue-review` criterion for epic type reviews (#1492)
- **Inline execution instructions**: Replaced external `execution-instructions.md` reference in `/review-issue` with inline 4-line execution instructions, matching the pattern used by all other commands. Eliminates missing-file deployment issue (#1502)

---

## [0.48.3] - 2026-02-22

### Added

- **Branch tracker linking in `/done` (Step 4a)**: Automatically links completed issues as sub-issues of the current branch tracker using `getTrackerForBranch()` and `gh pmu sub add`. Skips silently on main branch (#1490)
- **Next-steps guidance in `/done` (Step 4b)**: Provides contextual guidance for approval-gate issues (labeled `test-plan` + `approval-required`), suggesting `/review-prd` before `/create-backlog` (#1481)
- **`hasPushWorkflows()` CI pre-check**: `/done` Step 5b now pre-checks whether push-triggered CI workflows exist before spawning the background monitor (#1488)
- **Two-file sync for `ci-watch.js`**: Synced to `Templates/scripts/shared/` source of truth (#1488)
- Structural tests for Step 4a (`done-branch-tracker.test.js`) and Step 4b (`done-next-steps.test.js`)
- Unit tests for `hasPushWorkflows()` and `hasPushBranchTrigger()` in `ci-watch.test.js`

---

## [0.48.2] - 2026-02-22

### Added

- **Auto-generate proposed solution for story issues**: Extended `/review-issue` Step 3b-ii to trigger for story type when `proposed-solution` check fails, complementing existing enhancement and bug support. Standalone stories from `/add-story` now benefit from codebase-aware solution generation (#1485)
- **Story `proposed-solution` review criterion**: Added to `review-criteria.json` with autoCheck guidance for detecting missing or placeholder solution sections (#1485)

---

## [0.48.1] - 2026-02-22

### Fixed

- **framework-manifest.json version placeholder**: Replace hardcoded version with `v0.51.0` placeholder, matching the deployment pattern used by all other framework files (#1479)
- **generate-test-plan.js**: Handle `v0.51.0` placeholder gracefully by falling through to `vX.Y.Z` default (#1479)
- **audit.js**: Skip version mismatch check when manifest uses `v0.51.0` placeholder in dev environment (#1479)

### Added

- Manifest version validation test accepting both semver and `v0.51.0` placeholder (#1479)

---

## [0.48.0] - 2026-02-21

### Added

- **Auto-generate proposed solution/fix during `/review-issue`**: When an enhancement is missing a Proposed Solution or a bug is missing a Proposed Fix, the review command now auto-generates a structured solution with approach, files to modify, implementation steps, and testing considerations — appended to the issue body automatically (#1475)
- **Review criteria externalized to JSON metadata**: Type-specific review criteria (bug, enhancement, story, epic, generic) moved from inline command spec to `.claude/metadata/review-criteria.json`, and common criteria moved to `.claude/metadata/review-mode-criteria.json` with objective/subjective typing and autoCheck guidance (#1477)
- **Shared execution instructions metadata**: Extracted common execution tracking instructions (todo generation, extensions, progress, post-compaction) to `.claude/metadata/execution-instructions.md` for reuse across command specs (#1477)

### Changed

- **GitHub-Workflow.md reduced by 52%**: Source file trimmed from 844 to 405 lines — removed Prerequisites, Branch Semantics, verbose Issue Management/Branch Commands tables, Framework Applicability, workflow sections §1-§3/§5/§7-§10, Visibility Commands, CI/CD Rate Limiting, and Session Behavior sections already covered by command specs (#1474)
- **Extension loading error handling**: Moved from inline command spec documentation to shared script `.claude/scripts/shared/lib/load-review-extensions.js` (#1477)
- **Review criteria applicability filtering**: Trimmed inline filtering documentation to meet 35% token reduction target via JSON-driven approach (#1477)

---

## [0.47.0] - 2026-02-21

### Added

- **`/plan-workstreams` command**: New managed command for concurrent workstream planning across multiple epics — argument parsing, codebase analysis, conflict detection, workstream grouping with union-find, execution plan builder, cancel mode with branch unwinding, worktree setup guide, and stale worktree cleanup reminders (#1449–#1461)
- **`workstream-utils.js` shared library**: Utility functions for workstream metadata loading, pre-destroy checks, post-merge checks, epic disposition, and formatting helpers — shared across `/plan-workstreams`, `/destroy-branch`, and `/merge-branch` (#1461)
- **`upgrade-check.js` session startup script**: Automatic third-party dependency upgrade checking with 8-ecosystem keyword registry, dependency file parsing, package registry queries (npm, pypi), 14-day cooldown, and non-blocking session startup integration (#1469)
- **Workstream extensions for `/destroy-branch`**: Pre-destroy workstream detection and post-destroy metadata update with epic reassignment options (#1460)
- **Workstream extensions for `/merge-branch`**: Post-merge workstream detection with sibling warning and metadata update (#1459)
- **Concurrent Workstream Planning PRD**: Full PRD with test plan and diagrams (#1433)
- **Institutional Learning Command proposal**: New proposal for session-to-session knowledge retention (#1433)

### Changed

- **`/work` Step 9b documentation judgment**: Moved from `/done` to `/work` Step 9b for earlier documentation during implementation (#1467)
- **`/work` Step 12 autonomous epic processing**: Sub-issues processed sequentially with per-sub-issue STOP boundaries (#1440)
- **`/create-prd` solo-mode**: Single-epic preference in Phase 4.5 for solo review mode (#1442)
- **`/complete-prd` proposal move**: Automatically moves proposal to `Proposal/Implemented/` after PRD closure (#1463)
- **Session startup review mode display**: Shows review mode (solo/team/enterprise) in session info (#1441)
- **`/prepare-release` CI skip**: Skip CI wait step when no `.github/workflows/` files configured (#1466)
- **Symlink-safe metadata access**: Command specs updated to use Read tool instead of Glob for symlinked directories (#1465)

### Fixed

- **`checkBranchCommits` shallow clone**: Fixed test failures on depth-1 shallow CI clones (#1456)
- **`/create-prd` untracked proposals**: Handle untracked proposal files in Phase 7 (#1464)
- **Test script**: Fixed test runner configuration (814dc40)

---

## [0.46.2] - 2026-02-19

### Fixed

- **IDPF acronym inconsistency**: Replaced "Iterative" with "Interactive" across README, README-DIST, NOTICE, framework-manifest, docs, and proposal files (#1435)
- **review-prd Decomposition context**: Added decomposition context preview (epic/story structure summary) before subjective question in `/review-prd` Step 3c so reviewers have context for the Decomposition question (#1436)
- **prepare-release Step 5.3 duplicate release**: Changed from unconditional `gh release create` to verify-then-fallback pattern using `gh release view` first, preventing "already exists" errors when Step 4.8 creates the release (#1434)
- **/ci script existence check**: Added Step 2 guard to verify CI scripts exist before routing to handler, providing clear install instructions instead of crashing with module-not-found error (#1438)

### Added

- **Concurrent Workstream Planning proposal**: New proposal document for parallel issue workstreams (#1433)

---

## [0.46.1] - 2026-02-18

### Fixed

- **Generated startup rules missing sandbox safety**: `generateHubStartupRules()` in `install-hub.js` updated with sequential execution warning, Tool column in session info table, post-compact behavior note, rules auto-loading summary, and removed blocked shell builtins (`test -f`, `basename`) (#1430)

### Added

- **Structural test for generated startup rules**: 9 assertions verifying safety patterns in hub-generated `03-startup.md` and absence of blocked builtins (#1430)

---

## [0.46.0] - 2026-02-18

### Added

- **Charter Praxis Diagram configuration**: `/charter` generates `.praxis-diagram.json` when the project uses Flowbite-Svelte or Flowbite-React, deriving the shape library from the tech stack. Prompts user if framework is undetectable. New utility script `praxis-diagram-config.js` with `detectShapeLibrary()`, `generateConfig()`, and `getAvailableShapeLibraries()` (#1428)
- **Editor setup documentation**: New `Docs/02-Advanced/Editor-Setup.md` for extensions-cli output integration with editors (#1424)
- **New tests**: 32 new tests — charter Praxis Diagram (22), release naming (10) (#1426, #1428)

### Changed

- **Windows Shell Safety command substitution guidance**: Refined tiered safety rules replacing blanket avoidance with context-specific guidance — safe patterns (variable expansion, simple substitution), caution patterns (flag values), and avoid patterns (nested/complex substitution) (#1423)
- **Extensions-cli output formatting**: `/extensions list` and `matrix` output reformatted for narrow terminal width compatibility (#1424)

### Fixed

- **Release page naming**: `update-release-notes.js` reads project name from CHARTER.md heading instead of hardcoding "IDPF Framework". Falls back to "Release" when no charter is found (#1426)
- **Domain specialist persistence**: Project installers (`install-project-new.js`, `install-project-existing.js`) persist selected `domainSpecialist` to `framework-config.json` after charter setup (#1422)
- **Startup sandbox safety**: Replaced sandbox-blocked builtins in startup instructions to prevent sibling tool errors when parallel calls fail (#1425)

---

## [0.45.0] - 2026-02-16

### Added

- **New `/code-review` command**: Performs methodical, charter-aligned code review across a codebase with manifest-driven incremental tracking via `.code-review-manifest.json` and SHA-256 content hashing. Supports `--full` (bypass manifest), `--status` (report only), `--scope <globs>` (targeted review), and `--batch N` (incremental sessions). Reviews produce structured reports in `Construction/Code-Reviews/`, with findings classified by severity (high/medium/low/info) and category (correctness, security, maintainability, naming, error-handling, documentation). Lazy-loads relevant project skills for domain-specific analysis and offers issue creation via `/bug` or `/enhancement` (#1419)
- **Charter skill auto-matching from `skill-keywords.json`**: `/charter` now uses `skill-keywords.json` for intelligent keyword-based skill matching instead of the sparse `skill-registry.json` triggers. Matches tech stack keywords against 22 skills with `skillKeywords` entries and `groupKeywords` expansion (e.g., "tdd" matches all 5 TDD skills). Presents candidates via `AskUserQuestion` with multi-select, supports additive merge for existing projects (preserves current skills, only offers new matches), and handles edge cases (missing file, unknown tech stack, zero matches) (#1418)
- **Structural tests**: 73 new tests — code-review command spec (50), charter skill matching (23) (#1418, #1419)

---

## [0.44.0] - 2026-02-16

### Added

- **New `/bad-test-review` command**: Evaluates every unit and e2e test against the project charter for alignment and functional authenticity, using 6 detection heuristics (hardcoded returns, no branching, single-input coverage, narrow assertions, mock-only validation, same-commit pattern). Includes persistent `.bad-test-manifest.json` with SHA-256 content hashing for incremental reviews, charter hash tracking for full re-evaluation on charter changes, and `--full`/`--status` CLI flags (#1415)
- **`/work` QA extraction flow (Step 7b)**: Scans acceptance criteria for manual test indicators (e.g., `manually verify`, `QA:`, `exploratory test`) and offers to extract them into tracked QA sub-issues with `qa-required` label via `AskUserQuestion`. Parent AC remains unchecked until QA sub-issues are closed (#1413)
- **Structural tests**: 37 new tests — bad-test-review command spec (26), QA extraction in /work (11) (#1413, #1415)

---

## [0.43.7] - 2026-02-15

### Added

- **`/done` PRD label redirect**: Step 2b checks for the `prd` label and redirects to `/complete-prd` instead of closing directly, preventing accidental PRD tracker closure (#1411)
- **`/proposal` interactive mode selection**: Step 3 now adapts based on user input — bare invocation defaults to Guided mode, title-only asks Quick/Guided via `AskUserQuestion`, title+description auto-selects Quick mode (#1410)
- **Proposal diagram tracking**: `/proposal` template includes `**Diagrams:** None` metadata field with lazy `Proposal/Diagrams/` directory creation and `[Name]-*.drawio.svg` naming convention (#1409)
- **`/review-proposal` diagram verification**: Step 2b auto-evaluates `**Diagrams:**` field — verifies referenced files exist on disk, skips when "None" or absent (#1409)
- **Structural tests**: 26 new tests — PRD redirect (6), interactive proposal mode (12), diagram tracking (8) (#1409, #1410, #1411)

---

## [0.43.6] - 2026-02-15

### Changed

- **`/review-proposal` scope context display**: Step 2c now extracts and displays the in-scope/out-of-scope sections from the proposal file inline before asking the subjective scope question, giving the reviewer immediate context (#1403)
- **`/review-test-plan` approval gate AC check-off**: Step 5.6 automatically checks off acceptance criteria on the approval issue after a "Ready for approval" review, and moves the issue to `in_review` for `/done` closure (#1404)
- **`/review-issue` shared type detection**: Step 2 now uses `getIssueType()` from `.claude/scripts/shared/lib/issue-type.js` instead of a redundant `gh issue view` API call, reusing labels already fetched in Step 1 (#1406)
- **`/review-prd` AC check-off**: Step 6.6 automatically checks off acceptance criteria on the PRD issue after a "Ready for backlog creation" review, with no status transition (owned by `/create-backlog`) (#1407)

### Added

- **Shared `getIssueType()` utility**: `.claude/scripts/shared/lib/issue-type.js` centralizes label-based issue type detection with redirect support for `test-plan`, `proposal`, and `prd` labels (#1406)
- **Structural tests**: Tests for all four review command changes — scope context display, AC check-off steps, and `getIssueType()` integration (#1403, #1404, #1406, #1407)

### Fixed

- Workflow Guide approval gate attribution correction

---

## [0.43.5] - 2026-02-14

### Fixed

- **TDD REFACTOR phase skipped in `/work`**: Step 9 sub-step 2 now includes inline RED, GREEN, REFACTOR phase summaries so the REFACTOR requirements survive context compaction without depending solely on the framework methodology file (#1400)

### Added

- **Structural tests for `/work` command spec**: 8 tests in `tests/commands/work.test.js` validate Step 9 includes inline TDD phase summaries with REFACTOR reporting and test-passing requirements (#1400)

---

## [0.43.4] - 2026-02-14

### Changed

- **Epic sub-issue reviewed label propagation**: `/review-issue` Step 5.5 now applies the `reviewed` label to all sub-issues when an epic receives a "Ready for work" recommendation. Previously only the epic itself was labeled (#1397)
- **Step 6 epic summary**: Review summary now reports how many sub-issues received the `reviewed` label for epic reviews (#1397)

### Added

- **Structural tests for Step 5.5 sub-issue labeling**: 6 tests in `tests/commands/review-issue.test.js` validate Step 5.5 includes epic sub-issue label propagation and Step 6 includes sub-issue count reporting (#1397)

---

## [0.43.3] - 2026-02-14

### Changed

- **TDD REFACTOR phase reporting**: REFACTOR phase in `Agile-Core.md` now requires a **Report** step — must state what was analyzed (duplication, naming, complexity, structure) and the decision (refactor or skip with reason). Previously the phase could execute silently with no visible output (#1394)

### Added

- **Structural test for REFACTOR phase**: `tests/reference/agile-refactor-phase.test.js` validates REFACTOR phase section contains required reporting instruction with 4 assertions (#1394)

---

## [0.43.2] - 2026-02-13

### Added

- **Structured AC iteration in `/work` Step 9**: Step 9 now iterates through auto-TODO from Step 7 with per-AC TDD cycles, TODO tracking, and commits using `Refs #$ISSUE` — provides natural commit boundaries, compaction recovery, and traceability (#1392)
- **Commit step in TDD REFACTOR phase**: `Agile-Core.md` REFACTOR phase now includes "run full test suite" and "commit with `Refs #$ISSUE`" steps, making commits a natural part of the TDD cycle (#1392)
- **Conditional commit regression tests**: 5 tests in `tests/commands/done-conditional-commit.test.js` verify source and distribution copies contain conditional commit logic (#1390)

### Fixed

- **`/done` Step 6 conditional commit**: Step 6 now checks `git status --porcelain` before committing — skips commit gracefully when no changes exist (e.g., design decisions doc declined), pushes any unpushed `/work` commits instead (#1390)

---

## [0.43.1] - 2026-02-13

### Fixed

- **Framework methodology dispatch in `/work`**: Replace hardcoded `.min-mirror/` paths with `{frameworkPath}` resolution so user projects can locate Agile-Core.md and Vibe-Core.md via their configured framework path (#1387)
- **Anti-hallucination rules path in `/create-prd`**: Wrap self-hosted `.min-mirror/` reference in `FRAMEWORK-ONLY` tags and add universal `{frameworkPath}` row for user projects (#1387)

### Added

- **Distribution safety tests**: New `tests/commands/distribution-safety.test.js` with 3 regression tests: forbidden `.min-mirror/` path references, FRAMEWORK-ONLY content stripping, and excluded commands isolation (#1387)

---

## [0.43.0] - 2026-02-12

### Added

- **Active label for branch trackers**: New `active-label.js` lib module manages an `active` label on branch tracker issues. Integrated into `/create-branch`, `/destroy-branch`, `/prepare-release`, `/merge-branch`, and `switch-branch.js` — at most one open tracker holds the label at any time (#1379)
- **Reviewed label auto-assignment**: Review commands (`/review-issue`, `/review-prd`, `/review-proposal`, `/review-test-plan`) now add the `reviewed` label when the recommendation starts with "Ready for" (Step 5.5/6.5) (#1381)
- **`test-coverage-proportionate` criterion**: New objective review criterion added to all 4 review commands with type-specific heuristics — bug (single-path vs multi-path), story (scope-based), enhancement (new feature vs behavior change), PRD (per-story), test plan (depth vs scope) (#1375)
- **`--mode` argument for review commands**: Transient reviewMode override (`solo`, `team`, `enterprise`) for all 4 review commands with active mode hint display
- **Branch validation in `/create-backlog`**: Phase 1b validates branch assignment before creating epics/stories from PRD
- **Branch protection in project installer**: `configureBranchProtection()` in `install-project-new.js` uses GitHub rulesets API with legacy fallback, free plan detection, and idempotent named ruleset (`IDPF-Main-Protection`) (#1378)
- **Modularization proposals**: Three proposals for decomposing Create-PRD, Review-PRD, and Review-Proposal into smaller modules

### Fixed

- **Solo review mode**: Correctly skips description-sufficiency subjective question — solo mode has NO subjective criteria (#1373)
- **`update-release-notes.js`**: CRLF regex fix in changelog parser; added `require.main` guard
- **`active-label.js`**: Registered in `framework-manifest.json` (#1379)
- **YAML frontmatter**: Corrected argument-hints across command files
- **Integration tests**: Updated criteria counts for `test-coverage-proportionate`

---

## [0.42.2] - 2026-02-12

### Changed

- **`/review-proposal`**: Auto-evaluate feasibility as objective criteria instead of subjective user question (#1370)
- **Project installers**: Replace `generateGhPmuConfig` with `gh pmu init --non-interactive` for `.gh-pmu.yml` creation (#1368)

---

## [0.42.1] - 2026-02-11

### Fixed

- **ci-watch.js**: Resolve short SHA to full 40-char before `gh run list --commit` lookup (#1366)
- **ci-watch.js**: Add branch-based fallback when commit-based run lookup returns empty (#1366)
- **ci-watch.js**: Make `maxWait` configurable via `--max-wait` CLI argument (#1366)
- **Review mode tests**: Update solo mode criteria counts after `description-sufficient` removal
- **Integration tests**: Update solo mode assertions for description removal
- **Project installer**: Add `reviewMode` to generated `framework-config.json` (#1362)
- **Startup rules**: Replace hardcoded absolute paths with `frameworkPath` in generated rules
- **Startup rules**: Reference `framework-config.json` for version field instead of manifest

### Changed

- **`/done` command**: Added `--no-docs` flag to skip design decisions documentation offer

---

## [0.42.0] - 2026-02-11

### Added

#### CI Workflow Management (`/ci` command — PRD #1296)
- **#1303** - `/ci` command for workflow status overview
- **#1304** - `/ci list` command for feature discovery from CI feature registry
- **#1305** - `/ci validate` for workflow YAML validation
- **#1306** - `/ci add` feature integration script with template-based injection
- **#1307** - `/ci remove` feature script for safe YAML removal
- **#1308** - `languages` and `template` fields in CI feature registry (`ci-features.json`)
- **#1309** - Multi-language stack detection for CI features
- **#1310** - Auto-detect target workflow file for CI features
- **#1311** - YAML-safe workflow modification library (`yaml-safe.js`)
- **#1315** - Project analysis engine for CI intelligence pipeline
- **#1316** - Workflow inventory and gap analysis engine
- **#1317** - Recommendation report UI with selectable menu
- **#1318** - Apply recommendations orchestrator
- **#1319** - 4 extension points added to `/ci` command spec
- **#1320** - Contextual hints system for `/ci` subcommands (`ci-hints.js`)
- **#1321** - CI-related recipe prerequisites updated to reference `/ci` commands
- **#1312** - v1 Feature Set A integration tests and fixes
- **#1313** - v1 Feature Set B integration tests and step insertion bug fix
- **#1314** - v2 Feature Set tests and parallel test race condition fix

#### DrawIO Generation Skill (PRD #1298)
- **#1325** - `drawio-generation` skill with Draw.io XML file format specification
- **#1326** - Generation pattern documentation for drawio skill
- **#1327** - Validation checklist for drawio skill
- **#1328** - Shape style catalog for drawio skill
- **#1329** - Material Design color palette resource for drawio skill
- **#1330** - Added `drawio-generation` to skill registry
- **#1331** - Packaged `drawio-generation` skill for distribution
- **#1332** - Skill cross-reference in `/create-prd` Phase 5.5
- **#1333** - Skill cross-reference in diagram enhancement proposal

#### Review Mode Configuration (context-aware reviews)
- **#1336** - `reviewMode` configuration for context-aware reviews (`solo`/`team`/`enterprise`)
- **#1337** - `reviewMode` question added to `/charter` setup flow
- **#1338-#1342** - Convert all 5 review commands to batched `AskUserQuestion`
- **#1340-#1342** - Convert `/review-prd`, `/review-test-plan`, `/resolve-review` to `AskUserQuestion`
- **#1352** - Integration tests for `reviewMode` in review commands
- **#1352** - `reviewMode` and CI files added to deployment manifest
- **#1355** - Auto-evaluate objective review criteria, ask only subjective (two-phase pattern)
- **#1356** - Restore lost review criteria across all 5 review commands

#### Diff Verification for `/done`
- **done-verify.js** - Diff verification helper script for hallucination detection
- **done-verify.js** added to deployment chain (constants.js + framework-manifest.json)
- Diff verification step integrated into `/done` and re-read guard into `/work`
- **#1357** - Differentiate new files from EOF-only appends in `done-verify.js`

#### Background CI Monitoring
- **#1358** - `ci-watch.js` background CI monitor with 3-phase polling and dependency injection
- **#1359** - `node:test` CI step added to `test.yml` workflow

### Fixed
- **#1359** - `node:test` files not discovered by CI workflow (missing `--test` step)
- **#1359** - Stale review-mode test count assertions
- **#1334** - Generic branch detection in `switch-branch.js` (was hardcoded to `release/`/`patch/`/`hotfix/`)
- **#1290** - Version fields not updated when reinstalling to existing project
- Default `reviewMode` changed from `team` to `solo` (appropriate for single-developer usage)
- IDPF-PRD orphan reference removed from `deploy-dist.yml`

### Changed
- `@framework-script` tags added to CI and review-mode scripts for deployment tracking
- Minimized `done.md` and `work.md` command specs updated
- PRD for DrawIO Generation Skill moved to `Implemented/` (#1298)
- PRD for CI Workflow Management moved to `Implemented/` (#1296)

### Documentation
- Design decision: background CI monitoring architecture (#1358)
- Design decision: diff verification approach for `/done`
- Design decision: CI intelligence pipeline architecture
- Design decision: CI feature management YAML handling
- Microservices suitability analysis chain added
- Your Role guide and reframed docs for non-developer audience
- User-facing documentation revamped

---

## [0.41.1] - 2026-02-09

### Fixed
- **#1280** - Case-insensitive path deduplication in project registration (`projects.json`)
- **#1281** - Self-referential install guard prevents hub=target corruption
- **#1283** - Intent-based edit flow for `/extensions edit` (replaces raw text replacement)
- **#1284** - Registry rebuild removed from `/extensions edit` (framework-only reference tagged)

### Added
- **#1280** - `require.main === module` guards on both installer scripts for testability
- **#1280** - 14 tests for `registerProject` path deduplication
- **#1281** - 10 tests for self-referential install guard
- **#1283** - Updated extensions-registry test assertions for intent-based flow

### Documentation
- **#1280** - Design decision: case-insensitive path deduplication approach

---

## [0.41.0] - 2026-02-09

### Added
- **#1278** - TDD criteria added to `/review-issue` common criteria
- **#1276** - Orphaned directory cleanup in `install-hub.js`

### Changed
- **#1261** - Legacy installer removed and `constants.js` migrated to framework-only usage

### Documentation
- **#1261** - Design decision document for legacy installer removal

---

## [0.40.0] - 2026-02-08

### Added
- **#1259** - Review Command Domain Extensions (PRD complete)
  - `--with` flag for all review commands to layer domain-specific criteria (#1269, #1263)
  - Applicability filtering for review domain extensions (#1271, #1263)
  - Extension error handling with graceful degradation (#1272, #1263)
  - Discoverability tips suggesting available domain extensions (#1270, #1263)
  - `review-extensions.json` registry with 6 domain extensions (#1268)
  - 6 review criteria files under IDPF-Testing/review-criteria: accessibility, chaos, contract-testing, performance, qa-automation, security (#1267)
- **#1265** - Rename IDPF-Testing-Core to IDPF-Testing
  - All cross-references updated (#1266)
  - Gap analysis updated to include IDPF-Testing (#1273, #1264)
  - Documentation and .min-mirror rebuilt (#1274, #1264)
- **#1260** - `/review-test-plan` command for test plan review against its PRD
- **#1257** - `/resolve-review` command for structured resolution of review findings
- **#1255** - `/gap-analysis` rewritten to output proposal documents, expanded to 12 analysis areas
- **#1258** - Approved test plan for Review Command Domain Extensions

### Changed
- Deployment chain sync: 7 commands added to legacy installer manifest, 3 metadata registries reconciled between constants.js and framework-manifest.json
- New document: IDPF-Agile-Is-Not-Vibe-Coding.md

### Documentation
- Project documentation: workflow guide, friction philosophy, context essay, todo rationale
- Backlog created from PRD Review Command Domain Extensions

---

## [0.39.0] - 2026-02-08

### Added
- **#1238** - Script-Driven Extensions CLI (PRD complete)
  - `extensions-cli.js`: Node.js CLI with 6 subcommands (list, view, validate, matrix, recipes, help) for extension point management (#1244, #1245, #1246, #1247, #1248, #1249)
  - Thin dispatcher pattern: `/extensions` command spec delegates read-only subcommands to script, keeping only `edit` as spec-driven (#1250)
  - Deployed `extensions-cli.js` to Templates and updated manifests for distribution pipeline (#1252)
- **#1242** - Remove `hasContent` from extension registry output (schema simplification)

### Fixed
- **#1234** - `install-hub.js` not deploying `.claude/metadata/` to hub
  - Root cause: `setupClaudeStructure` copied metadata from target to itself (self-referential)
  - Fix: Added `sourcePath` parameter so metadata comes from source repo
  - Added `require.main` guard for testability and 6 new tests

### Changed
- **#1252** - Cleaned up unused variables across scripts (`catch (e)` → `catch (_e)`)

---

## [0.38.0] - 2026-02-07

### Added
- **#1186** - Slash Command Workflow Triggers (PRD complete)
  - `/work` command spec: validates issues, branch assignment, auto-TODO extraction, framework methodology dispatch, AC verification, and STOP boundary enforcement (#1193, #1194, #1195, #1196)
  - `/done` command spec: criteria verification, design decisions documentation, in_review→done transition (#1197, #1199, #1200, #1201)
  - `/bug`, `/enhancement`, `/proposal` command specs: standardized issue creation with templates and hook routing (#1190)
  - `/review-issue`, `/review-proposal`, `/review-prd` command specs: type-specific review criteria with metadata tracking (#1191)
  - `workflow-trigger.js` hook: routes trigger words (`work #N`, `done`, `bug:`, etc.) to slash commands via `[INVOKE:]` signals
  - Status transition ownership: `/work` owns in_progress→in_review, `/done` owns in_review→done (#1217, #1218)
  - Per-sub-issue STOP boundary enforcement in epic processing (#1217)
- **#1214** - Self-hosted command processing for `/minimize-files`
  - `commands-only` subcommand for targeted command minimization
  - Dual output: distribution (FRAMEWORK-ONLY stripped) + self-hosted (preserved in-place)
- **#1221** - Extension point registry with build script and `/extensions` update
  - Auto-generated `extension-points.json` from command specs
  - Staleness detection in test suite
- **#1230** - Manifest-driven script sync validation
  - `validate-helpers.js` validates scripts/hooks sync between installed and Templates
  - Uses `framework-manifest.json` as authority for expected files

### Changed
- **#1226** - Remove duplicate and verbose sections from GitHub-Workflow.md
  - Eliminated inline `/work` logic, `/done` logic, trigger routing from Reference file
  - Reduced rules file size while preserving all functional requirements
  - Cascaded changes to minimized files and rules
- **#1215** - Minimize commands via `/minimize-files commands-only`

### Fixed
- **#1183** - `/prepare-release` pre-check uses invalid `--json` field `status` for `gh pmu list`
  - Added guidance note: do not add `--json` to incomplete issues check
- **#1216** - Clean up stale commands and fix framework detection in `workflow-trigger.js`

---

## [0.37.2] - 2026-02-06

### Fixed
- **#937** - Rename Release terminology to Branch in assign-branch script
  - Renamed all functions: `assignToRelease` → `assignToBranch`, `assignSubIssuesToRelease` → `assignSubIssuesToBranch`
  - Renamed parameters, variables, and console output (Release → Branch)
  - Fixed generic branch detection: accepts any `{prefix}/{name}` format instead of only `release/`, `patch/`, `hotfix/`
  - Updated command spec: `NO_RELEASE_FOUND` → `NO_BRANCH_FOUND`
  - Added 19 new tests covering branch detection, function renames, and edge cases (51 total)

---

## [0.37.1] - 2026-02-05

### Fixed
- **#1167** - Remove unused `Construction/Sprint-Retros/` directory from `/charter`
- **#1172** - Fix `/extensions` command not properly minimized (69% reduction achieved)

### Changed
- **#1168** - Remove sprint terminology from IDPF-Agile framework
  - Replaced "Sprint-based development" with "Story-based development with TDD"
  - Updated workflow: Story Selection → Story Development → Story Review → Done
  - Removed sprint-related options from `/transfer-issue` and `/switch-branch` commands
  - Cleaned up sprint references from shared scripts

---

## [0.37.0] - 2026-02-05

### Added
- **#1146** - `/add-story` now automatically updates PRD tracker and document
  - Updates 4 locations in PRD tracker issue body: Backlog Summary count, epic table row, Epics section count, Total line
  - Updates PRD document file with new story section under epic's User Stories heading
  - Includes sequential story numbering (Epic.N) and `**Issue:** #N` traceability link
  - Handles both existing epics and new epic creation scenarios
  - Graceful handling when PRD tracker or document not found

- **#1165** - Single Source of Truth for Test Strategy
  - `Tech-Stack.md` owns language/runtime/dependencies
  - `Test-Strategy.md` owns test framework, coverage targets, and TDD philosophy
  - `/charter` removes test framework from Tech-Stack.md secondary artifact
  - `/create-prd` parameterizes test plan from Test-Strategy.md
  - `/create-backlog` reads test config from Test-Strategy.md
  - `/add-story` references Test-Strategy.md for test requirements

### Fixed
- **#1164** - Session startup sequential execution on Windows
  - Added Windows shell note to run startup checks sequentially, not in parallel
  - Prevents "Sibling tool call errored" cascading failures
  - References Windows shell safety rules for context

### Removed
- **#1166** - Removed `/emergency-bug` command
  - Redundant with `bug:` workflow trigger and future `/bug` command (#1080)
  - Simplifies bug creation to one canonical path
  - Removed from: `.claude/commands/`, `framework-manifest.json`, `install/lib/constants.js`
  - Removed documentation from: `IDPF-Agile/Agile-Commands.md`, `Reference/GitHub-Workflow.md`

---

## [0.36.3] - 2026-02-04

### Fixed
- **#1161** - Simplify `/install-skill` to hub model only
  - Removed self-hosted and standalone model complexity
  - Single model: Hub Model (registry + projectSkills)
  - Status values: "Enabled" (in projectSkills) or "Available" (in registry)
  - Footer now correctly shows "Enabled (in projectSkills): N"

---

## [0.36.2] - 2026-02-04

### Removed
- **#1157** - Removed duplicate `create-prd` skill (consolidated into command)
  - `create-prd` existed in both `Skills/` and `.claude/commands/`
  - Skill removed; PRD creation handled by `/create-prd` command
  - Skill count: 24 → 23

- **#1159** - Removed `uml-generation` skill (superseded by PRD Diagram Generation Enhancement)
  - UML generation capabilities planned via Mermaid integration in PRD workflow
  - Skill count: 24 → 23

### Fixed
- **#1156** - `/install-skill --list` now properly reflects hub model skill availability
  - Detects hub model via symlink check (`test -L .claude/skills`)
  - Hub status values: "Enabled" (in projectSkills), "Available (hub)" (accessible via symlink)
  - Hub counts show "Available via hub: N" and "Enabled (in projectSkills): N"

---

## [0.36.1] - 2026-02-04

### Fixed
- **#1152** - `/install-skill` command now recognizes hub symlink skill delivery
  - Detects if `.claude/skills/` is a symlink (hub model)
  - Hub model: verifies skill exists and updates `projectSkills` without extraction
  - Standalone model: unchanged, uses existing extraction logic
  - Added hub-specific documentation, examples, and edge cases

### Added
- **#1153** - Hub installers now add TDD skills to `projectSkills` by default
  - `install-project-new.js` creates `framework-config.json` with TDD skills
  - `install-project-existing.js` creates or merges TDD skills with existing config
  - TDD skills: `tdd-red-phase`, `tdd-green-phase`, `tdd-refactor-phase`, `tdd-failure-recovery`
  - Story templates now show TDD skills under "Relevant Skills" for all hub projects

---

## [0.36.0] - 2026-02-04

### Added
- **#1143** - Hub Installer Hybrid Architecture
  - Extensible commands (marked `<!-- EXTENSIBLE -->`) are now copied to projects instead of symlinked
  - Enables per-project customization of extension points without modifying shared hub
  - FRAMEWORK-ONLY content stripped during copy to user projects
  - Existing project extensions preserved on hub reinstall (merge, don't overwrite)
  - Non-extensible content (rules, hooks, scripts, metadata, skills) remains symlinked for auto-updates

- **#1145** - User Extension Directories
  - Creates `.claude/extensions/` directory for general extension scripts
  - Creates `.claude/scripts/{command}/` directories for 14 extensible commands:
    - Existing: `create-branch`, `prepare-release`, `prepare-beta`, `merge-branch`, `destroy-branch`, `create-prd`
    - New (per #1080): `work`, `done`, `bug`, `enhancement`, `proposal`, `review-proposal`, `review-prd`, `review-issue`
  - All directories include `.gitkeep` for git tracking
  - Project-owned (not symlinked), survives hub reinstalls

### Changed
- **Deployment-Awareness.md** - Added Hub Architecture documentation explaining hybrid model
- **Slash-Command-Workflow-Triggers.md** - Added Extension Points Specification (~200 lines)

---

## [0.35.6] - 2026-02-03

### Fixed
- **#1139** - TDD skills not installed for new or existing projects
  - Hub installer now extracts all 25 skills from `Skills/Packaged/*.zip` to `.claude/skills/`
  - Project installers create symlink from project `.claude/skills` to hub skills directory
  - All skills (including TDD) now accessible to projects via hub symlink

- **#1141** - Project symlinked directories should be in .gitignore
  - Project installers now auto-update `.gitignore` with 10 entries
  - Excludes: `.claude/commands`, `.claude/hooks`, `.claude/metadata`, `.claude/rules`, `.claude/scripts/shared`, `.claude/skills`
  - Also excludes launcher scripts: `run_claude.cmd`, `run_claude.sh`, `runp_claude.cmd`, `runp_claude.sh`
  - Idempotent: won't duplicate entries on reinstall

---

## [0.35.5] - 2026-02-03

### Fixed
- **#1133** - Version scripts fail parsing branch names as version tags
  - `analyze-commits.js` and `recommend-version.js` now filter for semantic version tags (`v*`)
  - Ignores branch names like `idpf/0.35.3` that could be mistaken for tags

- **#1134** - minimize-helper.js 'minimize' command not found
  - Added helpful error message explaining minimization is done by Claude via `/minimize-files`
  - Helper provides utilities only (scope, orphans, reset, copy-as-is)

- **#1136** - Project missing .claude/metadata symlink to hub
  - Projects now include metadata symlink for skill-registry.json and extension-recipes.json access

---

## [0.35.4] - 2026-02-03

### Fixed
- **#1129** - Hub missing .claude/ structure for project symlinks
  - Hub now creates complete `.claude/` structure: commands, hooks, rules, scripts/shared
  - Hub copies from `Templates/` to `.claude/` (not symlinks) to avoid symlink chains
  - Project installers create all 4 symlinks plus platform-specific launcher scripts
  - Rules generated from Assistant/ and Reference/ source files (6 rules total)

- **Deployment** - Release notes using auto-generated format instead of CHANGELOG
  - Updated `deploy-dist.yml` to use `update-release-notes.js` directly
  - Ensures consistent formatted release notes from CHANGELOG.md

---

## [0.35.3] - 2026-02-02

### Fixed
- **#1124** - Hub installers GitHub setup inconsistent with install.js
  - Refactored `install-project-new.js` and `install-project-existing.js` to use integrated GitHub flow
  - Single prompt for GitHub integration instead of fragmented prompts
  - Matches install.js pattern: git init → commit → create repo → project board → .gh-pmu.yml
  - Added helper functions: `checkGitRemote()`, `checkGhCliPrerequisites()`, `createGitHubRepo()`, etc.

---

## [0.35.2] - 2026-02-02

### Fixed
- **#1121** - Hub installers show only 8 of 22 domain specialists
  - Added `readDomainSpecialists(hubPath)` function to read from `framework-manifest.json`
  - Removed hardcoded `DOMAIN_SPECIALISTS` array from both installer scripts
  - Fallback handling for missing or malformed manifest files

---

## [0.35.1] - 2026-02-02

### Fixed
- **Deployment** - Central Hub Architecture installers not deployed to -dist
  - Added `install-hub.js`, `install-project-new.js`, `install-project-existing.js` to `deploy-dist.yml`
  - Users can now access hub installers via the distribution repository

---

## [0.35.0] - 2026-02-02

### Added
- **#1100** - Central Hub Architecture for multi-project management
  - New `install-hub.js` - Creates central IDPF installation from -dist repository
  - New `install-project-new.js` - Creates new projects with full IDPF integration
  - New `install-project-existing.js` - Adds IDPF to existing codebases
  - Projects use symlinks/junctions to access hub framework files (no file duplication)
  - Interactive configuration: framework selection, domain specialist, git setup
  - GitHub integration via `gh pmu init` for project management
  - Project registry in hub's `.projects/projects.json`
  - Minimal project footprint: ~2.5KB config + symlinks vs ~500KB+ embedded

### Changed
- **#959** - Archived canceled Hook Library Architecture PRD
  - PRD moved to `PRD/Canceled/` directory
  - Related proposals organized into ParkingLot

### Documentation
- Added Central Hub Architecture proposal and PRD with 14 user stories (3 epics)

---

## [0.34.2] - 2026-01-29

### Fixed
- **#1059** - Skills retain v0.51.0 placeholder after packaging
  - Added version substitution to `/minimize-files` Step 5 (sed replacement during packaging)
  - Added MAINTENANCE.md auto-generation to `/minimize-files` Step 6
  - Added v0.51.0 detection check to `/skill-validate` (Check 2.6)
  - Fixed `validate-helpers.js` to validate against actual directories (removed hardcoded values)
  - All 25 skill packages now contain actual version numbers

- **#1092** - Standardize skill version format to YAML frontmatter
  - Updated all 25 skill source files to use `version: "v0.51.0"` in YAML frontmatter
  - Removed `**Version:**` lines from skill bodies
  - Fixed 2 malformed skills (anti-pattern-analysis, uml-generation) with proper frontmatter structure
  - All skills now have consistent frontmatter: `name`, `description`, `version`, `license`

### Changed
- **#1088** - Document Write tool read-before-write safety for lifecycle templates
  - Moved lifecycle directory creation from installer to `/charter` command
  - Removed `Templates/Lifecycle/` directory (16 files)
  - Updated `/charter` command to create lifecycle directories on demand

---

## [0.34.1] - 2026-01-28

### Removed
- **#1082** - Rolled back Test Automation Foundation (PRD #1053)
  - Removed all installer CLI flags (`--help`, `--version`, `--with-tests`)
  - Removed test directory structure (`Construction/Test-Automation/`)
  - Removed E2E infrastructure (Agent SDK integration, test helpers)
  - Removed 113 tests added in v0.34.0 (back to 488 tests)
  - Moved 3 Test Automation proposals to `Proposal/ParkingLot/`
  - PRD status set to Rolled Back

### Changed
- **#1079** - `/create-backlog` now delegates to `/add-story` template (reference-and-extend pattern)
  - Atomic template marker added to `/add-story` as canonical source
  - Eliminates template duplication between commands

### Documentation
- Added proposal: Slash Command Workflow Triggers

---

## [0.33.3] - 2026-01-27

### Added
- **#1056** - Analysis mode detection guardrails for workflow-trigger hook
  - Detects analysis keywords (evaluate, analyze, assess, review, investigate, check, verify) + issue references
  - Injects STOP reminder to prevent accidental side effects during analysis
  - 14 new tests for analysis mode detection logic

### Fixed
- **#1057** - Orphan detection false positives for path-remapped files
  - `minimize-helper.js orphans` now correctly handles `.claude/commands/` → `Templates/commands/` remapping
  - Files in remapped directories no longer reported as orphans
  - 3 new integration tests for orphan detection

### Documentation
- Split Test Automation Distribution proposal into three focused parts
- Added PRD for Test Automation Foundation

---

## [0.33.2] - 2026-01-26

### Added
- **#1046** - Test Automation Distribution proposal
  - Comprehensive E2E testing framework specification for distributed test packages
  - Supports Release Tests (version-specific) and Comprehensive Tests (regression suite)
  - Utilizes Claude Agent SDK (`@anthropic-ai/claude-agent-sdk@^0.1.55`) for test invocation
  - Golden file comparisons with `--update-golden` flag support
  - Zod schema validation with custom Jest matchers
  - Generated fixture templates synchronized with framework updates
  - Manifest-based test discovery with glob fallback
  - selfHosted detection prevents running in framework repository
- **#1047** - Scope integrity rules added to anti-hallucination guidelines
  - Enforces preservation of Medium+ priority requirements during minimization
  - Prevents content reduction that would remove acceptance criteria
  - Added to both PRD work and software development rulesets

### Fixed
- CI workflow coverage artifact upload removed (was causing intermittent failures)
- Coverage job now non-blocking with reduced artifact retention

### Documentation
- Added v0.33.1 test plan

---

## [0.33.1] - 2026-01-26

### Added
- **#1038** - Consolidated "Session Initialized" display block
  - Standardized startup output format with all session fields
  - Date only appears in the status block
  - Shows Repository, Branch, Process Framework, Framework Version, Active Role, Charter Status, GitHub Workflow
- **#1039** - Charter is now mandatory for all user projects
  - Removed opt-out mechanism (`.no-charter` file no longer respected)
  - Charter creation automatically triggers on startup if missing
- **#1036** - Minimized framework anti-hallucination rules
  - Reduced token usage by ~69% (425 → 132 lines)
  - Preserved all functional instructions

### Fixed
- **#1042** - Added guidance for setting default repository after project creation
  - Installer now shows clear instructions
  - GitHub-Workflow.md documents the requirement
- README.md skill count corrected (23 → 25)
- minimize-config.json - removed incorrect exclusion of Deployment-Awareness.md

### Documentation
- Added v0.33.0 test plan

---

## [0.33.0] - 2026-01-25

### Added
- **#1033** - Extension recipe suggestions in `/charter` command
  - After skill selection, suggests relevant extension recipes based on tech stack
  - New `recipe-tech-mapping.json` metadata file (20 tech indicators → recipes)
  - Triggers on create, update (Tech Stack changes), and refresh workflows
  - Opt-out via `extensionSuggestions: false` in framework-config.json
- **#1031** - Epic creation option in `/add-story` command
  - When no epics exist, offers "Create new epic" option
  - Creates minimal epic with charter compliance check
  - Assigns epic to current branch if active
- **#1032** - Skill suggestions in `/create-backlog` and `/add-story` commands
  - New `skill-keywords.json` metadata file (25 skills with keyword mappings)
  - Matches story content against keywords to suggest relevant skills
  - Opt-out via `skillSuggestions: false` in framework-config.json
- **#1026** - Test plan generator extension recipe
  - New `test-plan-generator` recipe in testing category
  - Generates test plan skeleton from branch issues
  - Extracts acceptance criteria as expected results
- **#1027** - Skill deployment via `/charter` and new `/install-skill` command
  - Skills can now be installed from framework packages
  - Charter workflow deploys selected skills automatically

### Changed
- **#1009** - Eliminated microsprints from framework
  - Removed microsprint-specific documentation
  - Replaced with planning approaches guide
- **#1022** - Improved argument-hints in command YAML headers
  - Better examples and formatting for command arguments

### Fixed
- **#1034** - Temp file naming collision prevention
  - Changed from `.tmp-body.md` to `.tmp-{issue#}.md` pattern
  - Prevents conflicts when working on multiple issues
- **#1028** - `/playwright-check` handles missing package.json
  - Now reads charter for tech stack detection
  - Graceful fallback when package.json doesn't exist
- **#1030** - skill-registry.json names match package names
  - Registry entries now consistent with skill package names
- **#1025** - Charter startup detects framework files as code on new installs
  - Fixed false positive detection during initial installation

---

## [0.32.1] - 2026-01-24

### Fixed
- **#1017** - `playwright-check` command now deploys to user projects
  - Added to `deployCoreCommands()` hardcoded array in deployment.js
  - Command was missing from core commands deployment

### Changed
- **#1019** - Standardized JS versioning with `@framework-script` tag
  - All 52 framework JS files now use `@framework-script v0.51.0` pattern
  - Added regression test to catch future non-compliant JS files
  - Replaces inconsistent `// **Version:** X.X.X` comments
- Updated skill counts in documentation (22 → 25)
  - Framework-Overview.md, Framework-Summary.md, Framework-Skills.md
  - Added missing skills: codebase-analysis, playwright-setup, electron-development

---

## [0.32.0] - 2026-01-24

### Added
- **#1013** - Metadata files now deployed to user projects
  - `skill-registry.json` enables programmatic skill discovery at inception time
  - `extension-recipes.json` provides reusable automation patterns for extensible commands
  - New `deployMetadataFiles()` function in deployment.js
  - Added deployment step to deploy-dist.yml for distribution
- **New Skill: electron-development** - Patterns for Electron app development
  - Electron Forge + Vite configuration
  - Playwright E2E testing for Electron (fuses, packaged app testing)
  - Windows platform considerations (process management, path handling)
  - 12 resource guides covering IPC, settings persistence, update checking
- **Pre-commit extension point** for `/prepare-release` and `/prepare-beta`
  - Allows generating release artifacts before the preparation commit

### Changed
- **Scripts reorganization** - Consolidated command sources
  - Commands now sourced from `.claude/commands/` directly (not `Templates/commands/`)
  - Path remapping in minimize-config.json handles deployment
  - Simplified maintenance with single source location
- **framework-manifest.json** - Added `source` field to `deploymentFiles.commands`
- **validate-helpers.js** - Updated to check correct paths after reorganization

### Fixed
- **#1013** - Metadata files (skill-registry.json, extension-recipes.json) not deployed
- **Windows shell safety** - Documented `--flag=value` syntax for problematic flag parsing

### Removed
- `Templates/commands/` directory - Commands now in `.claude/commands/` with path remapping
- Orphaned `promote-to-prd.zip` package

---

## [0.31.0] - 2026-01-23

### Added
- **#991** - PRD tracker lifecycle improvements
  - New `/complete-prd` command to verify all epics/stories are Done before closing PRD tracker
  - `/create-backlog` now moves PRD to "In Progress" (not "Done") after backlog creation
  - Instruction banner added to PRD tracker with `/complete-prd` guidance
  - PRD Tracker reference added to epic body for linking
  - `/add-story` and `/split-story` now comment on PRD tracker for scope changes
- **#993** - Comprehensive deployment chain validation in `/prepare-release`
  - New Phase 2m validates all deployable files are synchronized
  - Validates commands (source, minimized, constants.js), scripts, and hooks
  - Bidirectional validation catches orphaned entries

### Fixed
- **#989** - `/create-backlog` now uses `gh pmu create` for proper project assignment
- **#992** - `/assign-branch --all` now handles flexible branch field names (Branch/Release)

---

## [0.30.2] - 2026-01-22

### Fixed
- **#985** - fetch-updates.js version verification fails on Windows
  - Added `flushFile()` function with `fs.fsyncSync()` to force OS flush before verification
  - Fixes Windows file system write-back caching issue where `copyFileSync` returns before data is persisted

---

## [0.30.1] - 2026-01-22

### Added
- **#785** - Manual verification extraction workflow
  - New labels: `qa-required`, `security-required`, `legal-required`, `docs-required`
  - Workflow for extracting criteria requiring manual verification to linked issues
  - Updated `Reference/GitHub-Workflow.md` with extraction process

### Fixed
- **#978** - Installer crash on script deployment key access
- **#977** - Prepare-release Step 5.1 now adds deployment comment instead of redundant close
- **#981** - Removed unnecessary PRD #959 implementation (todos persist natively)
  - Deleted hook files: `track-todo-progress.js`, `compact-hook.js`, `pre-todo-test.js`
  - Removed installer code for todo hooks deployment
  - Cleaned up settings.local.json hook configurations

---

## [0.30.0] - 2026-01-22

### Added
- **#962, #963** - TodoList Compaction Persistence feature (removed in v0.30.1 - todos persist natively)
  - `track-todo-progress.js`: PostToolUse hook captures last completed todo on every TodoWrite
  - `compact-hook.js`: SessionStart hook outputs `[TODO-RESUME]` block after compaction
  - `06-todo-resume.md`: Rule for Claude to recognize and auto-resume from saved state
  - Auto-installation via `deployment.js` and `generation.js` for new IDPF projects
  - 47 new tests for hooks (track-todo-progress: 25, compact-hook: 22)
- **#950** - Dynamic todo generation directive for extensible commands
  - Commands can now specify todo generation rules in their specs
  - Enables automatic TodoWrite list creation from command phases

### Changed
- **#959** - Added PRD for TodoList Compaction Persistence
- Moved CI wait and release notes from user extension to core steps in `/prepare-release`

### Fixed
- **#951** - Replace hardcoded versions with `v0.51.0` placeholder
- **#956** - Clarify proposal acceptance criteria placement in documentation
- `gh pmu sub list --json` flag usage (boolean flag, not field selector)
- Workflow scripts: explicit JSON fields and safe parsing
- `INSTALLED_FILES_MANIFEST`: Added todo hooks and synced workflow-trigger.js

---

## [0.29.3] - 2026-01-21

### Fixed
- **#946** - workflow-trigger.js batch work detection and broader patterns
  - Fixed JSON parsing to extract `items` array from `gh pmu list` response
  - Broadened "work" trigger to match any `^work\s` prompt
  - Added support for natural patterns: `work on #N`, `work issue N`, `#N` anywhere
  - Silent exit for non-actionable prompts (no false positive noise)
  - Added 11 new tests for broader patterns and silent exit behavior
  - Bumped hook version to 0.21.0

---

## [0.29.2] - 2026-01-21

### Fixed
- **#936** - Release→Branch field migration in workflow-trigger.js
  - Updated field reference from `Release` to `Branch` in hook script
  - Aligns with v0.29.1 field rename in GitHub Project
- **#935** - Manifest key inconsistency (`lib` → `shared/lib`)
  - Renamed category in `framework-manifest.json` to match filesystem path
  - Updated `deployment.js` to use consistent category name
  - Fixes "Untracked - File not in manifest" audit errors for lib files
- **#933** - v0.51.0 tokens in 12 script files
  - Replaced hardcoded version numbers with `v0.51.0` placeholder
  - Enables automatic version stamping during deployment
  - Affected: analyze-commits.js, recommend-version.js, wait-for-ci.js, and 9 others
- **#934** - Audit scope detection for non-IDPF projects
  - Added `NOT_IDPF_PROJECT` status to audit.js
  - Early detection prevents false "missing file" errors in non-IDPF directories
  - Checks for `framework-config.json` and `.claude/.manifest.json`
- **#931** - Installer messaging for manual repo-project association
  - Added warning in `displayGitHubSetupSuccess()` with manual step instruction
  - Added step to manual setup instructions in `index.js`
  - Addresses GitHub API limitation (cannot set default repository programmatically)

### Changed
- **#938** - Windows Shell Safety: Added backtick handling section
  - New "Issue/PR Bodies with Backticks" section in documentation
  - Documents `-F` temp file pattern for bodies with code blocks
  - Updated Reference/, .min-mirror/, and .claude/rules/ copies

### Removed
- **#939** - Removed orphaned `poll.js` from Templates and installed copies
  - File was never imported or used (dead code)
  - Removed from `framework-manifest.json` and `constants.js`

---

## [0.29.1] - 2026-01-20

### Added
- **#925** - INSTALLED_FILES_MANIFEST validation in `validate-helpers.js`
  - Validates rules, commands, and scripts against `framework-manifest.json`
  - Checks static files and conditional patterns (platform, feature flags)
  - Shows remediation commands with `--fix` flag

### Changed
- **#926** - Rename GitHub Project text field from `Release` to `Branch`
  - Field name change reflects semantic clarity: any branch can produce releases
  - `gh pmu release` deprecated in favor of `gh pmu branch`
  - `--release` flag deprecated in favor of `--branch`
  - Updated all scripts, commands, and documentation
  - Backwards compatible: old field/flag names work but show deprecation warnings

### Fixed
- **#923** - Race condition in `update-release-notes.js`
  - Added retry logic for GitHub Release API calls
  - Configurable retry attempts and delay for concurrent operations
  - Prevents "release not found" errors during rapid tag-and-release

---

## [0.29.0] - 2026-01-20

### Added
- **#918** - Auto-create todo list on work triggers
  - Extract acceptance criteria checkboxes from issue body
  - Detect epics and query sub-issues for todo items
  - Support batch work patterns (`work all in Ready`, `work all issues in sprint-5`)
  - Document auto-todo behavior in GitHub-Workflow.md
- **#917** - TodoWrite execution instructions for multi-step commands
  - Added to `/create-prd`, `/gap-analysis`, `/audit-hallucination`, `/minimize-files`
  - Ensures progress tracking and resumability after context compaction

### Changed
- **#916** - Remove deprecated "Check Open Releases" from session startup
  - Step 5 removed from Session-Startup-Instructions.md
  - Users can check branches on-demand with `/switch-branch`

### Fixed
- **#921** - `/assign-branch` argument parsing for quoted strings
  - Script now handles space-separated arguments passed as single string
  - Fixes `/assign-branch #915 #916 #917` not working
- **#919** - Update `workflow-trigger.js` to current hook output format
  - Use `hookSpecificOutput` format instead of deprecated hook spec
  - Remove deprecated `finding:` and `prd:` trigger words
- **#915** - Skip extension prompts in -dist repository
  - `fetch-updates.js` detects distribution repository and bypasses prompts

---

## [0.28.0] - 2026-01-20

### Added
- **#907** - New `/create-backlog` command with TDD test case integration
  - Accepts PRD issue number to generate epics and stories
  - Embeds test cases from approved Test Plan into story bodies
  - Tech stack detection for language-appropriate test syntax
  - Blocking gate requires test plan approval before backlog creation
- **#906** - TDD test plan generation in `/create-prd`
  - Automatically generates `Test-Plan-{name}.md` alongside PRD
  - Creates approval issue with review checklist
  - Blocks `/create-backlog` until test plan is approved
- **#910** - New `/add-story` and `/split-story` commands
  - Charter compliance checking for scope alignment
  - Automatic epic detection and story linking
  - Test plan update logic for new/split stories
- **#911** - New `/emergency-bug` and `/pivot` commands
  - `/emergency-bug` creates P0 issue with emergency label
  - `/pivot` reviews stories for direction changes (keep/archive/close)
- **#908** - Issue-driven mode for `/create-prd`
  - Accepts proposal issue number argument (`123` or `#123`)
  - Completes proposal lifecycle (moves to Implemented/, closes issue)
  - Creates PRD tracking issue with `prd` label
- **#913** - Todo list execution instructions for complex commands
  - Added to `/prepare-release`, `/prepare-beta`, `/merge-branch`
  - Ensures progress tracking and resumability after context compaction
- **#867** - Testing framework question in `/charter` inception flow
  - Triggers for testable project types, skipped for docs/config repos
  - Populates `Test-Strategy.md` and `Tech-Stack.md`
  - TDD philosophy stated as default per IDPF-Agile

### Changed
- **#911** - GitHub-Workflow.md now focused on rules/triggers only
  - Command references moved to self-contained slash commands
  - Agile-Commands.md updated to reference slash commands

### Removed
- **#909** - Redundant Story commands from documentation
  - Removed: Start-Story, Story-Status, Story-Complete, Refine-Story
  - Removed: Story-Growing, Estimate-Story, Story-Blocked, Archive-Story
  - Functionality covered by `gh pmu` commands and slash commands

### Fixed
- **#867** - Added TDD workflow constraint to `Constraints.md` generation

---

## [0.27.0] - 2026-01-19

### Added
- **#904** - Consolidated `framework-manifest.json` to single source of truth
  - Merged `Templates/framework-manifest.json` into root manifest
  - All deployment configuration now in one file under `deploymentFiles.scripts`
  - Eliminates sync issues between duplicate manifests
- **#868** - Pre-upgrade validation for extensible files in `fetch-updates.js`
  - Detects user modifications to extensible commands before overwriting
  - Validates USER-EXTENSION blocks are preserved
  - Prevents accidental loss of customizations during framework updates

### Fixed
- **#889** - Replaced deprecated `--release` flag with `--branch` in `assign-branch.js`
  - Updated to use current gh-pmu API before deprecation period ends
- **#900** - Fixed stale `frameworkVersion` in `framework-config.json`
  - Changed hardcoded version to `v0.51.0` placeholder
  - Added self-hosted config update step to `/prepare-release` Phase 3
- **#899** - Standardized GitHub release page formatting
  - `update-release-notes.js` now transforms CHANGELOG to formatted release pages
  - Includes title, release date, auto-generated summary, and comparison link
- Preserved blank lines around USER-EXTENSION tags in minimized templates
- Corrected `gh pmu branch start` flag from `--branch` to `--name`

### Changed
- **#823** - Added executable copy commands to Phase 2d rules build documentation
  - Clarified self-hosted only scope for rules directory build

---

## [0.26.3] - 2026-01-17

### Fixed
- **#896** - `/create-prd` command now installs correctly to target projects
  - Added `create-prd.md` to `framework-manifest.json` deployment configuration
  - Command was present in Templates but missing from the deployment manifest

---

## [0.26.2] - 2026-01-17

### Fixed
- **#893** - Added missing `create-prd` and `codebase-analysis` skill packages to `Skills/Packaged/`
  - Skills existed in source but were never minimized or packaged
  - Created `.min-mirror/Skills/` directory structure for skill minimization
  - Removed orphaned `promote-to-prd.zip` package (no source directory)
- **#865** - Removed deprecated `PRD-Analyst` specialist
  - Functionality replaced by `/create-prd` skill in v0.24
  - Updated domain specialist count from 23 to 22 across all documentation
  - Cleaned up references in manifest, installer, and documentation files

---

## [0.26.1] - 2026-01-17

### Fixed
- **#887** - `framework-manifest.json` now uses `v0.51.0` placeholder for proper version injection during deployment
  - Root cause of `fetch-updates.js` version verification failures on Windows

---

## [0.26.0] - 2026-01-15

### Added
- **#882** - `/prepare-release` auto-creates release branch when run from main
  - Analyzes commits and recommends version
  - Prompts for confirmation before creating branch
  - Supports `--dry-run` to preview branch creation

### Fixed
- **#882** - Restored release artifact generation in `/prepare-release`
- **#882** - `/extensions` now scans `.claude/commands/` for user customizations
- **#882** - Removed redundant `list-cmds` alias from `workflow-trigger.js`
- **#882** - Removed unused Step 6 from `/create-branch`

### Documentation
- Clarified branch semantics - any branch can produce releases

---

## [0.25.0] - 2026-01-14

### Added
- **#877** - New `audit.js` script for framework installation auditing
  - Detects modified, outdated, untracked, and missing files across installations
  - Validates `userScripts` entries in `framework-config.json`
  - Interactive `--fix` mode for cleaning up orphaned references
  - 24 unit tests covering all audit functionality
- Extended installer manifest tracking to include commands, rules, and hooks checksums (not just scripts)

### Fixed
- **#875** - Restored framework scripts deployment and synced release tooling

---

## [0.24.1] - 2026-01-13

### Fixed
- **#861** - `fetch-updates.js` now verifies version after update and reports errors for locked files
- **#860** - Removed obsolete commands from `workflow-trigger.js` help text (synced with v0.19.1 removals)
- **#859** - `/prepare-release` now closes branch tracker before switching to main (fixes "no active branch" error)
- **#820** - Closed as duplicate of #859

### Added
- **#824** - Slash command preference rule in GitHub Workflow documentation
- **#822** - Multi-issue syntax documentation for `gh pmu move` command

---

## [0.24.0] - 2026-01-12

### Added
- **#832** - New `/create-prd` command with full and extract modes
  - EXTENSIBLE markers for user customization
  - Integrates with `codebase-analysis` skill for extraction
- **#835** - UML diagram generation improvements
  - Diagram type selection (sequence, class, state, ER)
  - Appropriateness guidance for each diagram type
  - Anti-hallucination rules for diagram content
- **#844** - New `codebase-analysis` shared skill
  - Tech stack detection, architecture inference
  - NFR detection and test parsing guides
- **#851** - Automated testing infrastructure for installer
  - 59 tests in `install/test/` directory
  - Tag parsing, migrations, and skill deployment tests

### Changed
- **#826** - Skill renamed: `promote-to-prd` → `create-prd`
  - Enhanced Phase 4 with mandatory user/priority questions
  - Added Phase 4.5 for story transformation
  - Priority distribution validation for generated backlogs
- **#847** - Tag format standardization
  - Commands now use versionless `<!-- EXTENSIBLE -->` / `<!-- MANAGED -->`
  - Frontmatter uses `v0.51.0` placeholder instead of hardcoded versions
  - Installer regex updated for backward compatibility
- **#840** - PRD directory structure: `PRD/Active/` and `PRD/Implemented/`
- **#821** - README-DIST.md now uses `v0.51.0` placeholder

### Removed
- **#842** - Deprecated IDPF-PRD framework removed
  - Functionality replaced by `create-prd` skill and `/create-prd` command
  - Migration automatically removes `IDPF-PRD/` directory on upgrade

### Fixed
- **#857** - Removed non-existent `verify-config.js` references from `/prepare-release` and `/prepare-beta`

---

## [0.23.4] - 2026-01-11

### Fixed
- **#816** - Script deployment paths not deploying any scripts to user projects
  - Fixed incorrect paths in `deployment.js` (`scripts/shared/` → `Templates/scripts/shared/`)
  - Updated `constants.js` INSTALLED_FILES_MANIFEST for correct cleanup paths
- **#815** - Command template requirements causing confusion and failures
  - Removed incorrect branch naming validation from `/create-branch`
  - Fixed deprecated `gh pmu release start --branch` → `gh pmu branch start --name`
  - Removed release branch requirement from `/prepare-release`
- **#814** - Deploy-dist workflow missing `contents: write` permission for releases
- **#796** - `/assign-branch` not handling space-separated arguments correctly
- **#811** - Help text reorganized to show `--add-ready` first

### Added
- **#812** - Manifest-driven deployment for workflow commands
  - Commands now read from `framework-manifest.json` instead of hardcoded list
  - Added `readFrameworkManifest()` and `getDeploymentConfig()` helper functions
  - Single source of truth for deployment file configuration

### Changed
- **#818** - Post-release verification items tracked for v0.24.0

---

## [0.23.3] - 2026-01-11

### Fixed
- **#793** - `/create-branch` Step 7 shows `/assign-branch` instead of raw `gh pmu` command
- **#804** - ESLint warnings reduced with `caughtErrorsIgnorePattern` configuration
- **#805** - GitHub Release automation added to `deploy-dist.yml`
- **#807** - `extensions.md` command now deployed to user projects
- **#808** - `/create-branch` minimized template sync fixed

### Added
- **#806** - Pattern-based charter exclusions for framework files
- **#810** - Deployment file documentation centralized in manifests with validation functions

---

## [0.23.2] - 2026-01-11

### Added
- **#799** - Auto-run unit tests after JS file CRUD operations
  - New `test-on-change.js` PostToolUse hook
  - Runs tests when Edit/Write modifies JS files in `.claude/scripts/` or `.claude/hooks/`
  - Framework-only (not distributed to user projects)

### Fixed
- **#802** - Add missing System-Instructions subdirectories to .min-mirror
- Command template sync between `.claude/commands/` and `Templates/commands/`
- Rules directory rebuild from minimized sources

### Changed
- **#776** - Updated assign-branch.js with improvements
- Minimization timestamp updated

---

## [0.23.1] - 2026-01-10

### Fixed
- **#776** - Integrate REQ-007, REQ-008, REQ-009 into installer
  - `createExtensibilityStructure()` now called during install
  - `deployFrameworkScripts()` deploys framework scripts with checksum tracking
  - `cleanupRenamedCommands()` removes old command files (open-release, close-release, etc.)
- **#778** - Fix deployment of framework-only files and Skills redundancy
- **#779** - Fix missing GitHub Releases and version placeholder
- **#784** - Fix stale command references in .min-mirror
  - Updated extensions.md with correct command names
  - Updated prepare-beta.md with correct script paths

### Documentation
- **#781** - Update GitHub-Workflow.md for gh-pmu v0.11.0

### Internal
- **#782** - Add minimize-config.json validation and drift detection

---

## [0.23.0] - 2026-01-09

### Changed
- **Release Command Consolidation** (#751) - Complete overhaul of release workflow commands:
  - Renamed `/open-release` → `/create-branch` - Unified branch creation for releases and patches
  - Renamed `/assign-release` → `/assign-branch` - Works with any tracked branch
  - Renamed `/switch-release` → `/switch-branch` - Context switching for branches
  - Removed `/close-release` - Folded into `/prepare-release` Phase 5
  - Tracker issue naming now uses "Branch:" prefix with unified `branch` label

### Added
- **`/merge-branch` command** (#755) - Merge feature branches to main with gated validation
  - Default gates: uncommitted changes, tests pass
  - Extensible gates for custom validation
  - PR creation, approval wait, and cleanup
- **`/destroy-branch` command** (#756) - Safe branch deletion with validation
  - Prevents deletion of protected branches (main, master, develop)
  - Force delete option for emergency cleanup

### Fixed
- **Session-Startup version chain** - Consistent version flow from source → minimized → rules
- **Anti-hallucination rules** - Added STOP boundary enforcement, expanded "Never Invent" list

### Infrastructure
- **minimize-config.json** - Removed overly broad "Merge" pattern that excluded merge-branch.md
- **Rules rebuild from minimized sources** - All rules now use v0.51.0 placeholder

---

## [0.22.0] - 2026-01-06

### Added
- **`/extensions` command** (#734) - New command for managing extensible regions in command templates
  - List all extensible regions across commands
  - Add/remove custom extensions to command checklists
  - View extension configuration

### Changed
- **Extensible Summary Checklists** - Four commands now support user-defined checklist extensions:
  - `/open-release` (#730) - Custom validation steps when opening releases
  - `/prepare-release` (#731) - Custom pre-release checks
  - `/close-release` (#732) - Custom verification steps when closing releases
  - `/prepare-beta` (#733) - Custom beta preparation steps

### Infrastructure
- **Templates/ minimization pipeline** (#735) - Templates directory now included in minimization for token optimization

---
## [0.21.1] - 2026-01-05

### Fixed
- **PROCESS_FRAMEWORKS validation** (#696) - Now correctly excludes IDPF-PRD from process framework count
- **minimize-config.json path** - Fixed path resolution in validate-helpers.js

### Changed
- **Windows Shell Safety** (#693) - Expanded documentation to cover command substitution failures in loops
- **GitHub Workflow docs** (#714) - Prefer `--body-stdout` over `--body-file` pattern
- **gh-pmu v0.10.1 features** (#729) - Updated command reference with `comment`, `--body-stdin`, `-R`, batch `move`
- **/prepare-release workflow** (#692) - Added explicit STOP boundary section
- **/open-release workflow** (#719) - Now pushes branch to remote after creation

### Added
- **Post-deployment criteria workflow** (#725) - Documented workflow for acceptance criteria requiring deployment
- **install.js --debug flag** (#727) - EXTENSIBLE region logging for troubleshooting
- **README.md version updates** (#718) - Included in /prepare-release Phase 3
- **.gitattributes** - Consistent line endings across platforms

### Removed
- **version-header-fix.js** - Superseded by extensibility system

### Internal
- Integrated extensibility.js into deployment workflow
- Lowered coverage thresholds to match actual coverage
- Restored v0.51.0 placeholders to 209 framework source files

---

## [0.21.0] - 2026-01-05

### Added
- **Unit Testing Infrastructure** (#698) - Jest v29.7.0 test framework with v8 coverage provider
  - `jest.config.js` with coverage thresholds (70% statements, 60% branches)
  - Centralized `/tests` directory structure
  - Test fixtures for configs, changelogs, git logs
  - Mock factories for dynamic test data generation
  - Mock exec utilities for child_process mocking
- **CI Pipeline** (#699) - GitHub Actions workflow for automated testing
  - `.github/workflows/test.yml` runs on all branches/PRs
  - Coverage artifacts uploaded and retained for 30 days
- **Test Coverage** (#700) - 163 tests across 14 test suites covering 20 source files
  - P0 tests: workflow-trigger, validate-helpers, assign-release, recommend-version
  - P1 tests: minimize-helper, version-header-fix, analyze-commits, update-release-notes, switch-release, transfer-issue
  - P2 tests: stub-hooks, sprint-scripts, wait-for-ci
- **Test Documentation** (#701) - `/tests/README.md` with comprehensive guide
  - Directory structure explanation
  - Test execution commands
  - Coverage threshold policy
  - Mock strategy documentation

### Changed
- **ESLint Configuration** - Added Jest globals support for test files
- **package.json** - Added test scripts (`npm test`, `npm run test:coverage`, `npm run test:watch`)

### Completed
- **PRD: Unit Testing Non-Installer Scripts** - Full lifecycle completed (#612)

---

## [0.20.3] - 2026-01-04

### Fixed
- **Charter template detection** (#688) - Startup workflow now detects incomplete template CHARTER.md files with placeholders

### Added
- **Template placeholder detection** (#689) - Regex pattern `{[a-z][a-z0-9-]*}` identifies unfilled template files
- **Charter detection in startup rules** (#690) - Full startup flow with:
  - `.no-charter` opt-out support
  - Template vs complete charter detection
  - Extraction/Inception mode prompts for templates or missing charters
  - Charter summary display format for complete charters

### Changed
- **`/charter` command** - Workflow includes template detection step before displaying summary
- **Charter-Enforcement rules** - Skip validation for template files (charter not yet completed)
- **`generateStartupRules()`** - Expanded with complete charter detection flow for user projects

---

## [0.20.2] - 2026-01-03

### Changed
- **`gh pmu view` documentation** (#685) - Added `-c` (comments), `-w` (web), `--body-stdout` flags to command reference
- **`gh pmu edit` documentation** (#685) - Added `--body-stdin` flag to command reference
- **View/Edit examples** (#685) - Added practical usage examples for new options
- **Windows-Shell-Safety** (#685) - Documented `--body-stdout` and `--body-stdin` as Windows-safe alternatives

---

## [0.20.1] - 2026-01-02

### Fixed
- **Version placeholder handling** - `parseManifest()` now correctly handles `v0.51.0` placeholder in `Templates/framework-manifest.json`
- **Skill count documentation** - Updated skill count from 21 to 22 across all documentation (Framework-Overview.md, Framework-Summary.md, Framework-Skills.md, README.md) to include `promote-to-prd` skill

### Changed
- **Installer charter support** - Charter feature files (Charter-Enforcement.md, Runtime-Artifact-Triggers.md) now deployed by installer
- **Version placeholder standardized** - All version tokens now use `v0.51.0` format for consistent replacement

---

## [0.20.0] - 2025-12-31

### Added
- **Lifecycle Artifacts Implementation** (#647-#650) - Complete DAD-inspired lifecycle management:
  - `/charter` command creates Inception/, Construction/, Transition/ directories
  - Charter Enforcement validates scope at key checkpoints (Proposals, PRDs, Issues)
  - Runtime Artifact Triggers offer documentation during development
  - Inception Mode guides charter creation with dynamic questions
- **`promote-to-prd` skill** - New skill transforms proposals into PRDs using Inception/ context. Replaces IDPF-PRD 4-phase workflow with single conversational flow.

### Changed
- **IDPF-PRD Deprecated** - Framework deprecated in favor of `promote-to-prd` skill. Existing PRD files continue to work; new work should use the skill.
- **`extract-prd` skill** - Updated to generate Inception/ artifacts (CHARTER.md + Inception/ directory) instead of PRD worksheets.

### Removed
- **Guided PRD by Application Type Proposal** - Archived; superseded by Lifecycle Artifacts implementation.

---

## [0.19.1] - 2025-12-31

### Removed
- **Obsolete TDD Commands** (#639) - Removed 10 commands that don't fit Claude Code's agentic workflow:
  - Development: `Done-Next-Step`, `Rollback-Previous-Step`, `Refactor-Now`
  - Utility: `List-Cmds`, `Review-Last`
  - Project: `Velocity-Report`, `Project-Complete`, `Push-Changes` (entire section removed)
  - Stale: `Sprint-Review` (merged into `Sprint-Retro`), `Sprint-Progress` (merged into `Sprint-Status`)

### Changed
- **TDD Execution Model** (#639) - TDD phases (RED → GREEN → REFACTOR) now execute **autonomously** within each story. No user interaction required between phases. Only workflow checkpoints are at story completion (In Review, Done).

### Fixed
- **Stale Command References** (#639) - Removed obsolete `Sprint-Review` and `Sprint-Progress` references from overview and guide files (already merged per Release-and-Sprint-Workflow proposal)

---

## [0.19.0] - 2025-12-31

### Removed
- **IDPF-Structured framework** (#634) - Removed structured/waterfall development framework. Users should transition to IDPF-Agile for sprint-based development.
- **IDPF-LTS framework** (#634) - Removed Long-Term Support framework. Patch release workflow now supported under IDPF-Agile.

### Changed
- **Framework Transitions Simplified** (#634) - Transition model now VIBE → AGILE only:
  - IDPF-Agile becomes terminal state (no transitions out)
  - Patch releases supported within IDPF-Agile workflow
- **Default Framework** (#634) - Installer default changed from IDPF-Structured to IDPF-Agile
- **Framework Count** - Reduced from 12 to 10 frameworks (2 IDPF process + 8 testing)

### Added
- **Guided PRD Proposal** - New proposal for guided PRD creation workflow
- **Project Charter Proposal** - New proposal for project charter integration

---

## [0.18.0] - 2025-12-30

### Changed
- **Repository Rename** (#613) - Repository renamed from `process-docs` to `idpf-praxis` to better reflect the framework's purpose. All internal references and deployment workflows updated.

### Added
- **`gh pmu edit` documentation** (#632) - Documented the new `gh pmu edit` command in GitHub-Workflow.md for round-trip issue body editing: `gh pmu view --body-file` → edit → `gh pmu edit -F`
- **`gh pmu --body-file` flags** (#620) - Documented `-F/--body-file` support across `gh pmu create`, `gh pmu view`, and `gh pmu edit` commands

### Fixed
- **Template version placeholders** (#627) - Fixed 35+ Template files missing `v0.51.0` placeholder. Commands, scripts, and shell scripts now properly receive version during installation.
- **Release branch prefix** (#625) - Fixed `/open-release` incorrectly prefixing branch names with `release/release/`

---

## [0.17.1] - 2025-12-29

### Fixed
- **Installer ENOENT error** (#616) - Fixed installer failing when copying `prepare-release.md` to user projects before `.claude/commands/` directory existed. Commands now deploy after directory creation.

### Added
- **`/change-domain-expert` command** (#615) - New slash command allows users to change their Base Expert after installation without reinstalling the framework. Displays 12 Base Expert options and updates CLAUDE.md, 03-startup.md, and framework-config.json.

---

## [0.17.0] - 2025-12-29

### Breaking Changes
- **Single-Specialist Model** (#588) - Users now select ONE Base Expert at install time instead of multiple specialists:
  - `domainSpecialist` (string) replaces `domainSpecialists[]` + `primarySpecialist` in framework-config.json
  - Removed `/switch-role` and `/add-role` commands (no longer needed)
  - Future: Expertise Packs can be loaded on-demand via JIT loading

### Changed
- **Domain Specialist Reorganization** (#589-#595) - Files reorganized from flat `Domain/` to structured subdirectories:
  - `Domain/Base/` - 12 Base Experts available at install time
  - `Domain/Pack/` - 10 Expertise Packs for JIT loading
  - `Domain/PRD/` - 1 specialized PRD analyst
- **Installer Single-Specialist Support** (#603-#607) - Updated installer for single-specialist model:
  - Radio-button UI (single-select) replaces checkbox UI (multi-select)
  - Schema migration: `domainSpecialists[]` + `primarySpecialist` → `domainSpecialist`
  - Orphaned command cleanup (`switch-role.md`, `add-role.md`)
- **Branch Naming Enforcement** (#586) - `/open-release` now enforces `[prefix]/[name]` format:
  - Exactly one `/` separator required
  - Both prefix and name must be non-empty
  - Examples: `release/v1.2.0`, `patch/v1.9.1`, `hotfix/auth-bypass`

### Removed
- **`/switch-role` command** - No longer needed with single-specialist model
- **`/add-role` command** - No longer needed with single-specialist model
- **Multi-select specialist prompt** - Replaced with single-select

### Documentation
- **Migration Guide** (#609-#611) - Added comprehensive migration documentation in `Releases/idpf/domain-reorg/release-notes.md`
- **Updated Domain-Selection-Guide.md** - Reflects single-specialist model
- **Superseded note added** - `Dynamic-Domain-Specialist-Roles.md` marked as superseded

---

## [0.16.1] - 2025-12-28

### Fixed
- **Installer config schema mismatch** (#581) - Fresh installations now use the new v0.16.0 config schema (`frameworkVersion`, `extensibleCommands`, `frameworkScripts`, `userScripts`) instead of the deprecated schema. Updates and migrations also properly migrate old `installedVersion`/`components` fields to the new schema.
- **Shebang displacement in JS files** (#584) - Fixed `version-header-fix.js` inserting version comment before shebang (`#!/usr/bin/env node`). Shebang must be first line for Unix script execution.

---

## [0.16.0] - 2025-12-28

### Added
- **Extensible Commands Installer** (#559) - Complete system for preserving user extensions during framework upgrades:
  - `install/lib/extensibility.js` - Extension block parsing, restoration, rogue edit detection, frontmatter merging, deprecation handling (REQ-002-006, REQ-010, NFR-003)
  - `install/lib/checksums.js` - SHA256 checksum computation for modification detection (NFR-002)
  - `install/lib/config.js` - Config management, manifest parsing, project type detection, schema migration (REQ-011, REQ-013-015)
  - Enhanced `install/lib/deployment.js` - Directory structure creation, framework script deployment with checksum tracking (REQ-007-009)
  - Enhanced `install/lib/detection.js` - Git clean state verification before upgrades (REQ-001)
  - Enhanced `install/lib/ui.js` - UpgradeError class with rollback instructions (NFR-001)
- **PRD for Extensible Commands Installer** (#559) - Comprehensive requirements document with 15 requirements and 3 NFRs
- **Templates for extensible commands** - Populated `Templates/` directory with framework scripts, shared utilities, and hooks

### Changed
- **Proposal consolidation** - Split extensibility proposal into Framework and Installer documents for clearer separation of concerns
- **Archive management** - Added archive notices to superseded proposals (Base-Template, original Extensible-User-Commands)

### Fixed
- **Script paths in command templates** (#579) - Updated 7 command templates to use correct `.claude/scripts/shared/` paths after extensibility reorganization

---

## [0.15.4] - 2025-12-26

### Fixed
- **Release artifact orphaning** (#549) - Moved release artifact generation (release-notes.md, changelog.md) from `/close-release` to `/prepare-release` Phase 2l. Artifacts are now committed with the release PR instead of being orphaned when the release branch is deleted
- **Temp file gitignore pattern** (#550) - Added `.tmp-*` pattern to `.gitignore`. The existing `*.tmp` pattern only matched files ending in `.tmp`, not workflow temp files starting with `.tmp-`

---

## [0.15.3] - 2025-12-26

### Added
- **Windows Shell Safety rules** (#524) - Consolidated Windows-specific shell guidance into platform-conditional rule file (`05-windows-shell.md`), deployed only on Windows systems

### Changed
- **`/open-release` track prefix handling** (#547) - Now requires explicit track prefix (e.g., `release/v1.0`, `patch/v1.0.1`) instead of assuming `release/`. Supports any custom track prefix via pass-through validation
- **`/add-role` token optimization** (#548) - Reduced command file from ~140 to ~60 lines (57% reduction) by using directory discovery instead of embedded specialist lists. Now supports direct argument (e.g., `/add-role Security-Engineer`)
- **Installer branch check** (#546) - Installation now checks if target project is on `main`/`master` branch. Cancels with warning on feature branches unless `--force` flag is used

### Fixed
- **Duplicate Windows guidance removed** - Eliminated redundancy between CLAUDE.md and GitHub-Workflow.md Shell Limitations sections

---

## [0.15.2] - 2025-12-24

### Fixed
- **Inconsistent Patches/ and Releases/patch/ directory structure** (#536) - Consolidated all release artifacts under unified `Releases/{track}/` structure matching branch naming convention (`release/`, `patch/`, `hotfix/`)

### Changed
- **`/close-release` updated for track-based paths** (#536) - Now writes artifacts to `Releases/{track}/vX.Y.Z/` based on branch prefix
- **GitHub Workflow updated to v1.7** - Updated artifact paths to use `Releases/{track}/` pattern

---

## [0.15.1] - 2025-12-24

### Fixed
- **Distribution deployment missing npm dependencies** (#526) - Added `package.json` and `package-lock.json` to `deploy-dist.yml` to fix `Cannot find module 'prompts'` error when users run `node install.js`
- **install.js wrapper not calling main()** (#531) - Fixed wrapper to explicitly call `main()` instead of relying on `require.main === module` check which fails for required modules

---

## [0.15.0] - 2025-12-24

### Added
- **Release lifecycle commands** (#513) - Complete release lifecycle trilogy implementing trunk-based development:
  - `/open-release` - Opens release branch and creates tracker issue
  - `/close-release` - Generates release notes, creates GitHub Release, deletes branch
  - Both dev and user versions created (`.claude/commands/` and `Templates/commands/`)
- **Trunk-based development workflow** (#513) - Tags now created on `main` after PR merge, not on release branches

### Changed
- **Installer modular architecture** - Refactored install.js into modular architecture for improved maintainability
- **Anti-hallucination rules enhanced** - Added command/URL verification to prevent hallucinated commands and URLs
- **`/prepare-release` updated for trunk-based flow** (#513) - Phase 3 now: PR to main → merge → checkout main → tag main → push tag

### Fixed
- **README-DIST.md version** - Fixed hardcoded version and updated skill count to use dynamic values
- **Shebang displacement in 10 JS files** (#500, #506) - Fixed version-header-fix.js inserting version comment before shebang

---

## [0.14.0] - 2025-12-21

### Added
- **Release and Sprint Workflow commands** (#442) - 7 new slash commands: `/plan-sprint`, `/sprint-status`, `/sprint-retro`, `/end-sprint`, `/assign-release`, `/switch-release`, `/transfer-issue`
- **Release validation hook** (#442) - `validate-release.js` blocks `work #N` on issues without release assignment
- **Sprint-release binding** (#442) - Sprints scoped to exactly one release with branch enforcement
- **PR-only main merge rules** (#442) - GitHub Workflow enforces all work through PRs to main
- **Deployment awareness documentation** (#490) - Dev-only rule documenting the process-docs → virtual-ai-studio-dist deployment chain

### Changed
- **GitHub Workflow updated to v1.6** - Added sprint-release binding, PR-only rules, temp file cleanup guidance
- **Session Startup updated to v1.1** - Now checks for open releases at startup
- **IDPF-Agile sprint commands implemented** - Changed from deferred stubs to working commands backed by `gh pmu microsprint`
- **Unified release commands** (#442) - Replaced separate `gh pmu patch` with `--patch/--hotfix` flags on `gh pmu release`

### Removed
- **Show-Backlog command** (#443) - Removed in favor of `gh pmu board` and `gh pmu list`

---

## [0.13.0] - 2025-12-14

### Added
- **Optional audit arguments for /prepare-release** (#432) - Added `audit:minimization`, `audit:hallucination`, and `audit:all` arguments
- **Release Field Support documentation** (#431) - Comprehensive documentation for release and patch workflow field support
- **GitHub API rate limit guidance** (#430) - Added rate limit best practices to ci-cd-pipeline-design skill
- **Single source of truth for minimization exclusions** (#422) - Created `minimize-config.json` for centralized configuration
- **Content validation in /audit-hallucination** (#418) - Implemented validation for version consistency, counts, file paths

### Changed
- **Automatic rules sync in /minimize-files** (#417) - Rules directory now automatically synchronized when minimization runs
- **Minimized GitHub Workflow for framework development** (#417) - Framework development sessions now use token-optimized workflow documentation

### Fixed
- **Framework transition in bulk updates** (#404) - Fixed framework transition not being offered during bulk project updates
- **install.js not updating .claude/rules/ or skills** (#434) - Update path now always redeploys rules and skills

---

## [0.12.0] - 2025-12-12

### Added
- **GitHub repo and project board setup** (#353) - Automated GitHub repository creation, project board copy, and `.gh-pmu.yml` generation in `install.js`
- **5 new Domain Specialists** (#214, #221, #229, #238, #247) - Desktop-Application-Developer, Game-Developer, Graphics-Engineer-Specialist, Systems-Programmer-Specialist, Technical-Writer-Specialist
- **Vibe Platform completion** (#389) - Unified 7 Vibe variants (Core, Newbie, Web, Desktop, Mobile, Game, Embedded)
- **IDPF-Vibe-Embedded framework** (#381) - Embedded systems variant with specialized constraints
- **Testing framework guides** (#313, #319, #326, #331, #332, #333, #334) - Complete guides for all 7 testing frameworks
- **Epic workflow** (#264) - GitHub workflow integration for epic/sub-issue management

### Changed
- **Framework transition support** (#402) - install.js now allows changing frameworks on existing installations
- **Auto-install gh-pmu extension** (#143) - GitHub CLI extension automatically installed during GitHub setup
- **New slash commands** (#355, #356) - Added `/audit-hallucination` and `/gap-analysis` commands

### Fixed
- **Project board linking** (#398) - Use JSON output from `gh project copy` for reliable project number extraction

---

## [0.11.0] - 2025-12-10

### Added
- **Rules Auto-Loading** (#147, #154-157) - `.claude/rules/` directory with auto-loading at session start:
  - `01-anti-hallucination.md` - Framework development quality rules
  - `02-github-workflow.md` - GitHub issue management integration
  - `03-session-startup.md` - Startup procedure and on-demand loading
- **/audit-minimization slash command** (#212) - Audit minimized files for removed Medium+ requirements

### Changed
- **IDPF-Agile GitHub-native backlog** (#208) - Updated documentation for GitHub-native issue management
- **Create-Backlog command** (#197) - Now creates GitHub issues directly with Epic/Story hierarchy
- **Checkbox enforcement for status transitions** (#211) - Issue status cannot change until acceptance criteria checked
- **Manifest-based file cleanup** (#194) - `install.js` maintains manifest of expected files

### Removed
- **_chg.md files** (#149) - Removed 82 change history files and related CLAUDE.md rules

---

## [0.10.0] - 2025-12-08

### Added
- **GitHub workflow integration in installer** (#136) - Deploys workflow-trigger.js hook and configures settings.local.json
- **Prerequisite detection** (#141) - Installer checks for git (required), gh and jq (optional)
- **UserPromptSubmit hook** (#134) - workflow-trigger.js detects trigger prefixes (bug:, enhancement:, finding:, idea:, proposal:)
- **8 PRD Templates** (#144) - Framework Gap Analysis PRDs for identified framework gaps
- **Slash commands for release preparation** (#146) - `/prepare-release`, `/skill-validate`, `/minimize-files`

### Changed
- **LICENSE** - Updated copyright to Rubrical Studios
- **Repository references** (#145) - Updated all references to rubrical-studios

---

## [0.9.0] - 2025-12-07

### Added
- **Token-optimized files** (#116-#121) - 84.6% reduction in token consumption
  - `.min-mirror/` directory contains minimized versions of all framework files
  - Automated minimization via `MINIMIZE_FILES.md`
- **Automated deployment** (#122) - GitHub Action deploys to `virtual-ai-studio-dist` on release tags
- **fetch-updates.js** - End-user script to update framework installation from dist repo
- **Two-pass minimization** (#124) - Quality gate ensuring Medium-High reductions are reversed
- **Trigger Words section** (#126) - GitHub-Workflow.md explicitly lists trigger words

### Changed
- **Distribution repo** (#123) - Renamed to `virtual-ai-studio-dist`
- **Guides/ directory** - Moved non-functional documentation from Reference/

### Fixed
- **IDPF-Security** (#124) - Restored complete OWASP Top 10 (was 6 items, now 10)
- **IDPF-Accessibility** (#123) - Restored complete WCAG criteria (was 10 items, now 26)

---

## [0.8.0] - 2025-12-04

### Added
- **Full-Stack-Developer specialist** (#109) - Generalist specialist covering frontend, backend, and infrastructure (now default)
- **/add-role command** (#105) - Add domain specialists post-installation
- **/switch-role command** (#97) - Switch between installed domain specialists mid-session with persistence
- **Idea Workflow** (#85) - Lightweight proposal creation for early-stage concepts
- **Proposal-to-PRD Workflow** (#85) - Convert proposals to formal PRDs using IDPF-PRD

### Changed
- **Unified installer** (#93) - `install.js` replaces `install.sh` and `install.cmd`
- **gh-pmu integration** (#103) - Replaced gh-pm and gh-sub-issue with unified gh-pmu extension
- **GitHub-Workflow.md** (#112) - Moved from slash command to Reference/ directory

### Removed
- **install.sh and install.cmd** (#113) - Legacy installers removed

---

## [0.7.0] - 2025-12-02

### Added
- **Anti-Hallucination Rules for Framework Development** (#78)
  - Version management: Always analyze commits before versioning
  - Cross-reference validation: Verify counts, versions, registries
  - CHANGELOG discipline: Document ALL changes since last release
- **Anti-Hallucination Rules for PRD Work** (#79)
  - Stakeholder truth over helpful invention
  - Source attribution for every requirement
  - Scope boundary discipline

### Changed
- **Session-Startup-Instructions.md** (v2.1) - Now loads Framework Development rules
- **IDPF-PRD** (Rev 4) - Loads Anti-Hallucination Rules for PRD Work at session initialization
- **Phase 0 Commit Analysis** - PREPARE_RELEASE.md now requires commit review before version determination

---

## [0.6.0] - 2025-12-02

### Added
- **7 Testing Frameworks**
  - IDPF-Testing-Core (#50) - Foundation framework for all testing approaches
  - IDPF-QA-Automation (#51) - Quality Assurance and Test Automation
  - IDPF-Performance (#52) - Performance Testing framework
  - IDPF-Security (#53) - Security Testing framework
  - IDPF-Accessibility (#54) - Accessibility Testing framework
  - IDPF-Chaos (#55) - Chaos Engineering framework
  - IDPF-Contract-Testing (#56) - Contract Testing framework
- **IDPF-PRD Framework** (#57) - Requirements Engineering with PRD templates
- **Domain Specialists** - PRD-Analyst (#59), Accessibility-Specialist (#60)
- **Skills** - uml-generation (#63), anti-pattern-analysis (#4), bdd-writing (#58), extract-prd (#12)
- **Create-Issues commands** (#75) - Generate GitHub issues from PRD

### Changed
- **Framework-Overview split** (#74) - Created Framework-Summary.md for reduced token consumption (77% reduction)

### Fixed
- **SessionStart Hook Error** (#77) - Removed invalid `type: "prompt"` hooks from settings.local.json

---

## [0.5.0] - 2025-11-30

### Added
- **Consolidated Startup System** - Reduce token consumption by ~70%
  - `STARTUP.md` generated with condensed essential rules
  - Simplified 4-step startup procedure (down from 7 steps)
- **Expansion Commands** - `/expand-rules`, `/expand-framework`, `/expand-domain`
- **Claude Code Settings** - Hooks and permissions configuration via `settings.local.json`
- **Framework Installation Script** - `install.cmd` and `install.sh` for external projects
- **Framework Manifest** (`framework-manifest.json`) - Identifies valid IDPF Framework installations
- **GitHub Workflow Integration** (`.claude/commands/gh-workflow.md`)

### Changed
- Startup procedure reduced from 7 steps to 4 steps
- Token consumption reduced by ~70% at session startup

---

## [0.4.0] - 2025-11-17

### Added
- **IDPF-LTS Framework** - Long-Term Support maintenance mode
  - Stability-focused development for mature projects
  - Conservative change management
  - Backward compatibility requirements
- **Framework Overview v2.2** - Comprehensive documentation of all 4 frameworks
- **Framework transition documentation** - Valid transition paths between frameworks

---

## [0.3.0] - 2025-11-16

### Added
- **IDPF-Vibe Framework** - Exploratory development with evolution paths
  - 7 variants: Core, Newbie, Web, Desktop, Mobile, Game, Embedded
  - Evolution to Structured or Agile when requirements stabilize
- **5 TDD Skills** - tdd-red-phase, tdd-green-phase, tdd-refactor-phase, tdd-failure-recovery, test-writing-patterns
- **Session Startup Instructions** - Standardized session initialization
- **Anti-Hallucination Rules** - Three domains: Software Development, Technical Book Writing, Skill Creation

---

## [0.2.0] - 2025-11-01

### Added
- **IDPF-Agile Framework** - Sprint-based development with user stories
  - Epic and Story hierarchy
  - Sprint planning and retrospectives
  - Velocity tracking
- **Domain Specialist System Instructions** - 15 initial specialists
- **Skills system** - Reusable capabilities for specific tasks

### Changed
- Restructured framework documentation
- Separated core instructions from domain specialists

---

## [0.1.0] - 2025-09-01

### Added
- **IDPF-Structured Framework** - Test-Driven Development with fixed requirements
  - Requirements-first approach
  - TDD methodology (Red-Green-Refactor)
  - Traceability matrix
- **Core Developer Instructions** - Foundation AI assistant identity
- **Anti-Hallucination Rules** - Initial quality guardrails
- **Assistant Guidelines** - Accuracy and verification principles

---

[0.15.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rubrical-studios/idpf-praxis/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rubrical-studios/idpf-praxis/releases/tag/v0.1.0
