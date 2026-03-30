# /gap-analysis

Review framework content against current industry practices, identify gaps, and produce a proposal document per analyzed area.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<area>` | No | Area name to analyze (e.g., `IDPF-Security`, `Skills`). Prompts with menu if omitted. |
| `--all` | No | Analyze all 14 areas sequentially, one proposal per area |
| `--force` | No | Skip the 3-month staleness check and analyze regardless of last run date |

## Usage

```
/gap-analysis
/gap-analysis IDPF-Security
/gap-analysis Skills --force
/gap-analysis --all
```

## Key Behaviors

- **Framework-only command** — not available in user projects (marked `FRAMEWORK-ONLY`).
- Tracks last analysis date per area in `.claude/gap-analysis-log.yml`; warns and prompts before re-running an area analyzed less than 3 months ago (bypass with `--force`).
- Performs web research for current industry practices, then compares against the framework's actual content files for the selected area.
- Writes all findings to `Proposal/Gap-Analysis-{Area}-{YYYY-MM-DD}.md` (no interactive per-finding prompts) and creates a tracking issue via the standard proposal flow.
- The special `Framework-Review` area performs a holistic internal audit (deployment efficiency, architecture gaps, redundancy, minimization effectiveness, cross-reference integrity) instead of web research.
- Integrates with `/prepare-release` — stale areas surface as a recommendation to run gap analysis before releasing.
