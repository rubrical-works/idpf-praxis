// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.0
 * Generate Mockups/NAVIGATION.md from a screen catalog.
 * Sections: Pages (with nested outbound edges and modals),
 *           Wizards (with steps), Dangling References, Unreachable.
 *
 * Refs #2340 (AC10) — used by /catalog-screens and /mockups
 *                     to keep navigation discoverable from the registry.
 * Refs #2381 — page edges (navigatesTo) now render inline; dangling
 *              references (targets absent from catalog) surface separately.
 */

'use strict';

function dedupSort(list) {
  return Array.from(new Set(list)).sort();
}

function renderNavigationMarkdown(catalog) {
  const screens = catalog.screens || {};
  const names = Object.keys(screens);
  const nameSet = new Set(names);

  const pages = names.filter(n => screens[n].kind === 'page');
  const wizards = names.filter(n => screens[n].kind === 'wizard');

  // Reachable: every screen that is a page, a wizard, or appears as
  // a navigatesTo / parent / child / modal target somewhere.
  const reachable = new Set([...pages, ...wizards]);
  // Dangling refs: names referenced via navigatesTo that don't exist in the
  // catalog. Keyed by ghost-name → sorted list of referrer page names.
  const dangling = new Map();

  for (const name of names) {
    const s = screens[name];
    for (const t of s.navigatesTo || []) {
      if (nameSet.has(t)) {
        reachable.add(t);
      } else {
        const referrers = dangling.get(t) || [];
        if (!referrers.includes(name)) referrers.push(name);
        dangling.set(t, referrers);
      }
    }
    for (const t of s.children || []) reachable.add(t);
    for (const t of s.modals || []) reachable.add(t);
    if (s.parent) reachable.add(s.parent);
  }
  const unreachable = names.filter(n => !reachable.has(n));

  const lines = ['# Navigation', ''];

  lines.push('## Pages', '');
  if (pages.length === 0) {
    lines.push('_No pages in catalog._', '');
  } else {
    for (const p of pages.slice().sort()) {
      lines.push(`- ${p}`);
      // Outbound navigation, filtered to existing catalog entries
      // (dangling refs appear in their own section).
      const outbound = dedupSort((screens[p].navigatesTo || []).filter(t => nameSet.has(t)));
      if (outbound.length > 0) {
        lines.push(`  - navigates to: ${outbound.join(', ')}`);
      }
      // Modals surface inline under their anchor page.
      const modals = dedupSort(screens[p].modals || []);
      if (modals.length > 0) {
        lines.push(`  - opens: ${modals.join(', ')}`);
      }
    }
    lines.push('');
  }

  if (wizards.length > 0) {
    lines.push('## Wizards', '');
    for (const w of wizards.slice().sort()) {
      lines.push(`- ${w}`);
      const steps = (screens[w].children || []).filter(c => screens[c]?.kind === 'step');
      for (const s of steps) lines.push(`  - ${s}`);
    }
    lines.push('');
  }

  if (dangling.size > 0) {
    lines.push('## Dangling References', '');
    lines.push('_These screen names are referenced via `navigatesTo` but do not exist in the catalog._', '');
    const ghostNames = Array.from(dangling.keys()).sort();
    for (const ghost of ghostNames) {
      const referrers = dangling.get(ghost).slice().sort();
      lines.push(`- ${ghost} (referenced by ${referrers.join(', ')})`);
    }
    lines.push('');
  }

  if (unreachable.length > 0) {
    lines.push('## Unreachable', '');
    lines.push('_These screens have no in-edges from pages, wizards, or other catalog entries._', '');
    for (const u of unreachable.slice().sort()) lines.push(`- ${u}`);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

module.exports = { renderNavigationMarkdown };
