---
version: "v0.103.0"
description: Read or edit activeDomains for this project
argument-hint: "--add {domain} | --remove {domain} | --list"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /domain-config
Read or change `framework-config.json` `activeDomains` — the domains a review applies — without entering a charter flow.
**A surface over existing infrastructure, not new capability.** The key already exists, is in `framework-config.schema.json`, is written through the validating `framework-config.js` helper, and is read by `/review-issue` (`resolveAutoInclusion`), `/code-review` (`filterDomainsByCharter`) and `bad-test-review`; `/charter` creates and re-evaluates it. This adds a single-purpose read/edit path and a report of *why* each domain applies.
**MANAGED, not EXTENSIBLE** — no per-project customization surface: the domain list is fixed by `.claude/metadata/review-extensions.json`, the storage shape by the schema. No `USER-EXTENSION` blocks.
**Prerequisites:** `framework-config.json` in the project root; `.claude/metadata/review-extensions.json` readable.
## Arguments
| Argument | Description |
|----------|-------------|
| `--add {domain}` | Add one domain id to `activeDomains` |
| `--remove {domain}` | Remove one domain id from `activeDomains` |
| `--list` | Report effective domain state. Alias: `--show` |
Exactly one mode per invocation. No mode, or more than one → report `Usage: /domain-config --add {domain} | --remove {domain} | --list` and STOP. Two modes is an error, not a sequence — do not guess an order.
**REQUIRED:** `TaskCreate` one task per numbered step. No routing decision → bulk-create upfront, **in one message as parallel tool calls** (`07-task-creation-timing.md` § Emission). Post-compaction: re-read this spec, `TaskList`, resume from the first incomplete task.
## Workflow
### Step 1: Parse Arguments
Extract the mode and, for `--add`/`--remove`, the single domain id. Treat `--show` as `--list`.
### Step 2: Load the Registry and the Config
**Re-read `.claude/metadata/review-extensions.json` from disk at use** (rule `01-anti-hallucination.md`). Its keys are the complete set of valid ids.
```javascript
const { getAvailableExtensions, resolveAutoInclusion } =
  require('./.claude/scripts/shared/lib/load-review-extensions.js');
const fwconfig = require('./.claude/scripts/shared/lib/framework-config.js');
const validIds = getAvailableExtensions(process.cwd());
const config = fwconfig.read(process.cwd());
```
**NEVER write a domain id into this spec, a report template, or an error string.** The registry is the only place the set lives; #2812 removed exactly such a copy from the review specs after it went stale, advertising 8 of 11 registered domains.
**Registry unreadable** → report that the valid ids could not be established and STOP. No built-in fallback list; never write on an unvalidated id.
### Step 3: `--list` — Report Effective State
`activeDomains` is not the only path: `domainSpecialist` pulls domains in via `relevantSpecialists`, and nothing surfaces that today — a project can get a domain it never configured with no way to see why.
**Delegate to `resolveAutoInclusion`; do not re-derive the resolution.** It computes the effective set and returns a `sources` Map of per-domain attribution.
```javascript
const { domains, sources } = resolveAutoInclusion(process.cwd(), [], {});
```
Report **every registered id**, not only those that resolved — omitting the rest makes an empty result indistinguishable from a failed lookup. Per domain:
| Column | Source |
|--------|--------|
| Stored | id appears in `config.activeDomains` |
| Auto-included by | `sources.get(id)` when it is a specialist name rather than `activeDomains` |
| Applies | id appears in `domains` |
State the configured `domainSpecialist` above the report, or that none is set — without it the auto-inclusion column has no referent.
**Absent or empty `activeDomains` is "not configured", not "nothing applies" (#2810).** Say which: never-answered and deliberately-cleared read identically from the array alone, and the difference changes what the user does next.
### Step 4: `--add` — Add One Domain
1. **Validate.** The id MUST be in `validIds`. If not, report the rejection **and the valid ids composed from the registry** — never a list written into this spec — and STOP. Nothing is written.
2. **No-op check.** Already present → report the no-op and STOP. Nothing is written; a no-diff write is a spurious `git status` modification for no change in meaning.
3. **Write through the helper.**
```javascript
const config = fwconfig.read(process.cwd());
config.activeDomains = [...(config.activeDomains || []), domain];
fwconfig.write(process.cwd(), config);
```
**`fwconfig.write` validates against the schema before writing.** If it throws, report the error and STOP — **NEVER** retry with a raw `fs.writeFileSync`. Bypassing the helper lets schema-invalid config reach disk, and this key is read by three consumers that would then fail in three different places.
An absent `activeDomains` key is created by this step — the intended way to configure a project that never had one, not a migration.
### Step 5: `--remove` — Remove One Domain
1. **No-op check.** Not present → report the no-op and STOP. Nothing is written. Reported rather than silently succeeding: "removed" and "was never there" mean different things to a user who expected it configured.
2. **Write through the helper**, same contract as Step 4:
```javascript
const config = fwconfig.read(process.cwd());
config.activeDomains = (config.activeDomains || []).filter(d => d !== domain);
fwconfig.write(process.cwd(), config);
```
**No registry validation on `--remove`.** A stored id is removable whether or not it is still registered; refusing strands a stale entry only this command can clear.
**Removing the last entry leaves `[]`, not an absent key** — which reads as *not configured* to `filterDomainsByCharter` (#2810), so `/code-review` falls through to charter inference rather than applying nothing. Report that.
### Step 6: Cleanup, Report and STOP
Three parts, in order. The prune is **part of** this step, not a sibling step after it — a reader who stops at the STOP directive in part (3) must already have pruned in part (1).
**(1) Prune the task list** (unconditional — every path, including the early-exit paths where Step 1 rejected the arguments or Step 2 could not read the registry, so tasks were created and the later steps never ran):
1. `TaskList` — enumerate all tasks.
2. For every task owned by this `/domain-config` invocation, `TaskUpdate status=deleted`.
3. Do **not** delete tasks created outside this invocation (user TODOs).
**(2) Report** the mode, the domain, and what changed — or that nothing did. State that a change takes effect on the next review; nothing in the current session is re-resolved.
**(3) STOP.** This command edits configuration and reports. It does not run a review, move issue status, or start work.
## Error Handling
| Situation | Response |
|-----------|----------|
| No mode, or more than one | Usage line → STOP |
| `--add` / `--remove` with no domain | "A domain id is required." → STOP |
| Registry missing or unreadable | Valid ids could not be established → STOP, write nothing |
| `--add` with an unregistered id | Rejection plus the valid ids from the registry → STOP, write nothing |
| `framework-config.json` unreadable | Report the read failure → STOP |
| `fwconfig.write` validation failure | Report verbatim → STOP. NEVER retry with `fs.writeFileSync` |
| `--add` on a present domain, `--remove` on an absent one | Report the no-op → STOP, write nothing |
**End of /domain-config Command**
