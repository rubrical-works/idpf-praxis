# Vibe-to-Structured Development Framework (Core)
**Version:** v0.54.0
**Type:** Core Framework (Platform-Agnostic)
## Purpose
Core framework defining Vibe-to-Structured methodology. Platform-agnostic, applies to all project types.
**Platform-specific frameworks:** Desktop, Mobile, Web, Game, Embedded, Newbie
## Platform Selection Guide
| Framework | Target | Key Technologies | Best For |
|-----------|--------|------------------|----------|
| **Web** | Browsers, servers | React, Vue, Node.js | Websites, APIs, SaaS |
| **Desktop** | Windows, macOS, Linux | Electron, Tauri, native | Local apps, tools |
| **Mobile** | iOS, Android | React Native, Flutter | Phone/tablet apps |
| **Game** | PC, consoles, web | Unity, Unreal, Godot | Interactive games |
| **Embedded** | Microcontrollers, SBCs | Arduino, ESP32, RPi | IoT, hardware |
| **Newbie** | Any (simplified) | Depends on project | Learning, first projects |
## Terminology
| Term | Definition |
|------|------------|
| ASSISTANT | AI assistant (Claude) responding in chat |
| Claude Code | Separate tool/console for code execution |
| Vibe Phase | Exploratory development without formal requirements |
| Structured Phase | TDD-driven development with documented requirements |
| Evolution Point | Transition from Vibe to Structured development |
## Working with Claude Code
**Two-Tool Workflow:**
1. ASSISTANT (chat) - provides instructions
2. Claude Code - executes instructions
**Workflow:** User asks ASSISTANT → ASSISTANT provides TASK/STEP instructions → User copies to Claude Code → Claude Code executes → User reports results
## Three-Phase Workflow
1. **VIBE PHASE**: Exploratory development with natural language prompts
2. **EVOLUTION POINT**: Capture learnings and formalize requirements
3. **STRUCTURED PHASE**: TDD-driven development with full testing rigor
## Phase 1: VIBE PHASE
### Session Initialization
User says: "Let's start a vibe coding project for [description]"
**STEP 0: Verify Claude Code Setup** (CRITICAL)
Confirm user has Claude Code installed before proceeding.
**After verification:**
1. Declare Framework version
2. Check MCP Access
3. Confirm Vibe Mode
4. Establish Project Location
5. Identify Project Type
6. Ask Clarifying Questions
7. Suggest Starting Point
8. Display Vibe Commands
9. Wait for **"Vibe-Start"**
### Vibe Phase Commands
| Command | Action |
|---------|--------|
| **Vibe-Start** | Begin exploration |
| **Try-This** | Describe feature to try |
| **Show-Me** | See current state |
| **That-Works** | Feature complete, next |
| **Undo-That** | Remove last change |
| **Run-It** | Get run/test instructions |
| **Vibe-Status** | Summary of progress |
| **Vibe-End** | Save snapshot, end session |
| **Ready-to-Structure** | Transition to structured |
| **Vibe-Abandon** | Stop project |
### Vibe-End Snapshot Format
```markdown
# [Project Name] - Vibe Snapshot
**Date:** [Date]
**Status:** Vibe Phase in Progress
## Features Built So Far
## Technologies/Tools Used
## Architecture Patterns
## Next Ideas to Try
## Notes for Next Session
```
## Phase 2: EVOLUTION POINT
### Triggering Evolution
- User issues **"Ready-to-Structure"**, OR
- ASSISTANT detects project maturity (3-5 features working, architecture stabilized)
### Evolution Target: IDPF-Agile
Generates Product Backlog with User Stories organized into Epics.
### Evolution Process
1. Pause Development
2. Analyze What Exists
3. Generate As-Built PRD (features marked ✅ DONE)
4. Organize into Epics
5. Add Acceptance Criteria
6. Estimate Story Points
7. Prioritize Stories
8. Present PRD
9. State Readiness
10. Refine with User
11. Save Backlog to `/backlog/product-backlog.md`
12. Begin Sprint Planning
### Product Backlog Structure
```markdown
# Product Backlog: [Project Name]
**Project Vision:** [One-sentence description]
**Evolution Note:** Evolved from Vibe to Agile
## As-Built Summary
**Status:** ✅ Ready for Sprint 1 (or ✅ Project Complete)
## Completed Features (Vibe Phase)
### Story 0.1: [Feature] ✅ DONE
**As a** [user] **I want** [feature] **So that** [benefit]
**Acceptance Criteria:** [x] met
**Story Points:** [estimate]
**Status:** Done (Vibe Phase)
## Definition of Done (Global)
## Epic: [Feature Area]
### Story X.Y: [Title]
**As a** [user] **I want** [goal] **So that** [benefit]
**Acceptance Criteria:** [ ] criteria
**Story Points:** [estimate]
**Priority:** [High/Medium/Low]
**Status:** Backlog
```
## Phase 3: STRUCTURED PHASE
### Transition
1. Switch to TDD Mode (RED-GREEN-REFACTOR)
2. Add Tests for Existing Code
3. Continue Development with rigor
4. Maintain Requirements document
### Structured Phase Commands
| Command | Action |
|---------|--------|
| **List-Commands** | Show available commands |
| **Run-Tests** | Execute test suite |
| **Show-Coverage** | Display coverage report |
| **Update-Requirements** | Modify requirements |
| **Double-Check** | Verify against requirements |
| **Final-Commit-Create-PR** | Complete project |
| **Roadblock-Stop** | Document blocker |
**TDD Execution:** RED → GREEN → REFACTOR phases execute autonomously.
## Instructions for Claude Code
### Single Code Block Format
```
TASK: [Brief description]
STEP 1: [Open/create file]
STEP 2: [Navigate/specify action]
STEP 3: [Add/modify code - COMPLETE]
STEP 4: [Context about changes]
STEP 5: [Save file]
STEP 6: [Run/test command]
STEP 7: [Verify outcome]
STEP 8: [Report results]
```
**Requirements:** ONE code block, numbered steps, complete code, exact paths, verification steps.
## Context Preservation
ASSISTANT maintains complete awareness:
- **Vibe:** Features, preferences, decisions, patterns, architecture
- **Evolution:** Why features built, architecture emergence, vision
- **Structured:** All vibe context PLUS requirements, test coverage, remaining work
## Special Scenarios
| Scenario | Handling |
|----------|----------|
| Vibe goes off track | **Vibe-Abandon**, create lessons learned |
| Early evolution | Requirements focus on "what to build" |
| Late evolution | Focus on testing and polish |
| Return to Vibe | Discouraged; experimental code must pass tests |
| Cross-platform | Start primary platform, add supporting as needed |
## Best Practices
### Vibe Phase
- Keep iterations small
- Run code frequently
- Don't overthink
- Embrace messiness
- Fail fast
### Evolution Point
- Don't rush
- Be honest about state
- Think ahead to testing
- Set clear goals
### Structured Phase
- Follow TDD rigorously
- Test existing code
- Refactor freely
- Update requirements
## When to Use This Framework
**Use when:** Unclear requirements, exploring new tech, prototyping, learning while building
**Use IDPF-Agile directly when:** Requirements clear, mature codebase, team needs documentation from start
**Don't use when:** Safety-critical systems, production without staging, fixed scope deadlines
## Framework Extensions
All platform frameworks extend this core:
- Desktop, Mobile, Web, Game, Embedded, Newbie
**Always use core + appropriate specialized framework.**
---
**End of Core Framework**
