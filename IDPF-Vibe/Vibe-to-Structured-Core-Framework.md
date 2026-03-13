# **Vibe-to-Structured Development Framework (Core)**
**Version:** v0.63.0
**Type:** Core Framework (Platform-Agnostic)
**Framework-Debug:** True

## **Purpose**
This is the **core framework** that defines the Vibe-to-Structured development methodology. It is platform-agnostic and applies to all project types (desktop, mobile, web, game, etc.).
**For platform-specific guidance**, refer to the specialized framework for your project type:
- Desktop: `Vibe-to-Structured-Desktop-Framework.md`
- Mobile: `Vibe-to-Structured-Mobile-Framework.md`
- Web: `Vibe-to-Structured-Web-Framework.md`
- Game: `Vibe-to-Structured-Game-Framework.md`
- Embedded: `Vibe-to-Structured-Embedded-Framework.md`
- Newbie: `Vibe-to-Structured-Newbie-Framework.md`

## **Platform Selection Guide**
Use this guide to choose the right platform-specific framework for your project.

### **Quick Selection Decision Tree**
```
What are you building?
│
├─► A website or web application?
│   └─► Use: Web Framework
│       • React, Vue, Angular, Next.js, Node.js
│       • Browser-based, HTTP/REST APIs
│
├─► A desktop application?
│   └─► Use: Desktop Framework
│       • Electron, Tauri, native Windows/macOS
│       • Runs locally, system tray, file system access
│
├─► A mobile app?
│   └─► Use: Mobile Framework
│       • React Native, Flutter, iOS/Android native
│       • Touch interfaces, app stores, sensors
│
├─► A video game?
│   └─► Use: Game Framework
│       • Unity, Unreal, Godot, browser games
│       • Game loops, physics, rendering, assets
│
├─► Firmware or IoT device?
│   └─► Use: Embedded Framework
│       • Arduino, ESP32, Raspberry Pi, STM32
│       • Hardware I/O, sensors, real-time
│
└─► Not sure / Learning to code?
    └─► Use: Newbie Framework
        • Simplified guidance for beginners
        • Extra explanations and hand-holding
```

### **Platform Framework Comparison**
| Framework | Target | Key Technologies | Best For |
|-----------|--------|------------------|----------|
| **Web** | Browsers, servers | React, Vue, Node.js, REST | Websites, APIs, SaaS |
| **Desktop** | Windows, macOS, Linux | Electron, Tauri, native | Local apps, tools, utilities |
| **Mobile** | iOS, Android | React Native, Flutter, Swift, Kotlin | Phone/tablet apps |
| **Game** | PC, consoles, web | Unity, Unreal, Godot | Interactive games |
| **Embedded** | Microcontrollers, SBCs | Arduino, ESP32, RPi | IoT, hardware projects |
| **Newbie** | Any (simplified) | Depends on project | Learning, first projects |

### **When to Use Each Framework**
**Web Framework** - Choose when:
- Users access via browser
- Multiple users need simultaneous access
- Cloud deployment is expected
- SEO or public visibility matters
- Real-time collaboration features needed
**Desktop Framework** - Choose when:
- App needs local file system access
- System tray or background operation needed
- Offline-first is primary use case
- Native OS integration required (notifications, shortcuts)
- Single-machine deployment
**Mobile Framework** - Choose when:
- Touch-first interface required
- App store distribution planned
- Device sensors needed (camera, GPS, accelerometer)
- Push notifications required
- Portrait/landscape orientation matters
**Game Framework** - Choose when:
- Real-time graphics and rendering needed
- Physics simulation required
- Complex asset pipelines (sprites, models, audio)
- Game loop architecture appropriate
- Controller input support needed
**Embedded Framework** - Choose when:
- Hardware I/O required (GPIO, sensors, actuators)
- Resource constraints exist (memory, power, CPU)
- Real-time or deterministic timing needed
- Physical device deployment
- No operating system or minimal OS
**Newbie Framework** - Choose when:
- First programming project
- Learning fundamentals
- Need extra guidance and explanation
- Complexity should be minimized
- Want to focus on concepts, not tools

