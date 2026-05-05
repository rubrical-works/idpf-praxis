# Tutorial 1: Your First Project Setup

**Level:** New user — your first day with IDPF
**Time:** ~20 minutes
**Outcome:** A working project linked to a hub, a completed charter, and a session that recognizes you.

---

## Before You Start

This tutorial assumes you have completed `Docs/01-Getting-Started/00-Installation.md`. Run through this checklist in a fresh terminal before continuing — if any row fails, stop and finish the install guide first.

| Prerequisite | Verify with | Expected |
|---|---|---|
| Node.js (LTS, v20+) | `node --version` | `v20.x` or newer |
| Git for Windows (bash shell) | `bash --version` | any version |
| GitHub CLI authenticated | `gh auth status` | `Logged in to github.com` |
| gh-pmu extension | `gh pmu --version` | `1.4.6` or newer |
| Claude Code (Opus set as default model) | `claude --version` | any version |
| Praxis Hub Manager installed | App launches; Hub tab shows a framework version | — |
| Kanban template project exists on your GitHub owner | Visible at `https://github.com/users/<you>/projects` | a project named e.g. `Praxis Kanban Template` |

You do **not** need to pre-create a GitHub repository — the New Project wizard creates one for you using `gh repo create`. Just make sure the name you intend to use (`my-first-idpf-project` for this tutorial) is **not already taken** under your GitHub account.

---

## What You Are About to Do

IDPF has two things that did not exist on your machine before: a **hub** and a **project**.

The hub is a shared installation of the framework — its rules, scripts, hooks, commands, and skill libraries. You install it once. Every IDPF project on your machine links to the same hub.

A project is a regular folder on your disk (your code, your `.git`, your files) with a thin `.claude/` directory inside it that connects to the hub. The project owns your charter, your GitHub connection, and your customizations. The hub owns the framework.

You will create the hub, create the project, and then start a Claude Code session inside the project. The session will recognize the project and ask you to write a charter. After that, you are ready for Tutorial 2.

---

## Step 1: Install the Framework

Launch the Praxis Hub Manager application. The first time you open it, the **Environment Check** modal may appear — it verifies that `git`, `gh pmu`, `node`, `claude`, your GitHub token scopes, and your git identity are all in order. If anything fails, fix it and re-run the check; otherwise dismiss the modal with **Continue**.

You then land on the main screen. Because the framework has not been installed yet:

- The header status strip shows **FRAMEWORK: Not Installed**, and the **HUB VERSION** / **SKILLS VERSION** chips are empty.
- The **New Project**, **Clone**, and **Add Existing** buttons are disabled (visibly faded), and a hint underneath reads: *"Download the framework first to create or add projects"*.

That is the only thing you need to do on the first screen — install the framework. There is no separate "create hub" step; the hub *is* the installed framework, and Praxis Hub Manager creates it for you the first time you download.

Click the **Settings** (gear) button in the header. You will see nine collapsible sections: **Framework**, **Skills**, **Projects**, **File Manager**, **Terminal**, **Project Refresh**, **Logs**, **Debug**, and **About**. Only the first three matter for this tutorial. Expand **Framework**. You will see:

- **Releases URL** — pre-filled with `https://github.com/rubrical-works/idpf-praxis/releases`. This points at the official IDPF distribution repository's GitHub Releases page. You can change it (any HTTPS GitHub Releases URL is accepted) but for this tutorial leave it alone.
- **Installed Version** — currently empty / *Not Installed*.
- **Install Location** — the path where the hub will be created. The default on Windows is `%LOCALAPPDATA%\praxis-hub\` (i.e. `C:\Users\<you>\AppData\Local\praxis-hub\`). PHM creates a versioned `framework_root_<version>\` directory under that path and points a `framework_root` junction at the active version. Accept the default.
- **Actions** — four buttons: **Check for Update**, **Download**, **Reinstall**, **Verify**. With nothing installed, only **Download** is meaningful; **Reinstall** and **Verify** light up after the first install.

Click **Download**. Praxis Hub Manager fetches the latest release zip, extracts it into `framework_root_<version>\` under the install location, and runs the hub setup routine — copying commands, hooks, scripts, and metadata into place, generating rule files, and validating that required paths are present.

Progress shows inline on the button. When it finishes, the **Installed Version** field shows the version number with a green **Up to date** indicator (for example, `0.90.0 ● Up to date`), and the **Download** button disables itself until the next release.

Stay in **Settings** — the next step picks up in the **Skills** section right below. (If you flip back to the main screen now, you will see the header chips already read **FRAMEWORK: Installed** and **HUB VERSION: 0.90.0**, and the **New Project**, **Clone**, and **Add Existing** buttons are enabled. But you still have one one-time install to do, so do not start creating projects yet.)

---

## Step 1b: Download the Skill Library

Skills are reusable capabilities Claude can invoke (test-writing patterns, TDD phase guides, error-handling patterns, and so on). They ship as a separate release from the framework itself, so you install them once, hub-wide, after the framework is in place.

Stay in **Settings**. Expand the **Skills** section. You will see:

- **Source** — pre-filled with the official skills release page (`https://github.com/rubrical-works/idpf-praxis-skills/releases`). Read-only.
- **Installed Version** — currently empty / not installed.

