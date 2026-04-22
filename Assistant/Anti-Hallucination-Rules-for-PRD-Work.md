# Anti-Hallucination Rules for PRD Work
**Version:** v0.90.0

## Core Principle

**Stakeholder truth over helpful invention. Traceability over assumption.** Every requirement must trace to a stakeholder statement, documented evidence, or existing code — never to the assistant's imagination. Invented requirements lead to building the wrong product.

------

## Information Source Hierarchy

| Priority | Source | Notes |
|----------|--------|-------|
| 1 | Stakeholder statements | Direct quotes, written feedback, meeting notes, user research |
| 2 | Existing artifacts | Codebase, test files, API docs, schemas, migrations |
| 3 | Domain standards | Regulations (HIPAA, PCI-DSS, GDPR), compliance, published best practices |
| 4 | Logical inference | Must be flagged as inference, validated with stakeholder, never stated as fact |

If (1) and (2) disagree, investigate — do not pick one silently. Inference is the *last* source, never the first.

------

## Absolute "Never" Rules

### NEVER Invent (must cite a source before stating)

- Requirements not stated by stakeholders
- User stories, personas, or journeys without research evidence
- Acceptance criteria beyond what was stated or testable
- NFRs without code evidence or stakeholder input
- MoSCoW priority levels without stakeholder confirmation
- Success metrics, timeline estimates, or technical constraints without team input
- NFR targets (response time, uptime, throughput) without discussion

### NEVER Assume

- What stakeholders "probably meant" — ask instead
- That requirements are complete without asking
- User needs beyond what was stated
- Priority because it "seems important"
- Scope includes unstated features
- Edge cases matter without evidence

### NEVER Defer or Make Optional Without Confirmation

All stated stakeholder requirements must be documented. Unilateral decisions to defer or downgrade are prohibited.

- Do not mark requirements as "optional" without stakeholder approval
- Do not defer requirements to "Phase 2" or "future release" without explicit agreement
- Do not downgrade priority (Must Have → Should Have) without stakeholder confirmation
- Do not remove requirements because implementation seems complex
- Do not move requirements to "Out of Scope" without stakeholder decision

**When scope or priority concerns arise: STOP → REPORT → ASK → WAIT.** Ask: "Should this remain as stated, or would you like to adjust priority/scope?" Do not proceed until explicit decision.

------

## STOP Boundary Enforcement

Command specs with `## STOP — Workflow Boundary` are a **hard stop**, not a suggestion.

- **STOP means STOP.** Execution halts at the boundary.
- **No "helpful continuation."** Apparent logic, helpfulness, or workflow incompleteness do not authorize crossing.
- **User instruction required.** Only explicit user instruction crosses a STOP boundary.
- **Re-verify after compaction.** Re-read command specs before continuing; never assume pre-compaction state.

STOP boundaries separate workflow phases, permit stakeholder review, and prevent cascading or irreversible operations.

------

## Requirement Source Attribution

Every requirement MUST cite its source. Unsourced requirements are prohibited.

### Source Types and Confidence

| Source Type | Confidence | Action |
|-------------|------------|--------|
| Direct stakeholder quote | High | Document verbatim, cite date/person |
| Written stakeholder feedback | High | Reference document |
| Inferred from code/tests | Medium | Flag as "Inferred", confirm with stakeholder |
| Industry standard | Medium | Cite the standard, confirm applicability |
| Assistant suggestion | Low | Flag as "Suggested", require validation |

### Attribution Format

```markdown
REQ-001: User can reset password via email
Source: Stakeholder interview 2025-01-15, Sarah Chen
Quote: "Users frequently forget passwords and need a self-service option"
Confidence: High
Status: [ ] Confirmed [ ] Pending Validation
```

------

## Scope Boundary Rules

Only include features that stakeholders explicitly requested. Scope decisions must be documented in both directions (in-scope and out-of-scope).

### Scope Creep Detection

Flag when tempted to add features "users will expect," capabilities "competitors have," or functionality that "makes sense." These are inference, not requirements. Ask: "This wasn't explicitly discussed. Should I add [X] to the requirements, or confirm with stakeholders first?"

### Out-of-Scope Must Be Documented

When stakeholders confirm something won't be included, record it explicitly (with the source of the exclusion). An undocumented omission is not the same as an out-of-scope decision.

------

## Priority Assignment Rules

### MoSCoW Requires Explicit Stakeholder Input

| Priority | Requires Stakeholder To Have Said |
|----------|-----------------------------------|
| Must Have | "required", "must", "critical" |
| Should Have | "important", "should", "want" |
| Could Have | "nice to have", "if possible" |
| Won't Have | explicitly excluded |

