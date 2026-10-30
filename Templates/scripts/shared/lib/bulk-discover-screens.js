// Rubrical Works (c) 2026
/**
 * @framework-script 0.115.0
 * Bulk-discover screens from project source for /catalog-screens --init.
 *
 * Scans Svelte/React/Vue source. Auto-detects kind from path patterns:
 *   pages: routes/, pages/, views/
 *   wizard: directory name contains 'wizard'
 *   step: path contains 'wizard' AND the file's parent directory name contains 'step'
 *         (step, step1, step-two — unanchored; the file's own name is not read)
 *   section: lib/sections/ or section in path
 *   modal: name contains 'Modal'
 *   component: lib/components/, components/
 *
 * Detects navigation edges from import statements pointing at
 * other screen-kind files within the scanned source tree.
 *
 * Every entry's canonicalSpec names a file this helper creates (#3089):
 * a schema-shaped placeholder at Mockups/Catalog/Specs/<Name>.json, marked
 * `placeholder: true`, written only when nothing exists at that path. The
 * catalog it returns therefore satisfies validate-screen-catalog.js
 * invariant 1 from the moment it is written. "Catalog" is the mockup set
 * discovery seeds; /catalog-screens later writes authored specs beside it.
 *
 * Refs #2340 (PRD #2333 — Screen Design Pipeline), #3089
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE_EXTENSIONS = new Set(['.svelte', '.tsx', '.jsx', '.vue']);
// Mockup set that bulk discovery seeds; one placeholder spec per screen.
const SPEC_SET_DIR = 'Mockups/Catalog/Specs';

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

  // Step: path contains 'wizard' and the parent directory's name contains 'step' (#3305)
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
  // Default, named, namespace and mixed forms (#3305): everything between
  // `import` and `from` is ignored; only the specifier matters here.
  const importRe = /import\s+[^'";]*?\s*from\s+['"]([^'"]+)['"]/g;
  const targets = new Set();
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = resolveImport(path.resolve(path.dirname(filePath), spec), fileToName);
    if (target) targets.add(target);
  }
  return [...targets];
}

/**
 * The screen a resolved specifier names (#3305), resolving as a bundler does:
 * the exact path, then each source extension appended (`./Settings`), then a
 * directory's `index<ext>` (`../components/profile`).
 */
function resolveImport(resolved, fileToName) {
  const candidates = [
    resolved,
    ...[...SOURCE_EXTENSIONS].map((ext) => resolved + ext),
    ...[...SOURCE_EXTENSIONS].map((ext) => path.join(resolved, `index${ext}`)),
  ];
  for (const c of candidates) {
    const name = fileToName.get(c);
    if (name) return name;
  }
  return null;
}

/**
 * Write the placeholder spec an entry's canonicalSpec names, unless a file
 * is already there — an authored spec, or a placeholder from an earlier run,
 * is never overwritten. Shape follows screen-spec-schema.json; `placeholder`
 * is an additional property the schema admits, so a later pass can tell a
 * seeded spec from an authored one.
 */
function writePlaceholderSpec(projectRoot, canonicalSpec, { name, kind, source }) {
  const abs = path.resolve(projectRoot, canonicalSpec);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const spec = {
    screenName: name,
    source,
    kind,
    catalogEntry: name,
    lastUpdated: new Date().toISOString().slice(0, 10),
    elements: [],
    placeholder: true
  };
  // Exclusive create (#3446, CodeQL js/file-system-race): an existing spec is
  // never overwritten, including one written after a separate existence check.
  try {
    fs.writeFileSync(abs, JSON.stringify(spec, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

function discoverScreens(projectRoot) {
  const srcRoot = path.join(projectRoot, 'src');
  const files = walk(srcRoot);

  const fileToName = new Map();
  for (const f of files) {
    fileToName.set(f, nameFromPath(f, projectRoot));
  }
  // Unique before detectImports reads the map, so navigatesTo carries the
  // same names the catalog does (#3172).
  const warnings = disambiguateNames(fileToName, projectRoot);

  const screens = {};
  for (const f of files) {
    const name = fileToName.get(f);
    // Project-relative (#3379): the absolute path let a directory above the
    // project — a root under .../components/ — decide every file's kind.
    const kind = classifyKind('/' + path.relative(projectRoot, f).replace(/\\/g, '/'));
    const navigatesTo = detectImports(f, projectRoot, fileToName);
    const source = path.relative(projectRoot, f).replace(/\\/g, '/');
    const canonicalSpec = `${SPEC_SET_DIR}/${name}.json`;
    const entry = {
      status: 'active',
      kind,
      canonicalSpec,
      source
    };
    if (navigatesTo.length > 0) entry.navigatesTo = navigatesTo;
    writePlaceholderSpec(projectRoot, canonicalSpec, { name, kind, source });
    screens[name] = entry;
  }
  const catalog = { version: 1, screens };
  // Non-enumerable: the screen-catalog schema forbids extra top-level keys,
  // and a caller writing the catalog with JSON.stringify must not carry the
  // report into it.
  Object.defineProperty(catalog, 'warnings', { value: warnings, enumerable: false });
  return catalog;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Make every derived name unique, in place (#3172). Two files deriving one
 * name used to overwrite each other in `screens` and share one placeholder
 * spec. Each colliding file is prefixed with its nearest ancestor directories
 * — one more level at a time, skipping a directory already spelled in the
 * name — until the group is unique; a numeric suffix is the last resort.
 * @param {Map<string, string>} fileToName - absolute path → derived name
 * @param {string} projectRoot
 * @returns {string[]} one warning per collision, naming the files
 */
function disambiguateNames(fileToName, projectRoot) {
  const warnings = [];
  const byName = new Map();
  for (const [file, name] of fileToName) {
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(file);
  }
  const taken = new Set(fileToName.values());
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    const rel = (f) => path.relative(projectRoot, f).replace(/\\/g, '/');
    const ancestors = group.map((f) => path.dirname(rel(f)).split('/').reverse());
    const depth = Math.max(...ancestors.map((a) => a.length));
    let renamed = null;
    for (let k = 1; k <= depth && !renamed; k++) {
      const candidates = ancestors.map((a) => a.slice(0, k).reverse()
        .filter((seg) => !name.includes(cap(seg))).map(cap).join('') + name);
      if (new Set(candidates).size === group.length && candidates.every((c) => c === name || !taken.has(c))) {
        renamed = candidates;
      }
    }
    if (!renamed) {
      // Numeric last resort (#3179): skip any suffix already taken.
      renamed = [name];
      let n = 2;
      for (let i = 1; i < group.length; i++) {
        while (taken.has(`${name}${n}`)) n++;
        renamed.push(`${name}${n++}`);
      }
    }
    group.forEach((f, i) => {
      fileToName.set(f, renamed[i]);
      taken.add(renamed[i]);
    });
    warnings.push(`Screen name "${name}" was derived from ${group.length} files (${group.map(rel).join(', ')}); renamed to ${renamed.join(', ')}.`);
  }
  return warnings;
}

module.exports = { discoverScreens };
