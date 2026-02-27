# Agile-Driven Development Framework - Templates
**Version:** v0.54.0
**Module:** Templates (loaded on-demand)
---
## GitHub-Native Backlog
**Note:** IDPF-Agile uses GitHub issues for backlog management. Use `Create-Backlog` to create epics and stories directly in GitHub. Templates below are reference formats for issue content. See `Agile-Commands.md` for GitHub-native workflows.
---
## Product Backlog Format
**Note:** Reference format. Backlogs are stored as GitHub issues, not local files.
```markdown
# Product Backlog: [Project Name]
**Project Vision:** [One-sentence description]
---
## Definition of Done (Global)
All stories must meet these criteria:
- [ ] All acceptance criteria met
- [ ] Unit tests written and passing
- [ ] Code follows project conventions
- [ ] No known bugs
- [ ] Documentation updated (if applicable)
---
## Epic: [Epic Name]
**Epic Goal:** [What this epic achieves]
### Story [ID]: [Title]
**As a** [type of user]
**I want** [goal/desire]
**So that** [benefit/value]
**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
**Story Points:** [1, 2, 3, 5, 8, 13, 21]
**Priority:** [High/Medium/Low]
**Status:** [Backlog/Ready/In Progress/In Review/Done]
---
## Technical Debt & Improvements
### Tech Story: [Title]
**Description:** [What needs to be improved]
**Benefit:** [Why this matters]
**Story Points:** [estimate]
**Priority:** [High/Medium/Low]
---
## Icebox (Future Considerations)
- [Story idea 1]
- [Story idea 2]
```
---
**End of Templates Module**
