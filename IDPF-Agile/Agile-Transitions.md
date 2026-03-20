# Agile-Driven Development Framework - Transitions
**Version:** v0.67.1
**Module:** Transitions (loaded on-demand)
## When to Use Agile Framework
**Use Agile-Driven Framework when:**
- Building a product with evolving requirements
- Want iterative delivery with regular feedback
- Need to prioritize features based on value
- Working on medium to large projects
- Want to track velocity and predictability
- Prefer user-centric feature descriptions
**Use Structured Framework when:**
- Requirements are fixed and well-defined
- Small project with clear scope
- Single feature or component development
- Don't need iterative story workflow
**Use Vibe Framework when:**
- Starting with unclear requirements
- Need exploration phase first
- Prototyping before formalizing
## Agile → Structured
### When to Transition
- Project scope narrows to single well-defined feature
- Team shrinks to solo developer
- Story workflow overhead outweighs benefits
- Requirements become fixed and stable
- Don't need velocity tracking anymore
### How to Transition
1. Complete any in-progress work and close open issues
2. Ensure all "Done" stories are committed
3. Move incomplete stories back to Product Backlog
4. Convert selected stories into PRD document
5. Begin Structured session with "First-Step" command
### What Carries Forward
- All existing code and tests
- TDD methodology (RED-GREEN-REFACTOR cycles)
- Git repository and history
- Technical decisions and architecture
- Testing framework and practices
- Acceptance criteria from stories
### What Changes
- User Stories → PRD document
- Story Backlog → Linear task list
- Story workflow → Direct development
- Velocity tracking → Progress tracking only
- Story points → Feature completion
## Agile → LTS
### When to Transition
- Project reaches production and enters maintenance mode
- Active development lifecycle complete
- Only critical bugs and security patches needed
- Backlog is frozen (no new stories accepted)
- Stability and backwards compatibility are paramount
### How to Transition
1. Complete current work or close iteration early
2. Validate all stories are in "Done" status
3. Archive Product Backlog history
4. Run full test suite - must be 100% passing
5. Create comprehensive documentation
6. Tag final active development version
7. Begin using LTS Framework with "LTS-Triage" command
8. Establish EOL date for LTS version
### What Carries Forward
- All code, tests, and documentation
- Git repository and history
- TDD practices for bug fixes
- Testing framework
### What Changes
- User Stories → Bug reports
- Story Selection → LTS triage workflow
- Active development → Maintenance mode
- New features → Bug fixes only
- Velocity tracking → Regression prevention
## Invalid Transitions
**Never:** Agile → Vibe (defeats purpose of structured development)
## Integration with Other Frameworks
### Agile + Vibe Coding
1. **Vibe Phase**: Explore and prototype
2. **Create Backlog**: Generate stories from prototype
3. **Agile Phase**: Formalize with stories and TDD
### Agile for Existing Projects
1. **Audit Current State**: Assess what exists
2. **Create Backlog**: Stories for new features + technical debt
3. **Story Selection**: Prioritize improvements
4. **Incremental Enhancement**: Improve through stories
**End of Transitions Module**
