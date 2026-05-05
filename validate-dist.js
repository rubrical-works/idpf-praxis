#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.0
 * validate-dist.js - Distribution integrity validator
 *
 * Validates that the distribution package is complete and consistent.
 * Runs in CI on the public idpf-praxis repo after each deploy.
 *
 * Checks:
 * - Required directories exist
 * - Required root files exist
 * - framework-manifest.json is valid and has expected fields
 * - checksums.json entries match actual files
 * - Skills are distributed separately via idpf-praxis-skills repo
 *
 * Exit code 0 = all checks pass, 1 = failures found
 *
 * @module validate-dist
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.dirname(process.argv[1]);

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  PASS  ${msg}`);
  passed++;
}

function fail(msg) {
  console.error(`  FAIL  ${msg}`);
  failed++;
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

// 1. Required directories
section('Required Directories');

const requiredDirs = [
  'IDPF-Agile',
  'IDPF-Vibe',
  'Overview',
  'Reference',
  'System-Instructions',
  'Assistant',
  'Templates',
  'Domains',
  '.claude/metadata',
];

for (const dir of requiredDirs) {
  const fullPath = path.join(ROOT, dir);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    pass(dir);
  } else {
    fail(`${dir} — directory missing`);
  }
}

// 2. Required root files
section('Required Files');

const requiredFiles = [
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'SECURITY.md',
  'audit.js',
  'validate-dist.js',
  'framework-manifest.json',
  'package.json',
  'checksums.json',
];

for (const file of requiredFiles) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    pass(file);
  } else {
    fail(`${file} — file missing`);
  }
}

// 3. framework-manifest.json validity
section('Framework Manifest');

const manifestPath = path.join(ROOT, 'framework-manifest.json');
let manifest = null;

try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  pass('Valid JSON');
} catch (e) {
  fail(`Invalid JSON — ${e.message}`);
}

if (manifest) {
  const requiredFields = ['name', 'version', 'frameworks', 'domainSpecialists'];
  for (const field of requiredFields) {
    if (manifest[field] !== undefined) {
      pass(`Field: ${field}`);
    } else {
      fail(`Field: ${field} — missing`);
    }
  }

  // Version should not contain placeholder
  const TAG = '{' + '{VERSION}' + '}';
  if (manifest.version && !manifest.version.includes('{{')) {
    pass(`Version resolved: ${manifest.version}`);
  } else if (manifest.version) {
    fail(`Version contains unresolved ${TAG} placeholder`);
  }
}

// 4. checksums.json integrity
section('Checksums Integrity');

const checksumsPath = path.join(ROOT, 'checksums.json');
let checksums = null;

try {
  checksums = JSON.parse(fs.readFileSync(checksumsPath, 'utf8'));
  pass('Valid JSON');
} catch (e) {
  fail(`Invalid JSON — ${e.message}`);
}

if (checksums && checksums.files) {
  let checked = 0;
  let mismatches = 0;
  let missing = 0;

  for (const entry of checksums.files) {
    const entryPath = entry.relativePath || entry.path;
    if (!entryPath) {
      fail('Checksum entry missing path/relativePath field');
      missing++;
      continue;
    }
    const filePath = path.join(ROOT, entryPath);

    if (!fs.existsSync(filePath)) {
      fail(`${entryPath} — referenced in checksums but missing`);
      missing++;
      continue;
    }

    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    if (hash === entry.sha256) {
      checked++;
    } else {
      fail(`${entryPath} — checksum mismatch`);
      mismatches++;
    }
  }

  if (missing === 0 && mismatches === 0) {
    pass(`All ${checked} file checksums verified`);
  }
} else if (checksums) {
  fail('checksums.json missing "files" array');
}

// 5. Skills — distributed separately via idpf-praxis-skills repo (no local validation)

// 6. Version placeholder check
section('Version Injection');

const sampleFiles = [
  'audit.js',
  'README.md',
];

const PLACEHOLDER = '{' + '{VERSION}' + '}';
for (const file of sampleFiles) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes(PLACEHOLDER)) {
      fail(`${file} — contains unresolved ${PLACEHOLDER} placeholder`);
    } else {
      pass(`${file} — no unresolved placeholders`);
    }
  }
}

// 6. Runtime npm dependencies — every entry in framework-manifest.json
//    runtimeNpmDependencies must have a matching `node_modules/<pkg>/package.json`
//    installed in the dist tree, and the installed version must satisfy the
//    declared semver range. Introduced #2378 — catches the class of failure
//    where `npm ci --omit=dev` silently dropped a declared runtime dep
//    (e.g. ajv absent from `dist/node_modules/` at deploy time).
section('Runtime npm Dependencies');

try {
  const manifestPath = path.join(ROOT, 'framework-manifest.json');
  const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const runtimeDeps = manifestJson.runtimeNpmDependencies || {};
  const declaredPkgs = Object.keys(runtimeDeps);

  if (declaredPkgs.length === 0) {
    pass('(no runtimeNpmDependencies declared — skipping installed-version check)');
  } else {
    for (const pkgName of declaredPkgs) {
      const installedPkgJsonPath = path.join(ROOT, 'node_modules', pkgName, 'package.json');
      if (!fs.existsSync(installedPkgJsonPath)) {
        fail(`${pkgName} — declared in manifest runtimeNpmDependencies but node_modules/${pkgName}/package.json missing`);
        continue;
      }
      try {
        const installedVersion = JSON.parse(fs.readFileSync(installedPkgJsonPath, 'utf8')).version;
        // Minimum check: the installed version major must match the declared range's major.
        const declaredRange = runtimeDeps[pkgName];
        const declaredMajor = (declaredRange.match(/\d+/) || [null])[0];
        const installedMajor = (installedVersion.match(/^(\d+)/) || [null, null])[1];
        if (declaredMajor && installedMajor && declaredMajor !== installedMajor) {
          fail(`${pkgName} — declared ${declaredRange} but installed ${installedVersion} (major mismatch)`);
        } else {
          pass(`${pkgName}@${installedVersion} (declared ${declaredRange})`);
        }
      } catch (e) {
        fail(`${pkgName} — could not read installed package.json: ${e.message}`);
      }
    }
  }
} catch (e) {
  fail(`Runtime npm deps check failed: ${e.message}`);
}

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
