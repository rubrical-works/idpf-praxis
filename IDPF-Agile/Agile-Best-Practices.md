# Agile-Driven Development Framework - Best Practices
**Version:** v0.57.0
**Module:** Best Practices (loaded on-demand)
---
## Story Writing
| DO | DON'T |
|----|-------|
| Use "As a... I want... So that..." format | Write technical tasks as user stories |
| Focus on user value, not technical implementation | Make stories too large (split them) |
| Keep stories small (completable in 1-3 days) | Skip acceptance criteria |
| Include clear acceptance criteria | Estimate in hours (use story points) |
| Estimate relatively (compare to other stories) | |
---
## Story Selection
| DO | DON'T |
|----|-------|
| Select stories that support a cohesive goal | Take on too many stories at once |
| Consider dependencies between stories | Select unrelated stories without a theme |
| Aim for sustainable throughput (don't overcommit) | Ignore technical debt |
| Include mix of features and technical debt | Skip estimation |
| Leave buffer for unexpected issues | |
---
## Development
| DO | DON'T |
|----|-------|
| Follow TDD rigorously (RED-GREEN-REFACTOR) | Skip writing tests |
| Commit frequently with story references | Work on multiple stories simultaneously |
| Update story status as you progress | Let technical debt accumulate |
| Ask for help when blocked | Ignore failing tests |
| Refactor continuously | |
---
## Review & Retrospective
| DO | DON'T |
|----|-------|
| Celebrate completed stories | Skip retrospectives |
| Be honest about what didn't work | Blame individuals for issues |
| Identify actionable improvements | Make same mistakes repeatedly |
| Adjust process based on learnings | Ignore velocity data |
| Track velocity trends | |
---
## Special Scenarios
### Story Blocked
1. Add blocked label: `gh issue edit #ID --add-label blocked`
2. Add comment with blocking reason: `gh issue comment #ID --body "Blocked: [reason]"`
3. Options: Resolve blocker if possible | Move story to Parking Lot: `gh pmu move #ID --status parking_lot` | Work on different story
### Story Scope Creep
1. Add scope-creep label: `gh issue edit #ID --add-label scope-creep`
2. Options: Split story (`Split-Story #ID`) | Set estimate in GitHub Projects UI | Archive and create new story
### Emergency Bug
1. User issues: **"Emergency-Bug [description]"**
2. ASSISTANT creates GitHub issue with `emergency` label
3. ASSISTANT sets Priority to P0
4. Fix with TDD (write failing test, fix, verify)
### Scope Change
1. User issues: **"Pivot [new direction]"**
2. ASSISTANT documents pivot in parent epic/PRD issue
3. For each open story, prompt: Keep / Archive / Close
4. Resume with updated backlog
---
**End of Best Practices Module**
