# Domain Specialist Loading
**Version:** 1.0
**Source:** Reference/Domain-Specialist-Loading.md
How the configured specialist reaches a session, what it costs, which value decides it.
## The Two Lists
`framework-manifest.json` carries two lists: `domainSpecialists` (ship — 17) and `loadableSpecialists` (safe to **inject** — 8).
A specialist in the first but not the second is **announce-only**: reported as Active Role, loads nothing. Designed state, not degradation — the nine remain in the reference-catalog format that caused measured verbosity contamination, becoming loadable as they are rewritten.
`loadableSpecialists` is a sibling field, not a restructuring: five consumers read the flat-array-of-string shape, and a sibling leaves four untouched.
## Resolution Order
`.claude/hooks/startup-hook.js` → `resolveSpecialist()` runs four steps **in this order**, and the order is the security property:
1. **Shape check** — pure string work, no filesystem access. Separators, dot segments, drive letters, UNC prefixes, NUL rejected here.
2. **Manifest membership** — must be in `domainSpecialists`, decided before any path is built.
3. **Loadable gate** — must additionally be in `loadableSpecialists`.
4. **Filesystem** — only now may a config-derived path be resolved and read.
Reordering reintroduces an arbitrary-file-disclosure surface: the raw config value once went straight into `path.join`.
| Status | Meaning | Injects | Warns |
|---|---|---|---|
| `none` | Not configured | No | No |
| `rejected` | Unsafe shape, unknown name, or no allowlist | No | Yes |
| `announce-only` | Known specialist, not yet loadable | No | No |
| `missing` | Loadable, but no file on disk | No | Yes |
| `loaded` | Content injected into `additionalContext` | Yes | No |
Every failure degrades to announce-only — the hook gates session start, so a throw would brick it. **Fails closed:** an unreadable manifest yields no allowlist, and no allowlist means nothing injects.
## Per-Session Token Cost
Injection is a **recurring per-session cost**, paid every start, not once at install.
Across the 8 loadable specialists (chars ÷ 4): **~2.3K–3.7K tokens, mean ~2.8K** — 9.4 KB Graphics-Engineer-Specialist low, 15.0 KB Accessibility-Specialist high. Order-of-magnitude only; the divisor is approximate and rewrites move the files.
One specialist is injected per session, so this is the whole cost, not a multiplier. Announce-only costs nothing beyond the block line naming the role.
## Config-on-Disk Is the Single Source of Truth
`framework-config.json` `domainSpecialist` decides the active specialist, and **every session start re-reads it**.
- Context state alone never survives a session boundary; a switch persists only because `/change-domain-expert` writes the new value to config.
- A deactivation instruction lost to compaction cannot outlive its session.
- No second copy, no in-session cache. Editing the file is the whole mechanism.
The re-read is unconditional, not memoized: authority comes from reading fresh; caching would recreate the drift the design prevents.
## Injection Format
Loaded content is appended to `additionalContext` **after** the numbered post-startup actions, fenced by `--- BEGIN DOMAIN SPECIALIST: <name> ---` / `--- END DOMAIN SPECIALIST: <name> ---`.
Both placements are load-bearing: the verbatim-echo directive stays first so the Session Initialized block still displays first, and the blob goes last so a multi-KB insert does not split the block from the instructions acting on it. The markers separate role instructions from harness directives — without them a specialist file's imperative prose reads as harness-issued.
## Verifying That a Load Happened
**No runtime verification gate, and none is needed.** Injection is deterministic — the hook either put content in `additionalContext` or it did not, and `resolveSpecialist()` reports which via `status`. A gate adds value only where the mechanism is unobservable; here it reports itself.
### The retired byte attestation
An earlier approach had the model confirm a load by reporting the specialist name and its size on one line. Retired, and must NOT come back: a self-report is not a measurement. (Paraphrased, not quoted — this file is in a guarded tree, so the literal string would trip the guard. Verbatim text lives in `Construction/Tech-Debt/system-instructions-specialist-architecture.md`, excluded so the record can keep it.) The model attested **8,092 bytes for a 10,817-byte file that was demonstrably fully loaded** (confirmed by back-half content recall). The number tracked nothing, making it worse than no gate — a mismatch proved neither a partial nor a full load, so every result was unfalsifiable.
`tests/reference/byte-attestation-retired.test.js` sweeps `CommandsSrc/`, `.claude/commands/`, `Templates/`, `Reference/` and `.claude/rules/` to keep it retired; `Construction/`, `PRD/` and `Proposal/` are excluded — they describe the pattern on purpose.
### If a directive-based path ever needs a gate
| Gate | Why it holds |
|---|---|
| **Back-half content recall** | A fact appearing only in the last third of the file — answerable only if the tail loaded. |
| **`wc -c` stdout echoed verbatim** | The number comes from the filesystem, not the model, so it is comparable to `fs.statSync().size`. |
What matters is not "number vs. prose" but whether the answer is *produced by* the thing being verified — a self-reported count comes from the same process whose success is in question.
## Changing the Active Specialist
Edit `framework-config.json` `domainSpecialist`, or use `/change-domain-expert`. `framework-config.schema.json` constrains the value to the manifest allowlist plus `Framework-Developer` — the self-hosted maintainer role, backed by no file, resolving to announce-only; permitted by the schema, deliberately absent from the manifest.
`/change-domain-expert` calls the same `resolveSpecialist()`, so a mid-session selection gets the same allowlist and validation as one read at startup. `rejected` or `missing` stops the command **before** the config write — a bad selection cannot persist.
### Limits of an in-session switch
**Deactivation is an instruction, not a removal.** The previous text stays in context; the switch directs the model to disregard it. Actual removal happens only at compaction.
**Repeated switches accumulate.** Each adds ~2.3K–3.7K tokens until compaction — three switches cost three specialists' worth of context. Restarting is cheaper than switching repeatedly.
**What survives is what was written.** The switch persists because the command writes `domainSpecialist` to config and the next start re-reads it. If the write is skipped or fails, the next session reverts to the on-disk specialist regardless of what was loaded.
**End of Domain Specialist Loading**
