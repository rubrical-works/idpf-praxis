# Vibe-to-Structured Development Framework (Core)
**Version:** v0.89.0
**Type:** Core Framework (Platform-Agnostic)
## Purpose
Core framework defining the Vibe-to-Structured methodology. Platform-agnostic, applies to all project types.
**Platform-specific frameworks:**
- Desktop: `Vibe-to-Structured-Desktop-Framework.md`
- Mobile: `Vibe-to-Structured-Mobile-Framework.md`
- Web: `Vibe-to-Structured-Web-Framework.md`
- Game: `Vibe-to-Structured-Game-Framework.md`
- Embedded: `Vibe-to-Structured-Embedded-Framework.md`
- Newbie: `Vibe-to-Structured-Newbie-Framework.md`
## Platform Selection Guide
### Quick Selection Decision Tree
```
What are you building?
├─► Website/web app? → Web Framework (React, Vue, Node.js, browser-based)
├─► Desktop app? → Desktop Framework (Electron, Tauri, native)
├─► Mobile app? → Mobile Framework (React Native, Flutter, native)
├─► Video game? → Game Framework (Unity, Unreal, Godot)
├─► Firmware/IoT? → Embedded Framework (Arduino, ESP32, RPi)
└─► Not sure/Learning? → Newbie Framework
```
| Framework | Target | Key Technologies | Best For |
|-----------|--------|------------------|----------|
| **Web** | Browsers, servers | React, Vue, Node.js, REST | Websites, APIs, SaaS |
| **Desktop** | Windows, macOS, Linux | Electron, Tauri, native | Local apps, tools |
| **Mobile** | iOS, Android | React Native, Flutter | Phone/tablet apps |
| **Game** | PC, consoles, web | Unity, Unreal, Godot | Interactive games |
| **Embedded** | Microcontrollers, SBCs | Arduino, ESP32, RPi | IoT, hardware |
| **Newbie** | Any (simplified) | Depends on project | Learning, first projects |
### Hybrid and Multi-Platform Projects
| Project Type | Primary Framework | Secondary |
|--------------|-------------------|-----------|
| Mobile + backend API | Mobile | + Web (for API) |
| Desktop + mobile companion | Desktop | + Mobile |
| IoT + web dashboard | Embedded | + Web |
| Game with multiplayer server | Game | + Web |
**Recommendation:** Start with primary user interface, add supporting platforms as needed.
### Framework Dependencies
All platform frameworks extend this Core Framework. **Always read Core Framework first**, then platform-specific.
## Terminology
1. **ASSISTANT**: The AI assistant (Claude) responding in this chat
2. **Claude Code**: Separate tool/console where the User executes code changes
3. **User**: The human developer managing both interfaces
4. **Vibe Phase**: Initial exploratory development using natural language prompts
5. **Structured Phase**: Formalized development following TDD cycles
6. **Evolution Point**: Transition from Vibe to Structured development
7. **Session**: Single, continuous conversation from initial vibe through structured completion
## Working with Claude Code
### The Two-Tool Workflow
1. **Claude ASSISTANT (this chat)** - Planner: understands goals, breaks work into TASK/STEP instructions, provides guidance
2. **Claude Code** - Executor: runs commands, creates files, does technical work
### Workflow
1. USER asks ASSISTANT for help
2. ASSISTANT provides instructions (code blocks)
3. USER copies entire code block
4. USER pastes into Claude Code
5. Claude Code executes steps
6. USER reports results back to ASSISTANT
7. ASSISTANT provides next instructions
### First-Time Setup Checklist
- Claude Code is installed
- You know how to open it
- You can copy/paste between chat and Claude Code
- Both windows are accessible
### Important Notes
**DO:** Copy ENTIRE code block, paste into Claude Code, keep both visible, report results back
**DON'T:** Execute manually, copy only partial instructions, skip reporting, assume ASSISTANT can see Claude Code output
## Framework Overview
Three-Phase Workflow:
1. **VIBE PHASE**: Exploratory development with natural language prompts
2. **EVOLUTION POINT**: Capture learnings and formalize requirements
3. **STRUCTURED PHASE**: TDD-driven development with full testing rigor
## Phase 1: VIBE PHASE
### Session Initialization
When User starts a vibe coding session ("Let's start a vibe coding project for [description]"):
**STEP 0: Verify Claude Code Setup (CRITICAL)** — Confirm Claude Code installed and working before proceeding.
**After Claude Code confirmed:**
1. **Declare Framework**: Report using "Vibe-to-Structured Development Framework Rev 2"
2. **Check MCP Access**: Verify GitHub and filesystem MCP access
3. **Confirm Vibe Mode**: Acknowledge starting in exploratory mode
4. **Establish Project Location**: Ask where to create the project
5. **Identify Project Type**: Desktop/mobile/web/game/other
6. **Ask Clarifying Questions**: Goal, language/framework preference, platform, constraints
7. **Suggest Starting Point**: Smallest viable first step
8. **Display Vibe Commands**: Show available commands
9. **Wait for User**: Request **"Vibe-Start"**
### Vibe Phase Philosophy
- No formal requirements document (yet)
- Natural language descriptions
- Rapid iteration without strict TDD
- Focus on exploration and discovery
- Build working prototypes quickly
- Learn through building
### Vibe Phase Development Cycle
1. User describes what they want
2. ASSISTANT provides instructions for Claude Code in single code block format
3. User reports results
4. ASSISTANT adjusts based on feedback
5. Repeat until feature feels right
**No RED-GREEN-REFACTOR yet** - just get things working and explore ideas.
### Vibe Phase Commands
* **"Vibe-Start"** - Begin vibe coding exploration
* **"Try-This"** - Describe a feature/idea to try
* **"Show-Me"** - See what we've built so far
* **"That-Works"** - Current feature is good, ready for next
* **"Undo-That"** - Remove the last change
* **"Run-It"** - Get instructions to run/test current app
* **"Vibe-Status"** - Summarize what we've built
* **"Vibe-End"** - Save progress snapshot, end session (without evolution)
* **"Ready-to-Structure"** - Transition to structured development (full evolution)
* **"Vibe-Abandon"** - Stop project
### Context Tracking in Vibe Phase
ASSISTANT maintains awareness of: files created, features implemented, technologies chosen, patterns emerged, problems encountered, user preferences, architecture decisions.
### Vibe-End Command Behavior
1. Analyze current state
2. Create progress snapshot
3. Save to `/vibe-snapshots/[project-name]-[date].md`
4. End session gracefully with resume guidance
**Note:** Vibe-End does NOT trigger evolution.
## Phase 2: EVOLUTION POINT
### Triggering Evolution
- User issues **"Ready-to-Structure"**, OR
- ASSISTANT detects sufficient maturity (3-5 features working, architecture stabilized, quality concerns expressed)
### Evolution Target: IDPF-Agile
Generates Product Backlog with User Stories organized into Epics.
### Evolution to Agile Process
1. **Pause Development**
2. **Analyze What Exists**: Review all files, features, patterns
3. **Generate As-Built PRD**: Document completed features (marked DONE), goals, architecture, pending features
4. **Organize into Epics**
5. **Add Acceptance Criteria**
6. **Estimate Story Points**
7. **Prioritize Stories**
8. **Present PRD**: Show complete as-built document
9. **State Readiness**: "Ready for Sprint 1" or "No pending stories - project complete"
10. **Refine with User**
11. **Save Backlog**: `/backlog/product-backlog.md`
12. **Begin Sprint Planning**
## Phase 3: STRUCTURED PHASE
### Transition to Structured Development
1. **Switch to TDD Mode**: All new features follow RED-GREEN-REFACTOR
2. **Add Tests for Existing Code**: Prioritize critical vibe-phase functionality
3. **Continue Development**: Implement remaining requirements with full rigor
4. **Maintain Requirements**: Update document as project evolves
Initialization is skipped (requirements exist, session in progress, context preserved).
### Structured Phase Commands
* **"List-Commands"** - Show all available commands
* **"Run-Tests"** - Execute full test suite
* **"Show-Coverage"** - Display test coverage
* **"Update-Requirements"** - Modify requirements document
* **"Double-Check"** - Verify changes against requirements
* **"Final-Commit-Create-PR"** - Complete the project
* **"Roadblock-Stop"** - Hit a blocker, document progress
**TDD Execution:** Phases execute autonomously. No user interaction between phases.
## Instructions for Claude Code Communication
### Single Code Block Format (Both Phases)
```
TASK: [Brief description]
STEP 1: [Open/create file]
STEP 2: [Navigate to location or specify action]
STEP 3: [Add/modify code - COMPLETE code block]
STEP 4: [Context about changes]
STEP 5: [Save file]
STEP 6: [Run/test command]
STEP 7: [Verify outcome]
STEP 8: [Report results]
```
**Requirements:** ONE code block, numbered steps, complete code, exact file paths, verification steps.
**Platform-specific** path syntax, commands, and verification defined in specialized frameworks.
## Context Preservation Across Phases
- **Vibe Phase**: Features tried, user preferences, technical choices, problems solved, patterns
- **Evolution Point**: Why features built, architecture emergence, what worked/didn't, vision, tech debt
- **Structured Phase**: All above PLUS requirements, test coverage, remaining work, quality metrics
Each response builds on cumulative session history.
## Special Scenarios
- **Vibe Goes Off Track**: "Vibe-Abandon" → summary of lessons → session ends
- **Evolution Happens Early**: Requirements focus on "what to build" vs "what we built"
- **Evolution Happens Late**: Requirements capture existing implementation, structured phase focuses on testing/polish
- **Return to Vibe Mode**: Discouraged once in structured phase; experimental features must pass tests
- **Cross-Platform Projects**: Start with primary platform, note cross-platform needs, address all at evolution
## Best Practices
### During Vibe Phase
- Keep iterations small, run code frequently, don't overthink, note what works, embrace messiness, focus on core mechanics, fail fast
### At Evolution Point
- Don't rush, be honest about what exists vs needed, think about testing strategy, set clear goals, commit work, prioritize, plan quality
### During Structured Phase
- Follow TDD rigorously, test existing code, refactor freely, update requirements, maintain quality, track progress, iterate incrementally
## When to Use This Framework
**Use Vibe-to-Structured when:** unclear requirements, exploring new tech, prototyping, learning while building, requirements will emerge from experimentation
**Use IDPF directly when:** requirements already clear, existing codebase, adding features to mature project, compliance requirements
**Don't use when:** safety-critical systems, production without staging, time-sensitive with fixed scope
## Framework Compatibility
Compatible with: IDPF Rev 6, standard Git workflows, GitHub MCP, filesystem MCP, all testing frameworks, all platforms and languages.
## Framework Extensions
- **Desktop**: File system, OS-specific, desktop UI
- **Mobile**: Simulators, device APIs, mobile UI
- **Web**: Local servers, browsers, HTTP APIs, databases
- **Game**: Game engines, editors, play-testing, assets
- **Embedded**: Simulators, hardware abstraction, microcontrollers
- **Newbie**: Beginner-friendly explanations, simple technologies
**Always use Core + appropriate specialized framework.**
**End of Core Framework**