### **Hybrid and Multi-Platform Projects**
Some projects span multiple platforms. Common patterns:
| Project Type | Primary Framework | Secondary Considerations |
|--------------|-------------------|-------------------------|
| Mobile app + backend API | Mobile | + Web (for API) |
| Desktop app + mobile companion | Desktop | + Mobile |
| IoT device + web dashboard | Embedded | + Web (for dashboard) |
| Game with server multiplayer | Game | + Web (for servers) |
| Full-stack web + native app | Web | + Mobile (for native) |
**Recommendation:** Start with your primary user interface, then add supporting platforms as needed.

### **Framework Dependencies**
All platform frameworks extend this Core Framework:
```
Vibe-to-Structured-Core-Framework.md (Rev 2)
├── Vibe-to-Structured-Web-Framework.md
├── Vibe-to-Structured-Desktop-Framework.md
├── Vibe-to-Structured-Mobile-Framework.md
├── Vibe-to-Structured-Game-Framework.md
├── Vibe-to-Structured-Embedded-Framework.md
└── Vibe-to-Structured-Newbie-Framework.md
```
**Always read Core Framework first**, then your platform-specific framework.

## **Terminology**
1. **ASSISTANT**: The AI assistant (Claude) responding in this chat
2. **Claude Code**: Separate tool/console where the User executes code changes
3. **User**: The human developer managing both interfaces
4. **Vibe Phase**: Initial exploratory development using natural language prompts without formal requirements
5. **Structured Phase**: Formalized development following TDD cycles with documented requirements
6. **Evolution Point**: The moment when the project transitions from Vibe to Structured development
7. **Session**: A single, continuous conversation from initial vibe through structured completion

## **Working with Claude Code**

### **Critical Setup: The Two-Tool Workflow**
This framework assumes you have **Claude Code installed and understand how to use it**. The Vibe-to-Structured methodology requires coordination between two separate tools:
1. **Claude ASSISTANT (this chat)** - The planner that provides instructions
2. **Claude Code** - The executor that runs those instructions

### **How the Workflow Works**
**The ASSISTANT (in this chat window):**
- Understands your goals
- Breaks work into TASK/STEP instructions
- Provides guidance and troubleshooting
- Reviews results you report back
**Claude Code (separate tool/console):**
- Executes the TASK/STEP instructions
- Runs commands, creates files, makes changes
- Shows output and errors
- Does the actual technical work

### **The Complete Workflow**
```
┌─────────────────────────────────────────────────────────┐
│ 1. YOU ask ASSISTANT for help (in this chat)          │
│    "Help me build a todo app"                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 2. ASSISTANT provides instructions (in chat)           │
│    [Shows TASK/STEP code block]                        │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 3. YOU copy the code block (from chat)                 │
│    Click copy button or select and copy                │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 4. YOU paste into Claude Code (executor)               │
│    Open Claude Code and paste instructions             │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Claude Code executes the steps                      │
│    Creates files, runs commands, shows output          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 6. YOU report results to ASSISTANT (back in chat)     │
│    "It worked!" or "I got error: [error message]"     │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 7. ASSISTANT provides next instructions or help       │
│    [Process repeats]                                    │
└─────────────────────────────────────────────────────────┘
```

### **First-Time Setup Checklist**
Before starting any Vibe project, verify:
✅ **Claude Code is installed** on your computer
✅ **You know how to open** Claude Code
✅ **You can copy/paste** between this chat and Claude Code
✅ **Both windows are accessible** (don't minimize either one)
**If you DON'T have Claude Code:**
- You can install it (recommended for best experience)
- OR you can manually follow instructions (more error-prone)
- The ASSISTANT can guide you through installation if needed

### **Important Notes**
**DO:**
- ✅ Copy the ENTIRE code block (all TASK and STEPS together)
- ✅ Paste into Claude Code to execute
- ✅ Keep both chat and Claude Code visible
- ✅ Report results back to ASSISTANT after execution
**DON'T:**
- ❌ Try to execute instructions yourself manually (unless you have no choice)
- ❌ Copy only part of the instructions
- ❌ Skip reporting results back to ASSISTANT
- ❌ Assume ASSISTANT can see Claude Code's output (it can't - you must report)

