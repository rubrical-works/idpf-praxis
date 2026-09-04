# Concurrent Sessions Without Worktrees

**Date:** 2026-02-09
**Topic:** How to parallelize IDPF work across multiple Claude Code sessions using a single working tree

---

## The Bottleneck

IDPF projects accumulate review work. A release branch might carry twenty stories across three epics, and each story needs `/review-issue` before it can move forward. Each review takes a few minutes — fetching the issue, evaluating criteria, asking subjective questions, posting findings. Then `/resolve-review` processes each finding, applies fixes, and re-reviews. Multiply by twenty stories and you're looking at a long, sequential grind.

The obvious solution is git worktrees: check out the same branch in multiple directories, run separate Claude Code sessions in each. But worktrees add complexity — shared refs, lock contention, path confusion — and many developers don't use them. The less obvious solution is to notice that most of this review work doesn't touch git at all.

---

## The Key Insight: Not All Commands Need Git

IDPF commands fall into two categories based on what they actually do at the system level:

**GitHub API commands** read and write through `gh` and `gh pmu`. They fetch issues, post comments, edit labels, move cards on the project board. These operations hit GitHub's servers. They don't read from or write to your local working tree in any meaningful way.

**Git commands** stage files, create commits, switch branches, push, merge, and tag. These operations require exclusive access to the `.git` directory and the working tree. Two sessions committing simultaneously will corrupt state.

The split is clean. Most of the review pipeline is API work. Most of the implementation pipeline is git work. They can run in parallel.

---

## What's Safe to Run Concurrently

### Fully Concurrent (GitHub API Only)

These commands operate entirely through the GitHub API. Multiple sessions can run them at the same time on different issues without conflict:

| Command | What It Does |
|---------|--------------|
| `/review-issue #N` | Fetches issue, evaluates criteria, posts review comment |
| `/review-proposal #N` | Reads proposal file (read-only), evaluates, posts comment |
| `/review-prd #N` | Reads PRD file (read-only), evaluates, posts comment |
| `/review-test-plan #N` | Reads test plan file (read-only), evaluates, posts comment |
| `/resolve-review #N` | Reads review comment, applies fixes via API, re-reviews |
| `/bug <title>` | Creates issue via API |
| `/enhancement <title>` | Creates issue via API |
| `/assign-branch #N` | Moves issue on project board via API |

The review commands read local files (proposals, PRDs, test plans) but only for context — they don't modify them. The output goes to GitHub as a comment.

`/resolve-review` is the interesting case. For issue reviews, every fix is an API call: `gh issue edit` for titles and bodies, `gh pmu move` for priorities, `gh issue edit --add-label` for labels. No local files change. For proposal or PRD reviews, most findings are also API-fixable — but occasionally a finding asks the user to revise the document text itself. That edit touches a local file, which brings us to the next category.

### Needs Coordination (Local File Edits)

These situations involve writing to files in the working tree. They're not dangerous in the way git conflicts are, but two sessions editing the same file will overwrite each other:

| Situation | Risk |
|-----------|------|
| `/resolve-review` on a proposal/PRD with document-level findings | May edit the `.md` file |
| `/proposal <title>` | Creates a new file in `Proposal/` |
| `/create-prd` | Creates a new file in `PRD/` |

**Mitigation:** If two sessions are resolving reviews on *different* proposals or PRDs, the file edits won't collide — they're writing to different files. Conflicts only arise if two sessions edit the *same* file.

### Single-Session Only (Git Operations)

These commands must run in one session at a time. They stage, commit, or manipulate branches:

| Command | Why |
|---------|-----|
| `/work #N` | Creates commits during implementation |
| `/done #N` | May create final commits |
| `/prepare-release` | Commits version bumps, creates tags, merges |
| `/merge-branch` | Merges to main via PR |
| `/create-branch` | Creates and checks out a new branch |
| `/switch-branch` | Checks out a different branch |

Any task that involves writing code, running tests, or committing changes belongs in this category.

---

## The Practical Setup

### Designate Roles

**Session A — The Git Session.** This session owns the working tree. It runs `/work`, writes code, commits, runs tests, and eventually runs `/prepare-release`. It is the only session that modifies files and interacts with git.

**Sessions B, C, D... — Review Sessions.** These sessions run `/review-issue`, `/resolve-review`, and other API-only commands. They can operate on different issues simultaneously. They read the codebase for context but don't write to it.

