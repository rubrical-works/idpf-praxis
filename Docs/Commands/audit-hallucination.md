# /audit-hallucination

Comprehensive review of framework files to detect hallucinated or inconsistent material before release.

## Arguments

None.

## Usage

```
/audit-hallucination
```

## Key Behaviors

- Runs six sequential audit steps: version consistency, count verification (skills, specialists, frameworks, guidelines), file path verification, cross-reference verification, git tag verification, and content validation.
- Content validation (Step 6) checks domain specialist structural consistency and metadata, cross-specialist relationship references, skill SKILL.md completeness, and unreferenced skill resources.
- Produces a structured report with a PASS/FAIL recommendation and severity-classified findings (Critical, High, Medium, Low).
- Can be run standalone or as part of `/prepare-release` (before git operations).
- Framework-only: not available in user projects.
