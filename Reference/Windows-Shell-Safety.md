# Windows Shell Safety for Claude Code
**Version:** v0.69.0
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
**Pattern Safety**
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
**Parallel Tool Failures:** "Sibling tool call errored" is NOT the real error. When one parallel tool fails, all siblings abort. Find the ONE tool with the actual error, fix it, retry.
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
# GOOD - use Write tool to create temp file, then:
git commit -F .tmp-msg.txt
rm .tmp-msg.txt
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
gh issue create --body "$(cat README.md)"
dir=$(dirname $(realpath "$file"))
for file in $(find . -name "*.md"); do echo "$file"; done
# GOOD
gh issue create --body-file README.md
gh pr create --body-file .tmp-commits.txt
```
**Issue/PR Bodies:** ALWAYS use temp file approach. Bodies almost always contain backticks which fail with heredocs or `--body`.
```bash
# BAD
gh issue create --body "Fix the \`calculateTotal\` function"
# GOOD - Write tool + temp file
gh pmu create --title "Bug: ..." -F .tmp-body.md --status backlog
rm .tmp-body.md
# GOOD - editing existing issues (use issue-specific name)
gh pmu view 123 --body-stdout > .tmp-123.md
gh pmu edit 123 -F .tmp-123.md && rm .tmp-123.md
```
**Rule:** Never attempt `--body` with inline content on Windows. Always use `-F` with a temp file.
**gh pmu Body Flags:** Prefer `--body-stdout` / `--body-stdin` for cleaner workflows.
Preferred stdout/stdin pattern:
```bash
gh pmu view 123 --body-stdout > .tmp-123.md
gh pmu edit 123 -F .tmp-123.md && rm .tmp-123.md
gh pmu create --title "Bug: ..." -F .tmp-body.md --status backlog
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
**Temp File Best Practices:**
1. **Use relative paths** for temp files (`.tmp-*`) -- absolute paths get backslashes stripped
2. **Use Write tool** instead of `cat`, `echo >`, or heredocs for file creation
3. **Clean up** immediately after use
4. **Use unique names** per issue (`.tmp-123.md`) to prevent overwrites
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
# GOOD - Write tool creates .tmp-query.json
gh api graphql --input .tmp-query.json
rm .tmp-query.json
```
**Multi-line Strings:** Use temp files for multi-line content.
```bash
# BAD
gh issue create --body "Line 1
Line 2"
# GOOD - Write tool creates .tmp-body.md
gh issue create --body-file .tmp-body.md
rm .tmp-body.md
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
git log --oneline > .tmp-commits.txt
while read -r line; do echo "$line"; done < .tmp-commits.txt
rm .tmp-commits.txt
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
**Affected dirs in user projects:** `.claude/metadata/`, `.claude/rules/`, `.claude/scripts/shared/`, `.claude/skills/` -- symlinked to hub.
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
