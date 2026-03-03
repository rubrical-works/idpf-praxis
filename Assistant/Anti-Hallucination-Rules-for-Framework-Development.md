# Anti-Hallucination Rules for Framework Development
**Version:** v0.56.0

## Core Principle

**Accuracy over speed. Verification over assumption. Completeness over convenience.**

Framework development requires rigorous accuracy because errors propagate to all users of the framework. A version number mistake, missing CHANGELOG entry, or inconsistent registry affects every project that uses the framework.

------

## Information Source Hierarchy

Always prioritize information in this order:

1. **Git history and tags** (absolute authority for versions and changes)
   - Commit messages document what changed
   - Tags define release boundaries
   - `git log` is the source of truth for changes
2. **Existing framework files** (current state)
   - Registry files (MAINTENANCE.md, framework-manifest.json)
   - CHANGELOG.md for documented changes
   - Directory contents for actual file counts
3. **Issue tracker** (intent and requirements)
   - GitHub issues for planned work
   - Pull requests for implementation details
4. **Documentation** (reference, may be stale)
   - Framework-Overview.md and related files
   - README.md and guides

------

## Absolute "Never Do" Rules

### NEVER Invent:

- ❌ Version numbers without analyzing commits
- ❌ CHANGELOG entries without reviewing actual changes
- ❌ Skill counts without listing actual directories
- ❌ Specialist counts without verifying files exist
- ❌ Framework features not implemented in code
- ❌ File paths without verifying they exist
- ❌ Registry entries for non-existent components
- ❌ Installation commands or user workflows without verifying documentation
- ❌ CLI commands, npm packages, or tool names without checking they exist
- ❌ URLs or endpoints without verifying they are valid

### NEVER Assume:

- ❌ A patch version is appropriate without commit analysis
- ❌ CHANGELOG is complete without verifying against commits
- ❌ Install scripts are synchronized without comparing both
- ❌ Skill packages match source directories without checking
- ❌ Counts in documentation match actual files
- ❌ Proposals were moved to Implemented without verifying
- ❌ All changes were committed

### NEVER Defer or Reduce Scope Without Confirmation:

When working on any bug, enhancement, proposal, or PRD, you must implement ALL specified requirements. Unilateral scope decisions are prohibited.

- ❌ Mark any requirement as "optional" or "nice-to-have" without user approval
- ❌ Defer features to "future work" or "Phase 2" without explicit agreement
- ❌ Remove or skip acceptance criteria without confirmation
- ❌ Split or simplify requirements without user consent
- ❌ Downgrade priority of any item without discussion
- ❌ Declare something "out of scope" that was in the original specification
- ❌ Replace a requirement with a "simpler alternative" without approval

**When scope concerns arise:**

1. **STOP** - Do not silently defer or skip
2. **REPORT** - Explain the specific concern
3. **ASK** - "Should I proceed as specified, or would you like to adjust the scope?"
4. **WAIT** - Get explicit user decision before proceeding

```markdown
❌ BAD: "I've implemented the core functionality. The edge cases can be
        added in a future iteration."

✅ GOOD: "The edge cases specified in AC-3 would require significant
         additional work. Should I implement them now as specified,
         or would you like to create a separate issue for them?"
```

------

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

------

## Version Management Rules

### Before Determining Version Number

**ALWAYS run Phase 0 from PREPARE_RELEASE.md:**

```bash
# 1. Identify last release
git describe --tags --abbrev=0

# 2. Count and review ALL commits since last release
git log <last-tag>..HEAD --oneline
git log <last-tag>..HEAD --oneline | wc -l

# 3. Categorize changes
git log <last-tag>..HEAD --pretty=format:"%s" | grep -E "^(Add|Implement)"  # Features
git log <last-tag>..HEAD --pretty=format:"%s" | grep -E "^Fix"              # Fixes
```

### Version Decision Matrix