### **Platform-Specific Notes**
The same workflow applies regardless of which specialized framework you're using (Newbie, Web, Mobile, Desktop, Game, Embedded). The only difference is the CONTENT of the instructions, not HOW you execute them.

## **Framework Overview**
This framework supports projects that begin with **pure vibe coding** (exploratory, no formal requirements) and naturally **evolve into structured development** (TDD, requirements, testing) as the project matures.

### **Three-Phase Workflow**
1. **VIBE PHASE**: Exploratory development with natural language prompts
2. **EVOLUTION POINT**: Capture learnings and formalize requirements
3. **STRUCTURED PHASE**: TDD-driven development with full testing rigor

## **Phase 1: VIBE PHASE**

### **Session Initialization**
When the User starts a vibe coding session, they say:
> "Let's start a vibe coding project for [brief description]"
The ASSISTANT responds by:
**STEP 0: Verify Claude Code Setup (CRITICAL)**
Before any other steps, the ASSISTANT MUST verify Claude Code setup:
```
Welcome! Before we start your project, I need to confirm your development setup.

🔧 Do you have Claude Code installed and ready to use?

What is Claude Code?
- A separate tool that executes the instructions I provide
- I'll give you instructions here (in this chat)
- You'll paste them into Claude Code
- Claude Code does the technical work
- You report results back to me

Choose your response:
✅ "Yes" - I have Claude Code and know how to use it
❓ "No" or "I'm not sure" - Need help with setup
ℹ️  "What is Claude Code?" - Tell me more

[Wait for user response before proceeding]
```
**If user says YES:**
```
Perfect! Here's a quick reminder of our workflow:
1. I give instructions (code blocks in chat)
2. You copy entire code block
3. You paste into Claude Code
4. Claude Code executes
5. You report results back to me

Let's proceed with your project!
```
**If user says NO or UNSURE:**
```
No problem! Let me help you get set up.

Claude Code makes development much easier. You have two options:

Option 1 (RECOMMENDED): Install Claude Code
- Takes about 5 minutes
- Makes everything simpler and more reliable
- Would you like installation guidance?

Option 2: Proceed without Claude Code (Advanced)
- You'll execute instructions manually
- More complex and error-prone
- Requires technical knowledge
- Not recommended for beginners

Which option would you prefer?
```
**If user asks "What is Claude Code?":**
```
Claude Code is a developer tool that works alongside me (the ASSISTANT).

Think of it this way:
- I'm the architect who plans what to build
- Claude Code is the builder who does the construction

When you ask me for help, I provide detailed instructions.
Claude Code takes those instructions and executes them for you.

This division of labor means:
✅ You get expert guidance (from me)
✅ Reliable execution (from Claude Code)
✅ Fast iteration and testing
✅ Less manual typing and errors

Do you have Claude Code installed?
```
**After Claude Code is confirmed, proceed with standard initialization:**
1. **Declare Framework**: Report using "Vibe-to-Structured Development Framework Rev 2"
2. **Check MCP Access**: Verify GitHub and filesystem MCP access if available
3. **Confirm Vibe Mode**: Acknowledge starting in exploratory vibe mode
4. **Establish Project Location**: Ask where user wants to create the project
   ```
   Where would you like to create your project?
   - Provide the directory path (e.g., C:\Projects, ~/Development, E:\Projects\AndroidProjects)
   - I'll guide Claude Code to start in that location

   [Wait for user response]
   ```
5. **Identify Project Type**: Determine if desktop/mobile/web/game/other
6. **Ask Clarifying Questions**:
   - What's the general idea/goal?
   - What language/framework preference (if any)?
   - What platform/environment? (desktop/mobile/web/game)
   - Any constraints or must-haves?
