# Roadmap

**Date:** 2026-02-09
**Topic:** Where the IDPF framework is heading

---

## How to Read This

This is not a commitment schedule. There are no dates attached to these items. They are the directions the framework is moving, in rough priority order, based on the problems that have surfaced during active use. Items move faster when they solve real friction; items stall when the current approach turns out to be good enough.

---

## In Progress

### px-manager — Hub Management Application

**Problem:** Installing and managing IDPF hubs requires running Node.js scripts manually. Users must remember which installer to run (`install-hub.js` vs `install-project-new.js` vs `install-project-existing.js`), track which projects link to which hub, and handle symlink/junction creation across platforms.

**Direction:** A cross-platform **Electron desktop application** that replaces the command-line installers with a GUI-based hub management system. Built with TypeScript, tested with Vitest and Playwright.

**v1 scope:**
- Hub management: create and update central IDPF installations from GitHub releases
- New project installer: create projects with IDPF integration
- Existing project installer: add IDPF to existing codebases
- Project registry: track and list all managed projects
- Cross-platform symlink/junction management

**v1 explicitly defers:** project migration tools (per-project → hub-managed), project removal/unlinking, multi-hub support, remote/cloud management.

**Current state:** Under active development in a separate repository. Initial setup: Electron app scaffolding, hub installer implementation. The command-line installer scripts remain the supported path until px-manager reaches feature parity.

---

### Review Command Domain Extensions

**Problem:** Review commands (`/review-issue`, `/review-proposal`, `/review-prd`) apply generic criteria to all projects. A React frontend project and an embedded systems project have very different quality concerns, but the review questions are the same.

**Direction:** Domain-aware review criteria that adapt based on the project's active domain specialist. A React project gets accessibility and component architecture questions; an API project gets contract and versioning questions. Extension points allow project-specific review criteria on top of domain defaults.

**Current state:** PRD approved (#1259). Three epics in backlog (#1262–#1264). Stories created and assigned. Implementation underway.

---

## Planned

### GitLab Portability

**Problem:** IDPF requires GitHub. The slash commands call `gh pmu`, which is a GitHub CLI extension. Users on GitLab cannot use the framework without switching platforms.

**Direction:** The architecture is already partially portable — slash commands call `gh pmu` as an abstraction layer rather than using raw GitHub APIs. A `glab-pmu` equivalent for GitLab (which has comparable issues, boards, merge requests, and releases) would let the same workflow run there. The slash commands themselves would need minimal changes.

**Current state:** Not started. Depends on community interest and a GitLab-side contributor for the `glab-pmu` extension.

---

### Suitability Assessment Series

**Problem:** Prospective users want to know if IDPF fits their project type before investing in the learning curve. Common architectures — solo developer workflows, full-stack web apps, N-Tier, microservices, serverless, team projects — each have different framework fit profiles.

**Direction:** A series of standalone suitability documents, each assessing how well IDPF maps to a specific project type. These documents follow a consistent format: domain specialist coverage, skill applicability, workflow fit, gaps, and a concrete example.

**Current state:** Four assessments complete: Solo Developer (~80-90%), Full-Stack Web App (~85-95%), N-Tier (~85-90%), Microservices (~60-70%). One companion analysis: Microservices in a Monorepo (~80-85%). Remaining candidates: serverless, team/multi-developer, mobile-first, embedded systems.

---

### Customization Documentation

**Problem:** The extension system (USER-EXTENSION blocks, `/extensions` command, extension recipes, extension points registry) is functional but undocumented for end users. Discovery happens by accident — reading command source files or stumbling on the `/extensions` command.

**Direction:** A user-facing guide (`Customizing-Commands.md`) that explains what extension points are, how to add custom steps, the recipe system, and best practices for maintaining extensions across hub updates.

**Current state:** The extension system is stable. Documentation is the gap.

---

### UI Design Pipeline Context Awareness

**Problem:** The UI design commands (`/catalog-screens`, `/mockups`, `/paths`) share a filesystem convention (`Mockups/{Name}/`) but operate independently. `/catalog-screens` produces screen specs that `/mockups` can consume, and `/paths` produces scenario analysis that could inform mockup creation — but none of them detect or surface each other's output. Users must manually remember what was run previously and connect the dots.

**Direction:** Add passive context detection so each command checks for artifacts from the others and surfaces them when found. `/mockups` would detect existing screen specs and prior path analysis, offering to use them as starting points. `/paths` would load screen spec data (validation rules, input ranges, dependencies) to generate more precise scenario candidates. Writeback would expand beyond proposals to also update enhancement and bug issue bodies.

**Current state:** Enhancement filed (#2019). Scoped as lightweight changes to existing command specs — no new flags, file formats, or conventions. Detection is passive: commands work identically when no prior artifacts exist.

---

## Exploring

### Multi-Agent Orchestration

**Problem:** The concurrent sessions approach (documented in `04-Concurrent-Sessions.md`) works but is manual — the user opens terminals, starts sessions, and assigns roles. There is no programmatic coordination between sessions.

**Direction:** Investigating whether a lightweight orchestrator could manage multiple Claude Code sessions: dispatch reviews across sessions, collect results, and hand completed review queues to the git session. This would formalize the "coffee break handoff" pattern.

**Current state:** Conceptual. The concurrent sessions document establishes the safety model (API-only vs git operations). Orchestration would build on that foundation.

---

### Monorepo Microservices Support

**Problem:** IDPF's microservices fit (~60-70%) is the lowest of any suitability assessment, driven by two High-impact gaps: no cross-repository coordination and no cross-service contract management. Both stem from IDPF operating within a single git repository.

**Observation:** A monorepo structure eliminates both gaps. When all services share one repo, cross-service stories live in the same backlog, and TDD catches contract breaks at the RED phase — the consumer test fails in the same test run as the provider change. Analysis suggests this would raise fit from ~60-70% to ~80-85%.

**Direction:** Investigating what framework-level support would improve monorepo microservices workflows:
- Per-service charter sections or sub-charters (currently one `CHARTER.md` per project)
- Per-service release tagging (e.g., `order-service/v2.1.0` alongside repo-level tags)
- Story decomposition guidance for cross-service features
- Event-driven / message queue skill (missing regardless of repo structure)

**Current state:** Analysis complete. A conceptual design for an IDPF-Agile microservices module (contract-first TDD, service-aware charter/backlog/release) is documented. No implementation started. Depends on user demand from microservices projects.

**See:** `Docs/04-Suitability/Suitability-Microservices-Monorepo.md`, `Docs/04-Suitability/Concept-IDPF-Agile-MS.md`

---

### FAQ and Onboarding Refinement

**Problem:** New users have predictable questions — "Why can't I skip the charter?", "Can I use this without GitHub?", "What if the AI goes off the rails?" — that are answered across multiple docs but not collected in one place.

**Direction:** A FAQ document that provides short answers with links to the relevant detailed docs. This is a low-effort, high-discoverability improvement.

**Current state:** Not started. The individual docs that answer these questions are complete; the FAQ would be a cross-linking exercise.

---

## Design Principles for the Roadmap

These guide what gets prioritized:

1. **Solve friction that blocks adoption.** px-manager and the Quick Start guide address the steepest part of the learning curve.
2. **Extend what works before building new things.** Domain extensions build on the existing review system. Suitability docs extend an existing format.
3. **Don't abstract prematurely.** GitLab portability waits for demand. Multi-agent orchestration waits for the safety model to prove out.
4. **Document what exists before building what's next.** The customization guide documents a working system. The FAQ collects existing answers. Both are higher priority than new features.

---

**End of Roadmap**
