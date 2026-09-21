// Rubrical Works (c) 2026
/**
 * @framework-script 0.105.0
 * @description Load and resolve review extension domains for /review-issue and /code-review. Exports loadCodeReviewExtensions(), extractSectionQuestions(), getAvailableExtensions(), resolveAutoInclusion(), filterDomainsByCharter() and suggestDomains(). Consumed by review-preamble.js and by the /code-review command spec.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * Extension loading error messages and utilities for /review-issue and /code-review
 * Referenced by .claude/commands/review-issue.md Step 2b
 * Referenced by .claude/commands/code-review.md Step 5c (#1767)
 *
 * Error handling: all errors fall back to standard review only (non-blocking).
 */

const fs = require('fs');
const path = require('path');

const ERRORS = {
  REGISTRY_NOT_FOUND: 'Review extensions registry not found. Run hub update or check installation.',
  REGISTRY_MALFORMED: 'Review extensions registry is malformed. Run hub update or check installation.',
  CRITERIA_NOT_FOUND: (domain) => `Warning: Review criteria file not found for '${domain}'. Skipping domain. Update hub to resolve.`,
  ALL_MISSING: 'No review criteria files found. Running standard review only.',
  UNKNOWN_EXTENSION: (id, available = []) => `Unknown extension: ${id}. Available: ${available.join(', ')}`
};

const REGISTRY_RELATIVE_PATH = ['.claude', 'metadata', 'review-extensions.json'];

/**
 * Read the review extensions registry, or null when it cannot be read.
 *
 * Null is deliberately distinguishable from an empty registry: callers treat
 * "could not read" and "read, nothing registered" differently.
 *
 * @param {string} projectDir
 * @returns {object|null}
 */
function readRegistry(projectDir) {
  try {
    const raw = fs.readFileSync(path.join(projectDir, ...REGISTRY_RELATIVE_PATH), 'utf-8');
    const registry = JSON.parse(raw);
    return registry && typeof registry.extensions === 'object' ? registry : null;
  } catch (_err) {
    return null;
  }
}

/**
 * The set of domain ids this project can review with, derived from the
 * registry (#2812).
 *
 * This used to be a literal array duplicating the registry keys, and it acted
 * as a GATE — `resolveAutoInclusion` filtered `activeDomains` through it, so a
 * domain added to the registry alone was silently dropped from auto-inclusion.
 * Nothing asserted parity between the two. Deriving removes the second source
 * rather than adding a test to hold two sources together.
 *
 * @param {string} [projectDir] - defaults to the current working directory
 * @returns {string[]} Registered domain ids; empty when the registry is unreadable
 */
function getAvailableExtensions(projectDir = process.cwd()) {
  const registry = readRegistry(projectDir);
  return registry ? Object.keys(registry.extensions) : [];
}

/**
 * Resolve auto-inclusion domains from activeDomains and domainSpecialist.
 * @param {string} projectDir - Path to the project directory
 * @param {string[]} explicitDomains - Domains explicitly requested via --with
 * @param {object} options - { withNone: boolean, without: string[] }
 * @returns {object} { domains: string[], sources: Map<string, string> }
 */
function resolveAutoInclusion(projectDir, explicitDomains = [], options = {}) {
  const sources = new Map(); // domain -> source attribution
  const domains = new Set();

  if (options.withNone) {
    // --with none suppresses all auto-inclusion
    return { domains: [], sources };
  }

  // Load framework-config.json for activeDomains and domainSpecialist
  const configPath = path.join(projectDir, 'framework-config.json');
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    // No config or malformed — no auto-inclusion
    if (process.env.DEBUG) console.error(`[DEBUG load-review-extensions] Config load failed: ${err.message}`);
  }

  // One registry read serves both sources below: the available-domain set that
  // gates source 1, and the relevantSpecialists mapping that drives source 2.
  const registry = readRegistry(projectDir);

  // Source 1: activeDomains from framework-config.json
  const activeDomains = Array.isArray(config.activeDomains) ? config.activeDomains : [];
  const withoutSet = new Set(options.without || []);

  // Null registry means there is no derived set, so no filtering can happen —
  // activeDomains pass through. That failure is visible: a bogus domain
  // surfaces downstream as EXTENSION_NOT_FOUND or CRITERIA_NOT_FOUND. Dropping
  // every domain instead would be silent and total (#2812).
  const availableIds = registry ? new Set(Object.keys(registry.extensions)) : null;

  for (const domain of activeDomains) {
    const registered = availableIds === null || availableIds.has(domain);
    if (registered && !withoutSet.has(domain)) {
      domains.add(domain);
      sources.set(domain, 'activeDomains');
    }
  }

  // Source 2: domainSpecialist -> relevantSpecialists matching
  const specialist = config.domainSpecialist;
  if (specialist && registry) {
    for (const [id, ext] of Object.entries(registry.extensions)) {
      if (Array.isArray(ext.relevantSpecialists) && ext.relevantSpecialists.includes(specialist)) {
        if (!withoutSet.has(id)) {
          domains.add(id);
          if (!sources.has(id)) {
            sources.set(id, specialist);
          }
        }
      }
    }
  }

  // Source 3: explicit --with (additive)
  for (const domain of explicitDomains) {
    if (domain !== 'all' && domain !== 'none') {
      domains.add(domain);
      if (!sources.has(domain)) {
        sources.set(domain, '--with');
      }
    }
  }

  return { domains: [...domains], sources };
}

