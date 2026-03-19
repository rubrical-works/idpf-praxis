# Windows Shell Safety for Claude Code
**Version:** v0.66.1

**MUST READ:** Auto-loaded on Windows at session startup.

## Shell Environment

Claude Code uses Git Bash on Windows. Most Unix commands work, but these patterns fail or behave unexpectedly.

## Golden Rules

**Always use Unix-style commands and patterns.**

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

### Pattern Safety

| Pattern | Safe? | Use Instead |
|---------|:-----:|-------------|
| `$(cmd)` — short, predictable output | ✅ | — |
| `$(cmd)` — output may contain backticks/quotes/newlines | ❌ | Write tool + temp file |
| `for x in $(cmd)` | ❌ | Glob patterns or temp file |
| Nested `$($(cmd))` | ❌ | Sequential commands |
| Heredoc with backticks | ❌ | Write tool + temp file |
| `--body "..."` inline | ❌ | `-F file.md` or `--body-file` |
| `--flag value` (strings) | ⚠️ | `--flag=value` |
| Backslash paths | ❌ | Forward slashes |
| Absolute paths in args | ❌ | Relative paths (`.tmp-*`) |
| JSON inline | ❌ | `--input` or temp file |
| `rm -rf a/ b/ c/` | ❌ | One path at a time |
| Single quotes | ⚠️ | Prefer double quotes |
| Pipes `\|` | ✅ | — |
| Redirects `>` `>>` | ✅ | — |
| `$VAR` expansion | ✅ | — |
| `--body-stdout` / `--body-stdin` | ✅ | Use `.tmp-{issue#}.md` for edits |

### Parallel Tool Failures

**"Sibling tool call errored" is NOT the real error.**

When Claude Code runs multiple tools in parallel and one fails, all siblings are aborted. Look for the ONE tool with the actual error message, fix it, then retry.

```
● Bash(date /t)                    ← ROOT CAUSE (find this)
  ⎿  Error: date: invalid date '/t'

● Bash(git branch)                 ← Aborted (ignore)
  ⎿  Error: Sibling tool call errored
```

## Heredocs with Backticks

**NEVER use backticks inside heredocs.**

```bash
# BAD - fails on Windows
git commit -m "$(cat <<'EOF'
Fix bug in `calculateTotal` function
EOF
)"

# GOOD - use Write tool to create temp file, then:
git commit -F .tmp-msg.txt
rm .tmp-msg.txt
```

## Command Substitution

**Rule of thumb:** If the output is short, single-line, and guaranteed free of backticks, quotes, or special characters, `$(...)` is safe. If the output could contain markdown, code, user-generated content, or multi-line text, use a temp file.

### Safe `$(...)` Patterns

Simple substitutions with short, predictable output work reliably:

```bash
# SAFE - short, predictable output, no special chars
today=$(date "+%Y-%m-%d")
branch=$(git branch --show-current)
sha=$(git rev-parse HEAD)
count=$(git log --oneline | wc -l)
ver=$(node -e "console.log(require('./package.json').version)")

# SAFE - in commit messages (output is simple text)
git commit -m "Release $(date '+%Y-%m-%d')"
git tag "v$(node -e "console.log(require('./package.json').version)")"
```

### Unsafe `$(...)` Patterns

These fail because the output may contain backticks, quotes, newlines, or unpredictable content:

```bash
# BAD - file content may contain backticks, quotes, newlines
gh issue create --body "$(cat README.md)"
gh pr create --body "$(git log --oneline -5)"

# BAD - nested substitution
dir=$(dirname $(realpath "$file"))

# BAD - for loop with command output (word splitting)
for file in $(find . -name "*.md"); do echo "$file"; done

# GOOD - use --body-file flag for file content
gh issue create --body-file README.md

# GOOD - use Write tool for generated content
# [Write tool creates .tmp-commits.txt]
gh pr create --body-file .tmp-commits.txt
rm .tmp-commits.txt
```

## Issue/PR Bodies with Backticks (IMPORTANT)

**ALWAYS use temp file approach for issue/PR bodies.** Issue and PR bodies almost always contain backticks (code blocks, inline code), which fail with heredocs or `--body`.

```bash
# BAD - backticks in body cause failures
gh issue create --body "Fix the \`calculateTotal\` function"
gh pmu create --body "```js
code here
```"

# GOOD - Write tool + temp file
# [Claude's Write tool creates .tmp-body.md with content]
gh pmu create --title "Bug: ..." -F .tmp-body.md --status backlog
rm .tmp-body.md

# GOOD - For editing existing issues (use issue-specific name)
gh pmu view 123 --body-stdout > .tmp-123.md
# [edit .tmp-123.md]
gh pmu edit 123 -F .tmp-123.md && rm .tmp-123.md
```

