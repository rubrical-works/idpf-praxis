# Anti-Hallucination Rules for PRD Work
**Version:** v0.57.0
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
- Success metrics not discussed with stakeholders
- Personas from imagination
- User journeys without research evidence
- Technical constraints not verified with technical team
### NEVER Assume:
- What stakeholders "probably meant"
- Requirements are complete without asking
- User needs beyond what was stated
- Priority because it "seems important"
- Technical feasibility without verification
- Scope includes unstated features
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
- Flag scope creep: features "users will expect", capabilities "competitors have", functionality that "makes sense"
## Priority Assignment Rules
Never assign priority without stakeholder input. MoSCoW requires explicit confirmation:
| Priority | Requires |
|----------|----------|
| Must Have | Stakeholder said "required", "must", "critical" |
| Should Have | Stakeholder said "important", "should", "want" |
| Could Have | Stakeholder said "nice to have", "if possible" |
| Won't Have | Stakeholder explicitly excluded |
## NFR Rules
- Code-inferred NFRs must be flagged with confidence level and source
- Stakeholder-stated NFRs: preserve exact numbers, never modify targets
- Never invent NFR targets
## Acceptance Criteria Rules
- Derive only from stated requirements
- Flag implied criteria
- Every AC must be testable, specific, traceable
## Codebase Extraction Rules (codebase-analysis)
| Extraction | Minimum Evidence |
|------------|------------------|
| Feature exists | Test file + assertions |
| NFR implemented | Code pattern in multiple locations |
| API endpoint | Route + handler |
| Data model | Schema + usage |
Never over-state code evidence. Flag confidence levels accurately.
## Elicitation Session Rules
- Record, don't interpret
- Clarify ambiguity immediately (fast, secure, easy, reliable, scalable)
- Don't fill gaps silently
## PRD Document Rules
- Flag incomplete sections with status
- Distinguish fact from suggestion (Confirmed vs Suggested)
## Diagram Generation Rules
### NEVER Invent:
- Actors not in PRD
- States not from AC
- Components not in technical notes
- API calls not documented in PRD
- Workflow steps not traceable to stories
### ALWAYS Verify:
- Every actor in a user story "As a..." clause or PRD personas
- Every state maps to AC or documented status
- Every sequence step traces to documented behavior
- Every component mentioned in Technical Notes or architecture
### Traceability Requirement
Each diagram element MUST cite its source:
```
✅ Actor: "Framework Maintainer" (Story 1.1, 2.1, 3.1)
❌ Actor: "System Administrator" [Not in any user story]
```
### Diagram-Specific Checks
| Diagram Type | Must Verify |
|--------------|-------------|
| Use Case | All actors from PRD; all use cases from stories |
| Activity | All steps from AC or workflow descriptions |
| Sequence | All interactions from documented behavior |
| Class | All entities from data models in PRD |
| State Machine | All states/transitions from AC |
| Deployment | All components from Technical Notes |
### When Evidence Is Insufficient
Report what is missing, offer options: skip diagram, add detail to PRD first, or generate placeholder with [TBD] elements.
### Appropriateness Override
When advising against a diagram, explain reason. User can override with: "Generate anyway"
## Self-Checking Checklists
### PRD Completion:
- [ ] Every requirement has documented source
- [ ] No invented requirements
- [ ] All priorities from stakeholders
- [ ] NFR targets from stakeholders/code
- [ ] AC derive from stated requirements only
- [ ] Scope boundaries explicit
- [ ] Assumptions documented and flagged
### Codebase Extraction Completion:
- [ ] All features traced to code/test
- [ ] Confidence levels accurate
- [ ] Inferred requirements flagged
- [ ] NFRs sourced to code patterns
- [ ] Gaps noted
- [ ] Output marked as draft
## Response Templates
1. **Missing Input**: "This section requires stakeholder input..."
2. **Inferred Requirement**: "Based on [evidence], I've inferred... Confidence: [level]"
3. **Ambiguous Statement**: "Could mean [A] or [B]. Recommend clarifying."
4. **Scope Question**: "[Feature] wasn't discussed. Add to In-Scope, Out-of-Scope, or Questions?"
---
**End of Anti-Hallucination Rules for PRD Work**