// #2359 — Section marker regexes. The dev source authors write H2 headings,
// but the minimization pipeline flattens `## X` → `**X**` in .min-mirror/ and
// that is what ships to user projects. The parser must accept either form.
const ANY_H2_HEADING = /^##\s+/;
const ANY_BOLD_PARAGRAPH = /^\*\*[^*]+\*\*\s*$/;

const CODE_REVIEW_SECTION = 'Code Review Questions';

/**
 * Escape a section name for use inside a RegExp.
 *
 * Shipped section names are alphanumerics and spaces, so this changes nothing
 * for them. It is here because the section is now a PARAMETER: a caller can
 * pass anything, and an unescaped metacharacter would silently match the wrong
 * section rather than fail (#2812).
 *
 * @param {string} literal
 * @returns {string}
 */
function escapeForRegExp(literal) {
  return String(literal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the bullet items of a named question section (#2812).
 *
 * Accepts either `## <section>` (H2, the dev source form) or `**<section>**`
 * (bold paragraph, the minimized form that ships). Terminates on the next H2
 * OR the next bold paragraph, so a section never bleeds into its successor.
 *
 * @param {string} content - Full content of a review criteria markdown file
 * @param {string} section - Section name, e.g. 'Issue Review Questions'
 * @returns {string[]} Question strings; empty when the section is absent or
 *   carries no bullets
 */
function extractSectionQuestions(content, section) {
  const name = escapeForRegExp(section);
  const headingMarker = new RegExp('^##\\s+' + name + '\\b');
  const boldMarker = new RegExp('^\\*\\*' + name + '\\*\\*\\s*$');

  const lines = String(content || '').split('\n');
  const questions = [];
  let inSection = false;

  for (const line of lines) {
    if (headingMarker.test(line) || boldMarker.test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && (ANY_H2_HEADING.test(line) || ANY_BOLD_PARAGRAPH.test(line))) {
      break;
    }

    if (inSection && /^\s*-\s+/.test(line)) {
      questions.push(line.replace(/^\s*-\s+/, '').trim());
    }
  }

  return questions;
}

/**
 * Extract the "Code Review Questions" section from criteria file content.
 *
 * Retained as a wrapper over `extractSectionQuestions` so /code-review and its
 * tests need no edit — the export surface is deployed (#2812).
 *
 * @param {string} content - Full content of a review criteria markdown file
 * @returns {string[]} Array of question strings (bullet items)
 */
function extractCodeReviewQuestions(content) {
  return extractSectionQuestions(content, CODE_REVIEW_SECTION);
}

/**
 * Resolve the root that `registry.extensions[id].source` paths are relative to (#1861).
 *
 * The registry lives in projectDir — `.claude/metadata/` is symlinked to the
 * hub — but the criteria files it points at live in the framework root. The
 * two differ in every deployed project and coincide only when self-hosted.
 *
 * Exported (#2812) because review-preamble.js resolves the same paths; a
 * second copy of this rule there is the duplication this issue exists to
 * remove, one directory along.
 *
 * @param {string} projectDir - Path to the project directory
 * @returns {string} Framework root, falling back to projectDir
 */
function resolveFrameworkRoot(projectDir) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(projectDir, 'framework-config.json'), 'utf-8'));
    if (config.frameworkPath && config.frameworkPath !== '.') {
      return path.resolve(projectDir, config.frameworkPath);
    }
  } catch (_err) {
    // No config or malformed — fall back to projectDir (self-hosted behavior)
  }
  return projectDir;
}