**Rule:** Never attempt `--body` with inline content on Windows. Always use `-F` with a temp file.

## gh pmu Body Flags

The `gh pmu` extension provides Windows-safe body handling. **Prefer `--body-stdout` / `--body-stdin`** for cleaner workflows.

### Preferred: Stdout/Stdin Pattern

```bash
# Export body, edit, update (use issue-specific temp file name)
gh pmu view 123 --body-stdout > .tmp-123.md
# [edit .tmp-123.md]
gh pmu edit 123 -F .tmp-123.md && rm .tmp-123.md

# Creating issues with body from file (new issue, no number yet)
gh pmu create --title "Bug: ..." -F .tmp-body.md --status backlog

# Piping (also works)
cat issue-body.md | gh pmu edit 123 --body-stdin
```

### Alternative: Body-File Pattern

```bash
# Uses tmp/ directory (requires cleanup)
gh pmu view 123 --body-file    # Creates tmp/issue-123.md
gh pmu edit 123 -F tmp/issue-123.md
rm tmp/issue-123.md
```

**Note:** Unlike raw `$(...)` command substitution, these flags handle encoding and escaping correctly.

## Path Handling

**Use forward slashes. Quote paths with spaces.**

```bash
# BAD - backslashes get stripped by shell escaping
cd C:\Users\Name\My Projects
cat C:\path\to\file.txt

# GOOD - forward slashes work in Git Bash
cd "C:/Users/Name/My Projects"
cat "C:/path/to/file.txt"

# GOOD - use environment variables
cd "$USERPROFILE/My Projects"
```

## Temp File Best Practices

1. **Use relative paths** for temp files passed to shell commands (`.tmp-*`)
   - Absolute paths like `E:\Projects\...` get backslashes stripped
2. **Use Write tool** instead of `cat`, `echo >`, or heredocs for file creation
3. **Clean up** immediately after use
4. **Use unique names** when editing multiple issues - include issue number (`.tmp-123.md`)
   - Prevents accidental overwrites when working on several issues in sequence

```bash
# Pattern: Write tool creates file, Bash uses it
# [Claude's Write tool creates .tmp-body.md with content]
gh issue create --body-file .tmp-body.md
rm .tmp-body.md
```

## Quoting Rules

**Prefer double quotes. Escape special characters.**

```bash
# BAD - single quotes behave differently in some contexts
echo '$HOME'  # May print literal $HOME

# GOOD - double quotes with escaping
echo "$HOME"
echo "The file is \`important\`"
echo "Use a \"quoted\" string"
```

## JSON in Commands

**Use temp files for JSON payloads.**

```bash
# BAD - quote escaping nightmare
gh api graphql -f query='{ "query": "..." }'

# GOOD - Write tool creates JSON file
# [Claude's Write tool creates .tmp-query.json]
gh api graphql --input .tmp-query.json
rm .tmp-query.json
```

## Multi-line Strings

**Use temp files for multi-line content.**

```bash
# BAD - heredoc issues
gh issue create --body "Line 1
Line 2
Line 3"

# GOOD - Write tool creates temp file
# [Claude's Write tool creates .tmp-body.md]
gh issue create --body-file .tmp-body.md
rm .tmp-body.md
```

## Flag Values with Spaces

**Flags taking string values can fail when space-separated.**

On Windows Git Bash, `--flag value` can be misinterpreted as `--flag` (no value) plus `value` (extra argument).

```bash
# BAD - value interpreted as separate argument
gh pmu view 3 --json status --jq '.status'
#              ↑ shell sees: --json (flag) + status (extra arg)
# Error: accepts 1 arg(s), received 2

# GOOD - use = to attach value directly
gh pmu view 3 --json=status --jq='.status'

# GOOD - comma-separated values (no space after flag)
gh issue list --json number,title
gh pmu view 3 --json=number,title,status
```

**When to use `=` syntax:**
- Single-value string flags: `--json=status`, `--jq='.field'`
- When the value starts with a letter (can look like a command)

**When space works:**
- Comma-separated lists with no spaces: `--json number,title` (value starts immediately after space)
- Flags with obvious values: `--status in_progress`

**Safe rule:** When in doubt, use `--flag=value`.

## Loops with Command Substitution

**Loops using `$(...)` are particularly problematic.** File globbing works, but command output does not.

### Failing Patterns

```bash
# BAD - for loop with command substitution
for file in $(find . -name "*.md"); do
    echo "$file"
done

# BAD - while-read with substitution
while read -r line; do
    echo "$line"
done < <(git log --oneline)

# BAD - nested substitution
dir=$(dirname $(realpath "$file"))

# BAD - variable assignment from command in loop
for f in *.txt; do
    content=$(cat "$f")  # Unreliable
    echo "$content"
done
```

### Workarounds

