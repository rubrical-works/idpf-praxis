# Anti-Hallucination Rules for PRD Work
**Version:** v0.51.0
## Core Principle
**Stakeholder truth over helpful invention. Traceability over assumption. Validation over completion.**
## Information Source Hierarchy
1. **Stakeholder statements** (absolute authority)
2. **Existing artifacts** (documented evidence)
3. **Domain standards** (external reference)
4. **Logical inference** (with explicit caveats)
## Absolute "Never Do" Rules
### NEVER Invent:
- Requirements not stated by stakeholders
- User stories without evidence
- Acceptance criteria beyond testable/traceable
- NFRs without code evidence or stakeholder input
- Priority levels without stakeholder confirmation
- Personas from imagination
### NEVER Assume:
- What stakeholders "probably meant"
- Requirements are complete without asking
- User needs beyond what was stated
- Priority because it "seems important"
### NEVER Defer or Make Optional Without Confirmation:
- Mark requirements as "optional" without stakeholder approval
- Defer to "Phase 2" without explicit agreement
- Downgrade priority without confirmation
- Remove requirements due to complexity
- Move to "Out of Scope" without stakeholder decision
**When concerns arise:** STOP → REPORT → ASK → WAIT for stakeholder decision
```
❌ "I've captured core requirements. Reporting features can be Phase 2."
✅ "Reporting requirements (REQ-15 to REQ-20) are substantial. Defer some, or keep as Must Have?"
```
## STOP Boundary Enforcement
STOP boundaries are **hard stops**. Execution must halt. Only explicit user instruction authorizes crossing.
## Requirement Source Attribution
Every requirement MUST have a source:
| Source Type | Confidence | Action |
|-------------|------------|--------|
| Direct stakeholder quote | High | Document verbatim |
| Written feedback | High | Reference document |
| Inferred from code/tests | Medium | Flag, confirm |
| Industry standard | Medium | Cite, confirm |
| Assistant suggestion | Low | Flag, require validation |
## Scope Boundary Rules
- In-Scope MUST be explicit
- Out-of-Scope MUST be documented
- Flag scope creep
## Priority Assignment Rules
Never assign priority without stakeholder input. MoSCoW requires explicit confirmation.
## NFR Rules
Code-inferred NFRs must be flagged with confidence level. Never invent NFR targets.
## Acceptance Criteria Rules
- Derive only from stated requirements
- Flag implied criteria
- Every AC must be testable, specific, traceable
## extract-prd Specific Rules
| Extraction | Minimum Evidence |
|------------|------------------|
| Feature exists | Test file + assertions |
| NFR implemented | Code pattern in multiple locations |
| API endpoint | Route + handler |
| Data model | Schema + usage |
## Elicitation Session Rules
- Record, don't interpret
- Clarify ambiguity immediately
- Don't fill gaps silently
## Diagram Generation Rules
### NEVER Invent:
- Actors not in PRD
- States not from AC
- Components not in technical notes
- Workflow steps not traceable to stories
### ALWAYS Verify:
- Every actor in a user story
- Every state maps to AC
- Every sequence step traces to documented behavior
## Self-Checking Checklists
### PRD Completion:
- [ ] Every requirement has documented source
- [ ] No invented requirements
- [ ] All priorities from stakeholders
- [ ] NFR targets from stakeholders/code
- [ ] Scope boundaries explicit
### extract-prd Completion:
- [ ] All features traced to code/test
- [ ] Confidence levels accurate
- [ ] Inferred requirements flagged
- [ ] Gaps noted
## Response Templates
1. **Missing Input**: "This section requires stakeholder input..."
2. **Inferred Requirement**: "Based on [evidence], I've inferred... Confidence: [level]"
3. **Ambiguous Statement**: "Could mean [A] or [B]. Recommend clarifying."
4. **Scope Question**: "[Feature] wasn't discussed. Add to In-Scope, Out-of-Scope, or Questions?"
---
**End of Anti-Hallucination Rules for PRD Work**
