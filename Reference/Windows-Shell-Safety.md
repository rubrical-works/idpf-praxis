# Windows Shell Safety for Claude Code
**Version:** v0.110.0
**Source:** Reference/Windows-Shell-Safety.md
**MUST READ:** Auto-loaded on Windows at session startup.
Claude Code uses Git Bash on Windows. Most Unix commands work, but these patterns fail or behave unexpectedly.
**Always use Unix-style commands and patterns.**
**Command Translations**
| Windows CMD | Unix/Bash |
|-------------|-----------|
| `date /t` | `date "+%Y-%m-%d"` |
| `dir` | `ls` |
| `copy` | `cp` |
| `move` | `mv` |
| `del` | `rm` |
| `type` | `cat` (or Read tool) |
| `%VARIABLE%` | `$VARIABLE` |
| `set VAR=value` | `export VAR=value` |
| `C:\path\to\file` | `C:/path/to/file` |
| `taskkill /F /IM` | `powershell -Command 'Stop-Process ...'` |
Pipes, redirects, `$VAR` expansion and a short, predictable `$(cmd)` work normally.
**Command-shape corrections arrive from a hook:** `shell-safety-hook.js` (PreToolUse, `Bash`) adds the matching correction from `shell-pattern-corrections.json` only when a command needs it, and **blocks** `date /t` / `taskkill /F` with the fix.
**Parallel Tool Failures:** NEVER batch a command that can fail with unrelated tool calls. A single failure cancels all siblings. Destructive/cleanup commands and network calls must run alone or sequentially.
"Sibling tool call errored" is NOT the real error. Find the ONE tool with the actual error, fix it, retry.
```
Bash(date /t)                    <- ROOT CAUSE (find this)
  Error: date: invalid date '/t'
Bash(git branch)                 <- Aborted (ignore)
  Error: Sibling tool call errored
```
**Issue/PR bodies** go through a temp file (`-F` / `--body-file`), never inline `--body`.
**Examples use `gh pmu create` — deliberately.** The bare `gh issue` creation form,
without `pmu`, files an issue that never reaches the project board: invisible to
`gh pmu sub list`, epic closure, `/done` sub-issue checks and every board-driven gate — it
exists, satisfies nothing, blocks nothing. The `-F` / `--body-file` lesson below is identical
for both commands; board membership is not. QA case: `Reference/GitHub-Workflow.md`
§ QA-Issue Creation Ownership.
**One exception, and it is not a shell-safety one.** A `--target` **companion** filing uses the bare `gh issue` creation form deliberately: there the local board is exactly what must not be touched, since `gh pmu create -R` would add the issue to **this** repo's board. `file-companion-issue.js` then adds it to the *companion's* board, so membership is redirected rather than lost. **Do not read the prohibition above as covering that path.** Everything else is unchanged, `-F` / `--body-file` over inline `--body` included — that applies to the bare form exactly as to `gh pmu`.
**Naming the temp file — creation vs editing.** A fixed scratch name is a collision, not a convention: concurrent sessions in one working directory are a supported, announced setup, so two sessions running the same command share any fixed path. One session's write landing between another's write and its `gh pmu` call sends the wrong body to the wrong issue, and one session's `rm` can remove a file the other has not read. **Neither failure reports anything.** One question decides the name: does the issue number exist yet?
| Path | Name | Why |
|---|---|---|
| **Editing** an existing issue | `.tmp-{issue#}.md` | The number is in scope and is the natural discriminator — two sessions editing *different* issues cannot collide, and two editing the *same* one are a conflict the name must not hide |
| **Creating** an issue | `.tmp-{what}-{random}.md`, suffix shelled out | No number exists until after the body is written. Generated **once per invocation**, before first use, named at every site |
| **Scratch** not about an issue | `.tmp-{what}-{random}.{ext}` | Same as creation — nothing to name it after |
```bash
BODY_FILE=".tmp-proposal-body-$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))").md"
```
**Never invent the suffix** — shell out for it; a composed value is not random, and two sessions reasoning alike reach the same "random" name. **Always keep the `.tmp-` prefix**, either form: the startup stale-scratch sweep collects `.tmp-*` and nothing else, so a name without it survives every interrupted run and is never reclaimed. **One generated name per file held open at once** — `/create-backlog`'s epic and story bodies, `/plan-workstreams`' mapping and plan each need two distinct names; one shared name collides with itself, no second session required.
**Symlinked Directories and Glob:** Glob does NOT follow symlinks. Files inside symlinked directories are invisible to Glob.
**Non-traversal is NOT Glob-only — it also defeats context auto-discovery.** Read, `cat` and `ls` traverse a junction; an earlier version said other tools "access them fine" unqualified, which was true of explicit reads, false of discovery, and the sentence that made this defect look impossible: `.claude/rules/` was deployed as a junction, so **none of the 8 auto-loaded rules reached context in any deployed project.** Nothing errored, files read fine through the link, the startup block still rendered — the rules were never discovered.
| Consumed by | Traverses a junction? |
|---|---|
| Read, `cat`, `ls`, `node require()` — explicit paths | **Yes** |
| Glob | **No** |
| Claude Code project-instruction auto-discovery (`.claude/rules/`) | **No** |
**Affected dirs in user projects:** `.claude/metadata/`, `.claude/hooks/`, `.claude/recipes/`, `.claude/scripts/shared/` -- symlinked to hub, consumed by explicit reads, so the Glob caveat is their only consequence.
**`.claude/rules/` is moving out of that set.** `framework-manifest.json` `deploymentFiles.rulesDeploymentMode` declares it `copied`. Until Praxis Hub Manager stops creating the junction (`rubrical-worker/px-manager#1146`) **already-installed projects still have one** — junctioned in the field, copied by contract, until that ships.
**Not affected:** `.claude/skills/`, `.claude/commands/`, `.claude/extensions/` are **copied**, not symlinked -- real dirs, Glob works. See `Reference/Deployment-Awareness.md`.
**Rules:**
1. **Known paths -> Read tool directly.** Do NOT use Glob to check existence first.
2. **Discovery in symlinked dirs -> Bash `ls`.** Use `ls .claude/metadata/` instead of Glob.
3. **Non-symlinked dirs -> Glob is fine.**
**Upstream:** anthropics/claude-code#27254
**End of Windows Shell Safety**
