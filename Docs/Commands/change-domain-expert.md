# /change-domain-expert

Change the active domain specialist for this project.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[specialist-name]` | No | Specialist name (e.g., `Backend-Specialist`) or list number (e.g., `2`). Presents a numbered menu if omitted. |

## Usage

```
/change-domain-expert
/change-domain-expert Backend-Specialist
/change-domain-expert 2
```

## Key Behaviors

- Valid specialists are the 12 Base Experts: Full-Stack-Developer, Backend-Specialist, Frontend-Specialist, Mobile-Specialist, Desktop-Application-Developer, Embedded-Systems-Engineer, Game-Developer, ML-Engineer, Data-Engineer, Cloud-Solutions-Architect, SRE-Specialist, Systems-Programmer-Specialist.
- Updates three locations: `framework-config.json` (`projectType.domainSpecialist`), `CLAUDE.md` (Domain Specialist line), and `.claude/rules/03-startup.md` (metadata line, file path, and Active Role message).
- Immediately reads and loads the new specialist file into context so it takes effect for the rest of the session.
- Requires Framework v0.17.0+ and an existing `framework-config.json`.
