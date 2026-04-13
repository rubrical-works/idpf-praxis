# Screen Design Pipeline

**Date:** 2026-04-13
**Topic:** How to use the integrated design pipeline to establish and evolve your application's UI foundation
**Related Proposal:** #2155

---

## What the Pipeline Is

The screen design pipeline integrates three commands — `/design-system`, `/catalog-screens`, and `/mockups` — into a coordinated workflow that produces:

- **Design tokens** — DTCG-compliant token files (colors, typography, spacing, gradients) that define your visual language
- **Screen catalog** — a master registry of every screen in your application with navigation topology, lifecycle status, and structured element specs
- **Interactive mockups** — reviewable HTML mockups styled with your design tokens

These three artifacts form a **persistent foundation** that evolves with your application through the agile process. When a story adds a screen, the catalog grows. When a story changes a screen, the mockup and spec update. When the design evolves, tokens propagate to mockups.

This is not a component generation tool. Components are implementation artifacts produced when you work stories. The pipeline produces the **planning and design layer** that informs that implementation.

---

## Workflow: New Project

You're starting a new project and want to establish a design foundation before writing application code.

### Step 1: Create Design Tokens

Start by defining your visual language:

```
/design-system
```

The init mode walks you through palette selection, spacing scale, typography, and border radius. This produces a DTCG-compliant token file at `Design-System/idpf-design.tokens.json`.

If you have a reference design (a screenshot of a similar app, a Figma export, or a design you want to match):

```
/design-system --from-screenshot reference-design.png
```

This extracts candidate colors, typography, spacing, and gradients from the image. You review and adjust before writing.

### Step 2: Plan Your Screens

With tokens established, plan your application's screens:

```
/catalog-screens
```

Choose "Create new screen specs" and describe your screens manually. For each screen, the command creates a structured spec with element inventories (buttons, inputs, labels, navigation) and writes it to `Mockups/{Name}/Specs/`.

Each screen is registered in `Mockups/screen-catalog.json` — the master inventory that tracks what screens exist, their lifecycle status, navigation relationships, and which mockup set holds the authoritative spec.

### Step 3: Generate Mockups

With specs and tokens in place, generate reviewable mockups:

```
/mockups
```

Choose "From screen catalog" as the source to select from your registered screens. Choose "Interactive HTML mockups" as the output. The mockups use your design tokens for styling — your actual colors, typography, and spacing.

The output goes to `Mockups/{Name}/Screens/` as HTML files you can open in a browser to review.

### Step 4: Evolve Through Stories

As you work stories, the pipeline artifacts stay current:

- **New screen story:** Run `/catalog-screens` to add the screen to the catalog, then `/mockups` to create its mockup before implementation
- **Screen change story:** Update the spec via `/catalog-screens` (re-scan), regenerate the mockup
- **Design change:** Run `/design-system` to update tokens — the command detects existing tokens and presents an update walkthrough. Changed tokens are checked against the screen catalog, and affected mockups are flagged for regeneration (see "Updating the Design System" below)
- **Screen removal:** `/catalog-screens` drift detection flags removed screens for deprecation

---

## Workflow: Existing Project

You have an existing application and want to establish the design foundation retroactively.

### Step 1: Extract Design Tokens

Start by extracting what already exists in your code:

```
/design-system --discover
```

Discovery mode uses adapters to extract tokens from your existing CSS, Tailwind config, Sass variables, or CSS custom properties. For gradient-heavy applications, it also discovers `linear-gradient` and `radial-gradient` declarations.

If source code scanning misses visual details (dynamic styles, computed values), supplement with screenshots:

```
/design-system --from-screenshot current-app.png
```

Review and merge the candidates with your discovered tokens.

### Step 2: Initialize the Screen Catalog

Bulk-discover all screens from your source code:

```
/catalog-screens
```

Choose "Initialize full screen catalog." This:

1. Scans your entire project for screens (supports React/Next.js, Svelte, Vue, Electron, vanilla HTML)
2. Auto-detects screen kinds (page, wizard, step, section, modal, component)
3. Discovers navigation topology from router config, navigation stores, and component imports
4. Presents the complete screen list for your confirmation
5. Creates one spec per screen, populates `screen-catalog.json`, and generates `Mockups/NAVIGATION.md`

For additional enrichment, you can also feed screenshots:

```
/catalog-screens --from-screenshots screenshots/
```

Visual analysis captures layout and styling details that source scanning may miss — especially when components use dynamic classes or computed styles. Screenshot-derived and source-derived specs cross-reference to produce richer output.

### Step 3: Generate Baseline Mockups

With the catalog populated, generate mockups for your existing screens:

```
/mockups --from-catalog
```

Select screens from the registry, generate HTML mockups with token-derived styling. This establishes a visual baseline — you now have reviewable mockups of your current application that can be iterated on as part of enhancement work.

### Step 4: Ongoing Maintenance

As development continues:

- Run `/catalog-screens` with "Re-scan source for changes" to detect drift — new screens, removed screens, changed navigation
- Run `/design-system --discover --diff` to check whether new CSS values have been introduced without tokenization (see "Updating the Design System" below)
- The drift reports tell you what changed since the last scan without making modifications until you confirm
- Mockups and specs update incrementally — you don't regenerate everything for a single screen change

---

## The Screen Catalog

The screen catalog (`Mockups/screen-catalog.json`) is the central artifact that ties the pipeline together.

