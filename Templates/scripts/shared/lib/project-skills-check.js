// Rubrical Works (c) 2026
/**
 * @framework-script 0.109.0
 * @description Which `framework-config.json` `projectSkills` entries are missing
 *   on disk? (#3038). Splits the list into `present` and `missing`, a skill being
 *   missing when `.claude/skills/<name>/` is not a directory (an unresolvable
 *   symlink included). Read-only; self-hosted repos are exempt. Consumed by the
 *   startup hook's `Project Skills Missing:` row.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * WHY AFTER THE FACT. `.claude/skills/` is gitignored, so a skill a teammate
 * added through Praxis Hub Manager arrives on this machine as a name in
 * `projectSkills` with no directory behind it. /sync-branch can stop such a pull
 * before it lands (#3033), but a pull made any other way cannot be intercepted;
 * the next session start is where it shows.
 *
 * ONE DEFINITION OF MISSING. `findMissingSkills` is reused from
 * `upstream-upgrade-check.js`, not re-implemented: the startup row and the
 * /sync-branch stop name the same remedy, Praxis Hub Manager's Repair, and
 * both must agree with its Needs Repair badge. A directory without `SKILL.md`
 * is present by that definition, because Repair would not act on it.
 *
 * WHY SELF-HOSTED IS EXEMPT. This repo gitignores `.claude/skills/` too, so the
 * gap exists here, but its skills come from `/fw-import-skills`, not Praxis Hub
 * Manager. A row naming PHM Repair would name the wrong remedy.
 */

'use strict';

const { findMissingSkills } = require('./upstream-upgrade-check.js');

/**
 * @param {object} args
 * @param {string} args.cwd - project root
 * @param {unknown} [args.projectSkills] - the config's `projectSkills`
 * @param {boolean} [args.selfHosted]
 * @returns {{present: string[], missing: string[], exempt: boolean}}
 */
function checkProjectSkills({ cwd, projectSkills, selfHosted = false }) {
  if (selfHosted === true) return { present: [], missing: [], exempt: true };
  const names = Array.isArray(projectSkills)
    ? projectSkills.filter((n) => typeof n === 'string' && n !== '')
    : [];
  const missing = findMissingSkills(cwd, names);
  const present = names.filter((n) => !missing.includes(n));
  return { present, missing, exempt: false };
}

module.exports = { checkProjectSkills };
