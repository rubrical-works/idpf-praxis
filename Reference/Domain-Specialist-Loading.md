# Domain Specialist Loading
**Version:** 2.0
**Source:** Reference/Domain-Specialist-Loading.md
How the configured specialist reaches a session, what it costs, which value decides it.
## The One List
`framework-manifest.json` carries one `domainSpecialists` array of objects; every entry is selectable.
| Field | Meaning |
|---|---|
| `name` | Identifier; file basename when `loadable`. |
| `loadable` | `true` when **a file exists to load**. |
| `description` | One-line remit, shown by `/change-domain-expert` and PHM at install time. |
| `announceReason` | Only when `loadable: false`: `model-builtin` or `pending-evaluation`. |
Roster: **25 entries — 17 loadable, 8 announce-only** (7 `model-builtin`, 1 `pending-evaluation`). A `loadable: false` entry is **announce-only**: reported as Active Role, loads nothing. Designed state, not degradation.
**`loadable` means a file exists — nothing more.** It previously also meant "this file's format is safe to inject": all 17 had files but only 8 were allowlisted, the other 9 withheld on **format** grounds, which froze an unresolved measurement into a shipped capability restriction that no issue owned. #2533 collapsed the distinction — `loadable: false` and "no file on disk" are now the same set, and format is **#2536**'s call.
**Nine loadable specialists are still reference-catalog format** and inject in it today. #1977 measured that format at parity with loading nothing (28.5 vs 28.0 of 30) while producing output-discipline failures opinion-dense did not, so expect no gain and some regression risk. Accepted: the alternative was an untracked indefinite hold. #2536 decides rewrite-or-drop; `model-builtin` is already in the enum for ones that flip back.
| `announceReason` | Meaning | Can become `loadable: true`? |
|---|---|---|
| `model-builtin` | Base model applies it unprompted; a file costs tokens without changing output. | **No** — permanently announce-only. |
| `pending-evaluation` | Whether a file is warranted has **never been evaluated**. | **Undecided** — #2536 resolves it. |
`pending-evaluation` says the question is open, not that a file is scheduled. `pending-authoring` would read as a commitment to write one, and the value ships in a cross-repo contract PHM reads. Machine-readable enum, no per-entry prose — rationale lives here, not in a deployed manifest.
**Why 17 → 25.** #2494 dropped 8 specialists, deleting file and name together. Deleting the **files** was correct and stands. But the **names** are the join key for specialist-driven review-domain auto-inclusion in `review-extensions.json`, and a flat string list could not hold a selectable identity without a file — leaving `contract`, `seo` and `api-design` with **zero** live triggers. The object shape expresses "a real role, deliberately no file", so 7 names return. `Content-Strategist` does not: no extension references it, and `Brand-Strategist` + `Technical-Writer-Specialist` cover the space.
## Resolution Order
`.claude/hooks/startup-hook.js` → `resolveSpecialist()` runs four steps **in this order**, and the order is the security property:
1. **Shape check** — pure string work, no filesystem access. Separators, dot segments, drive letters, UNC prefixes, NUL rejected here.
2. **Manifest membership** — must be in `domainSpecialists`, decided before any path is built.
3. **Loadable gate** — the entry's own `loadable` flag must be true.
4. **Filesystem** — only now may a config-derived path be resolved and read.
Reordering reintroduces an arbitrary-file-disclosure surface: the raw config value once went straight into `path.join`.
| Status | Meaning | Injects | Warns |
|---|---|---|---|
| `none` | Not configured | No | No |
| `rejected` | Unsafe shape, unknown name, or no allowlist | No | Yes |
| `announce-only` | Known specialist, `loadable: false` (no file) | No | No |
| `missing` | `loadable: true`, file absent or unreadable | No | Yes |
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
