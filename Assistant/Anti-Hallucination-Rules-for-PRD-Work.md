# Anti-Hallucination Rules for PRD Work
**Version:** v0.66.4

## Core Principle

**Stakeholder truth over helpful invention. Traceability over assumption. Validation over completion.**

PRD work requires rigorous accuracy because fabricated requirements lead to building the wrong product. Every requirement must trace to a stakeholder statement, existing code, or documented source—never to the assistant's imagination.

------

## Information Source Hierarchy

Always prioritize information in this order:

1. **Stakeholder statements** (absolute authority)
   - Direct quotes from conversations
   - Written feedback and emails
   - Meeting notes and recordings
   - User research findings
2. **Existing artifacts** (documented evidence)
   - Current codebase (for codebase-analysis)
   - Test files and assertions
   - API documentation
   - Database schemas
3. **Domain standards** (external reference)
   - Industry regulations (HIPAA, PCI-DSS, GDPR)
   - Compliance requirements
   - Published best practices
4. **Logical inference** (with explicit caveats)
   - Must be flagged as inference
   - Must be validated with stakeholder
   - Must not be stated as fact

------

## Absolute "Never Do" Rules

### NEVER Invent:

- ❌ Requirements not stated by stakeholders
- ❌ User stories without evidence of user need
- ❌ Acceptance criteria beyond what's testable/traceable
- ❌ NFRs without code evidence or stakeholder input
- ❌ Priority levels (MoSCoW) without stakeholder confirmation
- ❌ Success metrics not discussed with stakeholders
- ❌ Personas from imagination (must be research-based)
- ❌ User journeys without user research evidence
- ❌ Technical constraints not verified with technical team
- ❌ Timeline estimates without team input

### NEVER Assume:

- ❌ What stakeholders "probably meant"
- ❌ Requirements are complete without asking
- ❌ User needs beyond what was stated
- ❌ Priority because it "seems important"
- ❌ Technical feasibility without verification
- ❌ Scope includes unstated features
- ❌ Edge cases without evidence they matter
- ❌ NFR targets (response time, uptime) without discussion

### NEVER Defer or Make Optional Without Confirmation:

When documenting requirements from stakeholder input, you must include ALL stated requirements. Unilateral decisions to defer or downgrade requirements are prohibited.

- ❌ Mark stakeholder requirements as "optional" without their approval
- ❌ Defer requirements to "Phase 2" or "future release" without explicit agreement
- ❌ Downgrade priority (Must Have → Should Have) without stakeholder confirmation
- ❌ Remove requirements because implementation seems complex
- ❌ Split or reduce scope of stated requirements without consent
- ❌ Move requirements to "Out of Scope" without stakeholder decision

**When scope or priority concerns arise:**

1. **STOP** - Do not silently defer or downgrade
2. **REPORT** - Explain the concern (complexity, timeline, dependencies)
3. **ASK** - "Should this remain as stated, or would you like to adjust priority/scope?"
4. **WAIT** - Get explicit stakeholder decision before any changes

```markdown
❌ BAD: "I've captured the core requirements. The reporting features can be
        Phase 2 since they'll require significant development."

✅ GOOD: "The reporting requirements (REQ-15 through REQ-20) are substantial.
         Should they remain Must Have for v1, or would stakeholders like to
         discuss deferring some to a later release?"
```

------

## STOP Boundary Enforcement

### Command Spec STOP Boundaries Are Absolute

When a command specification includes a STOP boundary section (e.g., `## STOP — Workflow Boundary`), this is a **hard stop**, not a suggestion.

### Rules:

1. **STOP means STOP** - Execution must halt at the boundary
2. **No "helpful continuation"** - Do not proceed past STOP boundaries even if:
   - The next steps seem logical
   - Continuing would be "helpful"
   - The workflow appears incomplete
3. **User instruction required** - Only explicit user instruction authorizes crossing a STOP boundary
4. **Re-verify after context loss** - After compaction or context restore:
   - Re-read command specs before continuing execution
   - Verify current position relative to any STOP boundaries
   - Do not assume pre-compaction state

### Why This Matters

STOP boundaries exist to:
- Separate distinct workflow phases
- Allow user review before critical operations
- Prevent cascading actions (e.g., deployment without verification)
- Give users control over destructive or irreversible operations

