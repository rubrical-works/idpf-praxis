# /audit-minimization

Review minimized files against their sources to identify Medium or higher requirements removed during minimization.

## Arguments

None.

## Usage

```
/audit-minimization
```

## Key Behaviors

- Compares every source/minimized file pair across all included directories (`IDPF-*/`, `Overview/`, `Reference/`, `System-Instructions/`, `Assistant/`, `.claude/commands/`).
- Classifies each removal as Low (acceptable), Medium (flag for review), Medium-High (should restore), or High (must restore). Standards checklists, compliance framework mappings, and complete reference matrices are always High.
- For Medium-High and High findings, restores content to the minimized file and, if the pattern is general, adds a new exception to `/minimize-files`.
- Reports total files audited, findings by impact level, restorations made, and a Pass/Fail status. Pass requires no unaddressed Medium-High or High findings.
- Best run immediately after `/minimize-files` and before `/prepare-release` Phase 3.
- Framework-only: not available in user projects.
