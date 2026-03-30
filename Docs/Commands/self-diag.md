# /self-diag

Run a systematic integrity audit of the IDPF framework across 6 dimensions.

## Arguments

None.

## Usage

```
/self-diag
```

## Key Behaviors

- Framework-only command — not deployed to users; intended for pre-release integrity checking
- Runs 6 audit phases via `self-diag-checks.js`: Registry Alignment, Metadata Integrity, Deployment Manifest, Script Sync, Constants Validation, and Cross-File References
- Each phase is run and summarized sequentially; findings are accumulated in `.tmp-diag-findings.txt` and cleaned up at the end
- Failing findings are triaged by severity: `must-have` → filed as bugs, `should-have` → filed as proposals, `nice-to-have` → recorded as tech-debt documents
- Produces a final summary table showing pass/fail counts per phase and a list of all filed issues and documents
- Can be run standalone or before `/prepare-release` as an early integrity gate
