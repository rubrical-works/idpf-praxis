**Internationalization (i18n) Review Criteria**
**Domain:** String externalization, locale-aware formatting, bidirectional text, translation workflow
**Companion Skill:** i18n-setup
**Charter Review Questions**
- Does the project target users in multiple languages or locales?
- Is an i18n library defined in the tech stack (i18next, FormatJS, ICU)?
- Are RTL languages in scope for the target audience?
- Is a translation management workflow established?
**Proposal Review Questions**
- Does the proposal account for i18n impact of new user-facing content?
- Are string externalization requirements addressed for new features?
- Does the proposal consider locale-aware formatting for dates, numbers, and currencies?
- Are RTL layout implications identified for UI changes?
- Does the proposal address translation workflow for new strings?
**PRD Review Questions**
- Do user stories include i18n acceptance criteria for user-facing features?
- Are locale-specific formatting requirements defined (date formats, number separators)?
- Does the PRD specify which locales are in scope for launch?
- Are pluralization rules addressed for content with variable counts?
- Does the test plan include validation of string externalization and locale rendering?
**Issue Review Questions**
- Are user-facing strings externalized to resource files (not hardcoded)?
- Does the implementation use ICU MessageFormat for pluralization and gender?
- Are dates, numbers, and currencies formatted with locale-aware APIs?
- Does the UI support RTL layout for bidirectional languages?
- Are translation keys named descriptively with context for translators?
- Does the implementation handle missing translations gracefully (fallback locale)?
**Code Review Questions**
- Are all user-facing strings externalized to resource/translation files?
- Does the code use locale-aware formatting APIs (Intl.DateTimeFormat, Intl.NumberFormat) instead of manual formatting?
- Are pluralization rules implemented using ICU MessageFormat (not if/else on count)?
- Does the CSS use logical properties (margin-inline-start vs margin-left) for RTL support?
- Are translation keys descriptive and namespaced (e.g., `settings.profile.saveButton` not `btn1`)?
- Does the code handle missing translation keys with a fallback strategy?
- Are string concatenations avoided in favor of parameterized messages?