# Quick Start

**Date:** 2026-02-09
**Topic:** From zero to your first completed issue in one session
**Note:** You don't need to be a developer to follow this guide. See `02-Your-Role.md` for what IDPF expects from you.

---

## What You Need

These are one-time setup requirements. You'll run these commands once during installation — after that, your daily interaction with IDPF is through slash commands, not terminal tools.

Before starting, make sure you have:

1. **A Claude subscription** — Claude Max or Pro recommended. IDPF is a token-rich environment: every command reads specs, generates todo lists, calls GitHub APIs, and runs TDD cycles. API-based usage works but the costs add up quickly. A subscription with Claude Code access is the practical path.
2. **Claude Code** installed and working (`claude --version`), using **Claude Opus** as your default model. IDPF's STOP boundaries, sequential processing, and anti-hallucination rules require strong instruction-following capability. Sonnet works for simple tasks; Opus is recommended for the full workflow. See `../02-Advanced/Choosing-a-Model.md` for details.
3. **GitHub CLI** installed and authenticated (`gh auth status`)
4. **gh-pmu extension** installed (`gh extension install rubrical-studios/gh-pmu`)
5. **A GitHub repository** for your project (existing or new)
6. **px-manager** installed (the IDPF hub manager — handles hub creation and project setup)

If any of these are unfamiliar, the linked installation pages walk through each step. You don't need to understand these tools deeply — IDPF uses them behind the scenes.

If you don't have `gh-pmu` yet, it installs in one command. It's a GitHub CLI extension that adds project board management — IDPF uses it behind the scenes for all issue tracking.

---

## Step 1: Install the Hub

The IDPF framework uses a **central hub** that serves multiple projects. You install the hub once, then link projects to it.

Open **px-manager** and follow the hub setup wizard. It downloads the framework distribution, creates the hub directory structure, and sets up framework files, commands, rules, scripts, and skills.

---

## Step 2: Create Your Project

In **px-manager**, use the project wizard to create a new project or link an existing one. px-manager handles:
- Creating (or updating) the `.claude/` directory with commands, rules, hooks, and scripts
- Symlinking shared resources (rules, hooks, scripts, metadata, skills) to the hub
- Copying commands into the project (these are yours to customize)
- Generating `.gh-pmu.json` to connect your repo to a GitHub Project board
- Creating launcher scripts (`run_claude` / `runp_claude`) in your project root

**That's the installation. One hub, one project wizard.**

---

## Step 3: Start a Session

From your project directory:

```
runp_claude
```

On Windows this runs `runp_claude.cmd`, on macOS/Linux `./runp_claude`. The `runp` variant bypasses permission prompts for faster operation. Use `run_claude` if you prefer to approve each tool call.

The session starts with `"Start"`, which triggers the IDPF startup sequence:

```
Session Initialized
- Date: 2026-02-09
- Repository: my-project
- Branch: main (clean)
- Process Framework: IDPF-Agile
- Active Role: Full-Stack-Developer
- Charter Status: Pending
- GitHub Workflow: Active via gh pmu 1.4.3
```

---

## Step 4: Create Your Charter

If this is a new project, the assistant will immediately ask you to create a charter. The charter defines your project's vision, tech stack, and scope boundaries. It's mandatory — the framework won't let you skip it.

The assistant asks 5 questions:
1. What are you building?
2. What problem does it solve?
3. What's your tech stack?
4. What's in scope and out of scope?
5. How will you test?

Answer naturally. The assistant creates `CHARTER.md` and supporting documents. This takes 2-3 minutes and only happens once.

---

## Step 5: Create an Issue

Now you're ready to work. Create your first issue:

```
/bug Fix login timeout after 30 seconds
```

or

```
/enhancement Add CSV export to the reports page
```

The assistant creates a GitHub issue with a structured template and **STOPS**. It will not start implementing. You decide when work begins.

---

## Step 6: Create a Branch and Assign

Create a branch for your work:

```
/create-branch patch/v0.0.1
```

Then assign your issue to it:

```
/assign-branch #1
```

The assistant detects the current branch and assigns the issue to it.

---

## Step 7: Work

```
/work #1
```

The assistant takes over and does the technical work:
1. Validates the issue exists and is assigned to a branch
2. Moves it to `in_progress`
3. Extracts acceptance criteria into a todo list
4. Starts TDD: writes a failing test, makes it pass, refactors
5. Repeats for each acceptance criterion
6. Moves to `in_review` when all criteria are met
7. **STOPS** — waits for you

You don't need to do anything during this phase. The AI writes the code and tests. Your role resumes at step 8.

---

## Step 8: Done

Review the work. At minimum, check that the acceptance criteria checkboxes are marked complete. If you're technical, scan the diff for anything unexpected. When it looks good:

```
/done #1
```

The assistant moves the issue to `done`, commits and pushes the changes. Your first issue is complete.

---

## What Just Happened

In about 15 minutes you:

1. Installed the framework (hub + project)
2. Started a session with full IDPF integration
3. Created a charter defining your project
4. Filed an issue through the GitHub project board
5. Worked it with TDD methodology
6. Completed it with a commit and status transition

Every subsequent issue follows steps 5-8. For larger features, the pipeline extends: `/proposal` → `/create-prd` → `/create-backlog` → then `/work` each story. See `03-Workflow-Guide.md` (same directory) for the full lifecycle.

---

## What to Read Next

| If You Want To... | Read |
|---|---|
| Understand what you'll actually be doing | `02-Your-Role.md` |
| Understand the full pipeline | `03-Workflow-Guide.md` |
| Choose between top-down and bottom-up planning | `04-Planning-Approaches.md` |
| Know what to do when something breaks | `05-When-Things-Go-Wrong.md` |
| Run reviews in parallel across sessions | `../02-Advanced/04-Concurrent-Sessions.md` |
| Understand why the framework has so many checkpoints | `../03-Philosophy/Intentional-Friction.md` |

---

**End of Quick Start**
