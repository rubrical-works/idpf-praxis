// Rubrical Works (c) 2026
/**
 * @framework-script 0.73.0
 * @description Load and resolve review extension domains for /review-issue and /code-review. Exports loadCodeReviewExtensions(), resolveAutoInclusion(), filterDomainsByCharter(), suggestDomains(), and AVAILABLE_EXTENSIONS. Used by review-preamble.js and code-review-preamble.js.
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
  UNKNOWN_EXTENSION: (id) => `Unknown extension: ${id}. Available: ${AVAILABLE_EXTENSIONS.join(', ')}`
};

const AVAILABLE_EXTENSIONS = [
  'security', 'accessibility', 'performance', 'chaos', 'contract', 'qa',
  'seo', 'privacy', 'observability', 'i18n', 'api-design'
];

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

  // Source 1: activeDomains from framework-config.json
  const activeDomains = Array.isArray(config.activeDomains) ? config.activeDomains : [];
  const withoutSet = new Set(options.without || []);

  for (const domain of activeDomains) {
    if (AVAILABLE_EXTENSIONS.includes(domain) && !withoutSet.has(domain)) {
      domains.add(domain);
      sources.set(domain, 'activeDomains');
    }
  }

  // Source 2: domainSpecialist -> relevantSpecialists matching
  const specialist = config.domainSpecialist;
  if (specialist) {
    const registryPath = path.join(projectDir, '.claude', 'metadata', 'review-extensions.json');
    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
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
    } catch (_err) {
      // Registry not found or malformed — skip specialist auto-inclusion
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

/**
 * Extract "Code Review Questions" section from criteria file content.
 * @param {string} content - Full content of a review criteria markdown file
 * @returns {string[]} Array of question strings (bullet items)
 */
function extractCodeReviewQuestions(content) {
  const lines = content.split('\n');
  const questions = [];
  let inSection = false;

  for (const line of lines) {
    // Detect start of Code Review Questions section
    if (/^##\s+Code Review Questions/.test(line)) {
      inSection = true;
      continue;
    }

    // Detect next section (any ## heading) — end of our section
    if (inSection && /^##\s+/.test(line)) {
      break;
    }

    // Collect bullet items within the section
    if (inSection && /^\s*-\s+/.test(line)) {
      questions.push(line.replace(/^\s*-\s+/, '').trim());
    }
  }

  return questions;
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

  // Resolve frameworkPath for criteria file resolution (#1861)
  // Registry is in projectDir (.claude/metadata/ is symlinked), but criteria files
  // are in the framework root (hub installation), not the project directory.
  let frameworkRoot = projectDir;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(projectDir, 'framework-config.json'), 'utf-8'));
    if (config.frameworkPath && config.frameworkPath !== '.') {
      frameworkRoot = path.resolve(projectDir, config.frameworkPath);
    }
  } catch (_err) {
    // No config or malformed — fall back to projectDir (self-hosted behavior)
  }

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
      warnings.push(ERRORS.UNKNOWN_EXTENSION(id));
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
  // Priority 1: activeDomains from config overrides everything
  const activeDomains = Array.isArray(config.activeDomains) ? config.activeDomains : null;
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

module.exports = { ERRORS, AVAILABLE_EXTENSIONS, extractCodeReviewQuestions, loadCodeReviewExtensions, resolveAutoInclusion, filterDomainsByCharter, suggestDomains };