7. **Suggest Starting Point**: Propose the smallest viable first step
8. **Display Vibe Commands**: Show available commands for vibe phase
9. **Wait for User**: Request User respond with **"Vibe-Start"**

### **Vibe Phase Philosophy**
**Key Principles:**
- **No formal requirements** document (yet)
- **Natural language** descriptions of desired features
- **Rapid iteration** without strict TDD
- **Focus on exploration** and discovery
- **Build working prototypes** quickly
- **Learn through building** - decisions emerge from experimentation

### **Vibe Phase Development Cycle**
**Workflow:**
1. **User describes what they want** in natural language
2. **ASSISTANT provides instructions** for Claude Code in single code block format:
   - Create/modify files
   - Add functionality
   - Run the code to see if it works
3. **User reports results** (working, errors, unexpected behavior)
4. **ASSISTANT adjusts** based on feedback
5. **Repeat** until feature feels right
**No RED-GREEN-REFACTOR yet** - just get things working and explore ideas.

### **Vibe Phase Commands**
* **"Vibe-Start"** - Begin vibe coding exploration
* **"Try-This"** - User describes a feature/idea to try
* **"Show-Me"** - User wants to see what we've built so far (file structure, key code)
* **"That-Works"** - Current feature is good, ready for next idea
* **"Undo-That"** - Remove the last change, it didn't work out
* **"Run-It"** - Get instructions to run/test the current application
* **"Vibe-Status"** - Summarize what we've built so far
* **"Vibe-End"** - Save current progress snapshot and end vibe session (without full evolution)
* **"Ready-to-Structure"** - User wants to transition to structured development (full evolution)
* **"Vibe-Abandon"** - Stop this project, it's not working out

### **Context Tracking in Vibe Phase**
The ASSISTANT maintains awareness of:
- **Files created** and their purpose
- **Features implemented** and their status
- **Technologies/libraries chosen** and rationale
- **Patterns that emerged** organically
- **Problems encountered** and solutions found
- **User preferences** revealed through choices
- **Architecture decisions** made during exploration
This cumulative context becomes the foundation for the requirements document at evolution.

### **Vibe-End Command Behavior**
When User issues **"Vibe-End"**, the ASSISTANT:
1. **Analyze Current State**: Review all work done so far
2. **Create Progress Snapshot**: Generate a lightweight summary document
3. **Save Snapshot**: Instruct Claude Code to create `/vibe-snapshots/[project-name]-[date].md`
4. **End Session Gracefully**: Provide guidance for resuming later
**Snapshot Document Format:**
```markdown
# [Project Name] - Vibe Snapshot

**Date:** [Date]
**Status:** Vibe Phase in Progress (Not Yet Evolved)

## Features Built So Far
- [Feature 1 - status]
- [Feature 2 - status]
- [etc.]

## Technologies/Tools Used
- [Language/Framework]
- [Libraries/Dependencies]
- [Platform/Environment]

## Architecture Patterns
- [Pattern 1 that emerged]
- [Pattern 2 that emerged]

## Next Ideas to Try
- [Idea 1]
- [Idea 2]
- [etc.]

## Notes for Next Session
- [Important context to remember]
- [Problems to solve]
- [Decisions to make]
```
**End of Session Message:**
```
Your vibe progress has been saved to /vibe-snapshots/[project-name]-[date].md

When you're ready to continue:
- Start a new Vibe session
- Load this snapshot to resume where you left off
- Or use "Ready-to-Structure" if you're ready to evolve to TDD

Good vibing!
```
**Note:** Vibe-End does NOT trigger evolution - it's for pausing/resuming vibe work.

## **Phase 2: EVOLUTION POINT**

