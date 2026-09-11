# /domain-config

Read or change which review domains apply to this project, without entering a charter flow.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--add {domain}` | Yes (one of) | Add one domain id to `activeDomains` |
| `--remove {domain}` | | Remove one domain id from `activeDomains` |
| `--list` | | Report the effective domain state. Alias: `--show` |

Exactly one mode per invocation.

## Usage

```
/domain-config --list
/domain-config --add {domain}
/domain-config --remove {domain}
```

## Key Behaviors

- **`--list` reports why each domain applies, not just what is stored.** A domain reaches a review from `activeDomains` **or** from your configured `domainSpecialist`, which pulls domains in through the review-extensions registry. The report separates the two, so a domain you never configured is traceable to the specialist that included it.
- Every registered domain is reported, not only the ones that resolved. Omitting the rest would make "no domains apply" indistinguishable from a failed lookup.
- **Valid domain ids come from the registry**, read at run time rather than hardcoded, so the set stays correct as domains are added. `--add` rejects anything absent from it and reports the valid ids without writing.
- Writes go through a schema-validating helper, so an invalid value is rejected at write time rather than persisted.
- **Idempotent.** `--add` on a domain already present, and `--remove` on one that is absent, are reported as no-ops and write nothing — no spurious change to `framework-config.json`.
- `--remove` does not validate against the registry. An id already stored is removable whether or not it is still registered, so a stale entry can always be cleared.
- A change takes effect on the next review. Nothing in the current session is re-resolved.

## Limitations

- **One domain per invocation.** There is no bulk mode; `/charter update` remains the multi-select surface for changing several at once.
- **An empty `activeDomains` means "not configured", not "nothing applies."** Removing the last entry leaves an empty list, which `/code-review` reads as unconfigured and falls through to charter inference rather than applying no domains. The command reports this when it happens.
- **This command changes what is configured, not what `activeDomains` means.** Its two consumers interpret the key differently — one additively, one as a filter — and that is out of scope here.

## Requirements

- `framework-config.json` in the project root
- `.claude/metadata/review-extensions.json` readable
