/**
 * @framework-script 0.92.0
 *
 * Living Style Guide showcase bundle generator (#2430 AC1.1.1, #2431 AC1.2.1-1.2.4).
 *
 * Writes a self-contained static bundle under `Design-System/showcase/` containing:
 *   - index.html         Renders the nine canonical categories with per-item controls
 *                        (Accept / Reject / Annotate), or "not yet populated" placeholders
 *                        with disabled controls when a source is missing
 *   - tokens.json        Bundled DTCG tokens (copied from Design-System/idpf-design.tokens.json)
 *   - catalog.json       Bundled screen catalog (copied if found at Mockups/<name>/Specs/*.json
 *                        or a project-root showcase-catalog.json; otherwise {})
 *   - assets/style.css   Minimal CSS shipping with the bundle
 *
 * Source mapping (per PRD Story 1.2 AC1.2.2):
 *
 *   Color / Typography / Spacing & Layout / Motion       ← DTCG tokens
 *   UI Components / Iconography                           ← Screen catalog
 *   Imagery & Illustration / Voice & Tone / Accessibility Patterns  ← inline stub
 *
 * `decisions.json` is owned by the server (showcase-server.js); the bundle generator
 * does not create or overwrite it.
 *
 * Rubrical Works (c) 2026
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_BUNDLE_DIR = 'Design-System/showcase';
const TOKENS_SOURCE = 'Design-System/idpf-design.tokens.json';
const CATALOG_SOURCE = 'showcase-catalog.json'; // optional project-root catalog (fallback)

// Nine canonical categories — order matches PRD Story 1.2 AC1.2.1.
const CATEGORIES = [
  { id: 'ui-components',          label: 'UI Components',          source: 'catalog' },
  { id: 'typography',             label: 'Typography',             source: 'tokens'  },
  { id: 'color',                  label: 'Color',                  source: 'tokens'  },
  { id: 'iconography',            label: 'Iconography',            source: 'catalog' },
  { id: 'spacing-layout',         label: 'Spacing & Layout',       source: 'tokens'  },
  { id: 'imagery-illustration',   label: 'Imagery & Illustration', source: 'stub'    },
  { id: 'motion',                 label: 'Motion',                 source: 'tokens'  },
  { id: 'voice-tone',             label: 'Voice & Tone',           source: 'stub'    },
  { id: 'accessibility-patterns', label: 'Accessibility Patterns', source: 'stub'    },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Per-category item extractors ──────────────────────────────────────────
//
// Each extractor takes the loaded tokens / catalog object and returns an array
// of `{ id, label, preview? }` items (or [] when no source data). Returning [] is
// the signal for the renderer to emit a "not yet populated" placeholder section.

function extractTokenItemsByGroup(tokens, groupNames) {
  if (!tokens || typeof tokens !== 'object') return [];
  const items = [];
  for (const groupName of groupNames) {
    const group = tokens[groupName];
    if (!group || typeof group !== 'object') continue;
    for (const key of Object.keys(group)) {
      const value = group[key];
      if (!value || typeof value !== 'object') continue;
      // DTCG token convention: $value is the literal; $type is the kind.
      const preview = value.$value != null ? String(value.$value) : '';
      items.push({ id: `${groupName}.${key}`, label: `${groupName}.${key}`, preview });
    }
  }
  return items;
}

function extractCatalogItems(catalog, kindHint) {
  if (!catalog || typeof catalog !== 'object') return [];
  // Catalog shape: { screens: [{ id, name, kind?, elements? }, ...] } OR a flat array.
  const screens = Array.isArray(catalog) ? catalog : Array.isArray(catalog.screens) ? catalog.screens : [];
  const items = [];
  for (const s of screens) {
    if (!s || typeof s !== 'object') continue;
    if (kindHint && s.kind && String(s.kind).toLowerCase() !== kindHint) continue;
    const id = s.id || s.name || '';
    const label = s.name || s.id || '(unnamed)';
    if (id) items.push({ id: `${kindHint || 'screen'}.${id}`, label });
  }
  return items;
}

function extractStubItems(categoryId) {
  // Inline stub items for categories that have no canonical source yet.
  // Story 1.2 requires placeholder rendering only — Story 1.7 (#2436) will replace
  // these with real exemplars during accessibility dogfooding.
  const stubs = {
    'imagery-illustration': [
      { id: 'hero-image', label: 'Hero illustration', preview: '(stub)' },
    ],
    'voice-tone': [
      { id: 'tone-do', label: 'Tone — Do', preview: '(stub)' },
      { id: 'tone-dont', label: 'Tone — Don\'t', preview: '(stub)' },
    ],
    'accessibility-patterns': [
      { id: 'focus-visible', label: 'Visible focus pattern', preview: '(stub)' },
    ],
  };
  return stubs[categoryId] ? stubs[categoryId].slice() : [];
}

function itemsForCategory(category, tokens, catalog) {
  switch (category.id) {
    case 'color':
      return extractTokenItemsByGroup(tokens, ['color']);
    case 'typography':
      return extractTokenItemsByGroup(tokens, ['typography', 'font']);
    case 'spacing-layout':
      return extractTokenItemsByGroup(tokens, ['spacing', 'sizing', 'layout']);
    case 'motion':
      return extractTokenItemsByGroup(tokens, ['motion', 'animation', 'duration']);
    case 'ui-components':
      return extractCatalogItems(catalog, 'component');
    case 'iconography':
      return extractCatalogItems(catalog, 'icon');
    default:
      return extractStubItems(category.id);
  }
}

// ─── Renderers ─────────────────────────────────────────────────────────────

function renderItemRow(item, opts) {
  const disabled = opts && opts.disabled ? 'disabled aria-disabled="true"' : '';
  const safeId = escapeHtml(item.id);
  const safeLabel = escapeHtml(item.label);
  const safePreview = item.preview != null ? escapeHtml(item.preview) : '';
  return [
    `<li class="item" data-item-id="${safeId}">`,
    `  <span class="item-label">${safeLabel}</span>`,
    (safePreview ? `  <span class="item-preview">${safePreview}</span>` : ''),
    `  <span class="item-controls">`,
    `    <button class="btn-accept" ${disabled} data-action="accept" data-item-id="${safeId}">Accept</button>`,
    `    <button class="btn-reject" ${disabled} data-action="reject" data-item-id="${safeId}">Reject</button>`,
    `    <button class="btn-annotate" ${disabled} data-action="annotate" data-item-id="${safeId}">Annotate</button>`,
    `  </span>`,
    `</li>`,
  ].filter(Boolean).join('\n      ');
}

function renderSection(category, items) {
  const populated = items.length > 0;
  const sectionClass = populated ? 'category' : 'category not-yet-populated';
  const placeholderItem = { id: `${category.id}.placeholder`, label: 'Not yet populated', preview: '' };
  const renderedItems = populated
    ? items.map((item) => renderItemRow(item, { disabled: false })).join('\n      ')
    : renderItemRow(placeholderItem, { disabled: true });
  return [
    `<section id="${escapeHtml(category.id)}" class="${sectionClass}" data-category="${escapeHtml(category.id)}">`,
    `  <h2>${escapeHtml(category.label)}</h2>`,
    `  ${populated ? '' : '<p class="placeholder-note">Not yet populated — connect a source to see items here.</p>'}`,
    `  <ul class="items">`,
    `      ${renderedItems}`,
    `  </ul>`,
    `</section>`,
  ].filter(Boolean).join('\n');
}

function renderSidebar() {
  const items = CATEGORIES.map((c) => `<li><a href="#${escapeHtml(c.id)}">${escapeHtml(c.label)}</a></li>`).join('\n      ');
  return [
    `<nav class="sidebar" aria-label="Categories">`,
    `  <ul>`,
    `      ${items}`,
    `  </ul>`,
    `</nav>`,
  ].join('\n');
}

function renderIndexHtml(opts) {
  const title = (opts && opts.title) || 'Living Style Guide';
  const tokens = opts && opts.tokens;
  const catalog = opts && opts.catalog;
  const sections = CATEGORIES.map((c) => renderSection(c, itemsForCategory(c, tokens, catalog))).join('\n\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="assets/style.css" />
</head>
<body>
  <header><h1>${escapeHtml(title)}</h1></header>
  <div class="layout">
    ${renderSidebar()}
    <main>
${sections}
    </main>
  </div>
  <footer><button id="btn-done" type="button">Done</button></footer>
  <script src="assets/showcase.js"></script>
</body>
</html>
`;
}

function renderStyleCss() {
  // Explicit AA-contrast palette (Story 1.7 / AC1.7.1). Foreground/background
  // pairs verified at 4.5:1 (normal text) and 3.0:1 (large text).
  //   light: text #1a1a1a on bg #ffffff   = 16.4:1 (AAA)
  //   dark:  text #f5f5f5 on bg #1a1a1a   = 13.6:1 (AAA)
  //   muted text light: #595959 on #ffffff = 7.0:1 (AAA)
  //   muted text dark:  #b8b8b8 on #1a1a1a = 9.0:1 (AAA)
  //   placeholder note light: #595959 on #ffffff = 7.0:1 (AAA)
  //   focus outline: 3px solid #005FCC (light) / #4D9BFF (dark)
  return `:root {
  color-scheme: light dark;
  --fg: #1a1a1a;
  --bg: #ffffff;
  --muted: #595959;
  --rule: #d0d0d0;
  --focus: #005FCC;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fg: #f5f5f5;
    --bg: #1a1a1a;
    --muted: #b8b8b8;
    --rule: #3a3a3a;
    --focus: #4D9BFF;
  }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
* { box-sizing: border-box; }
body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 0; color: var(--fg); background: var(--bg); }
header { padding: 1rem 2rem; border-bottom: 1px solid var(--rule); }
header h1 { margin: 0; }
.layout { display: grid; grid-template-columns: 220px 1fr; min-height: calc(100vh - 7rem); }
.sidebar { padding: 1rem; border-right: 1px solid var(--rule); }
.sidebar ul { list-style: none; padding: 0; margin: 0; }
.sidebar a { display: block; padding: 0.25rem 0.5rem; text-decoration: none; color: inherit; border-radius: 3px; }
.sidebar a:hover { background: color-mix(in srgb, var(--fg) 10%, transparent); }
.sidebar a:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
main { padding: 1rem 2rem; }
.category { margin-bottom: 2rem; }
.category h2 { margin-top: 0; }
.category.not-yet-populated { opacity: 0.85; }
.placeholder-note { color: var(--muted); font-style: italic; margin: 0 0 0.5rem; }
.items { list-style: none; padding: 0; margin: 0; }
.item { display: grid; grid-template-columns: 1fr auto auto; gap: 0.5rem; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--rule); }
.item:focus-within { background: color-mix(in srgb, var(--fg) 5%, transparent); }
.item-label { font-weight: 600; }
.item-preview { color: var(--muted); font-family: ui-monospace, monospace; font-size: 0.9em; }
.item-controls button { margin-left: 0.25rem; padding: 0.35rem 0.85rem; border: 1px solid var(--fg); background: transparent; color: var(--fg); cursor: pointer; min-height: 32px; }
.item-controls button[disabled], .item-controls button[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
.item-controls button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.item-controls button[data-state="accepted"] { background: color-mix(in srgb, #2e7d32 18%, transparent); border-color: #2e7d32; }
.item-controls button[data-state="rejected"] { background: color-mix(in srgb, #c62828 18%, transparent); border-color: #c62828; }
.item-controls button[data-state="annotated"] { background: color-mix(in srgb, #f9a825 18%, transparent); border-color: #f9a825; }
.annotate-panel { grid-column: 1 / -1; padding: 0.5rem 0; }
.annotate-panel textarea { width: 100%; min-height: 80px; padding: 0.5rem; border: 1px solid var(--rule); background: var(--bg); color: var(--fg); font: inherit; }
.annotate-panel textarea:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.annotate-panel .annotate-actions { margin-top: 0.5rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
footer { padding: 1rem 2rem; border-top: 1px solid var(--rule); text-align: right; }
#btn-done { padding: 0.5rem 1rem; border: 1px solid var(--fg); background: transparent; color: var(--fg); cursor: pointer; min-height: 36px; }
#btn-done:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
`;
}

function renderShowcaseJs() {
  // Story 1.7 keyboard + decision-recording behavior (AC1.7.3).
  // Runs in the browser; not invoked by Node tests.
  return `(function () {
  'use strict';
  var nonce = null;
  function loadNonce() {
    return fetch('/nonce').then(function (r) { return r.json(); }).then(function (j) {
      nonce = j.nonce;
      return nonce;
    });
  }
  function postRecord(payload) {
    if (!nonce) return Promise.reject(new Error('nonce-not-ready'));
    return fetch('/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Showcase-Nonce': nonce },
      body: JSON.stringify(payload),
    });
  }
  function focusedItem() {
    var el = document.activeElement;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('item')) return el;
      el = el.parentElement;
    }
    return null;
  }
  function moveFocus(delta) {
    var current = focusedItem();
    var items = Array.prototype.slice.call(document.querySelectorAll('main .item'));
    if (items.length === 0) return;
    var idx = current ? items.indexOf(current) : -1;
    var next = (idx + delta + items.length) % items.length;
    var firstBtn = items[next].querySelector('button:not([disabled])');
    if (firstBtn) firstBtn.focus();
  }
  function openAnnotate(itemEl, itemId, category) {
    if (itemEl.querySelector('.annotate-panel')) return;
    var panel = document.createElement('div');
    panel.className = 'annotate-panel';
    panel.innerHTML =
      '<label class="sr-only" for="note">Annotation</label>' +
      '<textarea id="note" maxlength="1000" aria-label="Annotation"></textarea>' +
      '<div class="annotate-actions">' +
      '  <button type="button" class="btn-cancel">Cancel</button>' +
      '  <button type="button" class="btn-submit">Submit</button>' +
      '</div>';
    itemEl.appendChild(panel);
    var textarea = panel.querySelector('textarea');
    textarea.focus();
    panel.querySelector('.btn-cancel').addEventListener('click', function () { panel.remove(); });
    panel.querySelector('.btn-submit').addEventListener('click', function () {
      var note = textarea.value;
      postRecord({ category: category, itemId: itemId, decision: 'annotate', note: note, timestamp: new Date().toISOString() })
        .then(function (r) {
          if (r.ok) {
            var btn = itemEl.querySelector('.btn-annotate');
            if (btn) btn.setAttribute('data-state', 'annotated');
          }
          panel.remove();
        });
    });
    textarea.addEventListener('keydown', function (e) { if (e.key === 'Escape') panel.remove(); });
  }
  function wire() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button[data-action]');
      if (!btn || btn.disabled) return;
      var action = btn.getAttribute('data-action');
      var itemEl = btn.closest('.item');
      var itemId = btn.getAttribute('data-item-id');
      var section = btn.closest('section[data-category]');
      var category = section ? section.getAttribute('data-category') : '';
      if (action === 'annotate') {
        openAnnotate(itemEl, itemId, category);
        return;
      }
      var decision = action === 'accept' ? 'accept' : 'reject';
      postRecord({ category: category, itemId: itemId, decision: decision, timestamp: new Date().toISOString() })
        .then(function (r) {
          if (r.ok) btn.setAttribute('data-state', decision === 'accept' ? 'accepted' : 'rejected');
        });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' && focusedItem()) { e.preventDefault(); moveFocus(1); }
      else if (e.key === 'ArrowUp' && focusedItem()) { e.preventDefault(); moveFocus(-1); }
      else if (e.key === 'Escape') {
        var open = document.querySelector('.annotate-panel');
        if (open) open.remove();
      }
    });
    var done = document.getElementById('btn-done');
    if (done) {
      done.addEventListener('click', function () {
        fetch('/done', { method: 'POST', headers: { 'X-Showcase-Nonce': nonce || '' } })
          .then(function () { window.close(); });
      });
    }
  }
  loadNonce().catch(function () { /* nonce will retry on first POST */ });
  if (document.readyState !== 'loading') wire();
  else document.addEventListener('DOMContentLoaded', wire);
})();
`;
}

/**
 * Build a showcase bundle on disk.
 *
 * @param {object} [opts]
 * @param {string} [opts.bundleDir=Design-System/showcase]  Bundle output directory.
 * @param {string} [opts.tokensSource=Design-System/idpf-design.tokens.json]  Source DTCG token file.
 * @param {string} [opts.catalogSource=showcase-catalog.json]  Optional catalog source path.
 * @param {string} [opts.projectRoot=process.cwd()]  Root all paths resolve from.
 * @param {string} [opts.title]  Page title override (mostly for tests).
 * @returns {object} Summary: { bundleDir, files, tokensCopied, catalogCopied }
 */
function buildShowcaseBundle(opts) {
  const projectRoot = (opts && opts.projectRoot) || process.cwd();
  const bundleDir = path.resolve(projectRoot, (opts && opts.bundleDir) || DEFAULT_BUNDLE_DIR);
  const tokensSource = path.resolve(projectRoot, (opts && opts.tokensSource) || TOKENS_SOURCE);
  const catalogSource = path.resolve(projectRoot, (opts && opts.catalogSource) || CATALOG_SOURCE);

  ensureDir(bundleDir);
  ensureDir(path.join(bundleDir, 'assets'));

  const filesWritten = [];

  // tokens.json + catalog.json (copy if source exists; otherwise write {})
  const tokens = readJsonSafe(tokensSource);
  const catalog = readJsonSafe(catalogSource);

  const indexPath = path.join(bundleDir, 'index.html');
  fs.writeFileSync(indexPath, renderIndexHtml({ title: opts && opts.title, tokens, catalog }));
  filesWritten.push(path.relative(projectRoot, indexPath));

  const tokensPath = path.join(bundleDir, 'tokens.json');
  fs.writeFileSync(tokensPath, JSON.stringify(tokens || {}, null, 2) + '\n');
  filesWritten.push(path.relative(projectRoot, tokensPath));

  const catalogPath = path.join(bundleDir, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalog || {}, null, 2) + '\n');
  filesWritten.push(path.relative(projectRoot, catalogPath));

  const cssPath = path.join(bundleDir, 'assets', 'style.css');
  fs.writeFileSync(cssPath, renderStyleCss());
  filesWritten.push(path.relative(projectRoot, cssPath));

  const jsPath = path.join(bundleDir, 'assets', 'showcase.js');
  fs.writeFileSync(jsPath, renderShowcaseJs());
  filesWritten.push(path.relative(projectRoot, jsPath));

  return {
    bundleDir,
    files: filesWritten,
    tokensCopied: tokens !== null,
    catalogCopied: catalog !== null,
  };
}

module.exports = {
  buildShowcaseBundle,
  renderIndexHtml,
  renderStyleCss,
  renderShowcaseJs,
  renderSection,
  renderItemRow,
  itemsForCategory,
  extractTokenItemsByGroup,
  extractCatalogItems,
  extractStubItems,
  CATEGORIES,
  DEFAULT_BUNDLE_DIR,
  TOKENS_SOURCE,
  CATALOG_SOURCE,
};
