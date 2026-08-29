# gh-pmu Configuration Reference
**Version:** v0.99.0
**Source:** Reference/gh-pmu-Configuration.md
**Load on demand** for `.gh-pmu.json` schema, release config, or `gh pmu` CLI operations.
## .gh-pmu.json Schema
```yaml
project: {owner: {owner}, number: {number}}   # GitHub user/org, board number
repositories: [{owner}/{repo}]
defaults:                                     # Applied when none given
    priority: p2
    status: backlog
fields:
    status:
        field: Status
        values: {backlog: Backlog, in_progress: In progress, in_review: In review, done: Done}
    priority:
        field: Priority
        values: {p0: P0, p1: P1, p2: P2}
```
**Derived:** Repository = `repositories[0]`. Board = `https://github.com/users/{project.owner}/projects/{project.number}/views/1`.
Use the **alias** (left side) in commands: `gh pmu move 90 --status in_progress`
**Labels vs Project Fields:** labels are issue metadata (`bug`, `enhancement`, `pm-tracked`) set via `gh issue edit --add-label`; project fields are board columns (Status, Priority) set via `gh pmu move [number] --status [value]` and defined under `fields:`.
### Issue Assignee — Constant Plus Flag
**Not a `.gh-pmu.json` setting.** No `defaults.assignee` key exists; adding one has no effect (#2599).
**Resolution order:** the invocation's `--assignee <value>` when a non-empty string → the `DEFAULT_ASSIGNEE` constant (`@me`) otherwise. No file is read.
```bash
node .claude/scripts/shared/lib/gh-pmu-config.js --assignee           # prints @me
node .claude/scripts/shared/lib/gh-pmu-config.js --assignee octocat   # prints octocat
```
Consumers — each documenting `--assignee <value>` and passing it through: `/add-story`, `/bug`, `/create-backlog`, `/create-prd` (×2), `/enhancement`, `/fw-gap-analysis`, `/proposal`, `/split-story`, `create-epic.js`. `/bug`, `/enhancement`, `/proposal` also declare it in `.claude/metadata/trigger-flag-allowlist.json`, so `bug: login fails --assignee octocat` binds the login to the flag, not the title.
**Why the key was removed (#2599).** `.gh-pmu.json` is owned by `gh pmu`, which does not recognise `defaults.assignee` — the framework read it, not `gh pmu` — so any re-serialisation dropped it. One drop is enough: every later issue resolved from a missing key, indistinguishable from a deliberately-unset one, so the helper degraded silently to `@me` — rerouting every new issue on a project configured with another login, with no error. Reverses part of #2489 deliberately: the constant returns, the escape hatch becomes per-invocation. **Trade accepted** — a standing non-`@me` assignee must be named each time.
**No `project.owner` fallback, deliberately.** It is the *board* owner and may be an organisation login, which does not resolve as an assignee. Since gh-pmu v1.5.1 an unresolvable `--assignee` aborts creation with exit 1 *before* the createIssue mutation, so the fallback would convert a working default into a hard failure. Same reason the flag is **never omitted**: an omitted `--assignee` silently creates an unassigned issue, a bad login fails loudly — surface the exit-1 abort, never retry without the flag.
**Editing `.gh-pmu.json` changes the seal.** Regenerate `.gh-pmu.checksum` and commit both — `verify` also compares against git HEAD, and `gh pmu config` exposes only `verify`:
```bash
node -e "const c=require('crypto'),f=require('fs');f.writeFileSync('.gh-pmu.checksum',c.createHash('sha256').update(f.readFileSync('.gh-pmu.json')).digest('hex'))"
gh pmu config verify
```
### Framework Configuration
`framework: IDPF-Agile` (or `IDPF-Vibe`) — optional. If unset, all commands are available.
### Release Configuration
```yaml
release:
  tracks:
    stable: {prefix: "v", default: true}          # v1.2.0
    patch:
      prefix: "patch/"                            # patch/1.1.1
      constraints:
        version: patch_only                       # Must be PATCH increment
        labels: {forbidden: ["breaking-change"], required: []}
    beta: {prefix: "beta/"}                       # beta/2.0.0-beta.1
  artifacts: {directory: Releases, release_notes: true, changelog: true}
```
**Constraints per track:** `version: patch_only` (PATCH increment only); `labels.forbidden` (error if the issue carries these); `labels.required` (warning if missing).
### Setup and Terms
`gh pmu init` runs guided setup and requires a `Branch` Text field in your GitHub Project. After project creation set the default repository (Settings → Default repository), or issues may go to the wrong repo.
Terms must be accepted once per repository (`gh pmu accept --yes`) before any command executes; without it every command fails with "terms not accepted". Acceptance persists in `.gh-pmu.json` — re-run if regenerated. `--yes` is required for non-interactive environments.
## gh pmu Command Reference
Flags and operations spanning multiple commands; per-command behavior lives in each command's spec.
### Move Command Flags
| Flag | Description |
|------|-------------|
| `--status [value]` | Set project status (`--status in_progress`) |
| `--branch [value]` | Set branch field, replaces `--release` (`--branch current`) |
| `--backlog` | Clear branch field |
| `--recursive` | Apply to issue and all sub-issues |
| `--dry-run` | Preview without applying |
| `--depth N` | Limit recursion depth (default 10) |
| `-f, --force` | Bypass checkbox validation |
| `--yes` | Skip confirmation prompts |
**Multi-issue syntax:** `gh pmu move 42 43 44 --status in_progress`. **Deprecated:** `--release` — use `--branch`.
### Sub-Issue and Bulk Operations
| Command | Description |
|---------|-------------|
| `gh pmu sub create --parent [#] --title "..."` | Create and link sub-issue |
| `gh pmu sub add [parent] [child]` | Link existing issues |
| `gh pmu sub list [#]` | List sub-issues |
| `gh pmu split [#] --from=body` | Sub-issues from checklist |
| `gh pmu move [#] [#] [#] --status done` | Update several issues at once |
| `gh pmu move [#] --status done --recursive` | Update issue and all sub-issues |
| `gh pmu triage --query "..." --apply status:backlog` | Bulk update matching issues |
| `gh pmu intake --apply` | Add untracked issues to project |
**Auto-close:** with the default Kanban template, moving an issue to `done` auto-closes it — `gh pmu move [#] --status done` suffices. Explicit `gh issue close` is needed only to set a close reason (`not_planned` vs `completed`), add a closing comment, or on a project without that workflow.
### Slash Command Mapping
| Instead of | Use |
|------------|-----|
| `bug:` / `enhancement:` inline creation | `/bug` / `/enhancement <title>` |
| `proposal:` / `idea:` inline creation | `/proposal <title>` |
| `work #N` inline routing logic | `/work #N` |
| `done` / `gh pmu move --status done` | `/done [#N]` |
| `gh pmu branch start` / `list` / `delete` | `/create-branch` / `/switch-branch` / `/destroy-branch` |
| `gh pmu branch close` (releases / features) | `/prepare-release` / `/merge-branch` |
| `gh pmu move [#] --branch [name]` | `/assign-branch [#] [branch]` |
| Manual PRD / backlog / story creation | `/create-prd` / `/create-backlog` / `/add-story` |
| Manual story splitting / pivot review | `/split-story` / `/pivot` |
| Manual issue / proposal review | `/review-issue #N` / `/review-proposal #N` |
| Manual PRD / test plan review | `/review-prd #N` / `/review-test-plan #N` |
**End of gh-pmu Configuration Reference**
