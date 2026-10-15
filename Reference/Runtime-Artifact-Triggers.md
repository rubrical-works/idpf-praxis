# Runtime Artifact Triggers
**Version:** v0.107.1
**Purpose:** Define when to offer artifact creation/update during development and transition phases.
Runtime artifact population happens **during development**, not at charter creation. Claude offers to document decisions, plans, and procedures when they arise naturally in conversation.
**Key Principle:** Offer, don't force. Users can decline any artifact creation.
## Construction/ Artifacts
**Template bodies** live in `.claude/scripts/shared/lib/doc-templates.json` `templates`, under the key each **Template:** line names. Re-read from disk when an offer is accepted.
**Design-Decisions/** -- Trigger: User makes or discusses architectural choice
| Trigger Pattern | Example Phrases |
|-----------------|-----------------|
| Technology selection | "Let's use Redis for caching", "We should go with PostgreSQL" |
| Architecture decision | "We'll use a microservices approach", "Let's add a message queue" |
| Pattern adoption | "We'll implement the repository pattern", "Using event sourcing" |
| Trade-off discussion | "We chose X over Y because...", "The trade-off is..." |
Detection keywords: technology comparison/selection, "decided to", "going with", "chose", architecture terms, design pattern names -> Offer: "Would you like me to document this decision in Construction/Design-Decisions/?"
**Template:** `Construction/Design-Decisions/YYYY-MM-DD-[decision-name].md` — key `construction/design-decision`.
**Test-Plans/** -- Trigger: User discusses testing approach or strategy
| Trigger Pattern | Example Phrases |
|-----------------|-----------------|
| Test strategy | "We should test this with...", "For testing, let's..." |
| Coverage discussion | "We need unit tests for...", "Integration tests should cover..." |
| Test data | "Test data should include...", "Edge cases to test..." |
| Test environment | "We'll need a staging environment for...", "Mock the external API" |
Detection keywords: test strategy discussion, "how to test", "test coverage", "test plan", specific test scenarios, test environment requirements -> Offer: "Would you like me to capture this test plan in Construction/Test-Plans/?"
**Template:** `Construction/Test-Plans/[feature-name]-test-plan.md` — key `construction/test-plan`.
**Tech-Debt/** -- Trigger: User defers work or notes shortcuts
| Trigger Pattern | Example Phrases |
|-----------------|-----------------|
| Deferral | "We'll fix that later", "TODO:", "FIXME:" |
| Shortcuts | "Quick fix for now", "Temporary workaround" |
| Known issues | "This isn't ideal but...", "We'll need to refactor" |
| Performance notes | "This could be optimized", "Not efficient but works" |
Detection keywords: "later", "TODO", "FIXME", "hack", "workaround", "technical debt", "refactor later", "not ideal", "temporary", "quick fix" -> Offer: "Would you like me to track this in Construction/Tech-Debt/?"
**Template:** `Construction/Tech-Debt/[item-name].md` — key `construction/tech-debt`.
## Transition/ Artifacts
**Deployment-Guide.md** -- Trigger: During `/prepare-release` when missing or stale
| Trigger Pattern | Automatic Check |
|-----------------|-----------------|
| Release preparation | `/prepare-release` checks for Deployment-Guide.md |
| Missing file | File doesn't exist -> prompt to create |
| Stale content | Last updated > 30 days ago -> prompt to review |
**Template:** `Transition/Deployment-Guide.md` — key `transition/deployment-guide`.
**Runbook.md** -- Trigger: When operational procedures discussed
| Trigger Pattern | Example Phrases |
|-----------------|-----------------|
| Operations | "To restart the service...", "If the database goes down..." |
| Monitoring | "Watch for...", "Alert threshold is..." |
| Incident response | "When this happens, do...", "Escalation path is..." |
| Maintenance | "Monthly we need to...", "Backup procedure is..." |
| Dependency advisory | "npm audit flagged...", "There's a CVE in..." |
Detection keywords: operational procedures, "how to handle", "when X happens", incident/alert response, maintenance tasks, a dependency advisory ("npm audit", "CVE", "Dependabot") -> Offer: "Would you like me to add this to Transition/Runbook.md?"
**Template:** `Transition/Runbook.md` — key `transition/runbook`.
**User-Documentation.md** -- Trigger: When user-facing features complete
| Trigger Pattern | Example Phrases |
|-----------------|-----------------|
| Feature complete | "That feature is done", issue moved to Done |
| UI changes | "The new button...", "Users will see..." |
| API changes | "The endpoint now...", "New parameter added" |
| Workflow changes | "Users can now...", "The new process is..." |
Detection keywords: feature completion for user-facing work, UI/UX changes, new user workflows, API changes (if external) -> Offer: "Would you like to update Transition/User-Documentation.md?"
**Template:** `Transition/User-Documentation.md` — key `transition/user-documentation`.
## Behavior Rules
| Behavior | Implementation |
|----------|----------------|
| **Always offer** | Present option, accept "no" gracefully |
| **Never force** | User can decline any artifact creation |
| **Remember preference** | If user declines type repeatedly, reduce frequency |
| **Context-aware** | Only offer when genuinely relevant |
**Offer Format:**
```
"I noticed you [made a decision/discussed testing/etc.].
Would you like me to document this in [artifact location]? (yes/no)"
```
**After User Accepts:**
1. Generate artifact using template
2. Show user the content
3. Ask for any edits
4. Save to appropriate location
5. Report: "Saved to [path]"
**End of Runtime Artifact Triggers**