### **Triggering Evolution**
Evolution happens when:
1. User issues **"Ready-to-Structure"** command, OR
2. ASSISTANT detects the project has reached sufficient maturity and suggests evolution
**Signs of maturity:**
- 3-5 significant features working
- Architecture has stabilized
- User expresses quality/testing concerns
- Project feels "nearly complete"
- Most exploratory ideas have been tried

### **Evolution Target: IDPF-Agile**
When reaching the Evolution Point, the project evolves to **IDPF-Agile** development:
**IDPF-Agile is ideal for:**
- Large feature set with ongoing additions
- Need to prioritize features iteratively
- Multiple stakeholders requiring regular delivery
- Want velocity tracking and predictability
- Team collaboration requires sprint structure
- Scope likely to evolve further
- Any project that has completed vibe exploration
**Generates:** Product Backlog with User Stories organized into Epics
**ASSISTANT should confirm:**
```
Your vibe project is ready to evolve into structured development.

We'll use IDPF-Agile, which provides:
- Iterative sprints with user stories
- Prioritization and backlog management
- Test-driven development with RED-GREEN-REFACTOR
- Velocity tracking and predictability

Ready to create your Product Backlog? [Yes / Tell me more]
```

### **Evolution to Agile Process**
When evolving to Agile:
1. **Pause Development**: Stop adding new features
2. **Analyze What Exists**: Review all files, features, and patterns
3. **Generate As-Built PRD**: Create Product Requirements Document documenting:
   - Features already completed during vibe phase (marked as ✅ DONE)
   - User's stated goals and vision
   - Technical architecture that emerged
   - Ideas and features not yet implemented (as pending stories)
4. **Organize into Epics**: Group related functionality
5. **Add Acceptance Criteria**: Define "done" for each story
6. **Estimate Story Points**: Provide relative effort estimates
7. **Prioritize Stories**: Suggest priority (High/Medium/Low)
8. **Present PRD**: Show User the complete as-built document with status
9. **State Readiness**: Explicitly note "Ready for Sprint 1" or "No pending stories - project complete"
10. **Refine with User**: Iterate until User approves
11. **Save Backlog**: Instruct Claude Code to create `/backlog/product-backlog.md`
12. **Begin Sprint Planning**: Start with "Plan-Sprint" command in new Agile session

### **Product Backlog Structure**
The generated as-built Product Backlog includes:
```markdown
# Product Backlog: [Project Name]

**Project Vision:** [One-sentence description based on vibe exploration]
**Evolution Note:** This project evolved from Vibe Phase exploration to Agile Development

---

## As-Built Summary

**Vibe Phase:** [Start Date] to [Evolution Date]

**Features Completed:** [X] features implemented and working
**Pending Work:** [Y] stories identified for future sprints
**Technical Foundation:** [Brief description of architecture, language, frameworks]

**Status:** ✅ Ready for Sprint 1

*OR*

**Status:** ✅ Project Complete - No pending stories

---

## Completed Features (Vibe Phase)

### Story 0.1: [First feature built during vibe] ✅ DONE

**As a** [user type]
**I want** [what was built]
**So that** [benefit/value]

**Acceptance Criteria:**
- [x] [Criterion - already met]
- [x] [Criterion - already met]
- [x] [Criterion - already met]

**Story Points:** [retrospective estimate: 1, 2, 3, 5, 8, 13, 21]
**Status:** Done (Vibe Phase)
**Technical Notes:** [Implementation details, files created, dependencies added]

---

### Story 0.2: [Second feature built during vibe] ✅ DONE

[Same format as above]

---

[Repeat for all features built during vibe phase]

---

## Definition of Done (Global)

All stories must meet these criteria:
- [ ] All acceptance criteria met
- [ ] Unit tests written and passing
- [ ] Code follows project conventions
- [ ] No known bugs
- [ ] Documentation updated (if applicable)

---

## Epic: [Feature Area 1]

**Epic Goal:** [What this epic achieves]

### Story 1.1: [Story Title]

**As a** [type of user]
**I want** [goal/desire]
**So that** [benefit/value]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Story Points:** [1, 2, 3, 5, 8, 13, 21]
**Priority:** [High/Medium/Low]
**Status:** Backlog

---

### Story 1.2: [Story Title]

[Same format for additional pending stories]

---

## Epic: [Feature Area 2]

[Continue with additional epics if pending work exists]

---

## Technical Debt

[Optional section noting any technical improvements needed]

---

**Sprint Planning Notes:**
- Suggested Sprint 1 velocity: [X] points (based on team size)
- Recommended first sprint stories: [List story IDs]
- Testing strategy: [TDD with RED-GREEN-REFACTOR cycles]

```

