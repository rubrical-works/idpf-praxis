# Anti-Hallucination Rules for Skill Creation
**Version:** v0.62.0

## Core Principle
**Accuracy over helpfulness. Precision over assumption. Verification over invention.**
When creating Skills from System Instructions or Frameworks, it is always better to preserve the original intent and structure than to "improve" with invented additions.

## Information Source Hierarchy
Always prioritize information in this order:
1. **Source files being converted** (absolute authority)
   - System Instructions files
   - Framework documents
   - Existing Skill structures
   - User-provided templates or examples
2. **Established Skill patterns** (from examples)
   - Existing SKILL.md format conventions
   - Resource file organization patterns
   - Metadata structure standards
3. **Claude Skill documentation** (official standards)
   - Official Skill creation guidelines
   - Claude.ai Skill format specifications
   - Best practices from Anthropic documentation
4. **Logical organization** (when not specified)
   - Must maintain source document structure
   - Must not add content not present in source
   - Must preserve original language and terminology

## Absolute "Never Do" Rules

### NEVER Invent:
- ❌ Additional instructions not in the source document
- ❌ Example code or scenarios not present in source
- ❌ Tool configurations or parameters not specified
- ❌ File structures or organization not defined in source
- ❌ Best practices or guidelines beyond the source
- ❌ Templates or boilerplate not in source material
- ❌ Prerequisites or requirements not stated in source
- ❌ Workflow steps not explicitly described in source
- ❌ Error handling approaches not mentioned in source
- ❌ Additional resources or references not in source

### NEVER Assume:
- ❌ That vague instructions need clarification or expansion
- ❌ That examples need to be added for clarity
- ❌ That additional context would be helpful
- ❌ That the source is incomplete without your additions
- ❌ That standardization requires adding new content
- ❌ That brevity needs elaboration
- ❌ That implicit knowledge should be made explicit
- ❌ That better organization means adding sections

### NEVER Defer or Omit Source Content Without Confirmation:
When converting source documents to Skills, you must include ALL content from the source. Unilateral decisions to skip or defer content are prohibited.
- ❌ Skip sections because they seem "less important"
- ❌ Mark source content as "future enhancement" without approval
- ❌ Omit parts of the source because they're complex to format
- ❌ Defer content to "later" without explicit agreement
- ❌ Simplify by removing source material without consent
- ❌ Leave out source sections that don't fit neatly into Skill format
**When conversion concerns arise:**
1. **STOP** - Do not silently omit source content
2. **REPORT** - Explain which content is difficult to include and why
3. **ASK** - "Should I include this as-is, or would you like to handle it differently?"
4. **WAIT** - Get explicit user decision before omitting anything
```markdown
❌ BAD: "I've converted the main sections. The appendices can be added
        as resources later if needed."

✅ GOOD: "The source includes appendices A-C. Should I include these as
         resource files, or handle them differently?"
```

## STOP Boundary Enforcement

### Command Spec STOP Boundaries Are Absolute
When a command specification includes a STOP boundary section (e.g., `## STOP — Workflow Boundary`), this is a **hard stop**, not a suggestion.

### Rules:
1. **STOP means STOP** - Execution must halt at the boundary
2. **No "helpful continuation"** - Do not proceed past STOP boundaries even if:
   - The next steps seem logical
   - Continuing would be "helpful"
   - The workflow appears incomplete
3. **User instruction required** - Only explicit user instruction authorizes crossing a STOP boundary
4. **Re-verify after context loss** - After compaction or context restore:
   - Re-read command specs before continuing execution
   - Verify current position relative to any STOP boundaries
   - Do not assume pre-compaction state

### Why This Matters
STOP boundaries exist to:
- Separate distinct workflow phases
- Allow user review before critical operations
- Prevent cascading actions (e.g., deployment without verification)
- Give users control over destructive or irreversible operations

### Example
```markdown
## STOP — Workflow Boundary
**This command ends here.** Wait for user confirmation before proceeding.
```
**Correct Response:** Report completion and wait for user's next instruction
**Incorrect Response:** Proceeding to push changes because it's the "logical next step"

## Decision Trees for Common Scenarios

### When Converting System Instructions to Skills
**Step 1: Analyze source structure**
- ✅ **Clearly organized** → Map sections directly to Skill format
- ⚠️ **Mixed formats** → Preserve all content, organize minimally
- ❓ **Unclear structure** → Use minimal organization, preserve everything
**Step 2: Determine resource file needs**
- 📄 **Examples in source** → Extract to resource files
- 📋 **Templates in source** → Extract to resource files
- 📊 **Reference data in source** → Extract to resource files
- 🚫 **No extractable content** → No resource files needed
**Step 3: Create SKILL.md structure**
```
✅ GOOD: Organize existing content under appropriate Skill sections
❌ BAD: Add new sections or content not in source

✅ GOOD: Preserve exact wording and terminology from source
❌ BAD: Rephrase or "improve" the language

✅ GOOD: Maintain source document's level of detail
❌ BAD: Expand brief instructions into detailed explanations
```

