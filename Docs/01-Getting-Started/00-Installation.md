# Installation

**Date:** 2026-04-21
**Topic:** Install every dependency required to use or develop the IDPF framework on Windows
**Platform:** Windows 10 / 11 only (macOS and Linux are not supported paths at this time)

---

## Who This Is For

This guide covers two audiences, in the same install order:

- **Framework users** — you want to use IDPF to build your own software with an AI assistant. Stop after "Part 1: Core Install."
- **Framework developers** — you want to contribute to `idpf-praxis-dev`, `px-manager` (Praxis Hub Manager), or `gh-pmu`. Do Part 1, then continue through "Part 2: Developer Install."

The install order matters: Praxis Hub Manager depends on `gh`, which depends on Git; Claude Code depends on Node.js. Follow the sections top-to-bottom.

---

## Part 1: Core Install (all users)

### 1. Node.js (LTS, version 20 or newer)

Claude Code, the IDPF scripts, and `px-manager` all run on Node.

1. Download the Windows installer (`.msi`) from https://nodejs.org/ — pick the **LTS** build.
2. Run the installer. Accept the defaults; leave **"Add to PATH"** checked.
3. Open a **new** terminal (so PATH picks up) and verify:

   ```bash
   node --version
   npm --version
   ```

   Both must return a version. If `node` is not found, reboot or re-check the installer's PATH option.

### 2. Git for Windows

Git provides the `bash` shell that Claude Code and IDPF scripts run under on Windows.

1. Download the installer from https://git-scm.com/download/win.
2. Run it. The defaults are correct; the only setting that matters for IDPF is **"Git from the command line and also from 3rd-party software"** (default).
3. Verify in a new terminal:

   ```bash
   git --version
   bash --version
   ```

### 3. GitHub CLI (`gh`)

IDPF's project-board integration (`gh-pmu`) is a `gh` extension, so `gh` must come first.

1. Download the Windows `.msi` installer from https://cli.github.com/.
2. Run it.
3. Authenticate:

   ```bash
   gh auth login
   ```

   Choose **GitHub.com → HTTPS → Login with a web browser**. Complete the browser flow.
4. Verify:

   ```bash
   gh auth status
   ```

### 4. gh-pmu extension

`gh-pmu` is IDPF's GitHub project-board layer. Installed as a `gh` extension:

```bash
gh extension install rubrical-works/gh-pmu
```

Verify:

```bash
gh pmu --version
```

You should see `gh pmu version 1.4.6` or newer.

### 5. Claude subscription and Claude Code

IDPF runs inside Claude Code. It is a token-rich environment (spec reads, TDD cycles, GitHub API calls) — a **Claude Max or Pro subscription** is the practical path. API-metered usage works but adds up quickly.

1. Subscribe at https://claude.ai.
2. Install Claude Code. Follow the installer for Windows at https://claude.com/product/claude-code.
3. Verify:

   ```bash
   claude --version
   ```

4. On first run, sign in with the same account as your Claude subscription.
5. Set the default model to **Claude Opus** — IDPF's STOP boundaries, sequential processing, and anti-hallucination rules require Opus-level instruction-following. See `../02-Advanced/Choosing-a-Model.md` for the trade-offs.

### 6. GitHub Kanban Template Project

Before launching Praxis Hub Manager, create the GitHub Project that PHM will clone when bootstrapping each new project. PHM's startup **Environment Check** modal flags a missing template source and disables **New Project** until one is set.

You only need to do this **once per GitHub owner** (user or organization) that will host Praxis-managed projects. If you later host projects under a second owner (e.g., a GitHub organization), repeat this step for that owner.

1. In GitHub's top nav, click the **[+]** icon → **New project**.
2. If prompted, select the **owner** (user or organization). PHM clones from the owner level, not from a single repository.
3. Under **Start from a template**, pick **Kanban**. Do not pick Blank, Team planning, or any other template — PHM expects the Kanban columns (Todo / In Progress / Done).
4. **Deselect** **Import items from repository**. The template must start empty — PHM populates items itself per project.
5. Name it something clear, e.g. `Praxis Kanban Template`, and click **Create project**.
6. On the new project's board view, click **View** → **Fields**, toggle **Labels** to **Visible**, then **Save changes to view**. The Labels field is hidden by default; making it visible gives you per-card visual indicators.
7. Record the project **name** (as entered above) or **number** (the integer at the end of `https://github.com/users/<you>/projects/<NUMBER>`). PHM will ask for this value the first time you open it.

Full walkthrough with verification checklist: `06-Kanban-Template-Setup.md`.

### 7. Praxis Hub Manager (PHM)