Click **Check for Update** first if you want to see which version is latest, or just click **Download** to fetch it directly. Praxis Hub Manager downloads the skills archive and extracts it into the hub, alongside the framework files.

When the download finishes, the **Installed Version** badge shows the skills version. Every project you create from this hub will be able to draw from the same skill library — you do not need to download skills per-project.

Skills can be updated later the same way (**Check for Update** → **Download**) whenever a new release ships. Individual projects select which skills they want during project creation (Tutorial covers this in Step 2, Screen 4) or at any time afterwards via the project's **Skills** action on its card.

---

## Step 1c: Set Your Default Project Directory

One more one-time setting. While you are still in **Settings**, expand the **Projects** section. The first field is **Default Directory** — the parent folder where new projects will be created by default. It starts empty.

Click **Browse** and pick the folder where you keep code (for example, `C:\Users\<you>\Projects\` on Windows or `~/Projects/` on macOS/Linux). Praxis Hub Manager saves it immediately; you will see a brief **Saved!** confirmation on the button.

Why do this now? The **New Project** wizard you are about to run pre-fills its location field from this setting. Setting it once here means you will not have to navigate the file picker every time you start a new project.

You can change the default at any time from the same screen.

---

## Step 2: Create the Project

Back on the main screen, click **New Project**. The wizard walks you through five screens.

### Screen 1: Project Details

Two fields:

- **Project name** — for this tutorial, `my-first-idpf-project`. No spaces, no leading dot or hyphen. This is also the GitHub repo name the wizard will create on Screen 4.
- **Parent directory** — the folder *under which* the project folder will be created (the wizard creates the project folder itself; do not pre-create it). Browse to your code-keeping folder, e.g. `C:\Users\<you>\Projects\`. The final project path will be `<parent>\my-first-idpf-project\`.

### Screen 2: Framework

Pick a process framework:

- **IDPF-Agile** — choose this for the tutorial. It is the standard option and the one most commands are tuned for.
- **IDPF-Vibe** — listed but disabled (*Coming soon*).

### Screen 3: Domain Specialist

Pick the domain specialist you want Claude to act as. The dropdown is populated from the framework manifest — choices include roles like **Full-Stack-Developer**, **Backend-Specialist**, **Frontend-Specialist**, **Technical-Writer-Specialist**, etc. If you are not sure, pick **Full-Stack-Developer**. You can change it later with `/change-domain-expert`.

### Screen 4: GitHub

This screen is where the GitHub repository and project board get created. Options:

- **Create GitHub repository** — leave **checked**. The wizard runs `gh repo create` against your authenticated GitHub account using the project name from Screen 1.
  - **Visibility** — *Private* (default) or *Public*. Private is fine for the tutorial.
  - **Branch protection** — optional. Skip for the tutorial.

When this screen completes, the wizard will automatically:

- `git init -b main` in the project folder, stage the framework scaffolding, and commit it as *Initial project setup*.
- `gh repo create <your-user>/my-first-idpf-project` with the visibility you chose.
- `git push -u origin main` to publish the initial commit.
- Run `gh pmu init` to set up the project board, **cloning from the Kanban template project** you registered during installation (Settings → Projects → Template Source Project). If the template is unreachable, gh-pmu falls back to an empty board.

### Screen 5: Confirm

Review the summary. Click **Create**. The wizard executes the full sequence and shows live progress: scaffold the project, write `framework-config.json`, symlink `.claude/` to the hub, copy extensible commands, generate `CHARTER.md`, init git, create the GitHub repo, push, init the project board.

`gh pmu` acceptance is per-project, so the wizard will prompt you to accept its terms for this project during this step (even if you have accepted them in other projects before).

When the wizard finishes, your project appears as a new card on the main screen under the hub. Files written into the project folder include `framework-config.json`, `.gh-pmu.json` (+ `.gh-pmu.checksum` integrity seal — do not hand-edit), `.claude/` (symlinks to the hub plus copied extensible commands), `CHARTER.md` (template), and `run_claude` / `runp_claude` launcher scripts.

---

## Step 3: Start a Session

You do not need to open a terminal — Praxis Hub Manager launches Claude Code directly from the project card.

On the main screen, find your new project's card. Two controls matter here:

- **Bypass** checkbox — leave it **unchecked** for your first session. With it unchecked, PHM runs `run_claude`, which starts Claude Code in standard permission mode (you approve each tool call). Checking it switches to `runp_claude`, which starts Claude Code with `--permission-mode bypassPermissions` — faster once you trust the framework. The first time you check **Bypass** for a project, PHM shows a warning modal; once you accept, it remembers your acceptance for that project and forwards `--accepted` to the launcher on future runs (so the launcher skips its own bypass warning).
- **Claude** button (green) — click it. PHM verifies that `claude` and `node` are available, then spawns a **new terminal window** in your project directory and runs the launcher script. The PHM window stays free for other projects.

As soon as Claude Code finishes loading, the IDPF startup hook fires automatically: it runs four checks in parallel (upgrade, statusline, config integrity, branch sync) and prints a **Session Initialized** block with today's date, your branch, your framework, and the state of your charter.

You will see something like:

```
Session Initialized
- Date: 2026-04-22
- Repository: my-first-idpf-project
- Branch: main (clean)
- Process Framework: IDPF-Agile
- Framework Version: 0.90.0
- Active Role: Full-Stack-Developer
- Review Mode: solo
- Config Integrity: Verified
- Charter Status: Pending
- GitHub Workflow: Active via gh pmu version 1.4.6
- Project Skills: ...
```

The line that matters most right now is **Charter Status: Pending**. That tells Claude you do not have a charter yet. It will ask you to create one before you can move to the next step.

---

## Step 4: Create Your Charter

Claude will prompt you with something close to:

```
Your charter is pending. Would you like to create one now?
```

Say **yes**. This invokes the `/charter` command. Claude asks a short series of questions. The answers are not precious — you can revise the charter later with `/charter update`.

Expect questions like:

1. **What are you building?** One or two sentences. For this tutorial, say something like: *"A small web app for tracking books I've read, with tags and ratings."*
2. **What problem does it solve for the user?** Keep it human. *"I want a personal reading log that is faster to update than a spreadsheet and easier to query than Goodreads."*
3. **What is your tech stack?** List the tools you have already decided on, or say *"undecided"* for any layer you want to defer. Claude will fill in defaults you can edit.
4. **What is in scope?** List the features you will build first. *"CRUD for books, tagging, filtering by rating."*
5. **What is out of scope?** List the things you do **not** want to build. *"Multi-user accounts, social sharing, mobile app."*
6. **How will you test?** *"Jest for unit tests, Playwright for end-to-end."*

Claude writes `CHARTER.md` at the project root. Read it. It is yours. You can edit it directly in your editor afterwards — the charter is a regular Markdown file, not a magic artifact.

A good charter is 80 lines or so. It lists the technologies, a short vision paragraph, the scope fences, and a current-focus section you will update as priorities shift.

Why does IDPF insist on a charter? Because every later command — proposals, PRDs, reviews, even the nightly audits — checks work against the charter. The charter is how Claude tells the difference between "the user wants this" and "this is scope creep." Without it, reviews cannot flag drift, and drift is the single most common failure mode in AI-assisted development.

---

## Step 5: Confirm the Setup Works

Ask Claude:

```
show me today's date and the current charter status
```

You should see today's date and **Charter Status: Active**. If the status still says Pending, the charter file did not land — open `CHARTER.md` and check it exists and is not empty.

Run one read-only IDPF command to prove the GitHub connection works:

```
/idpf-stats
```

This prints a small report of session statistics and velocity metrics. With a brand-new project it will mostly be zeros, but the fact that it runs without error confirms that `.gh-pmu.json` is wired up and Claude can reach your project board.

---

## What Just Happened

In 20 minutes you:

1. Created a shared hub installation in Praxis Hub Manager
2. Linked a new project to the hub, wired to a GitHub repository and a project board
3. Started your first IDPF session
4. Wrote a charter that every later command will use as a guardrail

You now have the two things every IDPF session needs: a recognized project and an active charter.

---

## Common Mistakes on Day One

| Mistake | Symptom | Fix |
|---|---|---|
| Running `claude` directly instead of `runp_claude` | The session starts but the startup hook does not fire, so no Session Initialized block | Exit, run the launcher script instead |
| Editing `CHARTER.md` while the session is running | No harm, but Claude's in-memory copy lags disk | Say *"re-read the charter"* after you save |
| Hand-editing `.gh-pmu.checksum` | Integrity check fails on next startup | Delete the file — Praxis Hub Manager regenerates it on next project sync |
| Skipping the charter | Every command that reads the charter will refuse to run | Say *"create my charter"* to kick off `/charter` |

---

## What to Try Next

Tutorial 2 (`02-Your-First-Issue.md`) walks through the full lifecycle of a single issue: filing it, assigning it to a branch, working it with TDD, reviewing the result, and closing it. That is the core loop you will repeat for every piece of work.

If you would rather explore on your own first, try one of these:

- Ask Claude `"what commands are available?"` — it will list your slash commands by category.
- Open `CHARTER.md` and edit the tech-stack table. Save. Claude picks up the change on its next read.
- Type `/extensions list` to see the customization points the framework exposes for your commands.

---

**End of Tutorial 1**
