# Anti-Hallucination Rules for Skill Creation
**Version:** v0.48.1
## Core Principle
**Accuracy over helpfulness. Precision over assumption. Verification over invention.**
Preserve original intent and structure rather than "improve" with invented additions.
## Information Source Hierarchy
1. **Source files being converted** (absolute authority)
2. **Established Skill patterns** (from examples)
3. **Claude Skill documentation** (official standards)
4. **Logical organization** (when not specified)
## Absolute "Never Do" Rules
### NEVER Invent:
- Additional instructions not in source
- Example code not in source
- Tool configurations not specified
- File structures not defined
- Best practices beyond source
- Prerequisites not stated
- Error handling not mentioned
### NEVER Assume:
- Vague instructions need expansion
- Examples need to be added
- Additional context would be helpful
- Source is incomplete
### NEVER Defer or Omit Source Content Without Confirmation:
- Skip sections because they seem "less important"
- Mark content as "future enhancement" without approval
- Omit parts difficult to format
- Simplify by removing source material
**When concerns arise:** STOP → REPORT → ASK → WAIT for user decision
```
❌ "I've converted main sections. Appendices can be added later."
✅ "Source includes appendices A-C. Include as resources, or handle differently?"
```
## STOP Boundary Enforcement
STOP boundaries are **hard stops**. Only explicit user instruction authorizes crossing.
## Decision Trees
### Converting System Instructions to Skills
**Step 1:** Analyze source structure
**Step 2:** Determine resource file needs (only from source)
**Step 3:** Create SKILL.md preserving exact wording
### Creating Resource Files
Only extract content that exists in source. Don't create "helpful" examples.
### When Source is Ambiguous
Preserve ambiguity or ask user. NEVER add interpretation.
### When Source Seems Incomplete
Don't complete it. Ask user or create Skill with available content.
## Domain-Specific Rules
### Framework to Skill Conversion
- Preserve framework structure
- Don't reorganize for "better flow"
- Keep framework terminology unchanged
### System Instructions to Skill Conversion
- Keep directive language (MUST, NEVER, ALWAYS)
- Don't soften instructions
- Preserve conditional logic
### Metadata and Configuration
- Description must reference only actual content
- Don't promise capabilities not in source
## Self-Checking Before Finalizing
### Content Fidelity
- [ ] Every instruction from source
- [ ] No explanatory content added
- [ ] Terminology matches exactly
- [ ] Examples extracted from source, not created
### Resource Files
- [ ] Each file has source content
- [ ] No templates created from scratch
- [ ] Code quoted from source
### Skill Metadata
- [ ] Description only mentions actual content
- [ ] Trigger patterns match capabilities
## Conversion Workflow
1. **Analysis**: Read source, identify sections, note extractable content
2. **Mapping**: Map sections to Skill format (don't add sections)
3. **Extraction**: Copy content preserving exact wording
4. **Verification**: Compare line-by-line with source
## Common Pitfalls
| Pitfall | Bad | Good |
|---------|-----|------|
| "Improving" source | Add details to "Check the file" | Keep "Check the file" |
| Adding context | Expand "Use version control" | Keep "Use version control" |
| Creating examples | Add "For example..." | Just the concept |
| Filling gaps | Add testing section | Create Skill without it |
---
**End of Anti-Hallucination Rules for Skill Creation**