### When Creating Resource Files
**Step 1: Identify extractable content**
- Code examples explicitly provided in source
- Templates or boilerplate shown in source
- Reference tables or data structures from source
- Checklists or workflows detailed in source
**Step 2: Organize resource files**
```
✅ GOOD: Create files that exactly match examples in source
❌ BAD: Create "helpful" additional examples

✅ GOOD: Use filenames that reflect source content
❌ BAD: Standardize names that lose source context

✅ GOOD: Include only content extracted from source
❌ BAD: Add explanatory comments not in source
```

### When Source Content is Ambiguous
**Don't clarify by adding. Instead:**
```
Option 1: Preserve ambiguity exactly as stated in source
Option 2: Ask user: "The source document contains [ambiguous instruction].
          Should I preserve it as-is or would you like clarification?"
Option 3: Note in conversion: "Original instruction preserved as stated,
          may need user interpretation"

NEVER: Add your interpretation as if it was in the source
```

### When Source Content Seems Incomplete
**Don't complete it. Instead:**
```
✅ GOOD: "The source document provides [what's there].
          Should I include only this, or is there additional material
          to incorporate?"

❌ BAD: [Adds what you think is missing without asking]

✅ GOOD: Create Skill with only the content provided, note what's minimal

❌ BAD: Flesh out the Skill with "helpful" additions
```

## Domain-Specific Rules

### Framework to Skill Conversion
**Preserve framework structure:**
- Frameworks have intentional organization - maintain it
- Section headings in frameworks map to Skill sections
- Don't reorganize for "better flow" - preserve original flow
- Framework examples belong in resource files, not invented ones
**Handle framework-specific elements:**
```
✅ GOOD: Convert framework decision trees to Skill guidelines exactly
❌ BAD: Simplify decision trees by removing options

✅ GOOD: Preserve all framework phases/stages as documented
❌ BAD: Merge phases you think are redundant

✅ GOOD: Keep framework terminology unchanged
❌ BAD: "Standardize" terminology to common industry terms
```

### System Instructions to Skill Conversion
**Instruction fidelity:**
- System instructions are prescriptive - don't dilute them
- Keep directive language ("MUST", "NEVER", "ALWAYS")
- Don't soften instructions by adding "typically" or "usually"
- Preserve the instruction hierarchy and priority
**Context preservation:**
```
✅ GOOD: "When X occurs, do Y" stays exactly that
❌ BAD: "When X occurs, you might want to consider Y"

✅ GOOD: Keep all conditional logic from instructions
❌ BAD: Simplify complex conditionals for "clarity"
```

### Metadata and Skill Configuration
**Description accuracy:**
- Description must only reference content actually in the Skill
- Don't promise capabilities not present in source
- Use specific, verifiable language from source material
```
✅ GOOD: "Converts vibe descriptions into structured requirements using
          the framework from [source]"
❌ BAD: "Helps users create better software through collaborative design"
          [if source doesn't mention collaboration]
```

### Resource File Organization
**File structure rules:**
```
resources/
  ├── examples/          # Only if examples exist in source
  ├── templates/         # Only if templates exist in source
  ├── reference/         # Only if reference material in source
  └── [custom-name]/     # Only if source has specific category

✅ GOOD: Create structure that matches source organization
❌ BAD: Create "standard" structure regardless of source content
```

## Self-Checking Before Finalizing
Before completing a Skill conversion, verify:

### ✓ Content Fidelity
- [ ] Every instruction in SKILL.md comes from source
- [ ] No explanatory content added beyond source
- [ ] Terminology matches source exactly
- [ ] Examples are extracted from source, not created
- [ ] No "helpful additions" that aren't in source
- [ ] Structure reflects source organization

### ✓ Resource Files
- [ ] Each resource file has corresponding source content
- [ ] No template files created from scratch
- [ ] Example code is quoted from source
- [ ] Reference materials exist in source
- [ ] No "standard" files added for completeness

### ✓ Skill Metadata
- [ ] Description only mentions actual Skill content
- [ ] Trigger patterns match actual Skill capabilities
- [ ] Tags reflect source document domain
- [ ] No promises of functionality not in source

### ✓ Format Compliance
- [ ] SKILL.md follows Claude Skill format
- [ ] Resources organized per Skill standards
- [ ] Markdown formatting is correct
- [ ] File references are accurate
- [ ] Directory structure is proper

## Confidence Level Indicators
Use explicit language about source content:

### Direct Source Content
- "From the source document: [exact quote]"
- "The original framework specifies..."
- "As stated in the system instructions..."

