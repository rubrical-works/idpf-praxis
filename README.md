# IDPF — Interactive Development Process Frameworks

[![Version](https://img.shields.io/github/v/release/rubrical-studios/idpf-praxis-dist?label=version&color=blue)](https://github.com/rubrical-studios/idpf-praxis-dist/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Claude%20Code-blueviolet)](https://claude.ai/code)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

A structured framework for building software with an AI assistant. You define what to build; the AI writes the code. IDPF provides the process — TDD enforcement, story-driven workflows, review checkpoints, and release management — so the AI builds your project methodically. No coding experience required.

---

## Installation

Install and manage IDPF through **px-manager**, the cross-platform desktop application:

1. **Create a hub** — px-manager downloads the framework and sets up the central hub
2. **Add projects** — Use the project wizard to create new projects or link existing ones

px-manager handles:
- Creating a central hub that serves multiple projects
- Deploying framework files, commands, rules, and scripts
- Configuring Claude Code integration via symlinks/junctions
- Preserving your command customizations during hub updates

---

## Frameworks

| Framework | Use When |
|-----------|----------|
| **IDPF-Agile** | Story-based development with TDD |
| **IDPF-Vibe** | Exploration phase, unclear requirements → evolves to Agile |

### Testing Frameworks
- IDPF-Testing, IDPF-QA-Automation, IDPF-Performance
- IDPF-Security, IDPF-Accessibility, IDPF-Chaos, IDPF-Contract-Testing

### Requirements
> **Note:** Requirements engineering uses the `create-prd` skill (IDPF-PRD deprecated in v0.24).

---

## Skills (31)

**TDD:** tdd-red-phase, tdd-green-phase, tdd-refactor-phase, tdd-failure-recovery, test-writing-patterns

**Beginner Setup:** flask-setup, sinatra-setup

**Beginner Support:** beginner-testing, common-errors, sqlite-integration

**Database:** postgresql-integration, migration-patterns

**Architecture:** api-versioning, error-handling-patterns

**Advanced Testing:** property-based-testing, mutation-testing

**Analysis:** anti-pattern-analysis, bdd-writing, codebase-analysis

**DevOps:** ci-cd-pipeline-design

**Diagrams:** drawio-generation

**Desktop:** electron-development, playwright-setup

**Platform:** astro-development, playwright-explorer

**Deployment Platforms:** vercel-project-setup, railway-project-setup, render-project-setup, digitalocean-app-setup

**Compliance:** seo-optimization, privacy-compliance

---

## Domain Specialists (22)

Accessibility-Specialist, API-Integration-Specialist, Backend-Specialist, Cloud-Solutions-Architect, Database-Engineer, Data-Engineer, Desktop-Application-Developer, DevOps-Engineer, Embedded-Systems-Engineer, Frontend-Specialist, Full-Stack-Developer, Game-Developer, Graphics-Engineer-Specialist, ML-Engineer, Mobile-Specialist, Performance-Engineer, Platform-Engineer, QA-Test-Engineer, Security-Engineer, SRE-Specialist, Systems-Programmer-Specialist, Technical-Writer-Specialist

---

## Updating

Open **px-manager** and use the hub update feature to download and apply the latest framework version.

---

## Rules Auto-Loading (v2.9+)

Rules in `.claude/rules/` load automatically at session start:
- No explicit file reads required
- Rules persist after context compaction
- ~47% token reduction at startup

### Adding IDPF to Existing Projects

Open **px-manager** and use the project wizard to add IDPF to an existing project.

---

## Documentation

- `Overview/Framework-Overview.md` - Complete ecosystem reference
- `Reference/Session-Startup-Instructions.md` - Startup procedure

---

## Source Repository

https://github.com/rubrical-studios/idpf-praxis

---

## License

Copyright 2025-2026 Rubrical Studios

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.
