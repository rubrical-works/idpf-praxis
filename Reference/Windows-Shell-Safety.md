# Windows Shell Safety for Claude Code
**Version:** v0.106.0
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
## Pattern Safety

| Pattern | Safe? | Use Instead |
|---------|:-----:|-------------|
| `$(cmd)` -- short, predictable output | Yes | -- |
| `$(cmd)` -- output may contain backticks/quotes/newlines | No | Write tool + temp file |
| `for x in $(cmd)` | No | Glob patterns or temp file |
| Nested `$($(cmd))` | No | Sequential commands |
| Heredoc with backticks | No | Write tool + temp file |
| `--body "..."` inline | No | `-F file.md` or `--body-file` |
| `--flag value` (strings) | Caution | `--flag=value` |
| Backslash paths | No | Forward slashes |
| Absolute paths in args | No | Relative paths (`.tmp-*`) |
| JSON inline | No | `--input` or temp file |
| `rm -rf a/ b/ c/` | No | One path at a time |
| Single quotes | Caution | Prefer double quotes |
| Pipes `\|` | Yes | -- |
| Redirects `>` `>>` | Yes | -- |
| `$VAR` expansion | Yes | -- |
| `--body-stdout` / `--body-stdin` | Yes | Use `.tmp-{issue#}.md` for edits |
**Parallel Tool Failures:** NEVER batch a command that can fail with unrelated tool calls. A single failure cancels all siblings. Destructive/cleanup commands and network calls must run alone or sequentially.
"Sibling tool call errored" is NOT the real error. Find the ONE tool with the actual error, fix it, retry.
```
Bash(date /t)                    <- ROOT CAUSE (find this)
  Error: date: invalid date '/t'
Bash(git branch)                 <- Aborted (ignore)
  Error: Sibling tool call errored
```
**Heredocs with Backticks:** NEVER use backticks inside heredocs.
```bash
# BAD
git commit -m "$(cat <<'EOF'
Fix bug in `calculateTotal` function
EOF
)"
# GOOD - generate the name once, Write tool creates the file, then:
MSG_FILE=".tmp-msg-$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))").txt"
git commit -F $MSG_FILE
rm $MSG_FILE
```
**Command Substitution:** If output is short, single-line, free of backticks/quotes/special chars, `$(...)` is safe. Otherwise use a temp file.
Safe patterns:
```bash
today=$(date "+%Y-%m-%d")
branch=$(git branch --show-current)
sha=$(git rev-parse HEAD)
count=$(git log --oneline | wc -l)
ver=$(node -e "console.log(require('./package.json').version)")
git commit -m "Release $(date '+%Y-%m-%d')"
```
Unsafe patterns:
```bash
# BAD - unpredictable content
gh pmu create --body "$(cat README.md)"
dir=$(dirname $(realpath "$file"))
for file in $(find . -name "*.md"); do echo "$file"; done
# GOOD
gh pmu create --body-file README.md
gh pr create --body-file $PR_BODY_FILE   # generated name, Write tool creates it
```
**Issue/PR Bodies:** ALWAYS use temp file approach. Bodies almost always contain backticks which fail with heredocs or `--body`.
**Examples use `gh pmu create` — deliberately (#2724).** The bare `gh issue` creation form,
without `pmu`, files an issue that never reaches the project board: invisible to
`gh pmu sub list`, epic closure, `/done` sub-issue checks and every board-driven gate — it
exists, satisfies nothing, blocks nothing. The `-F` / `--body-file` lesson below is identical
for both commands; board membership is not. QA case: `Reference/GitHub-Workflow.md`
**One exception, and it is not a shell-safety one (#2775).** A `--target` **companion** filing uses the bare `gh issue` creation form deliberately: there the local board is exactly what must not be touched, since `gh pmu create -R` would add the issue to **this** repo's board. `file-companion-issue.js` then adds it to the *companion's* board, so membership is redirected rather than lost. **Do not read the prohibition above as covering that path.** Everything else is unchanged, `-F` / `--body-file` over inline `--body` included — that applies to the bare form exactly as to `gh pmu`.
§ QA-Issue Creation Ownership.
```bash
# BAD
gh pmu create --body "Fix the \`calculateTotal\` function"
# GOOD - Write tool + temp file, path generated once per invocation
BODY_FILE=".tmp-bug-body-$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))").md"
gh pmu create --title "Bug: ..." -F $BODY_FILE --status backlog
rm $BODY_FILE
# GOOD - editing existing issues (name it after the issue)
gh pmu view 123 --body-stdout > .tmp-123.md
gh pmu edit 123 -F .tmp-123.md && rm .tmp-123.md
```
**Rule:** Never attempt `--body` with inline content on Windows. Always use `-F` with a temp file.
**Naming the temp file — creation vs editing (#2983, #2985).** A fixed scratch name is a collision, not a convention: concurrent sessions in one working directory are a supported, announced setup, so two sessions running the same command share any fixed path. One session's write landing between another's write and its `gh pmu` call sends the wrong body to the wrong issue, and one session's `rm` can remove a file the other has not read. **Neither failure reports anything.** One question decides the name: does the issue number exist yet?
| Path | Name | Why |
|---|---|---|
| **Editing** an existing issue | `.tmp-{issue#}.md` | The number is in scope and is the natural discriminator — two sessions editing *different* issues cannot collide, and two editing the *same* one are a conflict the name must not hide (#1034) |
| **Creating** an issue | `.tmp-{what}-{random}.md`, suffix shelled out | No number exists until after the body is written. Generated **once per invocation**, before first use, named at every site (#2980) |
| **Scratch** not about an issue | `.tmp-{what}-{random}.{ext}` | Same as creation — nothing to name it after |
```bash
BODY_FILE=".tmp-proposal-body-$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))").md"
```
**Never invent the suffix** — shell out for it; a composed value is not random, and two sessions reasoning alike reach the same "random" name. **Always keep the `.tmp-` prefix**, either form: the startup stale-scratch sweep collects `.tmp-*` and nothing else, so a name without it survives every interrupted run and is never reclaimed. **One generated name per file held open at once** — `/create-backlog`'s epic and story bodies, `/plan-workstreams`' mapping and plan each need two distinct names; one shared name collides with itself, no second session required.
**gh pmu Body Flags:** Prefer `--body-stdout` / `--body-stdin` for cleaner workflows.
Preferred stdout/stdin pattern:
```bash
gh pmu view 123 --body-stdout > .tmp-123.md
gh pmu edit 123 -F .tmp-123.md && rm .tmp-123.md
BODY_FILE=".tmp-bug-body-$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))").md"
gh pmu create --title "Bug: ..." -F $BODY_FILE --status backlog
cat issue-body.md | gh pmu edit 123 --body-stdin
```
Alternative body-file pattern:
```bash
gh pmu view 123 --body-file    # Creates tmp/issue-123.md
gh pmu edit 123 -F tmp/issue-123.md
rm tmp/issue-123.md
```
**Path Handling:** Use forward slashes. Quote paths with spaces.
```bash
# BAD
cd C:\Users\Name\My Projects
# GOOD
cd "C:/Users/Name/My Projects"
cd "$USERPROFILE/My Projects"
```
**Temp File Best Practices:** NEVER pass absolute paths to shell commands for temp files. Use relative paths (`.tmp-*`).
1. **Use relative paths** for temp files (`.tmp-*`) -- absolute paths get backslashes stripped
2. **Use Write tool** instead of `cat`, `echo >`, or heredocs for file creation
3. **Clean up** immediately after use
4. **Use unique names — always** (§ Naming the temp file): editing an issue → include its number (`.tmp-123.md`); creating one, or any scratch file not about an issue → a shelled-out random suffix generated once per invocation (`.tmp-body-a1b2c3d4.md`). Prevents overwrites both **within** a session working several issues and **across** concurrent sessions sharing the directory — the second is what a fixed name cannot survive
**Quoting:** Prefer double quotes. Escape special characters.
```bash
# BAD
echo '$HOME'  # May print literal $HOME
# GOOD
echo "$HOME"
echo "The file is \`important\`"
```
**JSON in Commands:** Use temp files for JSON payloads.
```bash
# BAD
gh api graphql -f query='{ "query": "..." }'
# GOOD - Write tool creates $QUERY_FILE (generated name)
gh api graphql --input $QUERY_FILE
rm $QUERY_FILE
```
**Multi-line Strings:** Use temp files for multi-line content.
```bash
# BAD
gh pmu create --body "Line 1
Line 2"
# GOOD - Write tool creates the file at a generated path
BODY_FILE=".tmp-body-$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))").md"
gh pmu create --body-file $BODY_FILE
rm $BODY_FILE
```
**Flag Values with Spaces:** `--flag value` can be misinterpreted on Git Bash.
```bash
# BAD - value interpreted as separate argument
gh pmu view 3 --json status --jq '.status'
# GOOD - use = to attach value directly
gh pmu view 3 --json=status --jq='.status'
gh pmu view 3 --json=number,title,status
```
When to use `=`: single-value string flags, values starting with a letter. Space works for comma-separated lists and obvious values (`--status in_progress`). **Safe rule:** When in doubt, use `--flag=value`.
**Loops with Command Substitution:** File globbing works, command output does not.
Failing patterns:
```bash
# BAD
for file in $(find . -name "*.md"); do echo "$file"; done
while read -r line; do echo "$line"; done < <(git log --oneline)
dir=$(dirname $(realpath "$file"))
```
Workarounds:
```bash
# 1. File globbing (works reliably)
for file in *.md; do echo "$file"; done
for file in Skills/*/*.md; do echo "$file"; done
# 2. Helper scripts
node -e "require('fs').readdirSync('.').filter(f => f.endsWith('.md')).forEach(f => console.log(f))"
# 3. Pre-compute to temp file
git log --oneline > $COMMITS_FILE   # generated name
while read -r line; do echo "$line"; done < $COMMITS_FILE
rm $COMMITS_FILE
# 4. Native tools with proper flags
find . -name "*.md" -exec wc -l {} \;
find . -name "*.txt" -print0 | xargs -0 cat
```
**Environment Variables:** Use Unix-style syntax (`$VARIABLE`, `export VAR=value`), not Windows cmd style (`%VAR%`, `set VAR=value`).
**Piping and Redirection:** Standard piping works. Be careful with non-ASCII encoding.
**Dangerous rm Patterns:** NEVER use `rm -rf` with multiple paths on Windows Git Bash. Delete one path at a time.
```bash
# DANGEROUS
rm -rf .vite/ out/ dist/
rm -rf **/.vite
# SAFER - one at a time
rm -rf .vite
rm -rf out
rm -rf dist
```
**Symlinked Directories and Glob:** Glob does NOT follow symlinks. Files inside symlinked directories are invisible to Glob.
**Non-traversal is NOT Glob-only — it also defeats context auto-discovery (#2736).** Read, `cat` and `ls` traverse a junction; an earlier version said other tools "access them fine" unqualified, which was true of explicit reads, false of discovery, and the sentence that made this defect look impossible: `.claude/rules/` was deployed as a junction, so **none of the 8 auto-loaded rules reached context in any deployed project.** Nothing errored, files read fine through the link, the startup block still rendered — the rules were never discovered.
| Consumed by | Traverses a junction? |
|---|---|
| Read, `cat`, `ls`, `node require()` — explicit paths | **Yes** |
| Glob | **No** |
| Claude Code project-instruction auto-discovery (`.claude/rules/`) | **No** |
**Affected dirs in user projects:** `.claude/metadata/`, `.claude/hooks/`, `.claude/recipes/`, `.claude/scripts/shared/` -- symlinked to hub, consumed by explicit reads, so the Glob caveat is their only consequence.
**`.claude/rules/` is moving out of that set (#2736).** `framework-manifest.json` `deploymentFiles.rulesDeploymentMode` declares it `copied`. Until Praxis Hub Manager stops creating the junction (`rubrical-worker/px-manager#1146`) **already-installed projects still have one** — junctioned in the field, copied by contract, until that ships.
**Not affected:** `.claude/skills/`, `.claude/commands/`, `.claude/extensions/` are **copied**, not symlinked -- real dirs, Glob works. See `Reference/Deployment-Awareness.md`.
**Rules:**
1. **Known paths -> Read tool directly.** Do NOT use Glob to check existence first.
2. **Discovery in symlinked dirs -> Bash `ls`.** Use `ls .claude/metadata/` instead of Glob.
3. **Non-symlinked dirs -> Glob is fine.**
**Upstream:** anthropics/claude-code#27254
**Process Management:** Use PowerShell for killing processes. Git Bash mangles `/F` flags as paths.
```bash
# BAD
taskkill /F /IM "electron.exe"
# BAD - double quotes let Git Bash expand $_ variables
powershell -Command "Get-Process | Where { $_.Name -eq 'electron' } | Stop-Process"
# GOOD - single quotes pass command verbatim to PowerShell
powershell -Command 'Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue'
```
Recommended Electron cleanup sequence:
```bash
powershell -Command 'Stop-Process -Name "YourAppName" -Force -ErrorAction SilentlyContinue'
powershell -Command 'Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue'
sleep 2
rm -rf .vite
rm -rf out
```
**Detection:** "Device or resource busy" errors mean processes are still running.
**End of Windows Shell Safety**
