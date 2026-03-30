# Release Variants and Extensions

**Why IDPF ships two release commands — and why you don't need more.**

---

## What Ships Out of the Box

IDPF provides two release commands:

| Command | Purpose | Target |
|---------|---------|--------|
| `/prepare-release` | Production release | Merges to main, tags, creates GitHub Release |
| `/prepare-beta` | Pre-release from feature branch | Tags on branch, no merge to main |

That's it. There is no `/prepare-alpha`, `/prepare-rc`, `/prepare-nightly`, or `/prepare-qa-release`.

---

## Why Two Is Enough

Every release workflow, regardless of label, does one of two things:

1. **Ships to main** — a stable release (`/prepare-release`)
2. **Ships from a branch** — a pre-release for testing (`/prepare-beta`)

The difference between an "alpha," "beta," "RC," and "nightly" is not the workflow shape — it's the version label, the validation gates, and the post-release actions. Those are configuration, not commands.

---

## Extensions Fill the Gap

Both release commands have rich extension point coverage across every phase:

| Phase | `/prepare-release` | `/prepare-beta` |
|-------|-------------------|-----------------|
| Post-analysis | Override version format | Override version format |
| Pre/Post-validation | Custom quality gates | Custom quality gates |
| Pre-commit | Generate artifacts | Generate artifacts |
| Pre/Post-tag | Final gates, notifications | Final gates, notifications |
| Checklists | Variant-specific checks | Variant-specific checks |

To create an alpha workflow, you don't need a new command. You customize `/prepare-beta`:

- **`post-analysis`** — Change the version suffix from `-beta.N` to `-alpha.N`
- **`pre-validation`** — Relax or skip stability gates appropriate for alpha
- **`post-tag`** — Route artifacts to an alpha distribution channel

To create an RC workflow, you customize `/prepare-release`:

- **`post-analysis`** — Append `-rc.N` to the version
- **`checklist-before-tag`** — Add RC-specific sign-off requirements
- **`pre-tag`** — Gate on integration test results

Run `/extensions list --command prepare-beta` or `/extensions list --command prepare-release` to see all available extension points. Run `/extensions recipes` for pre-built patterns.

---

## The /ci Command Completes the Picture

Release workflows don't exist in isolation. The `/ci` command provides the CI/CD infrastructure that release variants depend on:

| Subcommand | What It Does |
|------------|-------------|
| `/ci` | View existing workflow status |
| `/ci list` | Show available CI features (11 features, tiered) |
| `/ci add <feature>` | Add CI features (caching, cross-OS testing, etc.) |
| `/ci validate` | Check workflows for errors, anti-patterns, security issues |
| `/ci recommend` | Analyze your project and suggest CI improvements |
| `/ci watch` | Monitor CI run status for a commit |

An alpha release that needs a different CI gate? Use `/ci add` to configure the workflow, then use a `pre-validation` extension in `/prepare-beta` to invoke it. A nightly that should only release if CI is green? Use `/ci watch` in a `pre-tag` extension.

The `/ci` command itself is extensible — its `custom-subcommands` extension point lets you add project-specific CI operations without forking the command.

---

## Large Artifacts and Distribution

Release workflows for desktop apps (Electron, Tauri, .NET) introduce a constraint that web apps rarely face: **artifact size**. A cross-platform Electron build can easily produce 150–500 MB of installers.

**Don't confuse Release assets with Actions artifacts.** These are two different storage systems with very different limits:

| Storage | Free Plan Limit | Retention | Purpose |
|---------|----------------|-----------|---------|
| **GitHub Releases** assets | 2 GB per file, no total cap | Indefinite | Distribution to users |
| **GitHub Actions** artifacts | 500 MB total quota | 90 days default | Temporary CI build outputs |

The trap: a typical Electron CI workflow uses `actions/upload-artifact` to pass build outputs between jobs (build → test → publish). A single Windows NSIS installer can be 200+ MB. One PR build consumes 40% of the free quota. The *next* PR fails — not because the build is too large, but because the **previous build's artifacts are still sitting there** counting against the 500 MB cap.

**The fix is artifact hygiene, not a bigger plan.** The `/ci` command includes three artifact management features that automate these best practices:

| Feature | Command | What It Does |
|---------|---------|-------------|
| `artifact-retention` | `/ci add artifact-retention` | Injects `retention-days: 1` into all `upload-artifact` steps |
| `artifact-conditional-upload` | `/ci add artifact-conditional-upload` | Wraps uploads with `if: startsWith(github.ref, 'refs/tags/')` |
| `artifact-cleanup` | `/ci add artifact-cleanup` | Adds `delete-artifact` step after release publish |

`/ci recommend` flags missing artifact hygiene, and `/ci validate` warns on `upload-artifact` without `retention-days`.

The principles behind these features:
- Set `retention-days: 1` on `upload-artifact` — artifacts only need to survive until the release job runs
- Only upload artifacts on tag pushes — PR builds don't need them
- Use `actions/delete-artifact` in your release job after promoting to GitHub Releases
- Or skip artifacts entirely — if build and release are in one job, publish directly

**GitHub Releases handles distribution.** Every plan — including free — allows 2 GB per file with no total size cap and no bandwidth limit. This is where your installers belong permanently. The Actions artifact storage is just a staging area, not a distribution channel.

**When GitHub Releases isn't enough:**

| Constraint | Solution | Extension Point |
|-----------|----------|-----------------|
| Binary exceeds 2 GB | Split or compress artifacts | `pre-commit` |
| Bandwidth costs at scale | Push to S3, Cloudflare R2, or CDN | `post-tag` |
| Commercial distribution | Integrate Keygen.sh or Paddle | `post-tag` |
| Air-gapped / enterprise | Self-hosted update server (nuts, hazel) | `post-tag` |
| Cross-platform build matrix | Multi-OS CI workflow | `/ci add cross-os-testing` |

The pattern is always the same: `/prepare-release` or `/prepare-beta` handles versioning and git operations. Extensions handle delivery. `/ci` handles the build infrastructure. The release commands don't need to know *where* your artifacts go — only that versioning and tagging happened correctly.

This is composition over enumeration applied to distribution, not just version labeling.

---

## Design Principle

IDPF follows **composition over enumeration**:

- Rather than shipping N commands for N release variants, ship 2 commands with extension points
- Rather than hardcoding CI requirements into release commands, provide `/ci` as composable infrastructure
- Rather than anticipating every workflow, provide the hooks for users to build exactly what they need

This means IDPF doesn't need to predict whether your team uses alpha/beta/RC, or just beta, or nightly snapshots, or canary releases. You compose the workflow you need from the pieces provided.

---

## Quick Reference

| "I need..." | Use |
|-------------|-----|
| Standard production release | `/prepare-release` |
| Beta from a feature branch | `/prepare-beta` |
| Alpha release | `/prepare-beta` + `post-analysis` extension |
| Release candidate | `/prepare-release` + `post-analysis` extension |
| Nightly build | `/prepare-beta` + `post-analysis` + `/ci watch` in `pre-tag` |
| QA release | `/prepare-beta` + `checklist-before-tag` for QA sign-off |
| Large desktop app (Electron) | `/ci add cross-os-testing` + `post-tag` for artifact delivery |
| Custom CI gates | `/ci add` + validation extensions in release commands |

See also: [Customizing Commands](../02-Advanced/Customizing-Commands.md) for hands-on extension examples.

---

**End of Release Variants and Extensions**
