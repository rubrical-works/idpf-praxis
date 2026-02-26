# Framework Transitions Reference
**Version:** v0.53.1
**Source:** Overview/Framework-Transitions.md
## Framework Transition Matrix
### Workflow Diagram
**Development Path:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ┌───────┐                   ┌───────────┐                             │
│   │ VIBE  │──────────────────►│   AGILE   │                             │
│   │       │                   │ (Terminal)│                             │
│   └───────┘                   └───────────┘                             │
│                                                                         │
│   Exploration                 Sprint-Based Development                  │
│   - Conversational dev        - User Stories                            │
│   - Rapid prototyping         - Sprints + Velocity                      │
│   - Requirements emerge       - Formal workflows                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```
**Invalid Transition:**
```
AGILE ──── X ────► VIBE
Rationale: Quality standards should never decrease.
```
## Valid Transitions
| From | To | When |
|------|----|----|
| **Vibe** | **Agile** | Exploration complete, requirements understood |
## Transition Principles
### Preserved Across Transitions
- Code and tests
- Git history
- TDD methodology (RED-GREEN-REFACTOR)
- Testing framework and test suite
- Architecture decisions
- Dependencies and configurations
### What Changes
- Documentation format (informal → User Stories)
- Workflow structure (conversational → Sprints)
- Planning granularity (ad-hoc → Stories/Epics)
- Progress tracking (informal → Velocity)
### Best Practices
1. Complete current work before transitioning
2. Ensure all tests pass (100% green)
3. Commit all work-in-progress
4. Create transition documentation
5. Archive old workflow artifacts
6. Generate new framework artifacts (backlog)
7. Communicate transition to stakeholders (if applicable)
## Invalid Transitions
- **Agile → Vibe:** Defeats structured discipline, quality standards should never decrease
## Framework-Specific Transitions
### Vibe → Agile
**When:** Exploration complete, requirements understood, ready for structured development
**Preserves:** Code, tests, Git history
**Changes:** Informal dev → User Stories, Ad-hoc → Sprints, Add velocity tracking
**Steps:**
1. Document discovered requirements
2. Create initial backlog with epics
3. Break epics into stories
4. Plan first sprint
5. Continue with TDD discipline
### Agile as Terminal State
- No transitions FROM Agile
- Projects continue until completion
- New projects can start with Vibe or directly with Agile
## Simultaneous Framework Usage
### Valid Hybrid Scenarios
- New feature exploration (Vibe) + Main product development (Agile)
- Multiple products at different stages (separate repos)
### Guidelines
- Document which framework governs which concern
- Maintain clear boundaries between contexts
- Never mix frameworks for same concern
- Communicate framework assignment to all team members
## Integration Architecture
### Dependency Hierarchy
```
System Instructions (WHO) → Framework (WHAT) → Skills (TOOLS) → Guidelines (HOW WELL)
```
### Selection Criteria
**IDPF-Agile:** Evolving requirements, iterative delivery, velocity tracking, team collaboration
**IDPF-Vibe:** Unclear requirements, exploration needed, prototyping, requirements emerge
### Common Elements
- TDD methodology (RED-GREEN-REFACTOR)
- Claude Code communication (single code block format)
- Context preservation
- Git workflows (GitFlow, GitHub Flow, trunk-based)
## Framework Selection Matrix
| Project Type | Starting Point | Evolution Path |
|--------------|---------------|----------------|
| Evolving requirements | IDPF-Agile | Terminal |
| Unclear requirements | IDPF-Vibe | → Agile |
| Separate test repo | IDPF-Testing | Use Agile |
---
**End of Framework Transitions Reference**
