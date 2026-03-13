# Framework Transitions Reference
**Version:** v0.62.1
**Purpose:** Framework transition rules, diagrams, and hybrid usage patterns

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
│   Exploration                 Story-Driven Development                  │
│   - Conversational dev        - User Stories + TDD                      │
│   - Rapid prototyping         - Backlog Management                      │
│   - Requirements emerge       - Formal workflows                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Legend:  ───► Valid transition
```
**Invalid Transition:**
```
     ┌───────────┐                   ┌───────────┐
     │   AGILE   │──────── ✗ ───────►│   VIBE    │
     └───────────┘                   └───────────┘

     Rationale: Quality standards should never decrease.
                Returning to Vibe abandons structured discipline.
```

## Valid Transitions
| From Framework | To Framework | When to Transition |
|----------------|--------------|-------------------|
| **Vibe** | **Agile** | Exploration complete, requirements understood, ready for structured development |

## Transition Principles

### Always Preserved Across Transitions
- All existing code and tests
- Git repository and commit history
- TDD methodology (RED-GREEN-REFACTOR)
- Testing framework and test suite
- Technical architecture decisions
- Dependencies and configurations

### What Changes
- Documentation format (informal → User Stories)
- Workflow structure (conversational → Story-Driven)
- Planning granularity (ad-hoc → Stories/Epics)
- Progress tracking (informal → Backlog Management)

### Transition Best Practices
1. Complete current work unit before transitioning
2. Ensure all tests pass (100% green)
3. Commit all work-in-progress
4. Create transition documentation (preserve context)
5. Archive old workflow artifacts
6. Generate new framework artifacts (backlog)
7. Communicate transition to stakeholders (if applicable)

## Invalid Transitions
**Never transition:**
- ❌ Agile → Vibe (defeats structured discipline)
**Rationale:**
- Returning to Vibe from Agile abandons testing discipline
- Quality standards should never decrease (always increase or maintain)

## Framework-Specific Transitions

### Vibe → Agile
**When:** Exploration complete, requirements understood, ready for structured development
**Preserves:**
- Code, tests, Git history
- Any tests written during exploration
**Changes:**
- Informal dev → User Stories
- Ad-hoc → Story-driven workflow
- Add backlog management
- Formalize requirements as epics/stories
**Steps:**
1. Document discovered requirements
2. Create initial backlog with epics
3. Break epics into stories
4. Select first story from backlog
5. Continue with TDD discipline

### Agile as Terminal State
**Agile is the terminal framework:**
- No transitions FROM Agile to any other framework
- Projects in Agile continue until completion
- Maintenance work continues within Agile framework
**If Starting Fresh:**
- ✅ New projects can start with Vibe for exploration
- ✅ New projects can start directly with Agile if requirements are clear

## Simultaneous Framework Usage

### Valid Hybrid Scenarios
Projects may have different concerns/aspects in different frameworks simultaneously:
**Example 1: Exploration + Production**
- New feature exploration: IDPF-Vibe
- Main product development: IDPF-Agile
- Separate branches or feature flags per concern
**Example 2: Multiple Products**
- Product A in active development: IDPF-Agile
- Product B in exploration phase: IDPF-Vibe
- Separate repositories per product

### Guidelines for Hybrid Usage
- Clearly document which framework governs which concern
- Use separate documentation for each framework scope
- Maintain clear boundaries between framework contexts
- Never mix frameworks for same concern/feature
- Communicate framework assignment to all team members

## Framework Integration Architecture

### Dependency Hierarchy
```
System Instructions (REQUIRED foundation - WHO + EXPERTISE)
    ↓
Framework Selection (WHAT process to follow)
    ↓
Skills (TOOLS for specific capabilities)
    ↓
Assistant Guidelines (HOW WELL - quality control)
```

### Selection Criteria
**Use IDPF-Agile when:**
- Building products with evolving requirements
- Iterative delivery with regular feedback
- Feature prioritization based on user value
- Medium to large projects
- Structured backlog and story management needed
- Team collaboration requires structured workflow
- Ready for structured development process
**Use IDPF-Vibe when:**
- Starting with unclear requirements
- Need exploration phase first
- Prototyping before formalizing
- Requirements will emerge from experimentation
- Plan to evolve to Agile afterward

### Common Elements Across Frameworks
**TDD Methodology:**
- All frameworks use RED-GREEN-REFACTOR cycles
- Identical test-writing discipline
- Same verification requirements
- Skills invoked at appropriate TDD phases
**Claude Code Communication:**
- Single code block format (numbered STEP format)
- Complete, runnable code with no placeholders
- Exact file paths and verification steps
- Report results back to assistant
- Two-tool workflow (ASSISTANT + Claude Code + User)
**Context Preservation:**
- Full awareness of previous steps and decisions
- Cumulative conversation context
- Reference previous implementations naturally
- Maintain session continuity
**Git Workflows:**
- All frameworks support GitFlow, GitHub Flow, trunk-based
- Commit conventions (Conventional Commits)
- PR creation and code reviews
- Branch management strategies

## Framework Selection Matrix
| Project Type | Starting Point | Evolution Path | Target Outcome |
|--------------|---------------|----------------|----------------|
| Evolving requirements, iterative delivery | IDPF-Agile | Terminal | Story-driven delivery with TDD |
| Unclear requirements, exploration | IDPF-Vibe | → Agile | Discovered requirements + TDD |
| Separate test repository | IDPF-Testing | Use Agile for test dev | Test automation codebase |
**End of Framework Transitions Reference**