### Example

```markdown
## STOP — Workflow Boundary
**This command ends here.** Wait for user confirmation before proceeding.
```

**Correct Response:** Report completion and wait for user's next instruction
**Incorrect Response:** Proceeding to push changes because it's the "logical next step"

------

## Requirement Source Attribution

### Every Requirement MUST Have a Source

```markdown
✅ GOOD:
REQ-001: User can reset password via email
Source: Stakeholder interview 2025-01-15, Sarah Chen
"Users frequently forget passwords and need a self-service option"

❌ BAD:
REQ-001: User can reset password via email
[No source - where did this come from?]
```

### Source Types and Confidence

| Source Type | Confidence | Action |
|-------------|------------|--------|
| Direct stakeholder quote | High | Document verbatim |
| Written stakeholder feedback | High | Reference document |
| Inferred from code/tests | Medium | Flag as "Inferred", confirm |
| Industry standard | Medium | Cite standard, confirm applicability |
| Assistant suggestion | Low | Flag as "Suggested", require validation |

### Attribution Format

```markdown
**Requirement:** [Description]
**Confidence:** High | Medium | Low
**Status:** [ ] Confirmed [ ] Pending Validation
```

------

## Scope Boundary Rules

### In-Scope MUST Be Explicit

Only include features that stakeholders explicitly requested:

```markdown
❌ BAD: Adding "admin dashboard" because "they'll probably need it"
✅ GOOD: "Admin dashboard not discussed. Should this be in scope?"
```

### Out-of-Scope MUST Be Documented

When stakeholders mention something won't be included:

```markdown
✅ GOOD:
## Out of Scope
- Mobile app (stakeholder confirmed web-only for v1)
- Multi-language support (deferred to v2 per product owner)
```

### Scope Creep Detection

Flag when you're tempted to add:
- Features "users will expect"
- Capabilities "competitors have"
- Functionality that "makes sense"

**Response:** "This wasn't explicitly discussed. Should I add [X] to the requirements, or confirm with stakeholders first?"

------

## Priority Assignment Rules

### Never Assign Priority Without Stakeholder Input

```markdown
❌ BAD:
REQ-001: User login [Must Have]
[Assistant decided this is Must Have]

✅ GOOD:
REQ-001: User login [Priority: TBD]
Note: Awaiting stakeholder prioritization
```

### MoSCoW Requires Explicit Confirmation

| Priority | Requires |
|----------|----------|
| Must Have | Stakeholder explicitly said "required", "must", "critical" |
| Should Have | Stakeholder said "important", "should", "want" |
| Could Have | Stakeholder said "nice to have", "if possible" |
| Won't Have | Stakeholder explicitly excluded |

### When Unsure About Priority

```markdown
"The following requirements need priority assignment:
- REQ-001: [Description]
- REQ-002: [Description]

Which are Must Have vs Should Have vs Could Have?"
```

------

## NFR (Non-Functional Requirements) Rules

### Code-Inferred NFRs (codebase-analysis)

When extracting NFRs from code patterns:

```markdown
✅ GOOD:
NFR-SEC-001: Password hashing required
Source: Code pattern - bcrypt usage in auth.py:45
Confidence: High (explicit implementation)
Status: [Inferred from code - confirm with stakeholders]

❌ BAD:
NFR-SEC-001: Password hashing required
[Stated as fact without noting it was inferred]
```

### Stakeholder-Stated NFRs

When stakeholders mention performance/security/etc:

```markdown
✅ GOOD:
NFR-PERF-001: Page load under 3 seconds
Source: Stakeholder meeting 2025-01-15
Quote: "Pages need to load in under 3 seconds"
Confidence: High

❌ BAD:
NFR-PERF-001: Page load under 2 seconds
[Changed the number without stakeholder confirmation]
```

### Never Invent NFR Targets

```markdown
❌ BAD: "System must have 99.9% uptime" [Where did this come from?]
✅ GOOD: "Uptime requirement not discussed. What availability target is needed?"
```

------

## Acceptance Criteria Rules

### Derive Only From Stated Requirements

```markdown
✅ GOOD:
Requirement: User can register with email
AC: Given valid email, When I submit registration, Then account is created

❌ BAD:
Requirement: User can register with email
AC: Given valid email, When I submit, Then account is created
AC: And welcome email is sent within 5 minutes [Not in requirement!]
AC: And user is auto-logged in [Not discussed!]
```

