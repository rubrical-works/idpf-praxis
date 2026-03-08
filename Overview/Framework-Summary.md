# Framework Summary
**Version:** v0.59.0
**Purpose:** Compact startup reference for framework developers

## Quick Reference
| Component | Count | Location |
|-----------|-------|----------|
| Development Frameworks | 2 | IDPF-Agile, IDPF-Vibe (7 variants) |
| Testing Frameworks | 7 | IDPF-Testing (review criteria library) + 6 specialized |
| Domain Specialists | 22 | 12 Base + 10 Pack |
| Core Instructions | 2 | Core-Developer-Instructions + Domain-Selection-Guide |
| Skills | 34 | Skills/ |
| Assistant Guidelines | 4 | Assistant/ |

## Current Versions

### Development Frameworks
| Framework | Revision | Type |
|-----------|----------|------|
| IDPF-Agile | 3 | Story-Driven Development with TDD |
| IDPF-Vibe (Core) | 4.0 | Exploratory → Agile |
> **Note:** IDPF-PRD was deprecated in v0.24 and replaced by the `create-prd` skill.

### Testing Frameworks
| Framework | Revision | Extends |
|-----------|----------|---------|
| IDPF-Testing | 1 | (Review criteria library) |
| IDPF-QA-Automation | 1 | IDPF-Testing |
| IDPF-Performance | 1 | IDPF-Testing |
| IDPF-Security | 1 | IDPF-Testing |
| IDPF-Accessibility | 1 | IDPF-Testing |
| IDPF-Chaos | 1 | IDPF-Testing |
| IDPF-Contract-Testing | 1 | IDPF-Testing |

### Skills Registry
| Skill | Category |
|-------|----------|
| tdd-red-phase | TDD |
| tdd-green-phase | TDD |
| tdd-refactor-phase | TDD |
| tdd-failure-recovery | TDD |
| test-writing-patterns | TDD |
| bdd-writing | BDD |
| create-prd | PRD |
| anti-pattern-analysis | Code Quality |
| flask-setup | Beginner Setup |
| sinatra-setup | Beginner Setup |
| common-errors | Beginner Support |
| sqlite-integration | Beginner Support |
| beginner-testing | Beginner Support |
| postgresql-integration | Database |
| migration-patterns | Database |
| property-based-testing | Advanced Testing |
| mutation-testing | Advanced Testing |
| api-versioning | Architecture |
| error-handling-patterns | Architecture |
| ci-cd-pipeline-design | DevOps |
| playwright-setup | Testing Setup |
| codebase-analysis | Code Quality |
| drawio-generation | Diagrams |
| electron-development | Desktop |

## Framework Selection Matrix
| Project Type | Starting Point | Evolution Path |
|--------------|---------------|----------------|
| Evolving requirements, iterative delivery | IDPF-Agile | Terminal |
| Unclear requirements, exploration | IDPF-Vibe | → Agile |
| Separate test repository | IDPF-Testing | Use Agile |

## Core Principle
**System Instructions** define WHO the assistant is
**Frameworks** define WHAT process to follow
**Skills** provide reusable capabilities
**Assistant Guidelines** ensure accuracy and quality

## Valid Framework Transitions
```
VIBE ──► AGILE (Terminal)
```
**Invalid:** Agile → Vibe (quality standards should never decrease)

## Detailed Documentation
For comprehensive information, load on-demand:
| File | Content |
|------|---------|
| Framework-Development.md | IDPF-Agile, Vibe details, create-prd skill |
| Framework-Testing.md | IDPF-Testing (criteria library) + 6 specialized frameworks |
| Framework-System-Instructions.md | Core + 22 Domain Specialists (12 Base, 10 Pack) |
| Framework-Skills.md | All 33 skills with descriptions |
| Framework-Transitions.md | Transition matrix, diagrams, hybrid usage |
| Framework-Overview.md | Complete reference (all sections) |
**End of Framework Summary**