| Commit Contains | Version Type |
|-----------------|--------------|
| ANY new framework (IDPF-*) | MINOR or MAJOR |
| ANY new domain specialist | MINOR |
| ANY new skill | MINOR |
| ANY new feature or capability | MINOR |
| ONLY bug fixes | PATCH |
| ONLY documentation updates | PATCH |

**If in doubt, choose the HIGHER version type.**

### CHANGELOG Discipline

Every release MUST document ALL changes since last release:

1. **Review every commit** - not just the triggering issue
2. **Categorize properly** - Added, Changed, Fixed, Removed
3. **Include issue numbers** - (#XX) for traceability
4. **Group related changes** - by component or feature area

```markdown
❌ BAD: Only documenting the issue you were working on
✅ GOOD: Documenting all 69 commits that occurred since last release
```

------

## Cross-Reference Validation Rules

### Before Releasing, Verify Consistency

| File A | Must Match | File B |
|--------|------------|--------|
| `framework-manifest.json` version | = | `CHANGELOG.md` latest version |
| `framework-manifest.json` version | = | `README.md` version |
| Skills in `Skills/` directories | = | Skills in `Skills/Packaged/*.zip` |
| Skills in MAINTENANCE.md registry | = | Skills in `Skills/` directories |
| Specialists in `System-Instructions/Domain/` | = | Count in documentation |
| Frameworks in `IDPF-*/` directories | = | List in framework-manifest.json |

### Validation Commands

```bash
# Count skill directories (excluding Packaged)
ls -d Skills/*/ | grep -v Packaged | wc -l

# Count skill packages
ls Skills/Packaged/*.zip | wc -l

# Count domain specialists
ls System-Instructions/Domain/*.md | wc -l

# List frameworks
ls -d IDPF-*/ 2>/dev/null
```

------

## Registry Synchronization Rules

### Skills Registry (Skills/MAINTENANCE.md)

Before release, verify:

- [ ] Every skill directory has an entry in the registry table
- [ ] Every registry entry has a corresponding directory
- [ ] Version numbers match SKILL.md files
- [ ] Framework-Skill dependency matrix matches install scripts

------

## Proposal Workflow Rules

### When Implementing a Proposal

1. **Before starting:** Verify proposal exists in `Proposal/`
2. **After implementing:** Move to `Proposal/Implemented/`
3. **In commit message:** Reference the proposal file
4. **In CHANGELOG:** Document the implementation

### Proposal File Movement

```bash
# Correct workflow
git mv Proposal/Feature-Name.md Proposal/Implemented/Feature-Name.md
git commit -m "Move Feature-Name proposal to Implemented (#XX)"

# NEVER leave proposals in wrong location after implementation
```

------

## File Operation Rules

### Before Bulk Updates

1. **List all files** that will be affected
2. **Read each file** before modifying
3. **Track progress** explicitly
4. **Verify completion** by listing again

### Count Verification

```markdown
❌ BAD: "Updated all 14 skills"
✅ GOOD: "Listed skills: [14 names]. Updated each. Verified: 14 complete."
```

------

## Self-Checking Before Release

### Pre-Release Checklist

- [ ] Ran `git log <last-tag>..HEAD` and reviewed ALL commits
- [ ] Version number reflects the HIGHEST change type in commits
- [ ] CHANGELOG documents every significant commit
- [ ] All counts in documentation match actual file counts
- [ ] Install scripts are synchronized (checked both)
- [ ] Skill packages match skill directories
- [ ] Framework-manifest.json version matches CHANGELOG
- [ ] README.md version matches framework-manifest.json
- [ ] All implemented proposals moved to Implemented/

### Post-Release Verification

- [ ] Git tag created and pushed
- [ ] GitHub shows correct tag
- [ ] No uncommitted changes remain

------

## Common Mistakes to Avoid

### Mistake 1: Patch Version for Feature Release

```markdown
❌ BAD: 69 commits with 7 new frameworks → v2.3.1 (PATCH)
✅ GOOD: 69 commits with 7 new frameworks → v2.4.0 (MINOR)
```

### Mistake 2: Incomplete CHANGELOG

```markdown
❌ BAD: CHANGELOG only mentions the bug that triggered the release
✅ GOOD: CHANGELOG documents all features, fixes, and changes since last release
```

### Mistake 3: Assumed Counts

```markdown
❌ BAD: "There are 14 skills" (from memory)
✅ GOOD: "Listed Skills/: 14 directories found" (from verification)
```

### Mistake 4: Stale Documentation Counts

```markdown
❌ BAD: Documentation says "10 skills" but there are now 14
✅ GOOD: After adding skills, updated all documentation counts
```

### Mistake 5: Invented Commands or URLs

```markdown
❌ BAD: "Run `npx install-idpf` to install" (command doesn't exist)
✅ GOOD: "Run `node install-hub.js` to install" (verified in documentation)

❌ BAD: "Visit https://example.com/docs for more" (URL not verified)
✅ GOOD: "See the README.md for installation instructions" (points to known file)
```

------

## When Communicating with Users

### Verify Before Stating

Before mentioning any of the following to users, verify they exist:

- **Installation commands** - Check README.md or install scripts
- **CLI tool names** - Verify the actual executable or script name
- **npm package names** - Check package.json or npm registry
- **URLs and endpoints** - Confirm they are valid and current
- **File paths** - Verify the file exists at that location

### When Uncertain, Be Generic

If you cannot verify a command or URL, use generic descriptions:

```markdown
❌ BAD: "Run `npx idpf-install` to get started"
✅ GOOD: "Follow the installation instructions in README.md"

❌ BAD: "The API is available at https://api.example.com/v2"
✅ GOOD: "Check the configuration file for the API endpoint"
```

### Verification Commands

```bash
# Check if a command/script exists
ls install-hub.js
cat README.md | grep -i "install"

# Verify npm package
npm view <package-name> 2>/dev/null

# Check file references in documentation
grep -r "install" README.md
```

------

## Response Templates

### Template 1: Version Determination

```
Before determining version, I analyzed commits since last release (vX.Y.Z):

Total commits: [N]
- New frameworks: [count]
- New specialists: [count]
- New skills: [count]
- New features: [count]
- Bug fixes: [count]

Based on [highest change type], this should be version [X.Y.Z].
```

### Template 2: Release Preparation

```
Pre-release verification:

1. Commits reviewed: [N] commits since v[last]
2. CHANGELOG updated: [sections added]
3. Version consistency:
   - framework-manifest.json: [version]
   - CHANGELOG.md: [version]
   - README.md: [version]
4. Registry verification:
   - Skills: [N] directories, [N] packages, [N] registry entries
   - Specialists: [N] files
5. Install scripts: Compared, identical mappings confirmed

Ready for release.
```

### Template 3: Count Verification

```
Verifying [component] count:

Command: [command run]
Result: [actual count]

Files found:
1. [file1]
2. [file2]
...

Documentation states: [documented count]
Status: [Match/Mismatch - action needed]
```

------

## Integration with Framework Development

### When This Ruleset Applies

- Working in the idpf-praxis repository (framework source)
- Preparing releases
- Updating registries or counts
- Modifying install scripts
- Managing proposals

### When Software Development Rules Apply Instead

- User projects installed via hub installer
- Writing application code
- General software development tasks

------

## Final Reminder

**Framework errors multiply.** Every mistake in the framework affects every user who installs it. Take the time to verify:

1. **Commits** - Review all of them before versioning
2. **Counts** - List files, don't assume numbers
3. **Consistency** - Cross-check all version references
4. **Completeness** - Document everything in CHANGELOG

When tempted to skip verification:

1. **Stop** - The release can wait
2. **Verify** - Run the commands, check the files
3. **Document** - Show your verification work
4. **Release** - Only when confident

------

**End of Anti-Hallucination Rules for Framework Development**