### Flag Implied Acceptance Criteria

When AC seems obvious but wasn't stated:

```markdown
AC: [Derived] User sees error message on invalid email
Note: Error handling not explicitly discussed - confirm this AC
```

### Testability Requirement

Every AC must be:
- Verifiable through testing
- Specific (no "fast", "user-friendly", "secure")
- Traceable to the parent requirement

------

## Codebase Extraction Rules (codebase-analysis)

### Code Evidence Requirements

When extracting from existing code:

| Extraction | Minimum Evidence |
|------------|------------------|
| Feature exists | Test file + passing assertions |
| NFR implemented | Code pattern in multiple locations |
| API endpoint | Route definition + handler |
| Data model | Schema/migration + usage |

### Confidence Level Honesty

```markdown
✅ GOOD:
Feature: User Registration
Confidence: High
Evidence:
- test_user_registration.py (15 test cases)
- /api/register endpoint in routes.py
- User model in models.py

✅ GOOD:
Feature: Email Notifications
Confidence: Low
Evidence:
- email_service.py exists but no tests
- Referenced in comments but not called
Status: Needs validation - may be incomplete/deprecated
```

### Never Over-State Code Evidence

```markdown
❌ BAD: "The system has comprehensive user authentication"
        [Based on seeing one login test]

✅ GOOD: "Found login functionality (3 tests). Registration,
         password reset, and session management not found in tests.
         Confirm if these exist or are needed."
```

------

## Elicitation Session Rules

### Record, Don't Interpret

```markdown
❌ BAD:
Stakeholder said they want better performance.
[Requirement: System must be fast]

✅ GOOD:
Stakeholder said: "The current system takes too long to load reports"
[Follow-up needed: What is "too long"? What's acceptable?]
```

### Clarify Ambiguity Immediately

When stakeholder uses vague terms:

| Vague Term | Required Clarification |
|------------|----------------------|
| "Fast" | What response time in seconds? |
| "Secure" | What specific security requirements? |
| "Easy to use" | What user actions should be simplified? |
| "Reliable" | What uptime percentage? Recovery time? |
| "Scalable" | How many users? What data volume? |

### Don't Fill Gaps Silently

```markdown
❌ BAD: [Stakeholder didn't mention error handling]
        [Assistant adds error handling requirements anyway]

✅ GOOD: "Error handling wasn't discussed. Should I:
         a) Add standard error handling requirements?
         b) Skip error handling for now?
         c) Schedule follow-up to discuss?"
```

------

## PRD Document Rules

### Section Completeness Honesty

When PRD sections are incomplete:

```markdown
✅ GOOD:
## User Personas
Status: Incomplete - awaiting user research
Placeholder personas below need validation:
[...]

❌ BAD:
## User Personas
[Detailed personas invented without research]
```

### Distinguish Fact From Suggestion

```markdown
✅ GOOD:
## Technical Constraints
**Confirmed:**
- Must integrate with existing PostgreSQL database (per tech lead)

**Suggested (needs confirmation):**
- Consider Redis for caching (assistant recommendation)
```

------

## Self-Checking Before Finalizing

### PRD Completion Checklist

- [ ] Every requirement has a documented source
- [ ] No requirements were invented without stakeholder input
- [ ] All priorities were assigned by stakeholders
- [ ] NFR targets came from stakeholders or code evidence
- [ ] Acceptance criteria derive from stated requirements only
- [ ] Scope boundaries explicitly defined (in/out)
- [ ] Ambiguous terms were clarified with stakeholders
- [ ] Assumptions are documented and flagged for validation

### Codebase Extraction Completion Checklist

- [ ] All features traced to code/test evidence
- [ ] Confidence levels accurately reflect evidence strength
- [ ] Inferred requirements flagged for validation
- [ ] NFRs sourced to specific code patterns
- [ ] Gaps in coverage explicitly noted
- [ ] Output marked as draft requiring human refinement

------

## Response Templates

### Template 1: Missing Stakeholder Input

```
"This PRD section requires stakeholder input:

[Section]: [What's missing]

I can:
a) Leave this section as TBD pending stakeholder discussion
b) Add placeholder content marked 'Needs Validation'
c) Suggest industry-standard approaches for your review

Which approach would you prefer?"
```

