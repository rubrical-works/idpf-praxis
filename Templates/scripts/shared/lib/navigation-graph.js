// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.2
 * Generate Mockups/NAVIGATION.md from a screen catalog.
 * Sections: Pages (with nested outbound edges and modals),
 *           Wizards (with steps), Dangling References, Unreachable,
 *           Not Shown.
 *
 * Refs #2340 (AC10) — used by /catalog-screens and /mockups
 *                     to keep navigation discoverable from the registry.
 * Refs #2381 — page edges (navigatesTo) now render inline; dangling
 *              references (targets absent from catalog) surface separately.
 * Refs #2701 — `parent` no longer feeds reachability (it is a back-reference,
 *              not an in-edge); entries that land in no section at all are
 *              reported under Not Shown rather than silently dropped.
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
  // a navigatesTo / child / modal target somewhere.
  //
  // `parent` is deliberately absent (#2701). It is a back-reference, not an
  // in-edge — a child naming its parent says nothing about how the parent is
  // reached. Counting it marked the parent reachable, which removed it from
  // ## Unreachable; since only page and wizard kinds get their own sections,
  // a component or section that was some child's parent then appeared in no
  // section at all, silently. `children` is the forward direction of the same
  // relationship and already feeds the set, so a correctly-populated catalog
  // loses nothing.
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
  }
  const unreachable = names.filter(n => !reachable.has(n));

  const lines = ['# Navigation', ''];
  // Every catalog name this render actually puts on the page — as its own
  // bullet, or nested under a page or wizard. Compared against `names` at the
  // end so nothing can be dropped without the document saying so (#2701).
  //
  // Tracking is manual at each push site, and a future section that forgets to
  // register its names fails in the safe direction: the entry appears on the
  // page *and* is listed under ## Not Shown — noisy and immediately visible,
  // rather than silently absent, which is the failure this exists to end.
  const rendered = new Set();

  lines.push('## Pages', '');
  if (pages.length === 0) {
    lines.push('_No pages in catalog._', '');
  } else {
    for (const p of pages.slice().sort()) {
      lines.push(`- ${p}`);
      rendered.add(p);
      // Outbound navigation, filtered to existing catalog entries
      // (dangling refs appear in their own section).
      const outbound = dedupSort((screens[p].navigatesTo || []).filter(t => nameSet.has(t)));
      if (outbound.length > 0) {
        lines.push(`  - navigates to: ${outbound.join(', ')}`);
        for (const t of outbound) rendered.add(t);
      }
      // Modals surface inline under their anchor page.
      const modals = dedupSort(screens[p].modals || []);
      if (modals.length > 0) {
        lines.push(`  - opens: ${modals.join(', ')}`);
        for (const m of modals) rendered.add(m);
      }
    }
    lines.push('');
  }

  if (wizards.length > 0) {
    lines.push('## Wizards', '');
    for (const w of wizards.slice().sort()) {
      lines.push(`- ${w}`);
      rendered.add(w);
      const steps = (screens[w].children || []).filter(c => screens[c]?.kind === 'step');
      for (const s of steps) {
        lines.push(`  - ${s}`);
        rendered.add(s);
      }
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
    for (const u of unreachable.slice().sort()) {
      lines.push(`- ${u}`);
      rendered.add(u);
    }
    lines.push('');
  }

  // Anything in the catalog that no section above put on the page. Only `page`
  // and `wizard` kinds get their own sections and `## Unreachable` lists only
  // the complement of the reachable set, so a *reachable* entry of any other
  // kind — a modal opened from a component, say — has nowhere to appear. It is
  // reported rather than dropped: a renderer that silently omits entries is
  // indistinguishable from one that has nothing to say, and regenerating
  // produces a byte-identical file either way (#2701).
  const notShown = names.filter(n => !rendered.has(n));
  if (notShown.length > 0) {
    const count = notShown.length === 1
      ? '1 catalog entry is'
      : `${notShown.length} catalog entries are`;
    lines.push('## Not Shown', '');
    lines.push(
      `_${count} absent from every section above. Only \`page\` and \`wizard\` ` +
      'kinds are rendered in their own sections, and these are reachable, so ' +
      'they do not appear under `## Unreachable` either._',
      ''
    );
    for (const n of notShown.slice().sort()) lines.push(`- ${n}`);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

module.exports = { renderNavigationMarkdown };
