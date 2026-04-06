# Anti-Hallucination Rules for PRD Work
**Version:** v0.83.0
**Core Principle:** Stakeholder truth over helpful invention. Traceability over assumption. Validation over completion.
Every requirement must trace to a stakeholder statement, existing code, or documented source -- never to the assistant's imagination.
---
**Information Source Hierarchy**
1. **Stakeholder statements** (absolute authority) - Direct quotes, written feedback, meeting notes, user research
2. **Existing artifacts** (documented evidence) - Codebase, test files, API docs, database schemas
3. **Domain standards** (external reference) - Industry regulations (HIPAA, PCI-DSS, GDPR), compliance requirements
4. **Logical inference** (with explicit caveats) - Must be flagged as inference, validated with stakeholder, not stated as fact
---
**NEVER Invent:**
- Requirements not stated by stakeholders
- User stories without evidence of user need
- Acceptance criteria beyond what's testable/traceable
- NFRs without code evidence or stakeholder input
- Priority levels (MoSCoW) without stakeholder confirmation
- Success metrics not discussed with stakeholders
- Personas from imagination (must be research-based)
- User journeys without user research evidence
- Technical constraints not verified with technical team
- Timeline estimates without team input
**NEVER Assume:**
- What stakeholders "probably meant"
- Requirements are complete without asking
- User needs beyond what was stated
- Priority because it "seems important"
- Technical feasibility without verification
- Scope includes unstated features
- Edge cases without evidence they matter
- NFR targets (response time, uptime) without discussion
**NEVER Defer or Make Optional Without Confirmation:**
Include ALL stated requirements. Unilateral decisions to defer or downgrade are prohibited.
- Mark stakeholder requirements as "optional" without their approval
- Defer requirements to "Phase 2" without explicit agreement
- Downgrade priority (Must Have -> Should Have) without stakeholder confirmation
- Remove requirements because implementation seems complex
- Split or reduce scope without consent
- Move requirements to "Out of Scope" without stakeholder decision
**When scope/priority concerns arise:** 1) STOP 2) REPORT the concern 3) ASK "Should this remain as stated, or would you like to adjust?" 4) WAIT for explicit stakeholder decision.
```markdown
BAD: "I've captured the core requirements. The reporting features can be Phase 2 since they'll require significant development."
GOOD: "The reporting requirements (REQ-15 through REQ-20) are substantial. Should they remain Must Have for v1, or would stakeholders like to discuss deferring some to a later release?"
```
---
**STOP Boundary Enforcement**
STOP boundaries in command specs are **hard stops**, not suggestions.
1. **STOP means STOP** - Execution must halt at the boundary
2. **No "helpful continuation"** - Do not proceed past STOP even if next steps seem logical
3. **User instruction required** - Only explicit user instruction authorizes crossing
4. **Re-verify after context loss** - Re-read command specs after compaction, verify position relative to STOP boundaries
---
**Requirement Source Attribution**
Every requirement MUST have a source.
```markdown
GOOD:
REQ-001: User can reset password via email
Source: Stakeholder interview 2025-01-15, Sarah Chen

BAD:
REQ-001: User can reset password via email
[No source - where did this come from?]
```
| Source Type | Confidence | Action |
|-------------|------------|--------|
| Direct stakeholder quote | High | Document verbatim |
| Written stakeholder feedback | High | Reference document |
| Inferred from code/tests | Medium | Flag as "Inferred", confirm |
| Industry standard | Medium | Cite standard, confirm applicability |
| Assistant suggestion | Low | Flag as "Suggested", require validation |
Attribution format: **Requirement:** [Description] / **Confidence:** High|Medium|Low / **Status:** [ ] Confirmed [ ] Pending Validation
---
**Scope Boundary Rules**
- **In-Scope MUST be explicit** - Only include features stakeholders explicitly requested
- **Out-of-Scope MUST be documented** - Record what stakeholders confirmed won't be included
- **Scope Creep Detection** - Flag when tempted to add features "users will expect", capabilities "competitors have", or functionality that "makes sense". Response: "This wasn't explicitly discussed. Should I add [X] or confirm with stakeholders first?"
---
**Priority Assignment Rules**
Never assign priority without stakeholder input. Use "Priority: TBD" when unconfirmed.
| Priority | Requires |
|----------|----------|
| Must Have | Stakeholder explicitly said "required", "must", "critical" |
| Should Have | Stakeholder said "important", "should", "want" |
| Could Have | Stakeholder said "nice to have", "if possible" |
| Won't Have | Stakeholder explicitly excluded |
---
**NFR (Non-Functional Requirements) Rules**
- **Code-Inferred NFRs:** Flag as inferred from code, include source file/line, require stakeholder confirmation
- **Stakeholder-Stated NFRs:** Document exact quote with source meeting/date, preserve exact numbers
- **Never Invent NFR Targets** - If not discussed, ask: "What availability/performance target is needed?"
---
**Acceptance Criteria Rules**
- Derive only from stated requirements -- never add implied ACs without flagging
- Flag implied ACs: `AC: [Derived] ... Note: Not explicitly discussed - confirm this AC`
- Every AC must be: verifiable through testing, specific (no "fast"/"user-friendly"/"secure"), traceable to parent requirement
---
**Codebase Extraction Rules (codebase-analysis)**
| Extraction | Minimum Evidence |
|------------|------------------|
| Feature exists | Test file + passing assertions |
| NFR implemented | Code pattern in multiple locations |
| API endpoint | Route definition + handler |
| Data model | Schema/migration + usage |
- Report confidence honestly (High/Medium/Low) with specific evidence
- Never over-state code evidence -- report exactly what was found and what's missing
---
**Elicitation Session Rules**
- **Record, don't interpret** - Capture exact stakeholder quotes, note follow-up questions needed
- **Clarify ambiguity immediately:**
| Vague Term | Required Clarification |
|------------|----------------------|
| "Fast" | What response time in seconds? |
| "Secure" | What specific security requirements? |
| "Easy to use" | What user actions should be simplified? |
| "Reliable" | What uptime percentage? Recovery time? |
| "Scalable" | How many users? What data volume? |
- **Don't fill gaps silently** - Ask user whether to add standard requirements, skip, or schedule follow-up
---
**PRD Document Rules**
- Mark incomplete sections with status (e.g., "Status: Incomplete - awaiting user research")
- Distinguish confirmed facts from suggestions with clear labels
---
**PRD Completion Checklist**
- [ ] Every requirement has a documented source
- [ ] No requirements were invented without stakeholder input
- [ ] All priorities were assigned by stakeholders
- [ ] NFR targets came from stakeholders or code evidence
- [ ] Acceptance criteria derive from stated requirements only
- [ ] Scope boundaries explicitly defined (in/out)
- [ ] Ambiguous terms were clarified with stakeholders
- [ ] Assumptions are documented and flagged for validation
**Codebase Extraction Completion Checklist**
- [ ] All features traced to code/test evidence
- [ ] Confidence levels accurately reflect evidence strength
- [ ] Inferred requirements flagged for validation
- [ ] NFRs sourced to specific code patterns
- [ ] Gaps in coverage explicitly noted
- [ ] Output marked as draft requiring human refinement
---
**Response Templates**
Template 1 - Missing Stakeholder Input: "This PRD section requires stakeholder input: [Section]: [What's missing]. I can: a) Leave as TBD b) Add placeholder marked 'Needs Validation' c) Suggest industry-standard approaches. Which?"
Template 2 - Inferred Requirement: "Based on [evidence], I've inferred: [Requirement]. Confidence: [H/M/L]. Evidence: [What found]. Needs stakeholder validation. Add as draft?"
Template 3 - Ambiguous Statement: "Stakeholder mentioned: '[exact quote]'. Could mean: a) [Interp 1] b) [Interp 2]. Recommend clarifying. Note as needing clarification?"
Template 4 - Scope Boundary: "[Feature] wasn't explicitly discussed. Options: a) Add to In-Scope (requires confirmation) b) Add to Out-of-Scope c) Add to Questions section. Which?"
---
**Integration Points**
Load these rules when: using IDPF-PRD framework, PRD-Analyst specialist is active, running codebase-analysis, creating/reviewing PRDs, eliciting requirements.
| Ruleset | Use When |
|---------|----------|
| **PRD Work** (this) | Requirements gathering, PRD creation, codebase extraction |
| **Software Development** | Writing code based on PRD |
| **Framework Development** | Working on IDPF framework itself |
| **Skill Creation** | Creating new skills |
---
**Diagram Generation Rules**
**NEVER Invent:**
- Actors/personas not explicitly named in PRD
- States/transitions not derived from acceptance criteria
- Components not mentioned in technical notes or architecture
- API calls or interactions not documented in PRD
- Relationships between entities not stated in requirements
- Workflow steps not traceable to user stories
- System boundaries not defined in scope
**ALWAYS Verify:**
- Every actor appears in a user story "As a..." clause or PRD personas
- Every state maps to an acceptance criterion or documented status
- Every sequence step traces to documented behavior
- Every component is mentioned in Technical Notes or architecture
- Every relationship has a source in requirements or constraints
**Traceability:** Each diagram element MUST cite its source (e.g., `Actor: "Framework Maintainer" (Story 1.1, 2.1, 3.1)`)
| Diagram Type | Must Verify |
|--------------|-------------|
| Use Case | All actors from PRD; all use cases from stories |
| Activity | All steps from AC or workflow descriptions |
| Sequence | All interactions from documented behavior |
| Class | All entities from data models in PRD |
| State Machine | All states/transitions from AC |
| Deployment | All components from Technical Notes |
**When evidence insufficient:** Report what's missing, offer options: skip diagram, add detail to PRD first, or generate placeholder with [TBD] elements.
**Appropriateness override:** When advising against a diagram, state reason. User can override with "Generate anyway".
---
**Final Reminder:** Invented requirements build the wrong product. When tempted to add: 1) Stop - stakeholder or imagination? 2) Source - can you cite it? 3) Flag - if inferred, mark clearly 4) Validate - get stakeholder confirmation.
**End of Anti-Hallucination Rules for PRD Work**