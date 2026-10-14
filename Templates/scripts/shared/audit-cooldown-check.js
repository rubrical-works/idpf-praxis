#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.107.0
 *
 * Cooldown-aware npm audit gate (#2537; deployed to user projects by #3016).
 *
 * Replaces a bare `npm audit --audit-level=high` in CI. That gate is
 * structurally incompatible with the `.npmrc` `min-release-age` cooldown
 * (#2481): npm refuses to resolve anything published in the last N days, so
 * every fresh advisory blocks CI for up to N days even when the correct action
 * is simply to wait for the patch to age. Because the audit step runs under
 * `bash -e` ahead of the test steps, that also masks every test result.
 *
 * Decision, per advisory with a candidate fix:
 *
 *   | candidate fix        | age vs cooldown | verdict          | exit |
 *   |----------------------|-----------------|------------------|------|
 *   | none                 | —               | fail-unfixable   | 1    |
 *   | some, all too new    | < min-release-age | defer-cooldown | 0    |
 *   | some, any aged out   | >= min-release-age | fail-actionable | 1  |
 *   | some, age unknown    | —               | fail-actionable  | 1    |
 *
 * Deferral requires *every* candidate fix to be inside the window. A mixed set
 * fails: the aged-out one is actionable today and must not hide behind the
 * others. An unknown publish date also fails — deferring on a registry lookup
 * failure would let a network hiccup silence the gate.
 *
 * **Why publish dates and not two dry-runs.** The obvious implementation
 * compares `npm audit fix --dry-run` against the same command with
 * `--min-release-age 0`, treating a fix that appears only in the second as
 * cooldown-blocked. That was implemented and abandoned: running
 * `npm audit --json` beforehand changes what the subsequent dry-run reports
 * (0 changes standalone, 2 changes after an audit call), so the difference
 * reflects npm invocation order rather than the cooldown. Publish dates are
 * order-independent.
 *
 * **The project root is the working directory, never this file's location.**
 * In a user project `.claude/scripts/shared/` is a symlink into the hub
 * framework root, so `__dirname` resolves to the hub: reading `.npmrc` and
 * `node_modules` from there audits the framework bundle instead of the project
 * (the px-manager#947 class of defect). `--root <dir>` overrides the working
 * directory for callers that run it from elsewhere. Every npm invocation runs
 * with that root as its cwd for the same reason.
 *
 * Deployed shared script: Node built-ins only, per the runtime dependency
 * contract in `04-deployment-awareness.md`. `/ci add dependency-audit` copies
 * this file into the project (`.github/scripts/`) because the symlinked
 * `.claude/scripts/shared/` tree does not exist on a CI runner; this repo's
 * own `test.yml` runs it from here directly.
 *
 * CLI:
 *   node audit-cooldown-check.js [--json] [--root <dir>]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DAY_MS = 24 * 60 * 60 * 1000;

// execSync (a shell) rather than execFileSync: on Windows npm is a .cmd shim
// and Node's CVE-2024-27980 hardening makes spawnSync refuse to exec .cmd
// without a shell (EINVAL). Linux CI does not need it; Windows dev does.
const NPM = 'npm';

/**
 * Read `min-release-age` out of an .npmrc body.
 *
 * @param {string} contents Raw .npmrc text.
 * @returns {number} Cooldown in days; 0 when unset or commented out.
 */
function parseMinReleaseAge(contents) {
  if (!contents) return 0;
  for (const line of String(contents).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const m = trimmed.match(/^min-release-age\s*=\s*(\d+)/);
    if (m) return Number(m[1]);
  }
  return 0;
}

/**
 * Days elapsed since a publish timestamp.
 *
 * @param {string|null|undefined} publishedAt ISO timestamp.
 * @param {string|number|Date} now Reference time.
 * @returns {number|null} Age in days, or null when the date is unusable.
 */
function ageInDays(publishedAt, now) {
  if (!publishedAt) return null;
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return null;
  const ref = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (Number.isNaN(ref)) return null;
  return (ref - t) / DAY_MS;
}

/**
 * The date a version becomes resolvable under the cooldown.
 *
 * @param {string|null|undefined} publishedAt ISO publish timestamp.
 * @param {number} minReleaseAge Cooldown in days.
 * @returns {string|null} `YYYY-MM-DD`, or null when the date is unknown.
 */
function clearsAt(publishedAt, minReleaseAge) {
  if (!publishedAt) return null;
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return null;
  return new Date(t + minReleaseAge * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Compare two semver strings numerically.
 *
 * Only ordering is needed, not full semver semantics. A prerelease sorts below
 * its release so `pickCandidate` never proposes `6.0.0-rc.1` as a fix.
 *
 * @returns {number} <0, 0, or >0
 */
function compareVersions(a, b) {
  const split = (v) => {
    const [core, pre] = String(v).split('-');
    return { parts: core.split('.').map((n) => parseInt(n, 10) || 0), pre: pre || null };
  };
  const A = split(a);
  const B = split(b);
  for (let i = 0; i < 3; i++) {
    const d = (A.parts[i] || 0) - (B.parts[i] || 0);
    if (d !== 0) return d;
  }
  if (A.pre && !B.pre) return -1;
  if (!A.pre && B.pre) return 1;
  return 0;
}

/**
 * Upper bound of an npm advisory's vulnerable range.
 *
 * npm emits `"4.0.0 - 5.0.8"`, `"<=5.0.8"`, `"<5.0.9"`, `">=1.0.0 <2.0.0"`,
 * or `"*"`. Only the top of the range matters: the fix is the first published
 * version above it.
 *
 * @param {string|null} range
 * @returns {{version:string, inclusive:boolean}|null} null when undeterminable
 *   — `"*"` means every version is vulnerable, which is emphatically not the
 *   same as "cooldown-blocked".
 */
function parseUpperBound(range) {
  if (!range || typeof range !== 'string') return null;
  const r = range.trim();
  if (r === '*' || r === '') return null;

  const hyphen = r.match(/^\s*[\d.]+\S*\s+-\s+(\d[\w.-]*)\s*$/);
  if (hyphen) return { version: hyphen[1], inclusive: true };

  const lte = r.match(/<=\s*(\d[\w.-]*)/);
  if (lte) return { version: lte[1], inclusive: true };

  const lt = r.match(/<\s*(\d[\w.-]*)/);
  if (lt) return { version: lt[1], inclusive: false };

  return null;
}

/**
 * Lowest published version that clears the vulnerable range.
 *
 * @param {string[]} versions All published versions.
 * @param {{version:string, inclusive:boolean}|null} bound
 * @returns {string|null}
 */
function pickCandidate(versions, bound) {
  if (!bound || !Array.isArray(versions)) return null;
  const clears = (v) => {
    const c = compareVersions(v, bound.version);
    return bound.inclusive ? c > 0 : c >= 0;
  };
  const eligible = versions
    .filter((v) => !String(v).includes('-'))   // no prereleases
    .filter(clears)
    .sort(compareVersions);
  return eligible.length ? eligible[0] : null;
}

/**
 * Decide the gate outcome. Pure — all I/O is done by the caller.
 *
 * @param {object} input
 * @param {number} input.highCount High/critical advisories found.
 * @param {Array<{name:string,from:string,to:string,publishedAt:?string}>} input.fixes
 * @param {number} input.minReleaseAge Cooldown in days.
 * @param {string|Date} input.now Reference time.
 * @returns {{verdict:string, exitCode:number, message:string}}
 */
function classifyAudit({ highCount, fixes = [], minReleaseAge = 0, now }) {
  if (!highCount) {
    return {
      verdict: 'pass',
      exitCode: 0,
      message: 'npm audit: no high-severity advisories.'
    };
  }

  if (!fixes.length) {
    return {
      verdict: 'fail-unfixable',
      exitCode: 1,
      message:
        `npm audit: ${highCount} high-severity advisory(ies) with no candidate fix. ` +
        'This needs a dependency change or an explicit override — it will not age out.'
    };
  }

  const describe = (f) => {
    const age = ageInDays(f.publishedAt, now);
    return { ...f, age, when: clearsAt(f.publishedAt, minReleaseAge) };
  };
  const described = fixes.map(describe);

  // Blocked only when the cooldown is active AND the version is younger than it.
  const blocked = described.filter(
    (f) => minReleaseAge > 0 && f.age !== null && f.age < minReleaseAge
  );
  const available = described.filter((f) => !blocked.includes(f));

  if (available.length) {
    const lines = available.map((f) => {
      if (f.age === null) {
        return `  - ${f.name} ${f.from} => ${f.to} (publish date unavailable — treated as installable)`;
      }
      return `  - ${f.name} ${f.from} => ${f.to} (published ${f.age.toFixed(1)} days ago)`;
    });
    return {
      verdict: 'fail-actionable',
      exitCode: 1,
      message:
        `npm audit: ${highCount} high-severity advisory(ies); ` +
        `${available.length} fix(es) installable now.\n` +
        lines.join('\n') + '\n' +
        'Run `npm audit fix` and commit the lockfile.'
    };
  }

  const lines = blocked.map(
    (f) => `  - ${f.name} ${f.from} => ${f.to}` +
      (f.when ? ` (resolvable from ${f.when})` : '')
  );
  return {
    verdict: 'defer-cooldown',
    exitCode: 0,
    message:
      `npm audit: ${highCount} high-severity advisory(ies) DEFERRED — every candidate fix ` +
      `is inside the ${minReleaseAge}-day .npmrc cooldown (#2481) and cannot be resolved yet. ` +
      'Not a test failure.\n' +
      lines.join('\n') + '\n' +
      'Re-run once they age out, or use the documented escape hatch ' +
      '(`npm i --min-release-age 0 <pkg>@<version>`) if the advisory warrants it.'
  };
}

// ─── I/O (used only by main) ────────────────────────────────

/**
 * Extract the JSON document from an npm stdout body.
 *
 * `npm audit fix --json` prints human progress lines ("change fast-uri 3.1.4
 * => 3.1.5") to stdout *ahead of* the JSON, so parsing the raw body fails.
 */
function extractJson(body) {
  if (!body) return null;
  const s = String(body);
  const start = s.search(/[{[]/);
  if (start === -1) return null;
  try { return JSON.parse(s.slice(start)); } catch (_e) { return null; }
}

function npmJson(args, cwd) {
  // A single command string rather than (file, args[]) with shell:true, which
  // triggers DEP0190. Every token is a literal defined in this file or a
  // package name npm itself reported — no caller input reaches the shell.
  const cmd = `${NPM} ${args.join(' ')}`;
  try {
    return extractJson(execSync(cmd, {
      cwd, encoding: 'utf8', maxBuffer: 1e8, timeout: 180000,
      stdio: ['ignore', 'pipe', 'ignore']
    }));
  } catch (err) {
    // npm exits non-zero whenever it finds anything; the report is still on
    // stdout. Only a genuinely unparseable body is an error.
    return extractJson(err && err.stdout);
  }
}

function countHigh(auditJson) {
  const vulns = (auditJson && auditJson.vulnerabilities) || {};
  return Object.values(vulns)
    .filter((v) => v && (v.severity === 'high' || v.severity === 'critical'))
    .length;
}

/**
 * Candidate fix per vulnerable package, derived from the advisory's own range
 * plus the registry's version list.
 *
 * Deliberately not `npm audit fix --dry-run --json --min-release-age 0`: that
 * flag needs npm >= 11.10.0, so it silently yields nothing on the npm 10.x
 * bundled with Node 20 — which is what CI runs. The first CI run of this gate
 * failed `fail-unfixable` for exactly that reason while passing locally on
 * npm 11.12.0. Advisory ranges and publish dates are the same on every npm.
 *
 * @param {object} auditJson Parsed `npm audit --json`.
 * @param {string} root Project root — where `node_modules` lives and npm runs.
 * @returns {Array<{name,from,to,publishedAt}>}
 */
function candidateFixes(auditJson, root) {
  const vulns = (auditJson && auditJson.vulnerabilities) || {};
  const out = [];
  for (const [name, v] of Object.entries(vulns)) {
    if (!v || (v.severity !== 'high' && v.severity !== 'critical')) continue;
    if (v.fixAvailable === false) continue;

    const bound = parseUpperBound(v.range);
    const meta = npmJson(['view', name, 'versions', 'time', '--json'], root) || {};
    const versions = meta.versions || [];
    const times = meta.time || {};
    const to = pickCandidate(versions, bound);
    if (!to) continue;

    out.push({
      name,
      from: (v.nodes && v.nodes.length ? installedVersionOf(name, root) : null) || 'installed',
      to,
      publishedAt: times[to] || null
    });
  }
  return out;
}

/**
 * Installed version of a package under the project root, or null.
 *
 * Read from disk rather than `require`d: a require resolves relative to THIS
 * file, which in a user project sits in the hub, and the require cache would
 * pin the first answer for the process.
 *
 * @param {string} name Package name as npm reported it.
 * @param {string} root Project root.
 * @returns {string|null}
 */
function installedVersionOf(name, root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(
      path.join(root, 'node_modules', name, 'package.json'), 'utf8'
    ));
    return pkg.version || null;
  } catch (_e) {
    return null;
  }
}

/**
 * The project root: `--root <dir>` / `--root=<dir>` when given, else the working
 * directory. Never derived from `__dirname` — see the header.
 *
 * @param {string[]} argv Arguments after the script path.
 * @param {string} cwd Working directory to default to.
 * @returns {string} Absolute path.
 */
function resolveProjectRoot(argv, cwd) {
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a === '--root') {
      const v = args[i + 1];
      if (!v || String(v).startsWith('--')) throw new Error('--root requires a directory');
      return path.resolve(cwd, String(v));
    }
    if (a.startsWith('--root=')) {
      const v = a.slice('--root='.length);
      if (!v) throw new Error('--root requires a directory');
      return path.resolve(cwd, v);
    }
  }
  return path.resolve(cwd);
}

/**
 * `min-release-age` from the project's `.npmrc`; 0 when there is none.
 *
 * @param {string} root Project root.
 * @returns {number}
 */
function readMinReleaseAge(root) {
  let npmrc = '';
  try { npmrc = fs.readFileSync(path.join(root, '.npmrc'), 'utf8'); } catch (_e) { /* none */ }
  return parseMinReleaseAge(npmrc);
}

function main() {
  let root;
  try {
    root = resolveProjectRoot(process.argv.slice(2), process.cwd());
  } catch (err) {
    console.error(`npm audit: ${err.message}`);
    process.exit(2);
  }
  const minReleaseAge = readMinReleaseAge(root);

  const audit = npmJson(['audit', '--json'], root);
  if (audit === null) {
    console.error('npm audit: could not obtain a parseable report — failing closed.');
    process.exit(1);
  }

  const highCount = countHigh(audit);
  const fixes = highCount ? candidateFixes(audit, root) : [];

  const result = classifyAudit({
    highCount, fixes, minReleaseAge, now: new Date()
  });

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...result, highCount, minReleaseAge, fixes }, null, 2));
  } else {
    (result.exitCode === 0 ? console.log : console.error)(result.message);
  }
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = {
  classifyAudit, parseMinReleaseAge, clearsAt, ageInDays, countHigh,
  compareVersions, parseUpperBound, pickCandidate,
  resolveProjectRoot, readMinReleaseAge, installedVersionOf
};
