# Anti-Hallucination Rules for Software Development
**Version:** v0.116.0
**Core Principle:** Verification over assumption. Project state over training memory. Observable actions over confident-sounding answers. Every rule names a *condition* and an *observable action*.
## Information Source Hierarchy
When facts conflict, trust them in this order:
1. **The project's own files** — README, package manifest, lockfile, config, source, tests. Read them before reasoning about the project.
2. **User-provided context in the current conversation** — requirements, shared snippets, error output.
3. **Official documentation** — fetched via WebFetch / WebSearch when project files are silent.
4. **Training memory** — only when 1–3 are unavailable, with an explicit hedge ("based on training; verify against current docs").
Skipping 1–3 because 4 *feels* sufficient is a hallucination risk, not an efficiency win.
## Verification Procedures (run *before* answering)
### V1 — Verify the project's stack before assuming it
**Trigger:** About to recommend a library, framework version, language feature, or build command.
**Action:** Read `README.md` and the manifest (`package.json` / `pyproject.toml` / `requirements.txt` / `go.mod` / `Cargo.toml` / `Gemfile` / `pom.xml` / `build.gradle`). Do not infer the stack from filenames or imports alone.
### V2 — Verify a CLI flag before claiming it exists
**Trigger:** About to write a shell command with a flag you have not used in this session.
**Action:** Run `<command> --help` (or `man <command>`) and read the output. If that is not safe to run, say so and ask the user to confirm the flag.
### V3 — Verify a dependency before claiming it is installed
**Trigger:** About to import or call a third-party library.
**Action:** Grep the manifest/lockfile for it. If absent, say so and offer to add it; never write code importing a package the project does not have.
### V4 — Verify a test framework's syntax by reading an existing test
**Trigger:** About to write or modify a test in a framework whose conventions you have not seen this session.
**Action:** Find an existing test (e.g., `**/*.test.*`, `**/*_test.go`, `**/test_*.py`), Read it, and match its assertion style, fixtures and imports. Do not mix frameworks.
### V5 — Verify a file path before referencing it
**Trigger:** About to write a file path into code, a command, an issue body, or a doc.
**Action:** Confirm it exists with Read or Glob. Never construct paths from training memory or directory-name guesses.
### V6 — Re-read an externalized file after compaction or after an unrelated edit
**Trigger:** About to act on a JSON config, schema, template or rule file read earlier in the session.
**Action:** Read it again from disk, by full path. Never paraphrase or reconstruct it from memory, and never skip a read because you "already loaded it". After compaction, treat *every* externalized file reference as a fresh read.
### V7 — Read a file before editing it
**Trigger:** About to call Edit or Write on an existing file.
**Action:** Read it first — the Edit tool enforces this; do not work around it. **Bulk operations:** (1) **enumerate** every file in scope and note the count; (2) **read** each before modifying; (3) **track** progress as `Processing N of M`; (4) **confirm** by re-listing afterwards. Counts come from listing, not from memory.
### V8 — Verify external UI/docs by fetching, not by remembering
**Trigger:** The user references a web page, installer wizard, third-party tool menu, or documentation site you cannot see.
**Action:** WebFetch it, or ask the user to describe what they see. **Never describe** navigation paths, page structure, button labels, menus or wizard options from memory — "I can't see that page; WebFetch it, or describe what it shows" — never "Click Quick Start". If you cannot verify the information exists, say so.
### V9 — Verify existing skill coverage before writing new automation
**Trigger:** About to propose a new script, command, or skill.
**Action:** Read `.claude/metadata/skill-registry.json` and list `.claude/skills/` on disk — a filesystem lookup, since `disable-model-invocation: true` skills never appear in the session skill list. Registry absent (by design in a self-hosted framework repo) → warn and skip.
## NEVER Invent
- ❌ API methods, function signatures, class names, property names → V1 + read the source
- ❌ Configuration file syntax or option names → Read an existing config in the project
- ❌ CLI flags, subcommands, environment variables → V2
- ❌ Library or package names → V3
- ❌ Test framework assertions or fixtures → V4
- ❌ File paths, directory layouts → V5
- ❌ URLs, endpoints, documentation navigation → V8
## NEVER Assume
- ❌ Operating system, shell, or Node/Python version → Read project config or ask
- ❌ Build system, test runner, or CI provider → V1 + check `.github/workflows/`, `Makefile`, `package.json` scripts
- ❌ Branching strategy or commit conventions → Read recent `git log` and `CONTRIBUTING.md`
- ❌ That a feature is already implemented → Grep for it before suggesting it as new
- ❌ That credentials or environment variables are configured → Check `.env.example` or ask
- ❌ Database schema or migrations state → Read migration files
## NEVER Expand Scope
- ❌ Edit files the user did not mention
- ❌ "Improve" or "clean up" code adjacent to the requested change
- ❌ Treat one explicit request as license for similar actions on related items
- ❌ Add features, error handling, or abstractions the user did not request
- ❌ Refactor while fixing a bug
When tempted to do "one more thing," stop and report it as a separate suggestion.
## NEVER Reduce Scope Without Confirmation
Implement *all* specified requirements. Unilateral scope decisions are prohibited.
- ❌ Marking a requirement "optional" or "nice-to-have" without user approval
- ❌ Deferring to "future work" or "Phase 2" without explicit agreement
- ❌ Removing or skipping acceptance criteria
- ❌ Replacing a requirement with a "simpler alternative" without approval
- ❌ Declaring something "out of scope" that was in the original spec
**When scope concerns arise: STOP → REPORT → ASK → WAIT.** Ask: "Should I proceed as specified, or adjust the scope?" Do not proceed until an explicit decision.
## STOP Boundary Enforcement
A command spec's STOP boundary (e.g., `## STOP — Workflow Boundary`) is a **hard stop**, not a suggestion.
1. **STOP means STOP.** Execution halts at the boundary.
2. **No "helpful continuation."** Do not proceed past STOP even if the next steps seem logical, helpful, or obvious.
3. **User instruction required.** Only an explicit user instruction authorizes crossing a STOP boundary.
4. **Re-verify after context loss.** After compaction, re-read the command spec before continuing — do not assume pre-compaction state.
## Externalized File References
V6 applies to every externalized file a command spec names (configs, criteria, templates): re-read it with the Read tool before acting, by full path, and treat every reference after compaction as a fresh read.
## When in Doubt
1. **Read project state.** README, manifest, source, tests, config.
2. **Run a help command or fetch the docs.** V2, V8.
3. **Ask the user a specific question** — "which version of X?", not "what do you want?"
4. **State the limit.** "I don't have reliable information about Z."
**End of Anti-Hallucination Rules for Software Development**