### What It Tracks

For each screen:
- **Identity:** name, kind (page/wizard/step/section/modal/component), canonical spec location
- **Lifecycle:** status (planned/active/deprecated/removed), introduction date, last modified date, related issues
- **Topology:** parent screen, child screens, navigation targets, owned modals
- **Source:** path to the source file in your codebase
- **Design:** whether design tokens have been applied

### Screen Lifecycle

```
planned ──→ active ──→ deprecated ──→ removed
```

| Status | Meaning |
|--------|---------|
| `planned` | Designed in a spec/mockup but not yet implemented |
| `active` | Implemented and current |
| `deprecated` | Scheduled for removal, still in code |
| `removed` | No longer exists; spec preserved for history |

New project screens start as `planned` and move to `active` when implemented. Existing project screens discovered from source start as `active`. Drift detection flags candidates for `deprecated` when source files disappear.

### Navigation Graph

`Mockups/NAVIGATION.md` is auto-generated from the catalog whenever it's updated. It shows:
- Page-to-page navigation
- Wizard step flows
- Parent-child hierarchies
- Unreachable screens (screens with no inbound navigation)

This file is generated — don't edit it manually. The catalog is the source of truth.

---

## Updating the Design System

Design tokens are not write-once artifacts. As your application evolves, the design system needs to keep pace. There are three update scenarios.

### Intentional Design Changes

A story calls for changing the primary color, adjusting spacing, or adding a new gradient. Run `/design-system` on a project that already has tokens:

```
/design-system
```

The command detects your existing `idpf-design.tokens.json` and presents an **update walkthrough** instead of the init flow. You modify specific token groups (e.g., change `color.primary.500` from emerald to indigo) while unchanged groups are preserved.

After writing, the command checks the screen catalog for mockups that depend on the changed tokens:

```
Token changes affect 3 mockups:
  - Mockups/Core/Screens/MainPage.html (uses color.primary, gradient.button)
  - Mockups/Settings/Screens/SettingsPage.html (uses color.primary)
  - Mockups/Auth/Screens/LoginPage.html (uses gradient.body)

Regenerate affected mockups? (yes/no/select)
```

This propagation works because `/mockups` records which tokens each mockup consumed (as `tokenDependencies` in the screen catalog). When tokens change, the pipeline knows exactly which mockups are affected — no guessing, no regenerating everything.

### Drift Detection

Code changes can introduce new design values without tokenizing them — a developer hardcodes a hex color, adds a gradient in CSS, or introduces a new spacing value. Over time this creates drift between the token file and the actual codebase.

Check for drift:

```
/design-system --discover --diff
```

This runs the same discovery adapters as initial extraction but compares against your existing tokens instead of writing new ones. The drift report shows:

| Category | What It Means |
|----------|--------------|
| **In code, not tokenized** | CSS values with no matching token — candidates to add |
| **In tokens, not in code** | Tokens that nothing references — candidates to remove or keep as reserves |
| **Value mismatch** | A token exists but code uses a different value — candidate to update |
| **Alias broken** | A token references `{color.accent.cyan}` but that token doesn't exist |

Nothing changes until you confirm. You can selectively apply additions, removals, or updates from the report.

### Screenshot-Based Updates

When you want to match a new reference design or capture changes that are hard to extract from code:

```
/design-system --from-screenshot new-design.png
```

Extracted values are presented as candidates alongside your existing tokens. You choose which to adopt.

---

## Visual Input Sources

All three commands accept screenshots or reference images as input:

| Command | Argument | What It Extracts |
|---------|----------|-----------------|
| `/design-system` | `--from-screenshot` | Colors, typography, spacing, gradients |
| `/catalog-screens` | `--from-screenshot` | Screen elements, layout structure, grouping |
| `/mockups` | `--from-image` | Visual layout for mockup reproduction |

These use Claude Code's multimodal capability to analyze images. They're especially valuable for:
- Brownfield reverse-engineering when source code is complex
- Capturing a specific visual state that differs from code defaults
- Quick bootstrapping from an existing design or reference

All visual extraction produces **candidates** — you review and confirm before anything is written.

---

## Troubleshooting

### "No screens found" during catalog init

The scanner looks for framework-specific patterns (React components, Svelte pages, Vue routes). If your project uses a non-standard structure, try scanning a specific directory:

```
/catalog-screens
→ "Create new screen specs"
→ "Scan a specific directory"
→ src/pages/
```

### Mockups don't reflect my design tokens

Ensure your token file exists at `Design-System/idpf-design.tokens.json`. Run `/design-system` or `/design-system --discover` to create or refresh it. Then regenerate the mockup.

### Token changes didn't propagate to mockups

Token propagation relies on `tokenDependencies` in the screen catalog. If your mockups were generated before the pipeline tracked dependencies, regenerate them once to populate the dependency list. After that, token changes will correctly identify affected mockups.

### Drift report shows values I want to keep untokenized

Not every CSS value needs a token. The drift report is informational — decline additions you don't want tokenized. Values that are one-off overrides or component-internal don't need to be in the design system.

### Catalog shows stale screens

Run `/catalog-screens` and choose "Re-scan source for changes." The drift report shows what's changed since the last scan and lets you confirm updates before applying them.

### Screenshots produce incomplete specs

Visual analysis works best with clear, full-screen screenshots at native resolution. Cropped or scaled images may miss elements. For best results, take one screenshot per screen state.
