# Windows Shell Safety for Claude Code
**Version:** v0.116.0
**Source:** Reference/Windows-Shell-Safety.md
**MUST READ:** Auto-loaded on Windows at session startup. Claude Code uses Git Bash on Windows; most Unix commands work, but these patterns fail or behave unexpectedly. **Always use Unix-style commands and patterns.**
### Command Translations
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
**Command-shape corrections arrive from a hook:** `.claude/hooks/shell-safety-hook.js` (PreToolUse, `Bash`) adds the matching correction from `.claude/metadata/shell-pattern-corrections.json` only when a command needs it, and **blocks** `date /t` / `taskkill /F` with the fix.
### Parallel Tool Failures
**NEVER batch a command that can fail with unrelated tool calls.** A single failure cancels all siblings. Destructive/cleanup commands and network calls must run alone or sequentially. **"Sibling tool call errored" is NOT the real error** — find the ONE tool with the actual error, fix it, retry.
```
Bash(date /t)                    <- ROOT CAUSE (find this)
  Error: date: invalid date '/t'
Bash(git branch)                 <- Aborted (ignore)
  Error: Sibling tool call errored
```
**Issue/PR bodies** go through a temp file (`-F` / `--body-file`), never inline `--body`. Examples use `gh pmu create`: the bare `gh issue` creation form never reaches the project board, and that prohibition and its `--target` companion exception are owned by `02-github-workflow.md` § QA-Issue Creation Ownership (#3060 item 8). Reasoning: `{frameworkPath}/Reference/Windows-Shell-Safety-Rationale.md`.
## Naming the temp file: creation vs editing
**A fixed scratch name is a collision, not a convention:** concurrent sessions in one working directory share any fixed path, and **neither failure reports anything**. One question decides the name: does the issue number exist yet?
| Path | Name |
|---|---|
| **Editing** an existing issue | `.tmp-{issue#}.md` |
| **Creating** an issue | `.tmp-{what}-{random}.md`, suffix shelled out, generated **once per invocation** before first use |
| **Scratch** not about an issue | `.tmp-{what}-{random}.{ext}` |
```bash
BODY_FILE=".tmp-proposal-body-$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))").md"
```
**Never invent the suffix** — shell out for it. **Always keep the `.tmp-` prefix** — the startup stale-scratch sweep collects `.tmp-*` and nothing else. **One generated name per file held open at once.**
## Symlinked Directories and Glob
**Glob does NOT follow symlinks** (junctions on Windows), and neither does context auto-discovery:
| Consumed by | Traverses a junction? |
|---|---|
| Read, `cat`, `ls`, `node require()` — explicit paths | **Yes** |
| Glob | **No** |
| Claude Code project-instruction auto-discovery (`.claude/rules/`) | **No** |
**Affected dirs in user projects:** `.claude/metadata/`, `.claude/hooks/`, `.claude/recipes/`, `.claude/scripts/shared/` — symlinked to the hub, read explicitly, so only Glob is affected. **`.claude/rules/` is moving out of that set:** `deploymentFiles.rulesDeploymentMode` declares it `copied`, but until Praxis Hub Manager stops creating the junction (`rubrical-worker/px-manager#1146`) **already-installed projects still have one**. **Not affected:** `.claude/skills/`, `.claude/commands/`, `.claude/extensions/` are **copied** — real dirs, Glob works (`Reference/Deployment-Awareness.md` → *Dependency Resolution for Copied Skills*).
**Rules:**
1. **Known paths -> Read tool directly.** Do NOT use Glob to check existence first.
2. **Discovery in symlinked dirs -> Bash `ls`.** Use `ls .claude/metadata/` instead of Glob.
3. **Non-symlinked dirs -> Glob is fine.**
**Upstream:** anthropics/claude-code#27254
**End of Windows Shell Safety**
