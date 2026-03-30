# Skill Guide: SEO Optimization

**Date:** 2026-02-28
**Topic:** Scope boundaries and curated references for the `seo-optimization` skill
**Related Skill:** `Skills/seo-optimization/`

---

## What the Skill Covers (v1)

The `seo-optimization` skill provides structured guidance in two areas:

1. **Technical SEO** — Meta tags, structured data (JSON-LD), sitemaps, robots.txt, canonical URLs, Open Graph, and Twitter Cards
2. **Content Optimization** — Heading hierarchy, semantic HTML, content structure, and internal linking

These are the foundational, code-level concerns that developers encounter during feature work. The skill is designed to be invoked when setting up a new web project, auditing existing pages, or adding SEO-relevant markup.

---

## What the Skill Does NOT Cover (Deferred)

The following topics are outside v1 scope. They are either too broad for a single skill, depend on external tools, or overlap with other IDPF domains.

### Keyword Research and Intent Mapping

Keyword research is a strategy concern, not a code concern. It happens before development and informs content decisions rather than markup decisions.

**Curated references:**
- Google Search Central — [Keyword research guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- Ahrefs — Keyword difficulty and search intent methodology
- Google Keyword Planner — Volume and competition data (requires Google Ads account)

### Core Web Vitals (LCP, INP, CLS)

Core Web Vitals are performance metrics that affect search ranking. They overlap heavily with the `IDPF-Performance` domain framework, which is the appropriate place for deep performance work.

**What the skill does touch:** Image `loading="lazy"`, `width`/`height` attributes for CLS prevention, and the general principle that page speed matters for SEO.

**What it defers:**
- Largest Contentful Paint (LCP) optimization strategies
- Interaction to Next Paint (INP) — JavaScript execution and event handler tuning
- Cumulative Layout Shift (CLS) — Layout stability beyond image dimensions
- Lighthouse audit interpretation and scoring

**Curated references:**
- web.dev — [Core Web Vitals](https://web.dev/articles/vitals)
- Google Search Central — [Page experience signals](https://developers.google.com/search/docs/appearance/page-experience)
- Chrome DevTools — Lighthouse panel for local auditing

### Framework-Specific SEO Guidance

Modern frameworks (Next.js, Nuxt, SvelteKit, Remix, Astro) each handle SEO differently through their rendering strategies (SSR, SSG, ISR) and meta tag management APIs. Framework-specific guidance is too broad for a single skill and changes rapidly with framework versions.

**What the skill does touch:** Universal HTML patterns (`<title>`, `<meta>`, `<link rel="canonical">`, JSON-LD) that work regardless of framework.

**What it defers:**
- SSR vs SSG vs ISR trade-offs for crawlability
- Framework-specific head management (`next/head`, `useHead()`, `<svelte:head>`)
- SPA meta tag injection for client-side rendered apps
- Dynamic sitemap generation with framework APIs
- Edge rendering and its SEO implications

**Curated references:**
- Next.js — [SEO documentation](https://nextjs.org/learn/seo/introduction)
- Nuxt — [SEO and Meta](https://nuxt.com/docs/getting-started/seo-meta)
- Astro — [SEO recipes](https://docs.astro.build/en/recipes/)

### Accessibility-SEO Overlap

Accessibility and SEO share significant overlap — semantic HTML, alt text, heading hierarchy, and ARIA landmarks benefit both. The `IDPF-Accessibility` domain framework is the primary owner of accessibility concerns.

**What the skill does touch:** Semantic HTML elements, `alt` attributes, `aria-label` on navigation, heading hierarchy — these are in the skill because they are directly SEO-relevant.

**What it defers:**
- WCAG compliance levels (A, AA, AAA)
- Screen reader testing and ARIA pattern guidance
- Color contrast and visual accessibility
- Keyboard navigation and focus management
- Accessibility audit tooling (axe, Lighthouse accessibility)

**Curated references:**
- W3C WAI — [Accessibility Fundamentals](https://www.w3.org/WAI/fundamentals/)
- Google Search Central — [Accessibility and search](https://developers.google.com/search/docs/fundamentals/accessibility)

---

## Future Expansion (v2 Considerations)

Issue #1602 notes these as potential v2 additions:

- **Review extension:** Register `seo` as a `/review-issue --with seo` domain (see Issue #1621)
- **Keyword research skill:** A separate skill focused on search intent and keyword strategy
- **Core Web Vitals skill:** A separate skill or integration with `IDPF-Performance`
- **Framework adapters:** Framework-specific resource files under `resources/frameworks/`

---

## Related Resources

| Resource | Purpose |
|----------|---------|
| `Skills/seo-optimization/SKILL.md` | Main skill with inline guidance |
| `Skills/seo-optimization/resources/technical-seo.md` | Deep-dive on meta tags, JSON-LD, sitemaps, robots.txt, canonical URLs, OG/Twitter |
| `Skills/seo-optimization/resources/content-optimization.md` | Deep-dive on heading hierarchy, semantic HTML, content structure, internal linking |
| `IDPF-Performance/` | Core Web Vitals and performance optimization |
| `IDPF-Accessibility/` | Accessibility standards and ARIA patterns |

---