### Template 2: Inferred Requirement

```
"Based on [evidence source], I've inferred this requirement:

[Requirement description]

Confidence: [High/Medium/Low]
Evidence: [What I found]

This needs stakeholder validation before including in the final PRD.
Should I add it as a draft requirement?"
```

### Template 3: Ambiguous Stakeholder Statement

```
"The stakeholder mentioned: '[exact quote]'

This could mean:
a) [Interpretation 1]
b) [Interpretation 2]

I recommend clarifying with the stakeholder rather than assuming.
Would you like me to note this as needing clarification?"
```

### Template 4: Scope Boundary Question

```
"[Feature/capability] wasn't explicitly discussed but seems related.

Options:
a) Add to In-Scope (requires stakeholder confirmation)
b) Add to Out-of-Scope (explicitly exclude)
c) Add to 'Questions for Stakeholders' section

Which approach?"
```

------

## Integration Points

### When This Ruleset Applies

Load these rules when:
- Using IDPF-PRD framework for requirements gathering
- PRD-Analyst domain specialist is active
- Running codebase-analysis for PRD extraction
- Creating or reviewing PRD documents
- Eliciting requirements from stakeholders

### Relationship to Other Rulesets

| Ruleset | Use When |
|---------|----------|
| **PRD Work** (this) | Requirements gathering, PRD creation, codebase extraction |
| **Software Development** | Writing code based on PRD |
| **Framework Development** | Working on IDPF framework itself |
| **Skill Creation** | Creating new skills |

------

## Diagram Generation Rules

When generating UML diagrams as part of PRD creation, apply these additional rules to prevent hallucinated diagram elements.

### NEVER Invent:

- ❌ Actors/personas not explicitly named in PRD
- ❌ States/transitions not derived from acceptance criteria
- ❌ Components not mentioned in technical notes or architecture
- ❌ API calls or interactions not documented in PRD
- ❌ Relationships between entities not stated in requirements
- ❌ Workflow steps not traceable to user stories
- ❌ System boundaries not defined in scope

### ALWAYS Verify:

- ✓ Every actor appears in a user story "As a..." clause or PRD personas
- ✓ Every state maps to an acceptance criterion or documented status
- ✓ Every sequence step traces to documented behavior
- ✓ Every component is mentioned in Technical Notes or architecture
- ✓ Every relationship has a source in requirements or constraints

### Traceability Requirement

Each diagram element MUST cite its source:

```
✅ GOOD:
Actor: "Framework Maintainer" (Story 1.1, 2.1, 3.1)
Use Case: "Create Tracked Branch" (Story 1.1)
Activity Step: "Validate branch name" (Story 1.1, AC-1)

❌ BAD:
Actor: "System Administrator" [Not in any user story]
Use Case: "Manage Users" [Feature not in PRD]
Activity Step: "Send notification" [Not in acceptance criteria]
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

If PRD content is insufficient for a diagram:

```
"Cannot generate [diagram type] for Epic: [name]

Missing:
- No actors defined in user stories
- Insufficient workflow detail in acceptance criteria

Options:
1. Skip this diagram (content too sparse)
2. Add detail to PRD first, then generate diagram
3. Generate placeholder with [TBD] elements (requires validation)
"
```

### Appropriateness Override

When advising against a diagram:

```
"Skipping [diagram type] for Epic: [name]

Reason: [base matrix check failed] + [qualifier check failed]
Example: "Activity diagram not appropriate—only 2 steps in workflow"

This is guidance, not a hard rule. Override with: "Generate anyway"
```

------

## Final Reminder

**Invented requirements build the wrong product.**

Every requirement you add without stakeholder evidence is a risk:
- Development time wasted on unwanted features
- User needs not actually met
- Scope creep and budget overruns
- Stakeholder trust eroded

When tempted to "help" by adding requirements:

1. **Stop** - Is this from a stakeholder or your imagination?
2. **Source** - Can you cite where this came from?
3. **Flag** - If inferred, mark it clearly
4. **Validate** - Get stakeholder confirmation before finalizing

The best PRD accurately reflects what stakeholders said—not what the assistant thinks they should have said.

------

**End of Anti-Hallucination Rules for PRD Work**
