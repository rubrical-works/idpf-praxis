// Rubrical Works (c) 2026
/**
 * @framework-script 0.89.0
 * Bulk-discover screens from project source for /catalog-screens --init.
 *
 * Scans Svelte/React/Vue source. Auto-detects kind from path patterns:
 *   pages: routes/, pages/, views/
 *   wizard: directory name contains 'wizard'
 *   step: parent path contains 'wizard' AND name matches step\d+
 *   section: lib/sections/ or section in path
 *   modal: name contains 'Modal'
 *   component: lib/components/, components/
 *
 * Detects navigation edges from import statements pointing at
 * other screen-kind files within the scanned source tree.
 *
 * Refs #2340 (PRD #2333 — Screen Design Pipeline)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE_EXTENSIONS = new Set(['.svelte', '.tsx', '.jsx', '.vue']);

function walk(root, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const ent of entries) {
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      walk(full, results);
    } else if (SOURCE_EXTENSIONS.has(path.extname(ent.name))) {
      results.push(full);
    }
  }
  return results;
}

function classifyKind(filePath) {
  const lower = filePath.toLowerCase().replace(/\\/g, '/');
  const base = path.basename(filePath);
  const baseLower = base.toLowerCase();

  if (baseLower.includes('modal')) return 'modal';

  // Step: parent dir path contains 'wizard' and basename starts with 'step' or matches step\d+
  if (/wizard/.test(lower) && /step\d*/.test(path.basename(path.dirname(filePath)).toLowerCase())) {
    return 'step';
  }

  // Wizard: directory name contains 'wizard' AND this file is the wizard root (+page or directly in the wizard dir)
  const parent = path.basename(path.dirname(filePath)).toLowerCase();
  if (parent.includes('wizard')) {
    return 'wizard';
  }

  // Section: lib/sections or 'section' segment
  if (/\/sections?\//.test(lower)) return 'section';

  // Component
  if (/\/components?\//.test(lower) || /\/lib\/components/.test(lower)) return 'component';

  // Page: routes/, pages/, views/
  if (/\/(routes|pages|views)\//.test(lower)) return 'page';

  return 'component';
}

function nameFromPath(filePath, rootAbs) {
  const rel = path.relative(rootAbs, filePath).replace(/\\/g, '/');
  const ext = path.extname(rel);
  const base = path.basename(rel, ext);

  // Svelte +page.svelte / +layout.svelte: name from parent directory
  if (base.startsWith('+')) {
    const parent = path.basename(path.dirname(rel));
    const grandparent = path.basename(path.dirname(path.dirname(rel)));
    const role = base.slice(1); // 'page', 'layout'
    if (parent === 'routes') {
      return role.charAt(0).toUpperCase() + role.slice(1);
    }
    // Glue parent (and grandparent if it's not 'routes') to disambiguate steps
    const segments = [];
    if (grandparent && grandparent !== 'routes') segments.push(grandparent);
    segments.push(parent);
    segments.push(role);
    return segments
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  }
  // index.tsx / index.jsx / Home.vue: name from base or parent
  if (base.toLowerCase() === 'index') {
    const parent = path.basename(path.dirname(rel));
    return parent.charAt(0).toUpperCase() + parent.slice(1);
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function detectImports(filePath, rootAbs, fileToName) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const importRe = /import\s+\w+\s+from\s+['"]([^'"]+)['"]/g;
  const targets = new Set();
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const resolved = path.resolve(path.dirname(filePath), spec);
    const target = fileToName.get(resolved);
    if (target) targets.add(target);
  }
  return [...targets];
}

function discoverScreens(projectRoot) {
  const srcRoot = path.join(projectRoot, 'src');
  const files = walk(srcRoot);

  const fileToName = new Map();
  for (const f of files) {
    fileToName.set(f, nameFromPath(f, projectRoot));
  }

  const screens = {};
  for (const f of files) {
    const name = fileToName.get(f);
    const kind = classifyKind(f);
    const navigatesTo = detectImports(f, projectRoot, fileToName);
    const entry = {
      status: 'active',
      kind,
      canonicalSpec: `Mockups/${name}/Screen.json`,
      source: path.relative(projectRoot, f).replace(/\\/g, '/')
    };
    if (navigatesTo.length > 0) entry.navigatesTo = navigatesTo;
    screens[name] = entry;
  }
  return { version: 1, screens };
}

module.exports = { discoverScreens };
