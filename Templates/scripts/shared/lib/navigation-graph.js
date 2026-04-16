// Rubrical Works (c) 2026
/**
 * @framework-script 0.88.0
 * Generate Mockups/NAVIGATION.md from a screen catalog.
 * Sections: Pages, Wizards (with steps), Unreachable.
 *
 * Refs #2340 (AC10) — used by /catalog-screens and /mockups
 *                     to keep navigation discoverable from the registry.
 */

'use strict';

function renderNavigationMarkdown(catalog) {
  const screens = catalog.screens || {};
  const names = Object.keys(screens);

  const pages = names.filter(n => screens[n].kind === 'page');
  const wizards = names.filter(n => screens[n].kind === 'wizard');

  // Reachable: every screen that is a page, a wizard, or appears as
  // a navigatesTo / parent / child / modal target somewhere.
  const reachable = new Set([...pages, ...wizards]);
  for (const name of names) {
    const s = screens[name];
    for (const t of s.navigatesTo || []) reachable.add(t);
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
    for (const p of pages.sort()) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  if (wizards.length > 0) {
    lines.push('## Wizards', '');
    for (const w of wizards.sort()) {
      lines.push(`- ${w}`);
      const steps = (screens[w].children || []).filter(c => screens[c]?.kind === 'step');
      for (const s of steps) lines.push(`  - ${s}`);
    }
    lines.push('');
  }

  if (unreachable.length > 0) {
    lines.push('## Unreachable', '');
    lines.push('_These screens have no in-edges from pages, wizards, or other catalog entries._', '');
    for (const u of unreachable.sort()) lines.push(`- ${u}`);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

module.exports = { renderNavigationMarkdown };