/**
 * Load code review extension criteria for specified domains.
 * @param {string} projectDir - Path to the project directory
 * @param {string[]} domainIds - Domain IDs to load, or ['all']
 * @returns {object} { ok, domains, warnings, error? }
 */
function loadCodeReviewExtensions(projectDir, domainIds) {
  const registryPath = path.join(projectDir, '.claude', 'metadata', 'review-extensions.json');
  const warnings = [];
  const frameworkRoot = resolveFrameworkRoot(projectDir);

  // Load registry
  if (!fs.existsSync(registryPath)) {
    return { ok: false, domains: {}, warnings, error: ERRORS.REGISTRY_NOT_FOUND };
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch (_err) {
    return { ok: false, domains: {}, warnings, error: ERRORS.REGISTRY_MALFORMED };
  }

  // Resolve 'all' to all registered extensions
  let requestedIds = domainIds;
  if (requestedIds.length === 1 && requestedIds[0] === 'all') {
    requestedIds = Object.keys(registry.extensions);
  }

  const domains = {};

  for (const id of requestedIds) {
    const ext = registry.extensions[id];
    if (!ext) {
      warnings.push(ERRORS.UNKNOWN_EXTENSION(id, Object.keys(registry.extensions)));
      continue;
    }

    // Read criteria file — resolve against frameworkRoot, not projectDir (#1861)
    const criteriaPath = path.join(frameworkRoot, ext.source);
    try {
      const content = fs.readFileSync(criteriaPath, 'utf-8');
      const questions = extractCodeReviewQuestions(content);

      if (questions.length > 0) {
        domains[id] = {
          description: ext.description,
          domain: ext.domain || null,
          questions,
        };
      } else {
        warnings.push(`No Code Review Questions found in ${ext.source}. Skipping '${id}'.`);
      }
    } catch (_err) {
      warnings.push(ERRORS.CRITERIA_NOT_FOUND(id));
    }
  }

  return { ok: true, domains, warnings };
}

/**
 * Parse charter text to extract Tech Stack and In Scope content.
 * Out of Scope is excluded — it describes what the project does NOT do,
 * so its keywords should not trigger domain applicability.
 * @param {string} charterContent - Raw CHARTER.md content
 * @returns {string} Lowercase combined text from relevant sections
 */
function parseCharterSignals(charterContent) {
  if (!charterContent) return '';
  const lines = charterContent.split('\n');
  const sections = [];
  let capturing = false;

  for (const line of lines) {
    // Only capture Tech Stack and In Scope (NOT Out of Scope)
    if (/^##\s+(Tech Stack|In Scope)/i.test(line)) {
      capturing = true;
      continue;
    }
    // Stop at next ## heading
    if (capturing && /^##\s+/.test(line)) {
      capturing = false;
      continue;
    }
    if (capturing) {
      sections.push(line);
    }
  }
  return sections.join(' ').toLowerCase();
}

/**
 * Filter requested domains by charter applicability.
 * Priority: activeDomains (config) > charter inference > fallback (all pass).
 *
 * @param {string[]} requestedDomains - Domain IDs requested via --with
 * @param {string} charterContent - Raw CHARTER.md content
 * @param {string} domainSignalsJson - Raw domain-signals.json content
 * @param {object} config - framework-config.json parsed object
 * @returns {{ applicable: string[], skipped: Array<{domain: string, reason: string}>, source: string }}
 */
function filterDomainsByCharter(requestedDomains, charterContent, domainSignalsJson, config = {}) {
  // Priority 1: a CONFIGURED activeDomains overrides everything.
  //
  // An EMPTY array is "not configured", not "nothing applies" (#2810).
  // `Array.isArray([])` is true, so an empty array used to take this branch with
  // an empty `activeSet`: every requested domain fell into `skipped`, priority 2
  // was never reached, and `/code-review --with all` returned zero domains. `[]`
  // is the state of a project where nobody has answered the domain question
  // yet — the default after install — so the user asked for everything and got
  // nothing, reported as "not applicable per activeDomains".
  //
  // Note the sibling reader `resolveAutoInclusion` treats this same key as
  // ADDITIVE and already handles `[]` correctly by contributing nothing. The
  // additive-versus-narrowing split between the two is a design question, not
  // this defect, and is deliberately left alone here.
  const activeDomains =
    Array.isArray(config.activeDomains) && config.activeDomains.length > 0
      ? config.activeDomains
      : null;
  if (activeDomains) {
    const activeSet = new Set(activeDomains);
    const applicable = requestedDomains.filter(d => activeSet.has(d));
    const skipped = requestedDomains
      .filter(d => !activeSet.has(d))
      .map(d => ({ domain: d, reason: 'Not in activeDomains config' }));
    return { applicable, skipped, source: 'activeDomains' };
  }

  // Priority 2: Charter inference
  let signals;
  try {
    signals = JSON.parse(domainSignalsJson);
  } catch (_err) {
    // Fallback: no filtering
    return { applicable: [...requestedDomains], skipped: [], source: 'fallback' };
  }

  const charterText = parseCharterSignals(charterContent);
  const applicable = [];
  const skipped = [];

  for (const domain of requestedDomains) {
    const domainConfig = signals.domains && signals.domains[domain];
    if (!domainConfig) {
      // Unknown domain in signals — let it through
      applicable.push(domain);
      continue;
    }

    if (domainConfig.alwaysApplicable) {
      applicable.push(domain);
      continue;
    }

    // Check charter keywords
    const hasKeywordMatch = domainConfig.charterKeywords &&
      domainConfig.charterKeywords.some(kw => charterText.includes(kw.toLowerCase()));

    if (hasKeywordMatch) {
      applicable.push(domain);
    } else {
      skipped.push({ domain, reason: domainConfig.reason || 'No charter signals matched' });
    }
  }

  return { applicable, skipped, source: 'charter' };
}

/**
 * Suggest domains based on charter analysis and score by relevance.
 * Returns sorted array (high → none) with reasoning.
 *
 * @param {string} charterContent - Raw CHARTER.md content
 * @param {string} domainSignalsJson - Raw domain-signals.json content
 * @returns {Array<{domain: string, relevance: string, reason: string}>}
 */
function suggestDomains(charterContent, domainSignalsJson) {
  let signals;
  try {
    signals = JSON.parse(domainSignalsJson);
  } catch (_err) {
    return [];
  }

  if (!signals.domains) return [];

  const charterText = parseCharterSignals(charterContent);
  const results = [];
  const relevanceOrder = { high: 0, medium: 1, low: 2, none: 3 };

  for (const [domain, config] of Object.entries(signals.domains)) {
    // Count keyword matches
    const matchCount = config.charterKeywords
      ? config.charterKeywords.filter(kw => charterText.includes(kw.toLowerCase())).length
      : 0;
    const totalKeywords = config.charterKeywords ? config.charterKeywords.length : 1;
    const matchRatio = matchCount / totalKeywords;

    let relevance;
    if (config.alwaysApplicable) {
      relevance = 'high';
    } else if (matchRatio >= 0.3) {
      relevance = 'high';
    } else if (matchRatio > 0 && matchRatio < 0.3) {
      relevance = 'medium';
    } else if (matchCount === 0 && charterText.length === 0) {
      relevance = 'low'; // No charter info — uncertain
    } else {
      relevance = 'none';
    }

    results.push({
      domain,
      relevance,
      reason: config.reason || domain
    });
  }

  // Sort by relevance (high first)
  results.sort((a, b) => relevanceOrder[a.relevance] - relevanceOrder[b.relevance]);

  return results;
}

module.exports = {
  ERRORS,
  getAvailableExtensions,
  resolveFrameworkRoot,
  extractSectionQuestions,
  extractCodeReviewQuestions,
  loadCodeReviewExtensions,
  resolveAutoInclusion,
  filterDomainsByCharter,
  suggestDomains
};

// `AVAILABLE_EXTENSIONS` was an exported literal until #2812. It is kept as a
// lazily-derived accessor so any existing consumer of the name keeps working;
// prefer `getAvailableExtensions(projectDir)`, which does not depend on the
// process working directory being the project root.
Object.defineProperty(module.exports, 'AVAILABLE_EXTENSIONS', {
  get() { return getAvailableExtensions(); },
  enumerable: true
});
