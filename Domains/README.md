# Domains
**Version:** v0.66.3
## Overview
Domains are **specialized knowledge lenses** used during reviews. Each domain provides review criteria, guides, and templates for a specific testing or quality discipline. Loaded on demand via `--with` flag in review commands.
Domains are **not process frameworks** — they serve as reference collections that review commands consume.
## Registry
See `DOMAINS.md` for the full domain registry.
## Structure
```
Domains/
├── README.md              ← This file
├── DOMAINS.md             ← Domain registry
├── review-criteria/       ← Domain-specific review questions (loaded by --with)
├── Guides/                ← Testing guides and references
└── Templates/             ← Test plan templates
```
## Usage
```
/review-proposal #42 --with security,performance
/review-prd #53 --with all
```
The extension registry at `.claude/metadata/review-extensions.json` maps domain IDs to criteria file paths.
**End of Domains README**