PHM is the Electron app that creates the central IDPF hub and wires your projects into it. It handles hub download, symlinks, skill extraction, and per-project `.claude/` setup.

1. Download the Windows installer from http://rubrical.works.
   *(The site is still being readied for launch. If the download is not yet published, ask your IDPF contact for a direct link.)*
2. Run the installer and launch **Praxis Hub Manager**.
3. In the hub-setup wizard, accept the defaults. PHM downloads the current IDPF framework release and creates the hub directory (typically under `C:\ProgramData\Praxis Hub Manager\`).
4. When hub setup completes, use PHM's **New Project** or **Link Existing Project** wizard. It:
   - Creates (or updates) `.claude/` in your project
   - Symlinks rules, hooks, scripts, metadata, skills to the hub
   - Copies extensible slash commands into the project
   - Generates `.gh-pmu.json` to bind the project to its GitHub Project board
   - Creates `run_claude` / `runp_claude` launchers in the project root

At this point **framework users** are done with installation. Continue to `01-Quick-Start.md` for your first issue.

---

## Part 2: Developer Install (contributors only)

Continue here only if you intend to modify `idpf-praxis-dev`, `px-manager`, or `gh-pmu`. Everything above must be installed first.

### 8. Clone the framework repo

The framework source of truth is `idpf-praxis-dev`. Pick a project root (this guide uses `E:\Projects`):

```bash
cd /e/Projects
git clone https://github.com/rubrical-works/idpf-praxis-dev.git
cd idpf-praxis-dev
npm install
```

Run the test suite to confirm the clone is healthy:

```bash
npx jest --no-coverage
```

All tests should pass. If Jest reports missing modules, re-run `npm install`.

### 9. Self-hosted session

`idpf-praxis-dev` dogfoods IDPF itself (`selfHosted: true` in `framework-config.json`). To start a development session:

```bash
./runp_claude
```

This launches Claude Code in the project with all IDPF rules, hooks, and commands active against the framework's own source tree.

### 10. Clone Praxis Hub Manager (optional)

Needed only if you plan to modify PHM itself. **Using** IDPF does not require the PHM source.

```bash
cd /e/Projects
git clone https://github.com/rubrical-works/px-manager.git
cd px-manager
npm install
npm run dev
```

`npm run dev` starts the Electron app in development mode. See `px-manager/README.md` for build and packaging details.

### 11. Clone gh-pmu (optional)

Needed only if you plan to modify the `gh-pmu` extension. Day-to-day IDPF work uses the installed extension from step 4.

```bash
cd /e/Projects
git clone https://github.com/rubrical-works/gh-pmu.git
cd gh-pmu
```

Build and local-install instructions live in `gh-pmu/README.md`. While iterating on a local build, uninstall the published extension (`gh extension remove pmu`) and install the local copy (`gh extension install .`) so `gh pmu` invokes your working copy.

---

## Verification Checklist

After installation, run each command in a new terminal. All must succeed:

| Command | Expected |
|---|---|
| `node --version` | `v20.x` or newer |
| `git --version` | any recent version |
| `gh auth status` | `Logged in to github.com` |
| `gh pmu --version` | `gh pmu version 1.4.6` or newer |
| `claude --version` | any recent version |
| Praxis Hub Manager launches | Hub tab shows an installed framework version |

Developers additionally confirm:

| Command (from `idpf-praxis-dev/`) | Expected |
|---|---|
| `npx jest --no-coverage` | All suites pass |
| `./runp_claude` | Claude Code starts with the IDPF Session Initialized block |

---

## Troubleshooting

**`gh pmu` not found after `gh extension install`.** Open a new terminal. `gh` caches its extension list per shell; a new shell reloads it.

**`claude` not found after install.** Close and reopen the terminal. Claude Code's installer adds to PATH, but existing shells don't pick that up until they restart.

**Praxis Hub Manager hub setup fails mid-download.** Check Windows Defender / SmartScreen history — large downloads can be quarantined silently. Whitelist the PHM install directory and retry.

**`./runp_claude` says "Permission denied" on Windows.** Use the `.cmd` variant: `runp_claude.cmd`. The bash launcher is for Git Bash; `.cmd` is for PowerShell and `cmd.exe`.

**Tests fail on a fresh `idpf-praxis-dev` clone.** Delete `node_modules/` and `package-lock.json`, then `npm install` again. Stale dependency trees are the most common cause.

---

## What to Read Next

| If You Want To... | Read |
|---|---|
| Run your first issue end-to-end | `01-Quick-Start.md` |
| Understand what you'll actually be doing | `02-Your-Role.md` |
| Learn the full issue lifecycle | `03-Workflow-Guide.md` |

---

**End of Installation**