Never assign priority from assistant judgment. Unassigned requirements are marked `Priority: TBD` with a note that stakeholder assignment is pending — never defaulted.

------

## NFR Rules

### Code-Inferred NFRs (codebase-analysis)

When extracting NFRs from code, cite the file path and explicit pattern. Flag as `Status: Inferred from code — confirm with stakeholders`. Never state inferred NFRs as fact.

### Stakeholder-Stated NFRs

Record the stakeholder's exact quote and the meeting/date. Never round, modify, or "improve" a stated target (e.g., "3 seconds" must not become "2 seconds").

### Never Invent NFR Targets

If uptime, response time, or throughput was not discussed, ask — do not default to industry averages or silently pick a round number.

------

## Acceptance Criteria Rules

### Derive Only From Stated Requirements

Every AC must trace to a parent requirement statement. Do not add "obvious" ACs (welcome emails, auto-login, error handling) unless they were discussed. Implied ACs must be flagged `[Derived]` with a validation note.

### Testability Requirement

Every AC must be: verifiable through testing, specific (no "fast", "user-friendly", "secure"), and traceable to the parent requirement.

------

## Codebase Extraction Rules

### Code Evidence Requirements

| Extraction | Minimum Evidence |
|------------|------------------|
| Feature exists | Test file + passing assertions |
| NFR implemented | Code pattern in multiple locations |
| API endpoint | Route definition + handler |
| Data model | Schema/migration + usage |

### Confidence Level Honesty

Confidence must reflect evidence strength, not the assistant's feeling about it. If only one test exists, confidence is Low — not High. If code exists but has no tests, mark `Status: Needs validation — may be incomplete/deprecated`.

### Never Over-State Code Evidence

A single login test is not "comprehensive authentication." Report exactly what was found, and explicitly list what was not found so the reader can confirm or deny the gap.

------

## Elicitation Session Rules

### Record, Don't Interpret

Record the stakeholder's exact words first, then add follow-up questions. Do not translate "the current system takes too long" into "System must be fast" — the translation loses the signal.

### Clarify Ambiguity Immediately

| Vague Term | Required Clarification |
|------------|------------------------|
| "Fast" | What response time, in seconds? |
| "Secure" | Which specific security requirements? |
| "Easy to use" | Which user actions should be simplified? |
| "Reliable" | What uptime percentage? Recovery time? |
| "Scalable" | How many users? What data volume? |

### Don't Fill Gaps Silently

If error handling, edge cases, or follow-up flows were not discussed, surface the gap — do not quietly add "standard" requirements.

------

## PRD Document Rules

### Section Completeness Honesty

Incomplete sections are marked as such, with the gap named. Never invent personas, metrics, or constraints to "complete" a section.

### Distinguish Fact From Suggestion

Confirmed facts (from stakeholders, tech leads, or cited code) and assistant suggestions must be separated in the document. Use explicit headings like `**Confirmed:**` and `**Suggested (needs confirmation):**`.

------

## Project-State Verification Procedures

These procedures direct Claude to read actual project state rather than act on memory. Each is imperative and has an observable action.

### VERIFY stakeholder quote before writing a requirement

Before recording any requirement, read the conversation transcript, interview notes, or meeting document at the cited path/line. Cite the line number in the requirement's `Source:` field. Do not paraphrase from memory of what the stakeholder "said earlier in this session."

### VERIFY code evidence before recording a code-inferred requirement

```bash
# Example — adjust to the repo language
grep -rn "<pattern>" src/ tests/
```
Run the search and cite the exact file:line results. Do not claim "authentication is implemented" based on a filename alone.

### VERIFY tests exist before claiming test coverage

Read the test file at the cited path using the Read tool. Count assertions. Report the actual count, not an estimate. If the file is missing, say so — do not silently omit the requirement.

### VERIFY dependencies before claiming a framework or library is in use

Read `package.json`, `requirements.txt`, `go.mod`, `pyproject.toml`, `Gemfile`, or the project-equivalent manifest. Do not infer framework usage from directory structure or file names.

### VERIFY existing PRD content before restating it in a new section

Read the existing PRD section with the Read tool before writing the new section. Silent rewording changes meaning. If the new section conflicts with the existing one, stop and flag the conflict.

### VERIFY cited story/AC before placing each diagram element

Before placing an actor, step, component, or state in a diagram, re-read the specific story or AC that justifies it. The diagram-element traceability citation (`Story 1.1, AC-1`) must match an actual story/AC line in the current PRD — not the assistant's memory of what the PRD said earlier in the session.

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

**End of Anti-Hallucination Rules for PRD Work**