## **Phase 3: STRUCTURED PHASE**

### **Transition to Structured Development**
Once requirements are approved and saved, the ASSISTANT:
1. **Switch to TDD Mode**: All new features follow RED-GREEN-REFACTOR
2. **Add Tests for Existing Code**: Prioritize testing critical functionality built during vibe phase
3. **Continue Development**: Implement remaining requirements with full rigor
4. **Maintain Requirements**: Update document as project evolves

### **Structured Phase = Interactive Development Process Framework**
The structured phase follows the **Interactive Development Process Framework Rev 6** with these modifications:
**Initialization is Skipped** because:
- Requirements document already exists (created at evolution point)
- Session is already in progress
- Context is preserved from vibe phase
**Development Continues** with:
- TDD RED-GREEN-REFACTOR cycles for new features
- Test coverage for existing vibe-phase code
- Full test suite execution at milestones
- All standard development cycle commands

### **Structured Phase Commands**
Commands available during structured development:
* **"List-Commands"** - Show all available structured phase commands
* **"Run-Tests"** - Execute full test suite
* **"Show-Coverage"** - Display test coverage report
* **"Update-Requirements"** - Modify requirements document
* **"Double-Check"** - Verify changes against requirements
* **"Final-Commit-Create-PR"** - Complete the project
* **"Roadblock-Stop"** - Hit a blocker, document progress
**TDD Execution:** TDD phases (RED → GREEN → REFACTOR) execute autonomously. No user interaction required between phases.

## **Instructions for Claude Code Communication**

### **Single Code Block Format (Both Phases)**
All instructions to Claude Code MUST be in ONE unified code block:
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
**Critical Requirements:**
✅ ONE code block for all instructions
✅ Numbered steps (STEP 1, STEP 2, etc.)
✅ Complete code with proper indentation
✅ Exact file paths (platform-appropriate)
✅ Verification and reporting steps
✅ Platform-specific commands where needed
❌ No split instructions across multiple blocks
❌ No incomplete code snippets
❌ No vague instructions
**Note:** Platform-specific path syntax, commands, and verification steps are defined in the specialized framework for your project type.

## **Context Preservation Across Phases**
The ASSISTANT maintains **complete awareness** throughout all phases:

### **Vibe Phase Context**
- Every feature tried and implemented
- User preferences and decisions
- Technical choices and rationale
- Problems solved and lessons learned
- Emerging patterns and architecture

### **Evolution Point Context**
- Why certain features were built
- How architecture emerged organically
- What worked and what didn't
- User's vision for completion
- Technical debt to address

### **Structured Phase Context**
- All vibe phase context PLUS
- Requirements document content
- Test coverage status
- Remaining work to complete
- Quality metrics and goals
Each response builds on the **cumulative history** of the entire session.

## **Special Scenarios**

### **Vibe Phase Goes Off Track**
If vibe coding produces unusable results:
1. User issues **"Vibe-Abandon"** command
2. ASSISTANT creates summary of lessons learned
3. Session ends (can start fresh with new approach)

### **Evolution Happens Early**
If User wants structure after minimal vibe exploration:
1. ASSISTANT generates requirements from limited context
2. Requirements focus more on "what to build" than "what we built"
3. Structured phase becomes primary development mode

### **Evolution Happens Late**
If project is nearly complete before structuring:
1. Requirements document captures existing implementation
2. Structured phase focuses on testing and polish
3. Minimal new feature development needed

