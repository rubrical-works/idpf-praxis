#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.77.0
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
 * - Skill packages are valid zip files
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
  'Skills/Packaged',
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
  const requiredFields = ['name', 'version', 'frameworks', 'skills', 'domainSpecialists'];
  for (const field of requiredFields) {
    if (manifest[field] !== undefined) {
      pass(`Field: ${field}`);
    } else {
      fail(`Field: ${field} — missing`);
    }
  }

  // Version should not contain 0.77.0 placeholder
  if (manifest.version && !manifest.version.includes('{{')) {
    pass(`Version resolved: ${manifest.version}`);
  } else if (manifest.version) {
    fail('Version contains unresolved 0.77.0 placeholder');
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

// 5. Skill packages
section('Skill Packages');

const packagedDir = path.join(ROOT, 'Skills', 'Packaged');
if (fs.existsSync(packagedDir)) {
  const zips = fs.readdirSync(packagedDir).filter(f => f.endsWith('.zip'));

  if (zips.length > 0) {
    pass(`${zips.length} skill package(s) found`);
  } else {
    fail('No .zip files in Skills/Packaged/');
  }

  // Validate zip magic bytes (PK\x03\x04)
  for (const zip of zips) {
    const zipPath = path.join(packagedDir, zip);
    const header = Buffer.alloc(4);
    const fd = fs.openSync(zipPath, 'r');
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);

    if (header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04) {
      pass(`${zip} — valid zip`);
    } else {
      fail(`${zip} — invalid zip header`);
    }
  }
} else {
  fail('Skills/Packaged/ directory missing');
}

// 6. Version placeholder check
section('Version Injection');

const sampleFiles = [
  'audit.js',
  'README.md',
];

for (const file of sampleFiles) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('0.77.0')) {
      fail(`${file} — contains unresolved 0.77.0 placeholder`);
    } else {
      pass(`${file} — no unresolved placeholders`);
    }
  }
}

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