### Organizational Decisions
- "Organizing source content into..."
- "Structuring the [source section] as..."
- "Categorizing the instructions from [source]..."

### When Uncertain About Source Intent
- "The source document states [X]. Should this be..."
- "The instruction [quote] could be organized as... or as..."
- "Would you like me to preserve [ambiguity] or clarify?"

### When Source is Minimal
- "The source document provides minimal guidance on [X]"
- "Converting available content - source is brief on [topic]"
- "Source focuses on [Y] without detail on [X]"

## Common Pitfalls to Avoid

### Pitfall 1: "Improving" the Source
```
❌ BAD: Source says "Check the file"
       You write: "Check the file for syntax errors, missing imports,
                   and potential bugs"

✅ GOOD: Source says "Check the file"
         You write: "Check the file"
```

### Pitfall 2: Adding "Helpful" Context
```
❌ BAD: Source: "Use version control"
       You add: "Use version control like Git, with feature branches
                 and pull requests for code review"

✅ GOOD: Source: "Use version control"
         You keep: "Use version control"
```

### Pitfall 3: Creating Examples
```
❌ BAD: Source explains a concept
       You add: "For example, if building a web app..."

✅ GOOD: Source explains a concept
         You keep: Just the concept explanation
```

### Pitfall 4: Standardizing Structure
```
❌ BAD: Source has unusual organization
       You reorganize: Into "standard" sections you think are better

✅ GOOD: Source has unusual organization
         You preserve: The exact organization from source
```

### Pitfall 5: Filling Perceived Gaps
```
❌ BAD: Source doesn't mention testing
       You add: A testing section because "it should be there"

✅ GOOD: Source doesn't mention testing
         You create: Skill without testing section
```

## Quality Assurance Checklist
Before submitting a converted Skill, verify:
- [ ] **Source fidelity**: Can trace every instruction back to source
- [ ] **No additions**: Nothing present that isn't in source
- [ ] **No modifications**: Original language preserved
- [ ] **No reorganization**: Structure matches source
- [ ] **No clarifications**: Ambiguity preserved if in source
- [ ] **No examples**: Unless extracted from source
- [ ] **No templates**: Unless present in source
- [ ] **No assumptions**: About missing content
- [ ] **No improvements**: To wording or structure
- [ ] **Proper format**: Follows Claude Skill standards

## Conversion Workflow

### Phase 1: Analysis
1. Read source document completely
2. Identify main sections and structure
3. Note any extractable content (examples, templates)
4. Assess level of detail and directness
5. **Do NOT plan improvements or additions**

### Phase 2: Mapping
1. Map source sections to Skill format sections
2. Identify content for main SKILL.md
3. Identify content for resource files
4. Note any truly ambiguous areas to query user
5. **Do NOT add sections not in source**

### Phase 3: Extraction
1. Copy content from source to Skill format
2. Preserve exact wording and structure
3. Extract examples/templates to resource files
4. Maintain all conditional logic and options
5. **Do NOT rephrase or elaborate**

### Phase 4: Verification
1. Compare Skill line-by-line with source
2. Verify no additions were made
3. Confirm structure matches source
4. Check resource files match source examples
5. **Do NOT make "final improvements"**

## Response Templates

### Template 1: Ambiguous Source
```
"The source document contains this instruction: [exact quote]

This could be interpreted as [option 1] or [option 2].
Should I preserve it exactly as stated, or would you like to specify
which interpretation?"
```

### Template 2: Minimal Source
```
"I've converted the available content from [source]. The original document
is relatively brief on [topic area], providing [what's there].

Should I work with this level of detail, or is there additional source
material to incorporate?"
```

### Template 3: Complex Structure
```
"The source document has [describe unusual structure]. I'll preserve this
structure in the Skill to maintain the original organization and flow.

Would you like me to proceed with this structure, or reorganize?"
```

### Template 4: Verification
```
"I've created the Skill from [source]. To verify accuracy:

- Main SKILL.md contains [X] sections from source
- Resource files include [Y] extracted examples
- No additional content beyond source material
- Original structure and terminology preserved

Ready to review?"
```

## Final Reminder
**A perfect Skill conversion is invisible - you can't tell it was converted.**
The Skill should read as if the original author wrote it in Skill format. Your role is translator, not editor or enhancer.
When tempted to improve:
1. **Stop** - resist the urge to add
2. **Verify** - check if it's in the source
3. **Preserve** - keep source content unchanged
4. **Document** - note what you're preserving
Users trust Skill conversions that faithfully represent source material, not ones that add "helpful" improvements.

## Integration Note
These rules specifically govern the Skill creation and conversion process. They work alongside general anti-hallucination rules but take precedence for Skill-specific decisions. When in doubt, preserve source fidelity over any other consideration.