**1. Use file globbing (works reliably):**
```bash
# GOOD - glob patterns work
for file in *.md; do
    echo "$file"
done

for file in Skills/*/*.md; do
    echo "$file"
done
```

**2. Use helper scripts for complex operations:**
```bash
# GOOD - Node.js helper for file processing
node -e "require('fs').readdirSync('.').filter(f => f.endsWith('.md')).forEach(f => console.log(f))"

# GOOD - Pre-compute list to temp file
git log --oneline > .tmp-commits.txt
while read -r line; do
    echo "$line"
done < .tmp-commits.txt
rm .tmp-commits.txt
```

**3. Break into sequential simple commands:**
```bash
# GOOD - avoid nesting
realpath "$file" > .tmp-path.txt
dir=$(dirname "$(cat .tmp-path.txt)")
rm .tmp-path.txt

# GOOD - use intermediate variables set by tools
# [Read tool provides file content directly]
```

**4. Use native tools with proper flags:**
```bash
# GOOD - find with -exec instead of loop
find . -name "*.md" -exec wc -l {} \;

# GOOD - xargs for processing
find . -name "*.txt" -print0 | xargs -0 cat
```

## Environment Variables

**Use Unix-style syntax in Git Bash.**

```bash
# BAD - Windows cmd style
echo %USERPROFILE%
set MY_VAR=value

# GOOD - Unix style (works in Git Bash)
echo "$USERPROFILE"
export MY_VAR=value
```

## Piping and Redirection

**Standard piping works. Be careful with encoding.**

```bash
# GOOD - piping works
git diff | head -20
gh issue list --json number,title | jq '.[0]'

# CAUTION - encoding issues with non-ASCII
# If output has special characters, may need encoding conversion
```

## Dangerous rm Patterns

**NEVER use `rm -rf` with multiple paths on Windows Git Bash.**

Path expansion can fail catastrophically and delete unintended directories.

```bash
# DANGEROUS - path expansion can fail
rm -rf .vite/ out/ dist/
rm -rf **/.vite

# SAFER - delete one path at a time
rm -rf .vite
rm -rf out
rm -rf dist

# SAFEST - verify paths exist first
ls -la .vite && rm -rf .vite
```

**Why this happens:** Git Bash's glob expansion can behave unexpectedly with certain patterns, especially `**` recursive globs.

## Symlinked Directories and Glob

**Glob does NOT follow symlinks.** The Glob tool cannot traverse symlinked directories (junctions on Windows). Files inside symlinked directories are invisible to Glob even though other tools access them fine.

**Affected directories in user projects:** `.claude/metadata/`, `.claude/rules/`, `.claude/scripts/shared/`, `.claude/skills/` — these are symlinked to the hub installation.

```bash
# BAD - Glob returns empty for symlinked directories
Glob({ pattern: ".claude/metadata/skill-keywords.json" })  # → No files found

# GOOD - Read tool follows symlinks transparently
Read({ file_path: ".claude/metadata/skill-keywords.json" })  # → Works
```

**Rules:**
1. **Known paths → Read tool directly.** When the file path is known (e.g., `.claude/metadata/skill-keywords.json`), use the Read tool. Do NOT use Glob to check existence first.
2. **Discovery in symlinked dirs → Bash `ls`.** If you need to list files in a symlinked directory, use `ls .claude/metadata/` via Bash instead of Glob patterns.
3. **Non-symlinked dirs → Glob is fine.** Glob works normally for real directories (e.g., `Proposal/`, `Construction/`).

**Upstream:** anthropics/claude-code#27254 — Glob tool does not follow symlinks.

## Process Management

**Use PowerShell for killing processes on Windows Git Bash.**

Git Bash mangles Windows command flags (interprets `/F` as a path).

```bash
# BAD - Git Bash interprets /F as F:/ path
taskkill /F /IM "electron.exe"

# BAD - Double quotes let Git Bash expand $_ variables
powershell -Command "Get-Process | Where { $_.Name -eq 'electron' } | Stop-Process"

# GOOD - Single quotes pass command verbatim to PowerShell
powershell -Command 'Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue'

# GOOD - Multiple processes
powershell -Command 'Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue'
powershell -Command 'Stop-Process -Name "YourApp" -Force -ErrorAction SilentlyContinue'
```

**Recommended cleanup sequence for Electron development:**

```bash
# 1. Kill app processes
powershell -Command 'Stop-Process -Name "YourAppName" -Force -ErrorAction SilentlyContinue'

# 2. Kill stray Electron processes
powershell -Command 'Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue'

# 3. Wait for file handles to release
sleep 2

# 4. Clean build directories (one at a time!)
rm -rf .vite
rm -rf out
```

**Detection:** If build fails with "Device or resource busy" errors, processes are still running.

---

**End of Windows Shell Safety**
