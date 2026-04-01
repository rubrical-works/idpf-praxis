# Changelog

All notable changes to the IDPF Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Note:** Version numbers were reset to semantic versioning on 2025-12-24. See issue #525 for details. The v0.x.x series indicates pre-production status; v1.0.0 will mark production readiness.

---

## [0.79.0] - 2026-04-01

### Added

- **Dev Repo Symlink Protection Rules** — New `Reference/Dev-Repo-Rules.md` provides guidance for dev framework repos on read-only symlinked directories and the `local-{dir}` convention for repo-specific artifacts
- **Recipe Development Guide** — `Guides/Recipe-Development.md` for framework contributors
- **Skill-capability-test diagnostic skill** — Diagnostic skill for verifying skill capabilities (8/8 tests passed)
- **Skills-Repository-Migration-Completion PRD** — PRD and proposal updates for completing skills migration
- **Proposal: Better Use of Default Skills (#2184)** — 4-type skill taxonomy, security analysis, recipe-skill binding design
- **Proposal: Command-Skill Dependencies (#2185)** — JSON config as skills, dependency analysis, direct-read model

### Changed

- **`fw-minimize-files` removed from `extensibleCommands`** — Dev-only command was incorrectly classified as extensible; false-positive `EXTENSIBLE` marker in prose text corrected
- **`skills` property made optional in manifest schema** — Aligns with skills migration to separate repository
- **Timing test threshold increased** — Config integrity check threshold raised from 500ms to 2000ms for reliability under concurrent test load

### Fixed

- **False positive warning for dev-only extensible commands** — Suppressed validation warning for commands excluded from deployment
- **Break-on-mismatch loop in e2e-verification YAML extraction** — Fixed loop logic for YAML extraction in verification
- **Template copy sync and `detect-unsafe-regex` promotion** — Synced template copies and promoted `detect-unsafe-regex` rule to error severity
- **17 unsafe regex patterns resolved** — All patterns flagged by `detect-unsafe-regex` fixed across framework scripts

---

## [0.78.0] - 2026-03-31

### Added

- **ESLint Security Plugin and Semgrep CI workflow** — Added `eslint-plugin-security` dependency and a Semgrep SAST GitHub Actions workflow for automated security scanning (#2170)
- **Extension recipes for security category** — Added `semgrep-sast` and `eslint-security` extension recipes to the security category
- **`/fw-import-skills` command** — New command with `import-skills.js` implementation supporting `--skill`, `--all`, and `--update` flags for importing skills from the `idpf-praxis-skills` repository

### Changed

- **Coverage thresholds raised** — Updated Jest coverage thresholds to reflect actual test coverage levels
- **Skills migrated to `idpf-praxis-skills` repository (Epic #2170)** — Removed all 38 skill source directories, packaged zips, and `Skills/MAINTENANCE.md` from this repository. Skills are now maintained in a separate repository. Updated `constants.js`, `minimize-config.json`, `self-diag-checks.js`, `validate-helpers.js`, `framework-config.json`, `deploy-dist.yml`, `framework-manifest.json`, `CHARTER.md`, and `Overview/Framework-Skills.md`
- **Removed skill infrastructure** — Removed skill commands (`/fw-skill-validate`), 10 skill scripts, 6 metadata files, 6 orphaned Template scripts, and 26 obsolete test files
- **Removed skill references from `prepare-release-validation.md`**
- **Cleaned up 141 `.min-mirror/Skills` orphans**

### Fixed

- **Phantom `coverage.js` reference** — Replaced phantom `coverage.js` with direct `jest --coverage` in Phase 2o of prepare-release validation
- **Unsafe `node -e` patterns in `prepare-release-validation`** — Replaced 3 unsafe `node -e` patterns with safe alternatives
- **Unsafe `node -e` verification in `/fw-minimize-files`** — Replaced unsafe `node -e` verification in Step 6b
- **HTML comment end regex** — Updated HTML comment end regex to match `--!>` per HTML spec

---

## [0.77.4] - 2026-03-31

### Added

- **Manifest completeness check** — New `validate-manifest-completeness.js` script detects unregistered files in script/hook directories before release, preventing deployment gaps like #2158 (#2156)
- **Phase 2c-post validation gate** — Added manifest completeness check to prepare-release validation pipeline (#2156)
- **Proposal: Skills Repository Migration Completion** — Proposal for completing the skills distribution separation (#2157)
- **Proposal: Component Shell Generation from Mockups** — Proposal for generating UI component shells from mockup definitions (#2155)

### Changed

- **Framework-only commands renamed with `/fw-` prefix** — 10 maintainer-only commands renamed (e.g., `/minimize-files` → `/fw-minimize-files`, `/skill-validate` → `/fw-skill-validate`) to clearly distinguish framework commands from user commands (#2159)
- **Updated all command references** — Specs, docs, config, and test files updated to use `/fw-` prefix across the codebase (#2159)
- **Manifest schema updated** — Added `excludedFromDeployment` and `hooksConfig` properties to `manifest-schema.json` to match actual manifest structure

### Fixed

- **Security: command injection in `assign-branch.js`** — Replaced `exec` with `execFile` to prevent shell interpretation of untrusted input (#2153)
- **Security: CodeQL sanitization patterns** — Completed sanitization across 5 shared scripts (CodeQL alerts #1-5) (#2153)
- **Security: TOCTOU race in `saveToCache`** — Eliminated time-of-check-to-time-of-use race condition; removed retired `fetch-updates.js` (#2153)
- **Regex injection in `update-release-notes.js`** — Escaped regex metacharacters in version pattern matching (#2153)
- **Distribution sync: mockup scripts** — Synced `mockup-ac-generator.js` and `mockup-format.js` to Templates for distribution (#2158)
- **Distribution sync: 5 additional scripts** — Synced stale scripts to Templates that had diverged from installed versions (#2158)
- **`generateACFile` guard** — Added empty/undefined criteria input guard to prevent runtime errors (#2156)
- **Template sync: `mockup-ac-generator.js` and `workflow-trigger.js`** — Synced source to Templates during release validation

---

## [0.77.3] - 2026-03-30

### Fixed

- **Unused `execSync` imports** — Removed from 5 shared scripts (assign-branch, ci-watch, review-ac-checkoff, switch-branch, transfer-issue) and their template copies (#2142)
- **Unused `execAsync` declaration** — Removed from work-preamble.js along with unused `execCb` import (#2142)
- **Redundant conditional in `audit.js`** — Removed `if (frameworkConfig && manifest)` guard made redundant by early returns (#2142)
- **Deploy workflow reliability** — Added tag propagation guards and removed silent `|| echo` fallbacks in deploy-dist.yml and deploy-skill.yml (#2143)
- **Prepare-release non-interactive execution** — Added `--yes` flag to `gh pmu branch close` and `git stash` wrapper around `git checkout main` (#2140)

---

## [0.77.2] - 2026-03-30

### Added

- **`block-cd.js` PreToolUse hook** — Blocks `cd` commands in Bash tool to prevent silent working directory corruption; deployed to dev and hub template (#2134)
- **`hooksConfig` section in framework-manifest.json** — Declarative hook registration metadata for Praxis Hub Manager (#2134)
- **`Reference/Task-Creation-Timing.md`** — Source document for rule 07 (task creation timing) (#2129)
- **`06-runtime-triggers.md` rule in dev repo** — Closes dogfooding gap; aligns dev rule numbering with user projects (#2129)

### Changed

- **Routed command specs** — Migrated 7 commands from TodoWrite to TaskCreate two-phase boilerplate: `/review-issue`, `/work`, `/done`, `/resolve-review`, `/review-proposal`, `/review-prd`, `/review-test-plan` (#2129)
- **Rule 07 (task-creation-timing)** — Slimmed to cross-reference command spec boilerplate instead of duplicating instructions (#2129)
- **Rule numbering** — Renumbered `06-task-creation-timing` to `07-task-creation-timing`; added `06-runtime-triggers` (#2129)
- **9 shared scripts** — Converted `execSync` to `execFileSync` for CodeQL compliance: assign-branch, ci-watch, epic-complexity, install-skill, review-ac-checkoff, switch-branch, transfer-issue, update-release-notes, work-preamble (#2130)

### Fixed

- **Phase 2e rules build** — Corrected source path for `01-anti-hallucination.md` from `.min-mirror/Assistant/` (excluded from minimization) to `Assistant/` (#2126)
- **40 ESLint `no-unused-vars` warnings** — Removed dead code, prefixed unused params, removed unused imports across 30 files (#2128)
- **13 CodeQL `js/indirect-command-line-injection` alerts** — Replaced shell-based `execSync` with `execFileSync` (no shell), preserving `sanitizeShellArg` as defense-in-depth (#2130)

---

## [0.77.1] - 2026-03-29

### Fixed

- **validate-dist.js** — Placeholder check string was being replaced by version injection, corrupting the validation logic. Constructed search string via concatenation to survive sed replacement.

---

## [0.77.0] - 2026-03-29

### Added

- **shell-safe.js utility** — Shared module for CodeQL compliance with `sanitizeShellArg`, `readFileSafe`, `atomicWriteSync` functions
- **Unit tests for shell-safe.js** — Covers valid/invalid inputs, edge cases for all 3 utility functions
- **GitHub Issue Form templates** for distribution repo — Bug report, enhancement, contributor request, download request forms with structured fields and auto-labeling
- **CONTRIBUTING.md** for distribution repo — Contributor guidelines and onboarding
- **`/audit-core-docs` command** — Framework documentation auditing against codebase state
- **Release notes automation** for dist repo — Uses `update-release-notes.js` for GitHub Releases

### Changed

- **Overview/Framework-Summary.md** — Updated Skills Registry from 23 to 38 entries, added By Category and Pipeline sections, fixed domain count (11→13 with full domain table)
- **Overview documentation** — Fixed domain listing drift in Framework-Summary.md, Framework-Overview.md, Framework-Testing.md
- **IDPF-Agile/Agile-Commands.md** — Updated incomplete command listing (~12→48 commands)
- **IDPF-Agile/Agile-Transitions.md** — Removed references to non-existent Structured/LTS frameworks and `First-Step`/`LTS-Triage` commands
- **README-DIST.md** — Added content minimization explanation

### Fixed

- **27 CodeQL security findings** remediated across 14 shared scripts:
  - 13 command injection findings (whitelist validation via `sanitizeShellArg`)
  - 7 TOCTOU race condition findings (replaced `existsSync` with try/catch)
  - 1 insecure temp file finding (replaced `Date.now()` with `mkdtempSync` + crypto)
  - 6 quality findings (unused variables, trivial conditionals)
- **Checksum generation ordering** in `deploy-dist.yml` — Moved after version injection to fix 76 mismatches in CI (#2114)
- **CVE-2026-33228** — Updated `flatted` to 3.4.2
- **Template sync** — Synced shell-safe.js and updated manifests

### Removed

- **Model tier docs** — Pre-1M context documentation no longer needed

---

## [0.76.0] - 2026-03-28

### Added

- **Mockup AC generation** — New workflow in `/mockups` to extract and generate acceptance criteria from mockup artifacts (#2103)
- **Design token integration** — Palette-to-CSS and drawio conversion via mockup-token-styles helper, wired into `/mockups` command spec (#2106)
- **Gemini CLI content translation** — Semantic content translation, tool name translation, and startup trigger section for Gemini rules
- **Gemini startup-files rule** — `framework-config.json` and `Agile-Core.md` added to transform-gemini startup file handling (#2104)
- **Gemini passthrough extensions** — Content translation extended to passthrough files and command prompts
- **Regression test** for Gemini content translation
- **Minimization quality gate** in prepare-release validation
- **Structural validation gate** (`validate-minimized-commands.js`) — Validates minimized commands preserve STOP boundaries, ASK USER prompts, extension blocks, and EXTENSIBLE markers
- **`<!-- FRAMEWORK-ONLY -->`** marker added to `/transform-gemini` command

### Changed

- **Removed self-hosted in-place command minimization** from `/minimize-files` — source commands in `.claude/commands/` are never overwritten by minimization (#2108)
- **Re-minimized 21 distribution commands** that were at 100% ratio (not previously minimized)
- Removed `self-hosted-commands` CLI subcommand from minimize-helper.js

### Fixed

- **install-skill.js** extraction path doubling and added per-skill `.gitignore` entries (#2107)
- **Deployment parity** — Added framework-script tags and `FRAMEWORK_ONLY_FILES` entries for new mockup scripts
- **Statusline exclusion** — Excluded `statusline-check.js` from Gemini passthrough
- **Template sync** — Synced `install-skill.js` to `Templates/scripts/shared/` (missed in #2107)

---

## [0.75.0] - 2026-03-27

### Added

- **Gemini CLI transformer pipeline** (#2055) — Complete build-time transformation of IDPF artifacts into Gemini CLI equivalents. Includes 5 transform rules:
  - `md-to-toml`: Convert command specs to Gemini TOML format with tool name translation and path rewriting
  - `flatten-to-imports`: Generate GEMINI.md with `@import` directives from rules
  - `hook-event-map`: Remap hook events (PreToolUse→BeforeTool, PostToolUse→AfterTool, etc.) with timeout conversion
  - `perms-to-policy`: Convert permissions to Gemini TOML policy rules
  - `passthrough`: Copy format-agnostic files (scripts, hooks, metadata)
- **`/transform-gemini` command** (#2090) — Slash command wrapping the transformer pipeline with target directory validation, `.min-mirror/` prerequisite check, and structured reporting
- **`--output` flag for transform-gemini.js** (#2091) — Write transformation output to an arbitrary target directory instead of repo root
- **`validate-gemini-output.js`** — CI validation script for Gemini CLI output (TOML parsing, import resolution, event validation)
- **Build pipeline integration** — Transform manifest for incremental re-transform and feature gap tracking
- **Command rename map** (#2094) — `COMMAND_RENAMES` in md-to-toml rule to avoid Gemini CLI built-in conflicts (`bug`→`finding`)
- **Extension points metadata** (#2098) — Populated `location` and `purpose` fields for all 81 extension points across 19 commands
- **ASCII diagram style** — New diagram style option in `/create-prd`
- **Gemini CLI Compatibility Guide** — Documentation for the Gemini transformation approach

### Fixed

- **Hook timeout units** (#2092) — Convert timeout values from seconds (Claude Code) to milliseconds (Gemini CLI) in hook-event-map transform rule
- **Hook path generation** (#2092) — Generated `session-start-dispatch.js` now references `.gemini/hooks/` instead of `.claude/hooks/`
- **Windows stdin compatibility** (#2095) — Replace `fs.readFileSync('/dev/stdin')` with `process.stdin` stream in generated dispatch script (ENOENT on Windows)
- **PreCompact hook exclusion** (#2093) — Exclude `precompact-hook.js` from Gemini transformation (no Gemini CLI equivalent)

### Changed

- **Deployment awareness** — Added `/transform-gemini` to excluded commands list (framework-only, not distributed)

---

## [0.74.0] - 2026-03-26

### Added

- **`/design-system` command** (#2064) — New command producing DTCG-compliant design tokens (`Design-System/idpf-design.tokens.json`) with pluggable adapter architecture. Includes:
  - DTCG token schema generation and validation for all 11 token types (color, dimension, fontFamily, fontWeight, duration, cubicBezier, number, shadow, border, typography, transition)
  - Interactive init mode with 4 categories (color, typography, spacing, components) and sensible defaults
  - Pluggable adapter loader with auto-discovery from adapter directories and fault isolation
  - 4 built-in discovery adapters: css-vars, tailwind, react-native, style-dictionary
  - 4 built-in export adapters: css-vars, tailwind, react-native, style-dictionary
  - Theme support with light/dark file generation, type-safe merge resolution, and circular alias detection
  - Token reader integration for `/mockups` (palette) and `/catalog-screens` (value-to-alias mapping)
- **`verify-dist-deploy.js` script** — Post-tag verification of downstream deployment chain to distribution repo.
- **Auto-commit step for `/proposal` command** — Proposals now commit automatically after creation.
- **Bypass acceptance check for `runp_claude` launcher scripts** — Streamlined launcher with `--accepted` flag.
- **Gemini CLI compatibility proposal** (#2055) — Proposal for rules-based transformer for cross-CLI compatibility.

### Fixed

- **VERSION substitution for extensionless scripts** — `deploy-dist.yml` now handles scripts without `.js` extension in VERSION token replacement.
- **ESLint error in test** — Replaced undefined `fail()` with `throw` in test assertion.
- **`validate-dist.js` manifest field and checksums path mismatch** — Fixed field name and path alignment in distribution validation.

---

## [0.73.0] - 2026-03-25

### Added

- **Interactive HTML mockup format** (#2048) — `/mockups` now offers self-contained HTML mockups with Tailwind CSS, multiple visual states, and implementation notes section with component names, line references, and test impact analysis.
- **Mockup file discovery for /catalog-screens** (#2051) — `/catalog-screens` now detects ASCII and HTML mockup files as a discovery source, parsing them for UI elements instead of erroring with "No UI framework found."
- **`mockup-element-extractor.js` shared script** (#2051) — New utility for parsing ASCII art and HTML mockups into structured element data.
- **Distribution repo CI and integrity validation** — `validate-dist.js`, dist CI workflow, dist CodeQL workflow, and Dependabot config for the distribution repository.

### Changed

- **Defer mockup commit offer** (#2048) — `/mockups` now asks "Are the mockups satisfactory?" before offering to commit, allowing revision loops.
- **Update accept error recovery** (#2049) — `Reference/GitHub-Workflow.md` no longer instructs running `gh pmu accept` without `--yes` (hangs in non-interactive environments). Recovery flow now relies on error output containing terms text.

### Fixed

- **ci-status.js nodeVersion type mismatch** (#2050) — Fixed `TypeError` when YAML parses `node-version: 20` as number instead of string. Now coerces all version values to `String()` before calling string methods.
- CI deployment parity for `mockup-element-extractor.js` and `ci-status.js` Templates sync.

---

## [0.72.0] - 2026-03-25

### Added

- **Bundle node_modules in release artifact** (#2038) — `deploy-dist.yml` now runs `npm ci --omit=dev --ignore-scripts` to include production dependencies in the distribution, eliminating the need for manual `npm install` in hub deployments.
- **Framework-native mockup detection** (#2030) — New `mockup-detect-framework.js` script detects CSS/component frameworks with fallback logic for `/mockups` command.
- **Critical config drift detection** (#2034) — Session startup now validates `.gh-pmu.json` integrity with critical drift prompting (project/owner/repo changes block startup until acknowledged).
- **Security scanning CI** — Added SECURITY.md policy and Gitleaks workflow for automated secret detection on push.

### Changed

- **Optimize /create-branch** (#2037) — Minimized tool call round-trips for faster branch creation.
- **Auto-generate commit message in /create-branch** (#2036) — Branch creation now generates a commit message automatically instead of prompting.
- **Calibrate audit rubric** (#2033) — Added refinement step to command spec audit for more accurate scoring.
- **Apply audit findings** (#2032, #2031) — Updated `/catalog-screens` and `/mockups` command specs based on audit results.
- **Remove unused `prompts` dependency** (#2038) — Removed `prompts` package (and transitive deps `kleur`, `sisteransi`) from `package.json`.
- Remove `command-spec-audit` from default skills in keyword registry.
- Update gh-pmu config to v1.4.1.

### Fixed

- CI test failures for `skill-keywords` and `deployment-parity` tests after skill registry and script additions.

---

## [0.71.2] - 2026-03-25

### Added

- **Config integrity check at session startup** (#1906) — New Step 3e validates `.gh-pmu.json` checksum at startup using gh-pmu v1.3.1+ checksum validation. Reports `✅ Verified` or `⚠️ Drift detected` in the Session Initialized block. Silently skipped on older gh-pmu versions.
- **`config-integrity-check.js` shared script** (#1906) — New deployment script for config integrity validation at session startup.

### Fixed

- **CI deployment parity** (#1906) — Tests that require gh-pmu are now skipped when gh-pmu is not installed, preventing CI failures in environments without the extension.

### Changed

- Updated gh-pmu config and metadata registries.

---

## [0.71.1] - 2026-03-24

### Added

- **Post-processing commit offer for `/mockups` and `/catalog-screens`** (#2022) — Both commands now offer to `git add` and commit generated artifacts after processing completes. Commit messages reference the working issue number (`Refs #NN`). User can decline.
- **ASCII-only detection and conversion offer for `/mockups`** (#2024) — When working with a mockup set containing only ASCII mockups (no interactive `.drawio.svg` files), `/mockups` now detects this and offers to convert them to interactive mockups with corresponding screen specs.

### Fixed

- **Deployment leak: `audit-commands` and `audit-extensions` in `.min-mirror/`** (#2026) — Two dev-only commands were incorrectly deployed to the distribution mirror. Added `<!-- FRAMEWORK-ONLY -->` marker to all 9 dev-only commands and updated the minimization pipeline (`minimize-helper.js`) to auto-exclude files with this marker. Added both commands to `excludedCommands` in `minimize-config.json` as secondary safety net.

### Changed

- **Deployment awareness documentation** (#2026) — Added Command Marker Semantics table documenting the four marker types (`FRAMEWORK-ONLY`, `FRAMEWORK-ONLY-START/END`, `MANAGED`, `EXTENSIBLE`) and their deployment implications.
- **`gap-analysis.md`** (#2026) — Converted from whole-file `FRAMEWORK-ONLY-START/END` block to simpler `<!-- FRAMEWORK-ONLY -->` marker.

---

## [0.71.0] - 2026-03-24

### Added

- **JSON schemas for all metadata and manifest files** (#2017) — Created 18 JSON Schema files (draft-07) covering `framework-manifest.json`, 4 generator output files (`extension-points`, `skill-registry`, `extension-recipes`, `skill-catalog`), 3 review criteria files, and 10 remaining metadata files. Added `validate-schema.js` utility. Generator scripts now validate output against schema before writing. Release pipeline Phase 2s validates all files against schemas.
- **UI Design Pipeline Context Awareness** (#2019) — `/mockups` now detects existing screen specs (from `/catalog-screens`) and prior path analysis (from `/paths`), offering them as starting points. `/paths` loads screen spec data (validation rules, input ranges, dependencies) as supplementary context for more precise scenario candidate generation. `/catalog-screens` accepts optional `#NN` argument for enhancement/bug issue context. Writeback expanded from proposal-only to all issue types.
- **UI Design stage in Workflow Guide** (#2019) — Added Stage 4b (UI Design) as optional step between Paths and PRD for UI-heavy features. Updated Planning Approaches top-down flow diagram and Roadmap.

### Changed

- **`framework-manifest.json`** — Added 17 schema files to `deploymentFiles.metadata` registries.

---

## [0.70.0] - 2026-03-23

### Added

- **Test/source file separation in `/work` Step 4c** (#2005) — Files Changed section now separates test files from source files within each status category (Added, Modified, Deleted). New `classify-changed-files.js` utility with 20 unit tests for pattern-based classification (`*.test.*`, `*.spec.*`, `__tests__/`, `test/`, `tests/`).
- **`validate-manifest.js` for deployment chain validation** (#2012) — Comprehensive script validating 6 deployment categories bidirectionally, command classification completeness, marker matching, deprecated command tracking, and `constants.js` cross-referencing. Replaces 114 lines of inline bash loops in Phase 2n with a single script call. Includes 18 unit tests.
- **`deprecatedCommands` array in `framework-manifest.json`** (#2012) — Tracks 6 known deprecated commands with action type (removed, retired, renamed), version, and reason for px-manager cleanup.
- **Extension point deprecation and breaking change detection** (#2014) — `build-extension-registry.js` now diffs new scans against previous registry, blocking on unannounced extension point removals. Enforces a two-release deprecation cycle. `deprecatedExtensionPoints` array added to `extension-points.json` schema. Includes 8 unit tests.
- **`--wait` flag for `/work` command** (#2015) — Blocks on pending CI before starting work. Calls existing `wait-for-ci.js` on CI failure/timeout, stops work. Silently skipped when no CI workflows exist. Includes 4 unit tests.

### Fixed

- **25 manifest deployment gaps** (#2011) — Added 9 missing metadata registries, 1 missing hook (`pre-push`), 6 missing commands to workflow list, 7 missing command classifications, and 2 missing `shared/lib` files to `framework-manifest.json`. Synchronized `constants.js` INSTALLED_FILES_MANIFEST. Fixed `add-recipe.md` marker from `MANAGED` to `FRAMEWORK-ONLY`.

### Changed

- **`review-issue.md` Step 3** (#2010) — Replaced 16 lines of inline JSON example with Read instruction referencing `findings-schema.json` as single source of truth.
- **`review-finalize.js`** (#2010) — `REQUIRED_FIELDS` now derived from `findings-schema.json` `required` field; `normalizeFindings()` alternate field mappings derived from `alternateFields`.
- **`review-format.js`** (#2010) — `EMOJI` map now derived from `findings-schema.json` `statusEmoji`. Fixed skip emoji discrepancy (was `⏭️`, now `⊘` matching runtime).
- **`validate-helpers.js`** — Fixed conditional file extraction regex to handle extensionless files (e.g., `pre-push`).

---

## [0.69.0] - 2026-03-23

### Added

- **Shared screen spec JSON schema** (#2006) — Created `.claude/metadata/screen-spec-schema.json` defining 10 core element fields, 13 discoverable convention fields (data-testid, aria-label, library-component, etc.), screen-level metadata with library detection, framework-specific discovery patterns, and directory structure conventions. Includes 40 validation tests.
- **Branch sync check at session startup** (#2001) — Detects behind/ahead/diverged state vs upstream tracking branch and offers pull/rebase options via AskUserQuestion

### Changed

- **`/catalog-screens` redesigned as fully interactive** (#2007) — Removed all required arguments; replaced with AskUserQuestion-based Q1-Q6 flow covering create/update/re-scan workflows. Now reads element fields from shared schema instead of inline definitions. Output moved to `Mockups/{Name}/Specs/` directory structure with collision protection.
- **`/mockups` redesigned as interactive with issue context** (#2008) — Replaced screen-name arguments with optional `#NN` issue reference that pre-populates interactive flow. Q1-Q6 covers create/modify/view workflows. Output to `Mockups/{Name}/AsciiScreens/` and `Screens/` with auto-generated README.md index and collision protection.

### Fixed

- **Distribution deployment** (#2003) — Excluded `/add-recipe` from distribution deployment via minimize-config.json
- **Skills metadata** — Updated skills metadata registry

---

## [0.68.0] - 2026-03-21

### Added

- **`/add-recipe` command** — Add extension recipes from document or interactively; supports batch creation from structured markdown and single-recipe interactive mode with extension point validation
- **Missing `appliesTo` entries for 3 extension recipes** (#1993) — Added appliesTo entries to slack-release-notification, cross-os-testing, and coverage-report recipes

### Changed

- **`/catalog-screens` abstraction-layer tracing** — Added delegation chain verification for components that delegate rendering through bridge patterns or vanilla JS methods; traces through abstraction layers to actual DOM-producing code
- **Command Model Classification updated** — Added `/add-recipe` (Sonnet tier), removed `/check-upgrade`

### Removed

- **`/check-upgrade` command** — Removed command spec, backing script, template, tests, and all downstream references (constants.js, framework-manifest.json, documentation, .min-mirror orphans)

### Fixed

- **`recipe-tech-mapping.json` corrections** — Added slack-release-notification to notifications group, cross-os-testing to CI group
- **`framework-manifest.json` skills list** — Added missing `i18n-setup` and `observability-setup` entries
- **README.md skill count** — Updated "33 Installable Skills" to correct count of 38

---

## [0.67.2] - 2026-03-20

### Fixed

- **Review closing notification status-aware** (#1987) — Review finalize now generates status-appropriate closing notifications

### Changed

- **Recipes added to EXPECTED_SYMLINKS** (#1988) — `check-upgrade.js` now validates `.claude/recipes` symlink alongside the existing 5 directories

### Documentation

- Added proposals for Docker skill and recipe expansion

---

## [0.67.1] - 2026-03-20

### Added

- **Recipe source files deployed** (#1985) — `.claude/recipes/` directory now deployed to distribution for px-manager direct consumption; compiled `extension-recipes.json` retained for CLI backward compatibility

---

## [0.67.0] - 2026-03-20

### Added

- **Specialist loading at session startup** (#1978) — Domain specialist expertise profile loaded into context at Step 3d, shaping responses from first interaction
- **Holistic Framework-Review mode** (#1980) — `/gap-analysis` area #14 for cross-cutting framework analysis covering deployment audit, architecture gaps, redundancy, minimization effectiveness, cross-reference integrity
- **FRAMEWORK-ONLY markers on /gap-analysis** (#1980) — Defense-in-depth protection for dev-only command
- **Reference material purpose statements** (#1982) — 56 undistributed files annotated with purpose blockquote
- **Deployed File Loading Audit** — FrameworkReview document identifying 55+ unloaded files in distribution

### Changed

- **minimize-config.json** (#1979) — 8 new exclusion patterns for domain files; `copyAsIsSubdirectories` emptied
- **Two-pass minimization** — Applied to Overview, Assistant, Reference, Specialist, and Skills SKILL.md files
- **Overview docs** (#1978) — Updated to reflect Core-Developer-Instructions removal and specialist loading

### Removed

- **Core-Developer-Instructions.md** (#1978) — Deleted from framework; references removed from 22 specialist files
- **Domain-Selection-Guide.md** (#1978) — Excluded from distribution (retained in dev repo)
- **55 domain files from distribution** (#1979) — Guides, Templates, Examples, main docs, registry docs removed from `.min-mirror/`

### Fixed

- **audit-hallucination specialist check** (#1978) — No longer checks for removed Extends field
- **minimize-helper test** (#1979) — Updated for Guides no longer being copy-as-is

---

## [0.66.4] - 2026-03-19

### Fixed

- **review-issue redirect preserves flags** (#1971) — `--with`, `--mode`, `--force` flags now passed through when redirecting to `/review-proposal`, `/review-prd`, `/review-test-plan`
- **Framework path convention** (#1972) — All command specs use `{frameworkPath}/` prefix for framework directory references; convention documented in Deployment Awareness; fixes template/skill lookup failures in user projects
- **Review done reminder** (#1973) — All review commands output "Say done or run /done #N" in closing notification via shared `review-finalize.js`

---

## [0.66.3] - 2026-03-19

### Added

- **/work Step 4a automatic QA extraction** (#1965) — Replaced `AskUserQuestion` gate with silent, automatic `qa-required` sub-issue creation for unverifiable ACs; works in standard and `--nonstop` mode
- **/create-backlog decoupled from branch** (#1969) — Removed Phase 1b (branch validation); backlog creation no longer requires an active branch

### Fixed

- **/done discovery scoped to branch** (#1968) — Discovery mode now queries `--branch current --status in_review` instead of project-wide `--status in_review`

---

## [0.66.2] - 2026-03-19

### Added

- **/issue-reset command** (#1960) — Renamed from `/reset-issue` for clarity; added epic recursive reset support (resets epic and all sub-issues)
- **/work Step 4c: file change logging** (#1963) — Logs added/modified/deleted files to issue body before `in_review` transition

### Fixed

- **Start script version injection** (#1956) — Added `.cmd` and `.sh` to `deploy-dist.yml` version injection step; `v0.79.0` now substituted in start scripts
- **create-backlog priority consistency** (#1962) — Added explicit `--priority` flags to epic and story creation with documented derivation rules

---

## [0.66.1] - 2026-03-19

### Fixed

- **/review-issue findings schema mismatch** (#1958) — Added concrete JSON template to Step 3 preventing `review-finalize.js` rejection; normalizer now handles `result`→`status` field aliasing and recommendation shorthand normalization

### Added

- **Proposal: Separate Skills Distribution Repository** (#1957) — Proposal for dedicated skills distribution repos to fix broken download URLs, version coupling, and expand audience

---

## [0.66.0] - 2026-03-19

### Added

- **test-scaffold skill** (#1908–#1916) — New skill generating testing infrastructure from IDPF domain knowledge with 6 domain modules (accessibility, chaos, contract-testing, performance, QA-automation, security), shared engine with project detection, and multi-domain orchestration
- **Skill versioning** (#1889–#1895) — Independent semver in all 38 SKILL.md files, registry with version/compatibility/checksum, per-skill deployment workflow (deploy-skill.yml), catalog generation
- **Hub file integrity manifest** (#1902) — checksums.json generation for hub installations
- **Catalog error handling** (#1896) — Utility library for skill catalog errors with deployment parity
- **Paths command rewrite** (#1942–#1954) — 11 UX improvements including progress breadcrumb, inline category descriptions, preamble script (paths-preamble.js), and config externalization (paths-config.json)
- **Epic complexity classifier** (#1939) — epic-complexity.js with signals JSON and verification gates in /work command
- **Review AC check-off** (#1934) — Extracted review-ac-checkoff.js with unit tests, findings JSON schema externalization, closing notification moved into review-finalize.js
- **Closing notifications** (#1931) — Added to all review commands
- **Post-work summary comment** (#1932) — Added to /done command
- **Proposal review gate** (#1930) — Gate on missing path analysis
- **--no-redirect flag** (#1935) — Added to review-preamble.js
- **Skill suggestions persistence** (#1917) — persist-skill-suggestions utility integrated into /create-prd and /create-backlog
- **/idpf-stats command** (#1868) — Session statistics report with development velocity metrics
- **/assign-branch --remove** (#1903) — Branch unassignment flag
- **Skill Browser UI spec** (#1898) — Screen specification for px-manager
- **checkUpdates** (#1897) — Catalog-based update detection for manage-skills

### Changed

- Standardized JSDoc headers on 42 shared scripts, 14 library scripts, 8 framework scripts, and 3 remaining scripts (#1925–#1929)
- Updated skill count to 38 in README.md and Framework docs (#1916)
- Retired /manage-skills command in favor of px-manager (#1918)
- Scoped deploy workflow to preserve independent skill versions (#1892)
- Updated Skills MAINTENANCE.md with version and last-updated columns (#1891)
- Synced Templates/scripts/shared/ and lib/ with updated headers (#1929)
- Registered validate-release.js in deployment manifests (#1926)
- Added end-to-end validation tests for Phase 1 skill versioning (#1893)

### Fixed

- Deployment parity for catalog-errors.js (#1896)
- Regenerated clean skill-registry.json after test run (#1886)

---

## [0.65.0] - 2026-03-16

### Added

- **electron-cross-build skill** (#1871) — New skill for cross-compiling Electron apps from Linux to Windows (toolchain setup, electron-builder/forge config, native modules, NSIS, code signing, CI/CD examples)
- **Input validation module** (#1875) — Shared `input-validation.js` with validators for issue numbers, branch names, tags, versions, file paths, filenames, and regex patterns (18 unit tests)
- **DEBUG diagnostic logging** (#1881) — Shared `debug.js` utility with DEBUG environment variable gate; applied to `skill-keyword-matcher.js` and `load-review-extensions.js`

### Changed

- **Code-review exclude list expanded** (#1873) — Covers Node.js, Python, Ruby, Go, Rust, Java, .NET, PHP, iOS ecosystems plus framework build dirs
- **Branch tracker completion template** (#1866) — Explicit output template with counts; prohibits suggesting "done" for branch trackers
- **Review trigger tightened** (#1869) — Require "review" at start of prompt to prevent assistant output from triggering unintended invocations
- **Unique temp file names** (#1882) — PID/timestamp in temp files for `review-finalize.js` and `update-release-notes.js`
- **Promise.all timeout** (#1883) — 30s timeout on `checkSubIssueStatuses` in work-preamble to prevent indefinite blocking
- **deploy-dist.yml hardened** (#1880) — Version normalization (ensure 'v' prefix), format validation, conditional commit/tag instead of error-masking `|| echo`

### Fixed

- **loadCodeReviewExtensions return shape** (#1874) — Document verified API contract in /code-review spec
- **Redundant PRD review suggestion** (#1867) — Skip "review PRD" when closing test-plan approval (test plan proves PRD reviewed)
- **CSS selector injection** (#1878) — Escape data-testid, role, aria-label values in playwright-explorer
- **ReDoS in CI scripts** (#1876) — try-catch around registry-sourced `new RegExp()` in ci-list, ci-add, ci-remove
- **Path traversal** (#1877) — Validate suggestedName filename in ci-add.js
- **Command injection** (#1875) — Branch name validation in gh.js getRuns()
- **Sync-scripts naming confusion** (#1879) — Clarifying comments for intentional src/dest inversion

### Security

- Input validation for shell safety (#1875)
- ReDoS protection for registry patterns (#1876)
- Path traversal prevention (#1877)
- CSS selector injection fix (#1878)

---

## [0.64.0] - 2026-03-16

### Added

- **Domain Taxonomy** (#1845) — Unified `Domains/` directory structure consolidating 6 IDPF-* testing directories; domain registry with validation tests; 5 new domains (API Design, Observability, i18n, SEO, Privacy); domain profiling in `/charter` inception
- **Charter-aware domain filtering** (#1863) — `filterDomainsByCharter()` and `suggestDomains()` functions; `domain-signals.json` metadata with keyword mappings for 11 domains; `--suggest` flag for `/code-review`; Steps 5a (charter filtering) and 5d (--suggest) in code-review spec; 11 unit tests
- **Active domains wiring** (#1855) — `activeDomains` config integrated into review and creation commands
- **Copyright frontmatter** (#1842) — Added copyright to all skill and command frontmatter

### Changed

- Review extensions registry expanded to 11 domains (#1854)
- Deployment pipeline and minimization config updated for Domain Taxonomy (#1858)
- Linux launcher templates renamed: `run_claude.sh` → `run_claude`, `runp_claude.sh` → `runp_claude` (#1865)
- Shebang updated to `#!/usr/bin/env bash` for portability (#1865)
- `/bug` version confirmation uses `AskUserQuestion` instead of "Enter to confirm" (#1864)
- Cross-references and documentation updated for Domain Taxonomy (#1860)

### Fixed

- Criteria path resolution against `frameworkPath` instead of `projectDir` (#1861)
- Git rename tracking test skipped in shallow clones (#1846)

### Removed

- 6 standalone IDPF-* testing directories (migrated to Domains/)

---

## [0.63.1] - 2026-03-15

### Fixed

- **Review-routing trigger tightened** (#1836) — Require whole-word `review` and `#N` format for issue references, preventing false matches on bare numbers and substrings like "reviewed"
- **Self-finalization restored for review-prd and review-test-plan** (#1837) — Restored self-contained finalization (review-finalize.js call, AC check-off) lost in #1810 refactor; review commands no longer delegate finalization to calling orchestrator
- **Tests fixed for self-finalization restore** (#1837) — Updated test expectations to match restored self-finalization behavior
- **Code-review extension require path** (#1839) — Fixed missing `./` prefix in code-review extension require path that caused module resolution failure
- **Code-review issue creation strengthened** (#1840) — Mandate slash commands (`/bug`, `/enhancement`) in code-review issue creation instead of inline `bug:` / `enhancement:` triggers
- **Forward-slash wording in minimized Session-Startup-Instructions** — Restored correct forward-slash instruction wording lost during prior minimization

### Changed

- Updated PRD, test plan, and proposal working drafts
- Synced workflow-trigger.js to Templates (review-routing fix from #1836)
- Updated minimized review-prd.md and review-test-plan.md for self-finalization restore

---

## [0.63.0] - 2026-03-13

### Added

- **Persistent reports for review commands** (#1823) — `/bad-test-review` now writes reports to `Construction/Code-Reviews/YYYY-MM-DD-bad-test-report.md`; `/code-review` reordered to write report after issue creation so issue numbers appear in findings
- **Task creation timing rule** (#1829) — New rule `06-task-creation-timing.md` establishes two-phase task creation for commands with routing decisions, preventing orphaned tasks after redirects or early exits
- **Bug/enhancement template enrichment** (#1830) — `/bug` and `/enhancement` templates now include Scope (In scope / Out of scope), Acceptance Criteria (placeholder checkbox), and Proposed Fix (bug only) sections at creation time

### Changed

- **check-upgrade exit code semantics** (#1820) — Version drift now returns exit code 0 with `NEEDS UPDATE` status instead of exit code 1 with `FAIL`; new `determineOverallResult()` function extracts decision logic; ⚠️ icon for drift instead of ❌
- **Bug command version detection** (#1822) — Removed `framework-config.json` from `/bug` version detection chain; priority is now `package.json` → git tag → prompt
- **reset-issue bug support** (#1827) — `/reset-issue` now accepts `bug` label alongside enhancement, prd, and proposal

### Fixed

- **statusline-check --force flag** (#1821) — `statusline-check.js` now accepts `--force` flag to return `configured: false` regardless of existing settings; Session startup Step 3c passes `--force` when user launches with force flag

---

## [0.62.1] - 2026-03-13

### Fixed

- **Findings validation and malformed review detection** (#1825) — Added input validation to `review-finalize.js` to detect malformed findings JSON before processing
- **Findings schema documentation and alias tolerance** (#1828) — Documented findings JSON schema in `/review-issue` command spec; added alias tolerance (`issueNumber` → `issue`, `name` → `criterion`) for robustness

### Changed

- **Domain Taxonomy proposal** — Recorded review #3 (#1768)
- **Framework-Summary.md** — Corrected skill count from 33 to 34

---

## [0.62.0] - 2026-03-12

### Added

- **Review command thin orchestrator architecture** — rewrote `/review-issue` (317→102 lines), `/review-proposal`, `/review-prd`, `/review-test-plan`, and `/resolve-review` (231→95 lines) as thin orchestrators that delegate setup/cleanup to backing scripts (#1809, #1810, #1811)
- **`review-preamble.js` backing script** — consolidates issue loading, criteria resolution, extension loading, label detection, redirect routing, and early-exit logic for all review commands (#1806)
- **`review-finalize.js` backing script** — consolidates body metadata update, structured review comment posting, label assignment, and epic sub-issue label propagation (#1807)
- **`resolve-preamble.js` backing script** — consolidates review comment parsing, finding classification (auto-fixable vs user-input), and recommendation extraction (#1808)
- **`review-format.js` shared library** — `formatFindingLine()` and `parseReviewComment()` functions extracted from finalize; eliminates duplicated constants across review scripts (#1808, #1812)
- **Review criteria metadata files** — externalized inline criteria tables to JSON metadata: `prd-review-criteria.json` (#1783), `proposal-review-criteria.json` (#1794), `test-plan-review-criteria.json` (#1800)
- **Criteria graceful degradation** — all review commands fall back cleanly when criteria files are missing or malformed, with explicit error messages (#1786, #1799, #1803)
- **`command-boilerplate.json`** — extracted shared execution instructions boilerplate used across all command specs (#1798)
- **`prd-skill-matcher.js`** — extracted skills mapping from `/create-prd` to standalone script for reuse (#1791)
- **PRD/test plan template externalization** — moved inline templates to `Templates/artifacts/prd-template.md` and `Templates/artifacts/test-plan-template.md` (#1790)
- **Version detection in `/bug`** — auto-detects software version from `framework-config.json`, `package.json`, or git tags with user confirmation (#1816)
- **Security-finding label** — `/review-issue --with security` and `/code-review --with security` now apply `security-finding` label to issues with ⚠️/❌ security findings (#1818)
- **Status line detection** — `statusline-check.js` detects Claude Code status line configuration across user/project/local settings; session startup Step 3c spawns `statusline-setup` agent if unconfigured (#1542)
- **CLI entry point for `manage-skills.js`** — supports `node manage-skills.js list` invocation for symlink compatibility (#1815)
- **Deployment chain structural tests** — validates review backing scripts are registered in both `framework-manifest.json` and `constants.js` (#1813)
- **Token reduction validation tests** — verifies criteria extraction achieves target reduction ratios (#1801)
- **Schema validation tests** — validates structure of all review criteria metadata files (#1804)
- **Graceful degradation tests** — covers missing/malformed criteria file handling for all review types (#1799, #1803)
- **PRD and proposal artifacts** — review modularization PRDs (#1773, #1777, #1778, #1779) and domain taxonomy proposal

### Changed

- **Copyright notices** — renamed `Rubrical Systems (c) 2026` to `Rubrical Works (c) 2026` across all source files (317 files) (#1817)
- **`/create-prd` Extract Mode** — delegated to `codebase-analysis` skill instead of inline logic (#1793)
- **Phase 7 completion report** — compressed from ~20 lines to 6 lines (#1795)
- **`requiresTestPlan` filtering** — documented logic in `/review-prd` command spec (#1784)

### Fixed

- **`manage-skills` hubDir passing** — command spec now correctly passes `hubDir` to `installSkill()` function (#1814)
- **`parseCommand()` type guard** — added string type guard to handle both string and array input formats (#1814)
- **Criteria degradation error text** — added explicit "not found" message instead of generic fallback (#1803)

---

## [0.61.0] - 2026-03-12

### Added

- **`/code-review --with` domain extensions** — apply domain-specific review lenses (security, accessibility, performance, etc.) during code review, reusing the `review-extensions.json` registry and `load-review-extensions.js` loader (#1767)
- **Code Review Questions** — new fourth section in all 8 review criteria files (`security`, `accessibility`, `performance`, `chaos`, `contract`, `qa`, `seo`, `privacy`) with 7 domain-specific code review questions each (#1767)
- **`extractCodeReviewQuestions()` function** — extracts Code Review Questions from criteria markdown files in `load-review-extensions.js` (#1767)
- **`loadCodeReviewExtensions()` function** — loads registry, resolves domain IDs, reads criteria files, and returns structured domain question data (#1767)
- **Manifest domain tracking** — `.code-review-manifest.json` records `domains` array per file when `--with` is used; files approved without a domain are re-queued when that domain is first requested (#1767)
- **Skill category grouping** — `skill-keywords.json` now includes a `category` field for all 34 skills across 11 categories; `/manage-skills` available section groups skills by category (#1766)
- **`skillCategories` map in `skill-keywords.json`** — maps all 34 skills to categories (Testing, Analysis, Architecture, Platform, Database, Deployment, Web, Compliance, Debugging, Documentation, CI/CD) (#1766)
- **Load-review-extensions test suite** — 9 behavioral tests covering extraction, missing sections, unknown domains, missing registry fallback, and criteria file handling (#1767)
- **Proposals** — Testing Scaffold Skill Family (#1763), Domain Taxonomy, Independent Skill Distribution PRD updates (#1757)
- **Spike Workflow documentation** — added worktree spike section and `work --assign` shortcut (#1764)

### Changed

- **`/manage-skills` no-arg default** — changed from interactive mode to list mode; both paths now produce identical compact output (#1766)
- **`listSkills()` output** — always includes `category` field for each skill entry (#1766)
- **`/manage-skills` command spec** — replaced Interactive Mode section with List Display Format describing category-grouped output (#1766)

### Fixed

- **`parseCommand()` single-string splitting** — when invoked via command spec with `"$ARGUMENTS"`, shell passes all args as one token; `parseCommand` now splits internally (#1765)
- **Upgrade-check boundary test** — used 2-hour buffer to account for DST transitions in ms-based day calculation
- **Extension registry integration test** — regenerated `extension-points.json` for stale registry
- **IDPF-Testing-Core reference exclusion** — broadened from `Proposal/Implemented/` to `Proposal/` to cover active proposal files
- **`js-yaml` devDependency** — added missing dependency for CI coverage tests

---

## [0.60.0] - 2026-03-09

### Added

- **Extension integrity rewrite** — `checkExtensionIntegrity` now uses `git show` + block extraction instead of dead `diff.startsWith('-')` pattern; correctly detects when extension block content is lost during hub upgrades (#1754)
- **`extractExtensionBlocks()` helper** — reusable `Map<name, content>` parser for `USER-EXTENSION-START/END` blocks, exported for other tools (#1754)
- **`normalizeBlockWhitespace()` helper** — whitespace-insensitive comparison to avoid false positives from formatting differences (#1754)
- **`--deep N` flag for extension integrity** — scans back N commits to find content lost in earlier commits, not just HEAD (#1754)
- **Release-aware extension block tracking** — hub-aware comparison distinguishes upstream block removal (WARN) from user content loss (FAIL) (#1754)
- **Extension integrity test suite** — 17 behavioral tests covering content detection, whitespace normalization, deep history, and release-aware tracking (#1754)
- **Design decision** — documented `git show` approach rationale in Construction/Design-Decisions (#1754)

### Changed

- **Organization rename** — migrated from `rubrical-studios` to `rubrical-works` across all configuration, URLs, and documentation
- **`checkExtensionIntegrity` signature** — changed from `(projectDir)` to `(projectDir, options?)` with `{ deep, hubDir }` options (backward compatible) (#1754)

### Fixed

- **Dead extension integrity check** — replaced non-functional `diff.startsWith('-')` pattern that never triggered (#1754)
- **Templates sync** — updated `Templates/scripts/shared/check-upgrade.js` and `workstream-utils.js` to match installed copies

---

## [0.59.0] - 2026-03-08

### Added

- **`/catalog-screens` command** — discover and catalog screen elements from source code with framework-specific detection strategies (#1736, #1741)
- **`/mockups` command** — create text-based or diagrammatic screen mockups from screen catalogs (#1737)
- **`code-path-discovery` skill** — pattern scanning logic for behavioral path analysis with `--from-code` flag delegation from `/paths` (#1747, #1748, #1749)
- **Screen discovery integration** — `/proposal` and `/create-prd` now include screen discovery steps (#1739)
- **Screen catalog validation** — review commands (`/review-issue`, `/review-prd`, `/review-proposal`) validate screen catalogs (#1740)
- **Screen-Specs/ and Mockups/ directories** — lifecycle directory structure for screen design artifacts (#1738)
- **`--from-code` flag for `/paths`** — code-path-discovery delegation for automated path extraction (#1746)
- **Error handling validation** — `/paths` Step 3b adds error handling validation steps (#1748)
- **`playwright-explorer` skill** — interactive browser exploration with natural language interaction, DOM reading, and session management (SKILL.md created)
- **Proposals** — skill distribution architecture (#1751) and GitHub Pages web presence (#1753)

### Changed

- **`/work` Step 3 restructured** — commit gate added for cleaner workflow (#1744)
- **`/work` steps renumbered** — sequential numbering after Step 2 removal (#1729)
- **Skill count increased** — 33 → 34 (added `playwright-explorer` SKILL.md)
- **MAINTENANCE.md updated** — added missing `astro-development` and `resilience-patterns` entries

### Fixed

- **Test step references** updated after #1729 renumber, new commands registered (#1729)
- **`code-path-discovery.zip`** — rebuilt with version substitution (was containing `v0.79.0` placeholder)
- **Orphaned files** — removed 2 orphaned docs files from `.min-mirror/` and temp file from `code-path-discovery/`

---

## [0.58.0] - 2026-03-05

### Added

- **`/paths` command** — collaborative path analysis for proposals and enhancements with turn-based scenario discovery across 6 categories (#1705, #1713)
- **Path Analysis integration** into `/review-proposal` (#1710) and `/create-prd` Phase 3.5 extraction (#1711)
- **`--force` flag and early-exit gate** for review commands (`/review-issue`, `/review-proposal`, `/review-prd`, `/review-test-plan`) — skip re-review if `reviewed` label present (#1714)
- **Epic-aware `/done` command** with recursive sub-issue completion (#1715)
- **`skill-keyword-matcher.js`** backing script with unit tests for charter skill matching (#1713)

### Changed

- **work.md token reduction** — externalized doc templates and QA config to JSON, condensed epic/nonstop section from 56→18 lines, removed Step 2 dead code, cleaned up extension points; reduced spec from ~3,500 to ~1,746 tokens (50% reduction) (#1719–#1726)
- **Anti-hallucination language strengthened** — changed "Load" to "Re-read from disk, not memory:" across 10 externalized file references in 7 command specs; added general rule to anti-hallucination files (#1727)
- **Command specs updated** and Templates copies synced for /paths integration (#1713)
- **`gh pmu` terms acceptance** documented and proposals added (#1698, #1699)

### Fixed

- **Windows startup `tr` pipe failure** in Session-Startup-Instructions (#1700)
- **152 ESLint `no-unused-vars` warnings** cleaned up to zero across all JS files (#1720)
- **Manifest registration** for `skill-keyword-matcher.js` (#1713)

---

## [0.57.0] - 2026-03-04

### Added

- **Resilience patterns skill** — circuit breaker, retry, timeout, bulkhead, fallback patterns split from error-handling-patterns with broader language coverage (#1686)
- **Command spec audit skill** — evaluation rubric for command spec formatting and LLM processing reliability (#1678)
- **Default skills system** — `defaultSkills` array in framework-config.json, getDefaultSkills/isDefaultSkill utilities, charter and manage-skills integration (#1680)
- **/audit-commands command** — command spec formatting audit referencing command-spec-audit skill (#1678)
- **/audit-extensions command** — extension point content quality audit with creation-time guardrail (#1678)
- **/reset-issue command** — reset enhancement/prd/proposal issues to clean slate with preamble script and tests (#1483)
- **--nonstop flag for /work** — continuous sub-issue processing for epics/branch trackers without per-sub-issue STOP boundaries (#1689)
- **--all flag for /done** — batch complete all in_review issues on current branch (#1693)
- **Batch push optimization for /done** — deferred push when completing multiple issues (#1692)
- **Throttled artifact cleanup script** — rate-limited GitHub Actions artifact deletion preventing API rate limits during releases (#1696)
- **pre-phase-1 extension point** for prepare-release and prepare-beta commands (#1675)
- **Integration tests** for /audit-extensions command spec (#1677)
- **Nonstop mode design decision** documentation (#1689)
- **Default skills location design decision** documentation (#1680)
- **UML diagram type templates** and conventions for drawio-generation skill (#1685)
- **Parameterized test expansion** with framework syntax and test smell detection for test-writing-patterns (#1687)
- **Broader anti-pattern-analysis** for default skill status (#1683)
- **Expanded codebase-analysis** tech stack and NFR detection (#1684)
- **Copyright headers** added to all JS files (#1690)

### Changed

- **Rebrand Rubrical Studios → Rubrical Systems** across all files (#1690)
- **TDD skills interaction model** updated for autonomous execution (#1682)
- **Hardcoded skill counts replaced** with dynamic ALL_SKILLS.length (#1688)
- **Remove non-functional model: frontmatter** from all commands
- **/work --nonstop push strategy** deferred to /done (#1695)
- **Auto-assign tracker issue** to branch in /create-branch (#1691)
- **frameworkPath resolution** added to review extension loading (#1694)

### Fixed

- Discovery mode test for --all flag support (#1693)
- Remaining ASSISTANT references removed from tdd-green-phase and tdd-failure-recovery (#1682)

---

## [0.56.0] - 2026-03-03

### Added

- **Unified /manage-skills command** — list, install, remove, info, interactive subcommands with per-skill symlinking (#1660-#1664, #1672)
- **Skill registry schema enhancements** — category, suggests, postInstall, relevantTechStack, invocationMode fields (#1669)
- **Charter-driven skill recommendations** via matchSkillsToTechStack() (#1670)
- **Direct invocation awareness** via getInvocationMode() for skills (#1671)
- **Per-skill symlinking** with syncSkillSymlinks() for hub installer (#1666)
- **Directory-to-per-skill migration** via migrateSkillSymlinks() (#1668)
- **Post-install hook support** via getPostInstallHook() (#1665)
- **Windows junction support** for skill symlinking (#1667)
- **Astro development skill** — Islands architecture, Content Collections, multi-framework integration, deployment patterns (#1641)
- **Epic sub-issue expansion** in /assign-branch — detects epic label, expands sub-issues for bulk assignment (#1673)
- **Command model classification** — haiku/sonnet frontmatter for cost-optimized model routing (#1645, #1646, #1651)
- **Three-tier model classification** reference documentation (#1646, #1651)
- **Manage-skills PRD and test plan** (#1644)

### Changed

- **/install-skill retired** — migrated to /manage-skills (#1672)
- **Async preamble refactor** — parallelized per-commit git operations for performance (#1650)
- **--all flag removed** from /assign-branch — too broad and risky (#1673)
- **--add-ready documented** in /assign-branch frontmatter (#1673)

### Fixed

- Async mock for work-preamble and done-verify tests
- Skill registry sync: added astro-development to ALL_SKILLS
- Deferred Praxis Diagram config from charter to install-skill (#1642)

---

## [0.55.0] - 2026-03-01

### Added

- **Vercel deployment skill** — project setup with environment configuration (#1611)
- **Railway deployment skill** — project setup with environment configuration (#1612)
- **Render deployment skill** — project setup with environment configuration (#1613)
- **DigitalOcean App Platform deployment skill** — project setup with environment configuration (#1614)
- **SEO optimization skill** — review criteria, technical SEO, content optimization resources (#1602)
- **Privacy compliance skill** — GDPR/CCPA compliance, consent management, cookie compliance, dark pattern avoidance (#1603)
- **Playwright Explorer modules** — browser connection, DOM reader, NL interaction, session lifecycle, error recovery, pre-flight verification, auto-installation, component detection (#1628-#1635)
- **8 deployment recipe source files** for CI/CD integration (#1609)
- **Deployment recipe category** integrated into registry files (#1610)
- **SEO and privacy review extensions** registered for `/review-issue`, `/review-prd`, `/review-proposal` (#1621)
- **Deployment platform discovery** added to charter inception (#1616)
- **4 deployment skills registered** in framework registries (#1615)
- **Commit classification with label lookup** — `Refs #NNN` commits now classified via GitHub label lookup and keyword heuristics (#1601)
- **Epic review workflow case study** (#1608)
- **Seamless Deployment Platform Integration PRD** (#1598)
- E2E exploration lifecycle tests (#1638)
- IPC integration tests with real filesystem I/O (#1637)
- DOM reader edge case tests (#1636)
- E2E cross-reference verification tests (#1618)
- Deployment parity structural tests (#1512)

### Changed

- **QA extraction moved** from `/work` Step 2 to Step 5a for better workflow sequencing (#1624)
- **Epic sub-issue cascading removed** from `/assign-branch` (#1639)
- **Token budget considerations** added to drawio-generation skill (#1587)
- Template `recommend-version.js` synced with source (#1601)
- Framework documentation updated for deployment skills (#1617)

### Fixed

- Skill count inconsistency in Framework-Overview.md (#1617)
- CI node:test failures — updated hardcoded feature count 14→18

---

## [0.54.0] - 2026-02-27

### Added

- **`/work --assign` flag** — auto-assign issues to current branch during `/work` invocation, with `ALREADY_ASSIGNED` and `WORKSTREAM_CONFLICT` error handling (#1565)
- **Branch tracker support in `/work`** — issues with `branch` label now process sub-issues like epics, with `NO_SUB_ISSUES` and `ALL_SUB_ISSUES_COMPLETE` warnings (#1599)
- **`/extensions summary` subcommand** — shows condensed extension-point overview per command (#1576)
- **`/extensions list --status` flag** — filter extension points by active/empty status (#1576)
- **`/extensions matrix` alias** — shorthand for `list` subcommand (#1576)
- **Tracker body guidance in `/create-branch`** — new Step 3.5 populates branch tracker with structured guidance sections (#1599)
- **3 missing test-writing-patterns resources** — `assertion-patterns.md`, `test-doubles-guide.md`, `test-organization-examples.md` (#1564)
- **Skill keyword expansion** — expanded `skill-keywords.json` with missing keywords for 10 skills, expanded "When to Use" trigger phrases in 8 SKILL.md files (#1564)
- **PRD, diagrams, and test plan** for Work Tracker & More milestone (#1544)
- **Design decision** for skill keyword single source approach (#1564)

### Changed

- **Session-Startup-Instructions.md restructured** — now uses `FRAMEWORK-ONLY` markers instead of requiring hub code generation; minimized version deployable directly as rules file (#1597)
- **FRAMEWORK-ONLY stripping extended** — minimize pipeline now strips FRAMEWORK-ONLY blocks from all files, not just commands (#1597)
- **Skill packages rebuilt** — 11 skill packages rebuilt after keyword and resource changes (#1564)

### Fixed

- **`/check-upgrade` stale config self-flagging** — `checkStaleConfigReferences()` now excludes `check-upgrade.md` from scan, since its `.gh-pmu.yml` references are documentation text, not actual config usage (#1582)
- **`/check-upgrade` commit prompt** — CLI now parses `---JSON---` output for `commitReady`, supports `chore: upgrade hub to vX.Y.Z` commit message pattern, and respects `--no-commit` flag (#1579)
- **CI sync and skill count fixes** — synced Templates scripts, updated skill counts, regenerated extension registry (#1589)

### Removed

- **`extract-prd` zombie skill** — removed orphaned skill directory and all references from registry, keywords, and documentation (#1564)
- **`keywords:` frontmatter field** — removed from 3 skills in favor of centralized `skill-keywords.json` (#1564)

---

## [0.53.1] - 2026-02-25

### Fixed

- **`checkCommandVersionDrift` not wired into CLI** — version drift check existed but was never called from the `check-upgrade.js` CLI entry point; now properly wired with hub directory auto-detection from symlink targets (#1574)
- **Stale `.gh-pmu.yml` config reference detection** — new `checkStaleConfigReferences()` check reports both stale files (still referencing `.yml`) and already-migrated files (using `.json`) (#1574)
- **`/check-upgrade` CLI commit offering** — CLI entry point now parses `--commit`/`--no-commit` flags, outputs structured JSON for AI consumption, and supports symlink-aware auto-commit staging (#1575)
- **Command spec Step 7 incorrect paths** — `git add` now stages only non-symlinked project-owned files (`.claude/commands/`, `framework-config.json`), excluding symlinked hub directories (#1575)

---

## [0.53.0] - 2026-02-25

### Added

- **4 new extension points in `/work`** — `post-documentation`, `post-implementation`, `post-ac-verification`, `post-sub-issue-done` (#1570)
- **`linkToTracker()` and `linkAllToTracker()`** — serialized tracker linking functions in assign-branch.js (#1572)
- **Design decision documentation** for CLI installer retirement and .gh-pmu.json migration (#1566, #1567)

### Changed

- **`/check-upgrade` diff-based comparison** — Step 4 now uses content diff as default path, version comparison as fast path (#1562)
- **`pre-work` extension point relocated** from between Steps 1-2 to between Steps 0-1 for correct semantic placement (#1570)
- **`assignToBranch()` decoupled** from tracker linking — now only performs `gh pmu move` (#1572)
- **`assignSubIssuesToBranch()`** returns `{ assigned, issueNumbers }` instead of count (#1572)
- **Hooks simplified** — removed debug payloads, deleted startup hook
- **`.gh-pmu.yml` → `.gh-pmu.json`** migration across commands, rules, tests, and documentation (#1566)
- **CLI installer references** updated from retired scripts to px-manager (#1567)

### Removed

- **CLI installer scripts archived** — `install-hub.js`, `install-project-existing.js`, `install-project-new.js`, `fetch-updates.js` (#1567)
- **Version-header WARN** removed from check-upgrade in favor of diff-based comparison (#1562)

### Fixed

- **Fan-in concurrency bug** — `Promise.all()` with `gh pmu sub add` on same parent tracker now serialized via post-pass (#1572)
- Missing `@framework-script` tags in simplified hooks

---

## [0.52.0] - 2026-02-25

### Added

- **Done Preamble Script** (`done-preamble.js`) — consolidates 6-8 deterministic `/done` command round-trips into a single script invocation returning structured JSON (#1553):
  - Core validation, argument parsing, and status checks (#1554)
  - Diff verification integration with conditional move (#1555)
  - CI pre-check via `hasPushWorkflows()` and branch tracker linking (#1556)
  - Discovery mode for no-args in_review query (#1557)
  - Command spec rewritten from 6 inline steps to 4 preamble-based steps (#1558)
  - Schema validation and coverage gap tests — 85 node:test, 1904 Jest (#1559)
- **Cross-platform `.deb` build resource** for electron-development skill (#1563)
- **Packaging/deb keywords** for electron-development skill (#1563)

### Changed

- **Skill resource minimization** — all 24 skill SKILL.md and 77 resource files minimized from source, reducing token consumption (#1540)
- **`assign-branch.js` epic label auto-detection** — single-issue assignments now auto-detect the `epic` label (#1560)
- **`/done` command spec** rewritten to use preamble script pattern (Steps 1-4) matching `/work` (#1558)

### Fixed

- Discovery mode test for CI environment — accepts `PMU_MISSING` error code alongside `NONE_IN_REVIEW` (#1559)
- Windows Git Bash Phase 2c inline script failure in `/prepare-release` validation

---

## [0.51.1] - 2026-02-24

### Added

- **Artifact lifecycle management features** for `/ci` command (#1508):
  - `artifact-retention` — injects `retention-days: 1` into `upload-artifact` steps (v1 tier)
  - `artifact-conditional-upload` — wraps uploads with `if: startsWith(github.ref, 'refs/tags/')` (v1 tier)
  - `artifact-cleanup` — adds `delete-artifact` step after release publish (v2 tier)
- **`step-modify` injection type** in `ci-add.js` for modifying existing workflow steps in-place (#1508)
- **Artifact hygiene gap detection** in `ci-recommend.js` — flags `upload-artifact` without `retention-days` (#1508)
- **Upload-artifact anti-pattern warning** in `ci-validate.js` (#1508)
- **`RELATED_FEATURES` entries** for artifact features in `ci-hints.js` (#1508)
- **20 new tests** in `ci-artifact-features.test.js` covering registry, list, add, recommend, validate (#1508)
- **Documentation**: Artifact management features in `Release-Variants-and-Extensions.md` (#1508)
- **Design decision**: `artifact-step-modify-injection.md` — rationale for step-modify vs alternatives (#1508)

### Fixed

- **`/done` Step 5b CI pre-check invocation ambiguity** on Windows Git Bash (#1539):
  - Changed pseudo-code `js` block to executable `bash` block with `node -e` pattern
  - Fixed `require()` path to use `./` prefix for ci-watch.js
  - Fixed background spawn path to use `./` prefix
- **Hardcoded feature count assertions** (11 → 14) in `ci-list.test.js` and `ci-hints.test.js` (#1508)

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

- **framework-manifest.json version placeholder**: Replace hardcoded version with `v0.79.0` placeholder, matching the deployment pattern used by all other framework files (#1479)
- **generate-test-plan.js**: Handle `v0.79.0` placeholder gracefully by falling through to `vX.Y.Z` default (#1479)
- **audit.js**: Skip version mismatch check when manifest uses `v0.79.0` placeholder in dev environment (#1479)

### Added

- Manifest version validation test accepting both semver and `v0.79.0` placeholder (#1479)

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
- **#1059** - Skills retain v0.79.0 placeholder after packaging
  - Added version substitution to `/minimize-files` Step 5 (sed replacement during packaging)
  - Added MAINTENANCE.md auto-generation to `/minimize-files` Step 6
  - Added v0.79.0 detection check to `/skill-validate` (Check 2.6)
  - Fixed `validate-helpers.js` to validate against actual directories (removed hardcoded values)
  - All 25 skill packages now contain actual version numbers

- **#1092** - Standardize skill version format to YAML frontmatter
  - Updated all 25 skill source files to use `version: "v0.79.0"` in YAML frontmatter
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
  - All 52 framework JS files now use `@framework-script v0.79.0` pattern
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
- **#951** - Replace hardcoded versions with `v0.79.0` placeholder
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
- **#933** - v0.79.0 tokens in 12 script files
  - Replaced hardcoded version numbers with `v0.79.0` placeholder
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
  - Changed hardcoded version to `v0.79.0` placeholder
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
- **#887** - `framework-manifest.json` now uses `v0.79.0` placeholder for proper version injection during deployment
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
  - Frontmatter uses `v0.79.0` placeholder instead of hardcoded versions
  - Installer regex updated for backward compatibility
- **#840** - PRD directory structure: `PRD/Active/` and `PRD/Implemented/`
- **#821** - README-DIST.md now uses `v0.79.0` placeholder

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
- **Rules rebuild from minimized sources** - All rules now use v0.79.0 placeholder

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
- Restored v0.79.0 placeholders to 209 framework source files

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
- **Version placeholder handling** - `parseManifest()` now correctly handles `v0.79.0` placeholder in `Templates/framework-manifest.json`
- **Skill count documentation** - Updated skill count from 21 to 22 across all documentation (Framework-Overview.md, Framework-Summary.md, Framework-Skills.md, README.md) to include `promote-to-prd` skill

### Changed
- **Installer charter support** - Charter feature files (Charter-Enforcement.md, Runtime-Artifact-Triggers.md) now deployed by installer
- **Version placeholder standardized** - All version tokens now use `v0.79.0` format for consistent replacement

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
- **Template version placeholders** (#627) - Fixed 35+ Template files missing `v0.79.0` placeholder. Commands, scripts, and shell scripts now properly receive version during installation.
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
- **LICENSE** - Updated copyright to Rubrical Systems
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

[0.60.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.59.0...v0.60.0
[0.15.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rubrical-works/idpf-praxis-dev/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rubrical-works/idpf-praxis-dev/releases/tag/v0.1.0
