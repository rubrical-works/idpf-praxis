# Agile-Driven Development Framework - Best Practices
**Version:** v0.74.0
**Module:** Best Practices (loaded on-demand)
## Story Writing
### DO
- Use "As a... I want... So that..." format
- Focus on user value, not technical implementation
- Keep stories small (completable in 1-3 days)
- Include clear acceptance criteria
- Estimate relatively (compare to other stories)
### DON'T
- Write technical tasks as user stories
- Make stories too large (split them)
- Skip acceptance criteria
- Estimate in hours (use story points)
## Story Selection
### DO
- Select stories that support a cohesive goal
- Consider dependencies between stories
- Aim for sustainable throughput (don't overcommit)
- Include mix of features and technical debt
- Leave buffer for unexpected issues
### DON'T
- Take on too many stories at once
- Select unrelated stories without a theme
- Ignore technical debt
- Skip estimation
## Development
### DO
- Follow TDD rigorously (RED-GREEN-REFACTOR)
- Commit frequently with story references
- Update story status as you progress
- Ask for help when blocked
- Refactor continuously
### DON'T
- Skip writing tests
- Work on multiple stories simultaneously
- Let technical debt accumulate
- Ignore failing tests
## Review & Retrospective
### DO
- Celebrate completed stories
- Be honest about what didn't work
- Identify actionable improvements
- Adjust process based on learnings
- Track velocity trends
### DON'T
- Skip retrospectives
- Blame individuals for issues
- Make same mistakes repeatedly
- Ignore velocity data
## Special Scenarios
### Story Blocked
1. Add blocked label: `gh issue edit #ID --add-label blocked`
2. Add comment with blocking reason: `gh issue comment #ID --body "Blocked: [reason]"`
3. Options: Resolve blocker, move to Parking Lot (`gh pmu move #ID --status parking_lot`), or work on different story
### Story Scope Creep
1. Add scope-creep label: `gh issue edit #ID --add-label scope-creep`
2. Options: Split story (`Split-Story #ID`), set estimate in GitHub Projects UI, or archive and create new story
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
**End of Best Practices Module**
