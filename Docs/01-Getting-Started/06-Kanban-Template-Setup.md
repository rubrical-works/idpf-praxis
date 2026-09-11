# Kanban Template Project Setup

**Date:** 2026-04-23
**Topic:** Create the GitHub "Praxis Kanban Template" project that Praxis Hub Manager clones when bootstrapping new projects
**Platform:** GitHub (web UI)

---

## Who This Is For

Anyone preparing their GitHub account (or organization) to work with **Praxis Hub Manager** (`px-manager`). Praxis Hub Manager creates a new GitHub Project for each project it bootstraps by copying a pre-configured **template** Project you own. This guide walks through creating that template once.

You only need to do this **once per GitHub owner** (user or organization) that will host Praxis-managed projects.

> **First-time setup?** This guide is **step 6 of installation** (`00-Installation.md`). If you are setting up IDPF for the first time, follow the installation guide top-to-bottom — it will send you here at the right moment. Come back to this file later if you add a second GitHub owner (e.g., a new organization) and need another template.

---

## Prerequisites

- A GitHub account (or organization) where you have permission to create Projects.
- You are signed in to GitHub in your browser.

---

## Steps

### 1. Start a new Project from the Kanban template

1. Sign in to GitHub at `https://github.com`.
2. In the top navigation bar (to the right of the search box), click the **[+]** (plus) icon. A dropdown menu appears with these options:
   - New issue
   - New repository
   - Import repository
   - New codespace
   - New gist
   - New organization
   - **New project**
3. Click **New project** at the bottom of the menu.
4. If prompted for an **owner**, select the user or organization that should own the template. The template must be owned by a user or organization, not a single repository — Praxis Hub Manager clones it from the owner level.
5. A **"New project"** dialog opens showing template options (Board, Table, Roadmap, Team planning, etc.) under **"Start from a template"**.
6. Select the **Kanban** template. Do *not* pick **Blank project**, **Team planning**, or any other template — the Kanban columns (Todo / In Progress / Done) are what Praxis Hub Manager expects.

### 2. Configure the project

1. **Deselect** the **Import items from repository** checkbox. The template must start empty — Praxis Hub Manager populates items itself per project.
2. Name the project something descriptive, e.g. **`Praxis Kanban Template`**. The name is how you will identify it later when Praxis Hub Manager asks which template to clone.
3. Click **Create project**.

### 3. Make the Labels field visible on the board view

The Kanban template hides the **Labels** field by default. Making it visible gives you helpful at-a-glance visual indicators on each card.

1. On the new project, click the **View** button (the view-options control on the board view).
2. Select **Fields**.
3. In the field list, click **Labels** — this toggles it from **Hidden** to **Visible**.
4. Click **Save changes to view** (or **Save view**) to persist the change to the view, not just your local session.

### 4. Add the `QA Required` status option

The Kanban template ships with Todo / In Progress / Done only. Praxis files
manual-verification sub-issues into a **`QA Required`** column, so the option has
to exist before any project cloned from this template can use it.

1. On the project, click the **⋯** (more options) button in the top right.
2. Select **Settings**, then click the **Status** field in the field list.
3. Click **+ Add option** and type the name exactly: `QA Required` — capital Q,
   capital A, a **space**, capital R. The name is matched literally.
4. Save.

**Why this is not optional.** `.gh-pmu.json` maps the alias `qa_required` to the
column name `QA Required`. Commands address the column by alias — `gh pmu move
<n> --status qa_required` — and the alias resolves to a name the board must
actually have. Without the option, the alias is a dangling reference and every
QA sub-issue transition fails against an otherwise healthy board.

**Why the space rather than a hyphen (#2821).** `gh pmu init --source-project`
does not copy your aliases — it *derives* them from the source board's option
names, lowercasing and replacing spaces with underscores. Hyphens are left
alone. So `QA Required` derives `qa_required`, which is the alias the framework
uses everywhere; `QA-Required` would derive `qa-required`, and every command
issuing `--status qa_required` would fail with `invalid status value` on an
otherwise correctly-built board. Praxis Hub Manager runs that init path for
every project it bootstraps, so the column name here decides whether QA
transitions work in every downstream project. The same rule explains the
existing aliases: a `Parking Lot` column derives `parking_lot`, while a
`ParkingLot` column derives `parkinglot`.

### 5. Record the project identifier

Praxis Hub Manager needs to locate this template during project creation. Note **either** of the following and keep them handy:

- **Project name** — exactly as entered in step 2 (e.g. `Praxis Kanban Template`).
- **Project number** — the integer at the end of the project URL:
  `https://github.com/users/<you>/projects/<NUMBER>`

You will supply this value to Praxis Hub Manager the first time you set it up.

---

## Verification

Before moving on, confirm:

- [ ] The project exists under the correct owner (user or organization).
- [ ] The project contains **no items** (import was deselected).
- [ ] The board view shows the **Labels** field on cards (drag a test card on if needed, then delete it).
- [ ] The **Status** field has a `QA Required` option, spelled exactly.
- [ ] You have recorded the project **name** or **number**.

---

## Next Steps

Continue with **Installation step 7** (`00-Installation.md` → Praxis Hub Manager). When PHM first launches, its Environment Check modal will ask you to confirm the template source — supply the project name or number you recorded above.
