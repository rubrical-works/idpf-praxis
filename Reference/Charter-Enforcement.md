# Charter Enforcement
**Version:** v0.115.0
Charter scope is checked where work is created, not by this rule. `/proposal`, `/enhancement`, `/create-backlog`, `/add-story` and `/create-prd` run `.claude/scripts/shared/lib/charter-scope.js` (template detection: `.claude/scripts/shared/lib/charter-template.js`); reviews apply the `charter-alignment` criterion. Checkpoints, resolution options and exclusions: `.claude/metadata/charter-enforcement.json`. Opt out with a `.no-charter-enforcement` file.
**End of Charter Enforcement**
