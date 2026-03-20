**SEO Review Criteria**
**Source:** seo-optimization skill | **Domain:** Technical SEO, content optimization, structured data, crawlability
**Charter Review Questions**
- Does the project serve web-facing content that needs organic search traffic?
- Is the rendering strategy (SSR, SSG, CSR) defined and appropriate for SEO requirements?
- Are URL structure conventions established for crawlability and human readability?
- Does the tech stack support server-side meta tag rendering?
**Proposal Review Questions**
- Does the proposal consider the SEO impact of URL structure, routing, or navigation changes?
- Are meta tag strategies addressed for new pages or content types introduced by the proposal?
- Does the proposal account for crawlability (server-side rendering vs client-side rendering tradeoffs)?
- Are structured data requirements identified for content types that benefit from rich results?
- Does the proposal consider impact on existing search rankings during migration or URL changes?
**PRD Review Questions**
- Do user stories include SEO acceptance criteria for pages that serve organic traffic?
- Are canonical URL strategies defined for content that may exist at multiple URLs?
- Does the PRD specify Open Graph and social sharing metadata for shareable content?
- Are sitemap and robots.txt updates included when adding or removing pages?
- Does the test plan include validation of meta tags, heading hierarchy, and structured data?
- Are redirect strategies defined for any URL changes (301 vs 302, redirect chains)?
**Issue Review Questions**
- Does this feature affect pages that receive organic search traffic?
- Are meta tags (title, description) defined or updated for new or modified pages?
- Does the issue consider heading hierarchy (single H1, logical H2-H6 nesting)?
- Are canonical URLs specified for content accessible at multiple paths?
- Does the implementation include structured data (JSON-LD) where applicable?
- Are Open Graph and Twitter Card tags addressed for shareable content?
- Does the issue account for sitemap updates if pages are added or removed?
- Are image alt attributes and semantic HTML considered for content changes?
**Code Review Questions**
- Does the code render proper meta tags (title, description) server-side for crawlability?
- Are heading hierarchies correct (single H1 per page, logical H2-H6 nesting)?
- Does the code generate valid JSON-LD structured data for content types with rich result support?
- Are canonical URLs set correctly to prevent duplicate content indexing?
- Does the code implement proper 301 redirects for URL changes rather than client-side redirects?
- Are images served with alt attributes, appropriate dimensions, and modern formats (WebP, AVIF)?
- Does the code avoid rendering critical content exclusively via client-side JavaScript?