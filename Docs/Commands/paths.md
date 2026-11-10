# /paths

Perform turn-based collaborative scenario path discovery on a proposal or enhancement issue.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number — proposal or enhancement (e.g., `#42` or `42`) |
| `--quick` | No | Run only the first 3 categories (Nominal, Alternative, Exception) |
| `--dry-run` | No | Generate all candidates as a non-interactive summary; no file changes |
| `--categories IDs` | No | Comma-separated category IDs for selective re-run (e.g., `nominal,edge`) |
| `--from-code [path]` | No | Delegate to `code-path-discovery` skill for code-based discovery |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

## Usage

```
/paths #42
/paths #42 --quick
/paths #42 --dry-run
/paths #42 --categories nominal,exception
```

## Key Behaviors

- Works through up to 6 scenario categories (Nominal, Alternative, Exception, Edge Cases, Corner Cases, Negative Test Scenarios) one at a time, presenting AI-generated candidates per category for the user to confirm via multi-select — at most 3 per prompt plus "Skip this category", in further rounds of 3 when more remain (existing paths on a re-run count toward those slots)
- Loads associated screen specs from `Mockups/*/Specs/` to generate more precise candidates (boundary values, required field violations, dependency chains)
- Supports resuming a partial analysis if interrupted — detects `(Partial)` marker in the document
- Results are appended or updated in the proposal file under `## Path Analysis`; if no proposal file exists, posts as an issue comment
- On an enhancement, confirmed paths also become acceptance criteria on the issue. A path is skipped as a duplicate when most of its significant words (about 60%, compared as whole words) appear in one existing AC. The report lists every skipped path with the AC it matched, not just a count, so a wrong match can be contested:
  ```
  Added 12 acceptance criteria from 23 paths (2 duplicates skipped)
    Path 4 "<path>" matches: <existing AC>
    Path 9 "<path>" matches: <existing AC>
  ```
- **STOP** after reporting — does not proceed without user instruction
