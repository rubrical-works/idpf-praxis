**Agile-Driven Development Framework - Core**
**Version:** v0.88.0
**Module:** Core (loaded at session startup)
**Terminology**
1. **User Story**: Feature described from user's perspective with acceptance criteria
2. **Epic**: Large feature area containing multiple related user stories
3. **Story Points**: Relative effort estimate (Fibonacci: 1, 2, 3, 5, 8, 13, 21)
4. **Definition of Done (DoD)**: Checklist that must be satisfied for story completion
**Agile Workflow**
```
Product Backlog Creation → Story Selection (from Ready) → Story Development (TDD cycles) → Story Review (validate AC) → Done → Next Story or Release
```
**Key Commands**
**Backlog Operations (GitHub-Native)**
* **"Create-Backlog"** - Create GitHub epics/stories from PRD
* **"Add-Story"** - Create new story issue with epic auto-detection
* **"Prioritize-Backlog"** - Update Priority field (P0/P1/P2) for issues
**Story Workflow (via Commands)**
* **`/work #N`** - Begin development on a story (validates branch, extracts auto-TASK, dispatches TDD)
* **`/done`** - Close story (in_review → done only; `/work` handles in_progress → in_review)
**Development Commands**
* **"Run-Tests"** - Execute full test suite
* **"Show-Coverage"** - Display test coverage report
**GitHub Integration**
* All backlog commands work against GitHub issues
* No local backlog files created
* Requires `.gh-pmu.json` configuration and `gh pmu` extension
* Stories linked to epics via `gh pmu sub add`
**TDD Cycle (RED-GREEN-REFACTOR)**
Each task follows **RED-GREEN-REFACTOR** autonomously:
**RED Phase**
1. Write failing test for specific behavior
2. Run test, verify it FAILS
3. Proceed to GREEN phase
**GREEN Phase**
1. Write minimal implementation to pass test
2. Run test, verify it PASSES
3. Proceed to REFACTOR phase
**REFACTOR Phase**
1. Analyze code for refactoring opportunities (duplication, naming, complexity, structure)
2. **Report** — state what was examined and decision (refactor or skip with reason)
3. If refactoring: apply changes while keeping tests passing
4. Run full test suite — confirm no regressions
5. Commit: `Refs #$ISSUE — <what this cycle implements>`
6. Proceed to next behavior or complete story
**TDD Execution:** Phases execute autonomously. Commit after each REFACTOR phase to create natural recovery points. The only workflow checkpoint is story completion (In Review → Done).
**Skills Available:**
- `tdd-red-phase`: RED phase guidance
- `tdd-green-phase`: GREEN phase guidance
- `tdd-refactor-phase`: REFACTOR guidance
- `tdd-failure-recovery`: When tests behave unexpectedly
**Story Development Flow**
When User says **`work #N`** (or `/work #N`):
1. `/work` command validates issue, branch assignment, and issue type
2. Moves to in_progress, extracts auto-TASK from acceptance criteria
3. Dispatches to TDD methodology (this file)
4. Break down into testable behaviors
5. Begin TDD cycles
When User says **`done`** (or `/done`):
1. `/done` confirms issue is in `in_review` status (rejects `in_progress`)
2. STOP boundary → user confirms → moves to `done`
3. Offers to document design decisions
**Note:** AC verification and the `in_progress → in_review` transition are handled by `/work`, not `/done`.
**User Story Format**
```markdown
### Story [ID]: [Title]
**As a** [type of user]
**I want** [goal/desire]
**So that** [benefit/value]
**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
**Story Points:** [1, 2, 3, 5, 8, 13, 21]
**Priority:** [High/Medium/Low]
**Status:** [Backlog/Selected/In Progress/Done]
```
**Definition of Done (Global)**
All stories must meet:
- [ ] All acceptance criteria met
- [ ] Unit tests written and passing
- [ ] Code follows project conventions
- [ ] No known bugs
- [ ] Documentation updated (if applicable)
**Additional Documentation**
Loaded automatically when needed: Templates, Commands, Best Practices, Transitions.
**End of Core Module**