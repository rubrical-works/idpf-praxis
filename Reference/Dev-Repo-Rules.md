**Dev Repo Symlink Protection Rules**
**Version:** v0.83.0
**Scope:** Dev framework repos connected to a Praxis hub via symlinks. Does NOT apply to `idpf-praxis-dev` (framework source) or user project repos.
**Symlinked Directories (Read-Only)**
| Directory | Purpose | Managed By |
|-----------|---------|------------|
| `.claude/metadata/` | Registry files (skill, extension points, recipes) | Hub |
| `.claude/rules/` | Auto-loaded rules files | Hub |
| `.claude/scripts/shared/` | Shared utility scripts | Hub |
| `.claude/skills/` | Installed skill files | Hub |
| `.claude/hooks/` | Lifecycle hook scripts | Hub |
**Rules:**
- **NEVER** create, modify, or delete files in symlinked directories
- These directories are shared across all hub-connected projects
- Writing modifies the **hub's** copy, affecting all projects immediately
- Hub files diverge from distribution source; future updates may conflict
**Local Directory Convention**
Use `local-{dir}` naming for repo-specific artifacts:
| Local Directory | Purpose |
|-----------------|---------|
| `.claude/local-metadata/` | Repo-specific metadata files |
| `.claude/local-scripts/` | Repo-specific scripts |
| `.claude/local-data/` | Repo-specific data files |
**Rules:**
- Use `.claude/local-{dir}/` for repo-specific artifacts
- `local-` prefix signals safe to write (not symlinked)
- Add to `.gitignore` if generated content
- Created on demand (not default)
**Quick Reference**
| Action | Allowed? |
|--------|----------|
| Read from `.claude/metadata/` | Yes (symlinked, read-only) |
| Write to `.claude/metadata/` | **No** (hub-managed) |
| Read from `.claude/scripts/shared/` | Yes (symlinked, read-only) |
| Write to `.claude/scripts/shared/` | **No** (hub-managed) |
| Create/write `.claude/local-metadata/` | Yes (repo-specific) |
| Create/write `.claude/local-scripts/` | Yes (repo-specific) |
| Modify `.claude/commands/` | Yes (copied, not symlinked) |
**Self-Hosted Exception:** `idpf-praxis-dev` has `selfHosted: true` and owns `.claude/` directories — these rules do not apply.
**End of Dev Repo Symlink Protection Rules**