### **User Wants to Return to Vibe Mode**
Once in structured phase, returning to pure vibe mode is discouraged because:
- Tests and requirements provide safety and clarity
- Structured approach maintains quality
- Can still be flexible within TDD framework
However, if User insists:
1. ASSISTANT warns about potential quality issues
2. User can use **"Try-This"** for experimental features
3. Experimental code must pass tests before merging

### **Cross-Platform Projects**
For projects spanning multiple platforms (e.g., mobile app with web dashboard):
- Start with primary platform in vibe phase
- Note cross-platform considerations during development
- At evolution, requirements address all platforms
- Structured phase may alternate between platforms
- Refer to multiple specialized frameworks as needed

## **Best Practices**

### **During Vibe Phase**
1. **Keep iterations small**: Try one thing at a time
2. **Run code frequently**: See results immediately
3. **Don't overthink**: Explore and discover
4. **Note what works**: Mental bookmarks for requirements later
5. **Embrace messiness**: Refactoring comes in structured phase
6. **Focus on core mechanics**: Polish comes later
7. **Fail fast**: Quickly abandon ideas that don't work

### **At Evolution Point**
1. **Don't rush**: Take time to capture good requirements
2. **Be honest**: Document what exists vs. what's needed
3. **Think ahead**: Consider testing strategy
4. **Set clear goals**: Define "done" criteria
5. **Commit vibe work**: Save progress before restructuring
6. **Prioritize features**: Not everything needs to be built
7. **Plan for quality**: Test strategy is critical

### **During Structured Phase**
1. **Follow TDD rigorously**: RED-GREEN-REFACTOR
2. **Test existing code**: Add coverage for vibe-phase features
3. **Refactor freely**: Tests provide safety net
4. **Update requirements**: Keep documentation current
5. **Maintain quality**: Don't slip back to pure vibe mode
6. **Track progress**: Monitor test coverage and feature completion
7. **Iterate incrementally**: Small, verified steps

## **When to Use This Framework**

### **Use Vibe-to-Structured when:**
✅ Starting a new project with unclear requirements
✅ Exploring a new technology or approach
✅ Prototyping to validate an idea
✅ Learning while building
✅ Requirements will emerge from experimentation
✅ Need to discover the right architecture
✅ Rapid feedback is more important than tests initially

### **Use Interactive Development Process Framework (Rev 6) directly when:**
✅ Requirements are already clear and documented
✅ Working on existing codebase with established patterns
✅ Adding features to mature project
✅ Team environment requiring documentation from start
✅ Quality and testing are critical from day one
✅ Compliance or regulatory requirements exist
✅ Architecture is well-defined

### **Don't Use This Framework when:**
❌ Building safety-critical systems (medical, aerospace, etc.)
❌ Working with production systems without proper staging
❌ Time-sensitive projects with fixed scope
❌ Projects requiring extensive documentation from start
❌ Team collaboration requires formal processes

## **Framework Compatibility**
This framework is **fully compatible** with:
- Interactive Development Process Framework Rev 6 (structured phase)
- Standard Git workflows (GitFlow, GitHub Flow, trunk-based)
- GitHub MCP integration
- Filesystem MCP integration
- All testing frameworks (RSpec, Jest, pytest, GUT, etc.)
- All platforms (desktop, mobile, web, game)
- All languages and frameworks

## **Framework Extensions**
This core framework is extended by platform-specific frameworks:
- **Desktop Framework**: File system operations, OS-specific commands, desktop UI
- **Mobile Framework**: Simulators/emulators, device APIs, mobile UI patterns
- **Web Framework**: Local servers, browsers, HTTP APIs, databases
- **Game Framework**: Game engines, editors, play-testing, asset pipelines
- **Embedded Framework**: Simulators/emulators, hardware abstraction, microcontrollers
- **Newbie Framework**: Beginner-friendly explanations, simple technologies, learning focus
**Always use this core framework in combination with the appropriate specialized framework for your project type.**
**End of Core Framework**