### Starting Concurrent Sessions

The IDPF framework provides launcher scripts that initialize a full session — loading rules, hooks, charter, and the startup sequence. These are generated by the installer and live in your project root:

| Script | Mode | Command |
|--------|------|---------|
| `run_claude` | Standard | `claude "Start"` |
| `runp_claude` | Bypass permissions | `claude --permission-mode "bypassPermissions" "Start"` |

The `.cmd` / `.bat` variants are for Windows, `.sh` for macOS/Linux. The `"Start"` argument triggers the IDPF session startup — framework loading, charter check, domain specialist activation, and the session initialized block.

To run concurrent sessions, open multiple terminals in the same project directory and launch a session in each:

```
Terminal 1 (Git session)        Terminal 2 (Review session)     Terminal 3 (Review session)
─────────────────────           ────────────────────────        ────────────────────────
> runp_claude                   > runp_claude                   > runp_claude
Session Initialized             Session Initialized             Session Initialized
  Branch: release/v1.2.0         Branch: release/v1.2.0          Branch: release/v1.2.0
  ...                            ...                             ...
```

Each session loads the same `CLAUDE.md`, rules, and charter independently. Each gets its own context window. The review sessions will have access to the same files for read-only context. They simply won't create commits or modify files.

### Coordination Pattern

```
Session A (Git)              Session B (Review)         Session C (Review)
─────────────────           ──────────────────         ──────────────────
/work #101                  /review-issue #105         /review-issue #108
  writing code...           /review-issue #106         /review-issue #109
  running tests...          /resolve-review #105       /resolve-review #108
/done #101                  /review-issue #107         /resolve-review #109
/work #102                  /resolve-review #106       /review-issue #110
  ...                       /resolve-review #107       ...
```

Sessions B and C can process reviews as fast as the user can answer subjective questions. Session A works through implementation at its own pace. The GitHub project board reflects all three sessions' work in real time.

### The Coffee Break Handoff

The payoff comes when the review sessions finish. Reviews are the interactive bottleneck — each `/review-issue` pauses for subjective questions, and `/resolve-review` needs human judgment on which findings to accept. That's where your attention is required. But implementation via TDD is largely autonomous: Claude writes a failing test, makes it pass, refactors, moves to the next acceptance criterion. It doesn't need you for that.

Once Sessions B and C have cleared the review queue and all issues are resolved, you hand Session A the batch:

```
/work #122 #123 #135
```

Claude processes them sequentially — #122 through its full TDD cycle, then #123, then #135. Each issue gets worked, tested, committed, and moved to `in_review`. You go get a cup of coffee. Or cocoa.

When you come back, the git session has three issues ready for final review, and the project board has moved forward without you watching it.

### What About Issue Status Conflicts?

This is a non-issue in practice. Review commands don't change issue status — they post comments. `/resolve-review` edits issue metadata (title, labels, priority, body) but doesn't move issues between status columns. The status transitions happen through `/work` (→ in_progress) and `/done` (→ done), which belong to the git session.

The one edge case: if Session B runs `/resolve-review` on an issue that Session A is actively working on via `/work`, the resolve-review might edit the issue body while Session A is referencing it. This is harmless — Session A's working context doesn't refresh from GitHub mid-task — but it's worth knowing. Since sessions started announcing to each other (below), Session B is told the moment Session A starts `/work #101`, so the collision is visible before it happens rather than discovered afterwards.

---

## Sessions Announce to Each Other

The setup above used to rely on you remembering which session was doing what. Sessions in the same working directory now discover each other at startup and broadcast lifecycle announcements, so each one knows what the others are doing without you relaying it.

**Discovery.** The session-start block carries a `Peers:` line whenever another session is running in the same directory, naming each one and whether it can be reached. A lone session prints no line at all. Discovery is scoped to one machine, one user and one working directory: a sibling worktree or a second clone is a different directory and is not a peer.

**Announcements.** The git-owning commands and the review commands each announce as they reach a workflow moment:

| Command | Announces |
|---|---|
| `/work` | Work started on an issue; work completed, with the commits it produced |
| `/done` | A push started; how CI resolved for it (or that the push was rejected) |
| `/review-issue` | A review started; a review passed clean |
| `/resolve-review` | Findings are being resolved |

