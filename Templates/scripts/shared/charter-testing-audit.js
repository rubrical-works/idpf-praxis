// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 * charter-testing-audit.js — audit a `testing` declaration without writing it (#2854).
 *
 * #2850 made harness selection MANDATORY: an empty answer is rejected and the
 * prompt re-asked. Correct for a developer at a terminal, unrunnable for CI,
 * which cannot answer a prompt at all. This is the non-interactive half — it
 * compares the declaration against the merged registry and the detected stack
 * and reports drift through an EXIT STATUS, the one channel a CI job can act
 * on. Exit 0 = clean, 1 = drift, 2 = bad arguments.
 *
 * IT NEVER WRITES AND NEVER PROMPTS. That is what makes it safe to run in CI:
 * it cannot change what it is auditing.
 *
 * THE KEY MAPPING IS THE LOAD-BEARING PART, and it is reported rather than
 * applied silently. `detectTechStack()` returns from a fixed vocabulary of
 * seven — node, python, go, rust, java, ruby, mobile — while the registry is
 * keyed typescript, javascript, python, go, rust, java, kotlin, csharp in its
 * `languages` group and mobile in its `platforms` group. Indexing one by the
 * other directly yields FOUR hits and misses every JavaScript and TypeScript
 * project, which would report zero pairs, exit 0, and call every such project
 * clean. A silent empty result is indistinguishable from no drift, so the
 * envelope names the mapping it used and the techs it could not map.
 *
 * TWO MAPS, NOT ONE (#2900): TECH_TO_LANGUAGES and TECH_TO_PLATFORMS. A tech
 * may be claimed by either or both — a React Native project is `node` and
 * `mobile` — and `unmappable` means neither claimed it.
 *
 * Node built-ins and colocated files only, per the runtime dependency contract
 * in `04-deployment-awareness.md`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * `detectTechStack` tech -> registry language keys.
 *
 * `node` fans out to BOTH, deliberately: a `package.json` cannot tell us which
 * of the two a project writes, and offering the union is the honest answer —
 * narrowing it would silently drop one.
 *
 * `ruby` maps to nothing because the shipped registry carries no ruby entry
 * (#2847). That is reported as `unmappable`, not dropped: a Ruby project must
 * learn the registry has nothing for it rather than be told it is clean.
 * `kotlin` and `csharp` are in the registry but are undetectable, so they can
 * only ever arrive from an explicit declaration.
 */
const TECH_TO_LANGUAGES = Object.freeze({
  node: ['javascript', 'typescript'],
  python: ['python'],
  go: ['go'],
  rust: ['rust'],
  java: ['java'],
  ruby: [],
});

/**
 * `detectTechStack` tech -> registry PLATFORM keys (#2900).
 *
 * Separate from TECH_TO_LANGUAGES because the registry has two groups and a
 * platform is not a language: `mobile` names the surface a project targets,
 * not what it is written in, so a React Native project maps through BOTH maps
 * and is audited for its language pairs and its platform pairs alike.
 *
 * Without this map `mobile` has no TECH_TO_LANGUAGES entry, lands in
 * `unmappable`, and the audit warns that no harness can be offered for it —
 * while the registry ships three mobile e2e harnesses. That is the opposite
 * of what this issue delivers.
 */
const TECH_TO_PLATFORMS = Object.freeze({
  mobile: ['mobile'],
});

/** Roles a project is audited for. */
const AUDITED_ROLES = Object.freeze(['unit', 'e2e']);

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Vendored glob matcher, matching test-runner.js and scope-drift-check.js. */
function globToRegex(pattern) {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i += 2;
        if (pattern[i] === '/') i++;
      } else {
        re += '[^/]*';
        i++;
      }
    } else if ('.+^$()|{}[]\\'.includes(c)) {
      re += '\\' + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp(re + '$');
}

/** Project files, relative and forward-slashed, skipping noise directories. */
function walk(root, dir = root, out = [], depth = 0) {
  if (depth > 8 || out.length > 5000) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, full, out, depth + 1);
    else out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

function parseArgs(argv) {
  const out = { cwd: process.cwd(), schema: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cwd' && argv[i + 1]) out.cwd = argv[++i];
    else if (argv[i] === '--schema') out.schema = true;
    else if (argv[i].startsWith('--')) out.unknown = argv[i];
  }
  return out;
}

/**
 * Audit a project root.
 *
 * @returns {{verdict: 'clean'|'drift', detected: object, newlyGained: object[],
 *   orphaned: object[], provenance: object, warnings: string[]}}
 *   NEVER THROWS — an unreadable project reports rather than crashing, because
 *   a crash in CI is indistinguishable from a tooling failure.
 */
function audit(cwd) {
  const warnings = [];

  let techs = [];
  try {
    ({ detectTechStack: techs } = { detectTechStack: require('./lib/detect-tech-stack.js').detectTechStack(cwd) });
  } catch (err) {
    warnings.push(`Tech-stack detection failed: ${String(err.message).split('\n')[0]}`);
    techs = [];
  }

  const languages = [];
  const platforms = [];
  const unmappable = [];
  for (const tech of techs) {
    // A tech may map onto a language, a platform, or both — `unmappable` means
    // NEITHER map claimed it, which is still true of ruby (a registry with no
    // ruby entry) and must keep being reported rather than silently dropped.
    const toLanguages = TECH_TO_LANGUAGES[tech];
    const toPlatforms = TECH_TO_PLATFORMS[tech];
    let claimed = false;
    if (Array.isArray(toLanguages) && toLanguages.length > 0) {
      for (const l of toLanguages) if (!languages.includes(l)) languages.push(l);
      claimed = true;
    }
    if (Array.isArray(toPlatforms) && toPlatforms.length > 0) {
      for (const p of toPlatforms) if (!platforms.includes(p)) platforms.push(p);
      claimed = true;
    }
    if (!claimed) unmappable.push(tech);
  }
  if (unmappable.length > 0) {
    warnings.push(
      `Detected ${unmappable.join(', ')} with no shipped registry entry — no harnesses can be `
      + `offered for it, so its roles are not audited.`
    );
  }

  let merged = { languages: {}, platforms: {} };
  let mergeReport = { warnings: [], unknownRoles: [], unknownKeys: [], added: 0, replaced: 0, hidden: 0 };
  try {
    const registry = require('./lib/harness-registry.js');
    ({ merged, report: mergeReport } = registry.loadMergedRegistry(cwd));
    warnings.push(...(mergeReport.warnings || []));
  } catch (err) {
    warnings.push(`Registry merge failed: ${String(err.message).split('\n')[0]}`);
  }

  let suites = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(cwd, 'framework-config.json'), 'utf8'));
    if (isPlainObject(cfg.testing) && Array.isArray(cfg.testing.suites)) suites = cfg.testing.suites;
    else warnings.push('No `testing.suites[]` is declared — every detected pair is newly gained.');
  } catch (err) {
    warnings.push(`framework-config.json could not be read: ${String(err.message).split('\n')[0]}`);
  }

  // ATTRIBUTION: a suite records NO key. `testing.suites[]` is
  // `additionalProperties: false` with properties id/role/match/full/scoped/
  // prepare/sweep/execution/kind/cwd/note (#2849) — no language and no
  // platform among them — so the only link from a suite back to a registry
  // key is the harness `id`. Reverse-index the merged registry rather than
  // parsing the id's prefix: a locally-contributed harness (#2848) may use
  // any id it likes, and a prefix convention is not a contract.
  const idToKeys = new Map();
  for (const group of ['languages', 'platforms']) {
    for (const [key, roles] of Object.entries(merged[group] || {})) {
      for (const arr of Object.values(roles || {})) {
        for (const h of (Array.isArray(arr) ? arr : [])) {
          if (!isPlainObject(h) || !h.id) continue;
          if (!idToKeys.has(h.id)) idToKeys.set(h.id, []);
          idToKeys.get(h.id).push(key);
        }
      }
    }
  }

  // Newly-gained: a detected (key x role) with neither a suite in that role
  // nor a "none applicable" record standing in for one.
  //
  // PER KEY, NEVER GLOBALLY (#2900). The previous form was a flat Set over
  // every suite with the skip inside the per-language loop, so ONE declared
  // suite suppressed that role's finding for EVERY key at once — a React
  // Native project declaring Playwright for its web surface audited `clean`
  // while having no mobile harness at all, which is the exact case this
  // audit exists to catch.
  const knownKeys = new Set([
    ...Object.keys(merged.languages || {}),
    ...Object.keys(merged.platforms || {}),
  ]);
  const rolesDeclared = new Map();
  const globalRoles = new Set();
  const unattributedSuites = [];
  const declareFor = (key, role) => {
    if (!rolesDeclared.has(key)) rolesDeclared.set(key, new Set());
    rolesDeclared.get(key).add(role);
  };
  for (const s of suites) {
    if (!isPlainObject(s) || !s.role) continue;

    // A "none applicable" record is the spec's SANCTIONED answer — "a record,
    // not a silence" — so it must be able to satisfy the audit. It names no
    // harness, so it has no registry id to attribute by; since #2900 the
    // charter writes its key into the id as `none-<key>-<role>`.
    if (/none applicable/i.test(String(s.note || ''))) {
      const m = /^none-(.+)-(?:unit|e2e)$/.exec(String(s.id || ''));
      if (m && knownKeys.has(m[1])) { declareFor(m[1], s.role); continue; }
      // LEGACY: a record written before #2900 carries `none-<role>` and cannot
      // say which key it answered for. It keeps the old global suppression
      // rather than silently ceasing to work — a project is not made to fail
      // an audit by an id format that did not exist when it was written.
      globalRoles.add(s.role);
      continue;
    }

    const keys = idToKeys.get(s.id) || [];
    if (keys.length === 0) { unattributedSuites.push({ id: s.id, role: s.role }); continue; }
    for (const key of keys) declareFor(key, s.role);
  }
  // A suite whose id is in no registry — a "None of these" harness — suppresses
  // NOTHING, and is named rather than silently ignored. Suppressing every key
  // on its behalf is the defect above; suppressing none without saying so
  // would leave a project unable to explain why its pairs read newly-gained.
  if (unattributedSuites.length > 0) {
    warnings.push(
      `Suite(s) ${unattributedSuites.map((s) => s.id).join(', ')} match no harness id in the merged `
      + `registry, so they cannot be attributed to a language or platform and suppress no finding. `
      + `A suite records no key, so a locally-authored harness is unattributable by construction.`
    );
  }

  const declares = (key, role) =>
    globalRoles.has(role) || Boolean(rolesDeclared.get(key)?.has(role));
  const newlyGained = [];
  for (const language of languages) {
    for (const role of AUDITED_ROLES) {
      if (declares(language, role)) continue;
      const offered = ((merged.languages || {})[language] || {})[role] || [];
      newlyGained.push({ key: language, group: 'language', role, optionsAvailable: offered.length });
    }
  }
  for (const platform of platforms) {
    const offered = (merged.platforms || {})[platform] || {};
    for (const role of AUDITED_ROLES) {
      // A PLATFORM IS AUDITED ONLY FOR THE ROLES IT DECLARES. AUDITED_ROLES is
      // [unit, e2e] while `platforms.mobile` offers only `e2e`, so iterating
      // the full role set would emit a spurious (mobile, unit) pair with zero
      // options available — a finding no harness could ever answer and no
      // user could ever resolve.
      //
      // Languages are deliberately NOT filtered this way. A language with no
      // harness in a role is a real gap the charter still prompts for (#2850:
      // "a role with zero shipped and zero local harnesses still prompts"),
      // which is why `optionsAvailable` can legitimately read 0 there. The
      // difference is that a language is always audited for both roles, while
      // a platform's role set is whatever the registry gives it.
      if (!Array.isArray(offered[role])) continue;
      if (declares(platform, role)) continue;
      newlyGained.push({
        key: platform, group: 'platform', role, optionsAvailable: offered[role].length,
      });
    }
  }

  // Orphaned: a suite whose match[] matches no file. A record with NO match[]
  // is excluded — that is the "none applicable" record #2850 writes, valid
  // because #2849 requires match[] only of gate suites, and it declares no
  // files to match.
  const files = walk(cwd);
  const orphaned = [];
  for (const s of suites) {
    if (!isPlainObject(s) || !Array.isArray(s.match) || s.match.length === 0) continue;
    const hit = s.match.some((p) => {
      const re = globToRegex(p);
      return files.some((f) => re.test(f));
    });
    // Reported by the fields the declaration actually holds. #2849 puts no
    // language on a suite and none is derived from globs.
    if (!hit) orphaned.push({ id: s.id, role: s.role, match: s.match });
  }

  const provenance = {
    // Both groups (#2900). Naming only the language keys understated what the
    // registry ships and made a mobile entry invisible to anyone reading the
    // provenance to find out what was available.
    shipped: [
      ...Object.keys(merged.languages || {}),
      ...Object.keys(merged.platforms || {}),
    ],
    localAdded: mergeReport.added || 0,
    localReplaced: mergeReport.replaced || 0,
    hidden: mergeReport.hidden || 0,
    unknownRoles: mergeReport.unknownRoles || [],
    unknownKeys: mergeReport.unknownKeys || [],
  };

  const verdict = (newlyGained.length === 0 && orphaned.length === 0) ? 'clean' : 'drift';

  return {
    verdict,
    detected: {
      techs,
      mappedTo: languages,
      mappedToPlatforms: platforms,
      unmappable,
      mapping: TECH_TO_LANGUAGES,
      platformMapping: TECH_TO_PLATFORMS,
    },
    newlyGained,
    orphaned,
    unattributedSuites,
    provenance,
    warnings,
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  if (args.schema) {
    console.log(JSON.stringify({
      verdict: "'clean' | 'drift'",
      detected: 'techs from detectTechStack, mappedTo registry languages, mappedToPlatforms, unmappable, mapping',
      newlyGained: "[{key, group: 'language'|'platform', role, optionsAvailable}]",
      orphaned: '[{id, role, match}]',
      unattributedSuites: '[{id, role}] — suite ids in no registry; they suppress no finding',
      provenance: '{shipped (languages + platforms), localAdded, localReplaced, hidden, unknownRoles, unknownKeys}',
      exitCodes: { 0: 'clean', 1: 'drift', 2: 'bad arguments' },
    }, null, 2));
    process.exit(0);
  }

  if (args.unknown) {
    console.error(`Unrecognised argument ${args.unknown}. Valid form: charter-testing-audit.js [--cwd <path>] [--schema]`);
    process.exit(2);
  }

  const result = audit(args.cwd);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verdict === 'clean' ? 0 : 1);
}

module.exports = { audit, TECH_TO_LANGUAGES, TECH_TO_PLATFORMS, AUDITED_ROLES };
