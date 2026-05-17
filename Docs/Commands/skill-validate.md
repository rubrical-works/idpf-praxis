# /skill-validate

Validate all skills for release readiness — inventory, packages, and cross-references.

## Arguments

None.

## Usage

```
/skill-validate
```

## Key Behaviors

- Framework-only command — not deployed to users; run before a release to ensure skills are consistent
- Verifies a 1:1 match between source directories (`Skills/*/`), minimized directories (`.min-mirror/Skills/*/`), and packaged zip files (`Skills/Packaged/*.zip`)
- Checks each package for valid YAML frontmatter, a `LICENSE.txt` file, and the presence of any required `resources/` directory
- Critical check: confirms no `v0.92.0` placeholders remain in any package; if found, `/minimize-files` must be re-run
- Validates `FRAMEWORK_SKILLS` and `VIBE_VARIANT_SKILLS` mappings in `constants.js` against the `Skills/MAINTENANCE.md` dependency matrix
- Cross-checks skill counts in `Framework-Overview.md`, `Framework-Summary.md`, and `MAINTENANCE.md` against actual directory counts; reports any mismatches
