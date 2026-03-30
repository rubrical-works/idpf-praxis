# Anti-Hallucination Rules for Skill Creation
**Version:** v0.77.1
**Core Principle:** Accuracy over helpfulness. Precision over assumption. Verification over invention.
When creating Skills from System Instructions or Frameworks, preserve the original intent and structure -- never "improve" with invented additions.
---
**Information Source Hierarchy**
1. **Source files being converted** (absolute authority) - System Instructions, Framework documents, existing Skills, user-provided templates
2. **Established Skill patterns** (from examples) - SKILL.md format conventions, resource file organization, metadata standards
3. **Claude Skill documentation** (official standards) - Official creation guidelines, format specifications, Anthropic best practices
4. **Logical organization** (when not specified) - Must maintain source structure, must not add content not in source, must preserve original terminology
---
**NEVER Invent:**
- Additional instructions not in the source document
- Example code or scenarios not present in source
- Tool configurations or parameters not specified
- File structures or organization not defined in source
- Best practices or guidelines beyond the source
- Templates or boilerplate not in source material
- Prerequisites or requirements not stated in source
- Workflow steps not explicitly described in source
- Error handling approaches not mentioned in source
- Additional resources or references not in source
**NEVER Assume:**
- That vague instructions need clarification or expansion
- That examples need to be added for clarity
- That additional context would be helpful
- That the source is incomplete without your additions
- That standardization requires adding new content
- That brevity needs elaboration
- That implicit knowledge should be made explicit
- That better organization means adding sections
**NEVER Defer or Omit Source Content Without Confirmation:**
Include ALL content from the source. Unilateral decisions to skip or defer are prohibited.
- Skip sections because they seem "less important"
- Mark source content as "future enhancement" without approval
- Omit parts because they're complex to format
- Defer content to "later" without explicit agreement
- Simplify by removing source material without consent
- Leave out sections that don't fit neatly into Skill format
**When conversion concerns arise:** 1) STOP 2) REPORT which content is difficult and why 3) ASK "Should I include this as-is, or handle differently?" 4) WAIT for explicit user decision.
---
**STOP Boundary Enforcement**
STOP boundaries in command specs are **hard stops**, not suggestions.
1. **STOP means STOP** - Execution must halt at the boundary
2. **No "helpful continuation"** - Do not proceed past STOP even if next steps seem logical
3. **User instruction required** - Only explicit user instruction authorizes crossing
4. **Re-verify after context loss** - Re-read command specs after compaction, verify position relative to STOP boundaries
---
**Converting System Instructions to Skills**
Step 1 - Analyze source structure:
- Clearly organized -> Map sections directly to Skill format
- Mixed formats -> Preserve all content, organize minimally
- Unclear structure -> Use minimal organization, preserve everything
Step 2 - Determine resource file needs:
- Examples/templates/reference data in source -> Extract to resource files
- No extractable content -> No resource files needed
Step 3 - Create SKILL.md: Organize existing content under Skill sections. Preserve exact wording. Maintain source's level of detail. NEVER add new sections/content, rephrase, or expand.
**Creating Resource Files:**
- Only extract content explicitly in source (code examples, templates, reference tables, checklists)
- Filenames reflect source content; include only source-extracted content
- NEVER create "helpful" additional examples or add explanatory comments not in source
**When Source is Ambiguous:** Preserve ambiguity as-is, OR ask user, OR note "preserved as stated, may need interpretation". NEVER add your interpretation.
**When Source Seems Incomplete:** Ask if there's additional material. Create Skill with only content provided. NEVER flesh out with additions.
---
**Domain-Specific Rules**
**Framework to Skill Conversion:**
- Maintain intentional framework organization -- don't reorganize for "better flow"
- Convert decision trees exactly -- don't simplify by removing options
- Preserve all phases/stages as documented -- don't merge "redundant" ones
- Keep framework terminology unchanged -- don't "standardize" to industry terms
**System Instructions to Skill Conversion:**
- Keep prescriptive language ("MUST", "NEVER", "ALWAYS") -- don't dilute
- Don't soften with "typically" or "usually"
- Preserve instruction hierarchy, priority, and all conditional logic
**Metadata and Skill Configuration:**
- Description must only reference actual Skill content
- Don't promise capabilities not present in source
- Use specific, verifiable language from source material
**Resource File Organization:**
```
resources/
  examples/          # Only if examples exist in source
  templates/         # Only if templates exist in source
  reference/         # Only if reference material in source
  [custom-name]/     # Only if source has specific category
```
Create structure matching source organization, not a "standard" structure.
---
**Self-Checking Before Finalizing**
Content Fidelity:
- [ ] Every instruction in SKILL.md comes from source
- [ ] No explanatory content added beyond source
- [ ] Terminology matches source exactly
- [ ] Examples are extracted from source, not created
- [ ] No "helpful additions" that aren't in source
- [ ] Structure reflects source organization
Resource Files:
- [ ] Each resource file has corresponding source content
- [ ] No template files created from scratch
- [ ] Example code is quoted from source
- [ ] Reference materials exist in source
- [ ] No "standard" files added for completeness
Skill Metadata:
- [ ] Description only mentions actual Skill content
- [ ] Trigger patterns match actual Skill capabilities
- [ ] Tags reflect source document domain
- [ ] No promises of functionality not in source
Format Compliance:
- [ ] SKILL.md follows Claude Skill format
- [ ] Resources organized per Skill standards
- [ ] Markdown formatting is correct
- [ ] File references are accurate
- [ ] Directory structure is proper
---
**Quality Assurance Checklist**
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
---
**Conversion Workflow**
Phase 1 - Analysis:
1. Read source document completely
2. Identify main sections and structure
3. Note any extractable content (examples, templates)
4. Assess level of detail and directness
5. **Do NOT plan improvements or additions**
Phase 2 - Mapping:
1. Map source sections to Skill format sections
2. Identify content for main SKILL.md
3. Identify content for resource files
4. Note any truly ambiguous areas to query user
5. **Do NOT add sections not in source**
Phase 3 - Extraction:
1. Copy content from source to Skill format
2. Preserve exact wording and structure
3. Extract examples/templates to resource files
4. Maintain all conditional logic and options
5. **Do NOT rephrase or elaborate**
Phase 4 - Verification:
1. Compare Skill line-by-line with source
2. Verify no additions were made
3. Confirm structure matches source
4. Check resource files match source examples
5. **Do NOT make "final improvements"**
---
**Confidence Level Indicators**
- **Direct source:** "From the source document: [exact quote]", "The original framework specifies..."
- **Organizational:** "Organizing source content into...", "Structuring the [section] as..."
- **Uncertain:** "The source states [X]. Should this be...", "Would you like me to preserve [ambiguity] or clarify?"
- **Minimal source:** "Source provides minimal guidance on [X]", "Source is brief on [topic]"
---
**Final Reminder:** A perfect Skill conversion is invisible. Your role is translator, not editor. When tempted to improve: 1) Stop 2) Verify it's in the source 3) Preserve unchanged 4) Document what you're preserving.
These rules take precedence over general anti-hallucination rules for Skill-specific decisions. When in doubt, preserve source fidelity.
**End of Anti-Hallucination Rules for Skill Creation**