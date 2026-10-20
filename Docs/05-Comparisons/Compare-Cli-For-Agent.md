# cli-for-agents Guidance vs. gh-pmu and IDPF's Scripts

**Date:** 2026-10-17
**Compared against:** cli-for-agent in `cursor/plugins` at `0317eb8b` (`skills/cli-for-agents/SKILL.md`); gh-pmu 1.6.0 (`--help` output only, no mutating command run); a sample of IDPF's `.claude/scripts/shared/` CLIs
**Topic:** How well the CLIs IDPF's agents call every day follow published guidance for agent-friendly CLIs

---

## The Short Answer

cli-for-agents is a short checklist for CLIs that coding agents call. IDPF's agents call two kinds all day: gh-pmu, and IDPF's own Node scripts. Both mostly return useful output, but both have inconsistencies that IDPF currently works around in prose: shell-pattern corrections, rule text, and wrapper scripts. Each workaround points at a fix that belongs in the CLI.

---

## The Guidance

A Cursor plugin (MIT, Cursor) with one skill of ten rules:

1. Non-interactive first: every input available as a flag; prompt only as a fallback.
2. Layered discovery: each subcommand owns its own help.
3. `--help` on every subcommand, with an Examples section.
4. Accept stdin and pipelines; avoid odd positional ordering.
5. Fail fast with an actionable error that includes a correct example.
6. Idempotency: a retry is safe or says "already done".
7. `--dry-run` for destructive actions.
8. `--yes` / `--force` to skip confirmation.
9. Predictable resource-plus-verb structure.
10. Machine-useful success output: IDs, URLs, durations.

It says nothing about `--schema`, JSON envelopes or exit-code contracts; IDPF's scripts go further than the guidance there.

---

## gh-pmu

**Already meets:** layered help; `--dry-run` on `move`, `branch close`, `split` and `triage`; `--yes` on `move`, `branch close` and `accept`; body input from a file or stdin.

**Gaps, most costly first:**

1. **`--json` takes a required value on `view`, an optional one on `list`, and is a boolean on `split` and `triage`.** `gh pmu list --json status` silently ignores `status` and exits 0, which is why IDPF carries the `--flag=value` shell correction and writes `--json=status` everywhere.
2. Runtime errors print the full usage block, and argument errors give no example.
3. Short flags mean different things in different subcommands (`-b`, `-t`, `-f`).
4. No Examples section on `create`, `view`, `list` or `accept`.
5. No `--dry-run` on `create`, `sub create` or `branch start`, and a retried `create` files a duplicate.
6. Positional and flag forms are mixed (`branch start --name X` vs. `branch close X`; `sub add <parent> <child>` vs. `sub create --parent N`).
7. `create -R` takes the project from the local `.gh-pmu.json` with no `--project` override, which is why `file-companion-issue.js` exists.

## IDPF's Own Scripts

From a sample of six, plus a count across all 85 in `.claude/scripts/shared/`:

- **Help:** 2 of 85 handle `--help`. Others reply "Missing --issue", "Unknown argument" or a one-line usage, with mixed exit codes.
- **Schema:** 8 of 85 support `--schema`.
- **Envelopes:** two shapes are in use (`{ok,…}` and `{success,message,data}`).
- **Bad arguments:** some return JSON on stdout with exit 1, others text on stderr with exit 2. Exit 2 also means TIMEOUT in `wait-for-ci.js`.
- **Partial failure:** some batch modes exit 0 when members fail.
- **Unknown flags:** rejected, warned about or silently dropped, depending on the script.
- **Strong point:** success output is consistently machine-useful.

---

## Recommendations

| Where | Change | Effort |
|---|---|---|
| gh-pmu | Consistent `--json` semantics; never exit 0 after ignoring a value | M |
| gh-pmu | No usage dump on runtime errors; an example in argument errors | S |
| gh-pmu | Examples on `create`, `view`, `list`, `accept` | S |
| gh-pmu | `--dry-run` on `create`, `sub create`, `branch start`; an idempotent create option | M |
| gh-pmu | A `create --project` override | S |
| IDPF | A shared CLI library: `--help` with examples, `--schema`, unknown-flag rejection, `--flag=value`, one envelope; migrate in stages | L |
| IDPF | One exit-code meaning for bad arguments across scripts | S |
| IDPF | Non-zero exit on partial failure in batch modes | S |
| IDPF | Align the `sub create` form in `02-github-workflow.md` with gh-pmu's documented `--parent` example | S |

---

**End of Comparison**
