# /change-domain-expert

Change the active domain specialist for this project and load it into the current session.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[specialist-name]` | No | Specialist name (e.g., `Security-Engineer`) or list number. Presents a numbered menu if omitted. |

## Usage

```
/change-domain-expert
/change-domain-expert Security-Engineer
/change-domain-expert Full-Stack-Developer
```

## Key Behaviors

- Selectable specialists come from `framework-manifest.json` `domainSpecialists`, read at run time rather than hardcoded, so the list stays correct as specialists are added, dropped, or rewritten.
- `domainSpecialists` is a single list of objects. An entry with `loadable: true` has a specialist file and its content is injected; `loadable: false` means no file exists, so the entry is **announce-only** — recorded as the active role, but nothing is loaded. The menu marks these and shows each entry's `description`, so you know before choosing.
- Announce-only is not a lesser tier. Those entries carry `announceReason`: `model-builtin` (the base model already covers it unprompted, so no file is warranted) or `pending-evaluation` (never assessed). They still drive review-domain auto-inclusion, which is why they are selectable at all.
- Loading a specialist injects its full instructions and deactivates the previous role.
- Writes the top-level `domainSpecialist` field in `framework-config.json` through a schema-validating helper, so an invalid value is rejected at write time rather than persisted.
- An unknown name, a dropped specialist, or a path-like value is rejected **before any file is read**, and the config is left untouched.
- Resolves specialist files from both `Base/` and `Pack/`.

## Limitations

- **Deactivation is an instruction, not a removal.** The previous specialist's text stays in the context window until compaction.
- **Repeated switches accumulate.** Each adds roughly 2.3K–3.7K tokens that persist until compaction, so switching several times in one session costs materially more than restarting.
- **Config on disk wins at the next session start.** The switch survives because it is written to config; if that write is skipped or fails, the next session reverts to the specialist already on disk.

## Requirements

- Framework v0.17.0+
- `framework-config.json` in the project root