Every opener has a closer, so a session that hears "work started on #101" will also hear when #101 reaches review. The announcements are advisory. Nothing waits for delivery, a session that cannot be reached is skipped, and the receiving session decides whether to accept the message. The sender is told a message was dispatched, never that it was read.

**Turning it down.** `/x-session-config` controls what this project sends. Each group of announcements is a separate lever (`work`, `push`, `review`), discovery itself is one, and the background poller that watches the git upstream is another. `/x-session-config --quiet` addresses the other direction: a receiving session keeps the one-line acknowledgement of an inbound announcement but drops the commentary around it (issue lookups, likely-file lists, overlap analysis). `--show` prints the resolved state without writing anything. Absent settings mean everything is on.

**Watching the whole floor.** `/hall-monitor` dedicates a session to receiving. It performs no work and announces nothing of its own; it consumes the announcements the other sessions already broadcast, correlates them against local commits, and reports what no working session is positioned to see: commits nobody announced, a "work started" with no matching completion, two in-flight issues declaring overlapping files. With `--auto-create` it will file bugs for findings marked filable, behind a dedupe window and a per-session cap and always after a prior-art sweep; enhancements are offered, never filed unattended. A monitor sees only what is addressed to it. A direct message between two other sessions is point-to-point, and the report says so rather than implying full coverage.

In the role layout above, a monitor is a fourth terminal:

```
Terminal 1 (Git)     Terminal 2 (Review)   Terminal 3 (Review)   Terminal 4 (Monitor)
> runp_claude        > runp_claude         > runp_claude         > runp_claude
/work #101           /review-issue #105    /review-issue #108    /hall-monitor
```

It is optional. The announcements reach Sessions A, B and C whether or not anyone is monitoring; the monitor adds a reader, not a transport.

---

## Why Not Just Use Worktrees?

Git worktrees let you check out the same repository at multiple paths simultaneously. Each worktree has its own working tree and index, sharing the same `.git` object store. In theory, you could run a full `/work` session in each worktree.

In practice, worktrees introduce friction that often exceeds their benefit for IDPF workflows:

1. **Shared refs.** Branch operations in one worktree affect all worktrees. Creating a tag in worktree A is visible in worktree B immediately, which can confuse release workflows.

2. **Lock contention.** Git uses lock files for ref updates. Simultaneous commits across worktrees can hit lock conflicts, especially on Windows where file locking is more aggressive.

3. **Path assumptions.** IDPF commands, scripts, and configuration reference paths relative to the repository root. Worktrees have a different root, which can break path resolution for framework scripts.

4. **Cognitive overhead.** Tracking which worktree is doing what, which has uncommitted changes, and which is safe to delete adds management burden that the API-concurrent approach avoids entirely.

The API-concurrent model is simpler: one working tree, one git owner, multiple reviewers. No lock files, no path confusion, no cleanup.

---

## Limits of This Approach

This is not true parallelism for implementation work. You still have one session writing code at a time. If your bottleneck is implementation rather than review, this approach won't help — you need worktrees or separate clones.

But in IDPF workflows, review is often the bottleneck. A release with twenty stories needs twenty reviews and potentially twenty resolve-review cycles. Processing those sequentially in a single session, interleaved with implementation, is slow. Offloading reviews to concurrent sessions lets the git session focus on what only it can do: write and commit code.

---

## Summary

| What | Where | How Many Sessions |
|------|-------|-------------------|
| Reviews (`/review-issue`, `/review-prd`, etc.) | GitHub API | As many as needed |
| Review resolution (`/resolve-review`) | GitHub API (usually) | As many as needed, on different issues |
| Issue creation (`/bug`, `/enhancement`) | GitHub API | As many as needed |
| Board management (`/assign-branch`) | GitHub API | As many as needed |
| Implementation (`/work`, `/done`) | Git + local files | One |
| Releases (`/prepare-release`) | Git + local files | One |
| Observation (`/hall-monitor`) | Announcements + git (read-only) | One, optional |

One session commits. The rest review. No worktrees required.

---

## What to Read Next

- [Concurrent Workstreams](Concurrent-Workstreams.md) — The strategic counterpart to concurrent sessions. Instead of parallelizing reviews within a single branch, workstreams parallelize entire epics across separate branches with conflict-aware grouping and merge ordering.

---

**End of Concurrent Sessions Without Worktrees**
