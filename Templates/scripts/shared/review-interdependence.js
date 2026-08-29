#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.99.0
 * @description Analyze interdependence between multiple issues.
 * Detects overlap, ordering dependencies, conflicts, and shared criteria
 * using config-driven evaluation dimensions.
 * @checksum sha256:placeholder
 */

const fs = require('fs');
const path = require('path');
const { scanCheckboxes } = require('./lib/checkbox-scan.js');
// Reused, not reimplemented (#2622). scope-drift-check.js holds the only
// declared-scope parser and glob matcher in the deployed tree, and both live
// under .claude/scripts/shared/, so the relative require satisfies the runtime
// dependency contract. A second path matcher here would drift from the one the
// Step 4c gate enforces, and the two disagreeing is worse than either being
// imperfect.
const { parseDeclaredScope, matchesAny } = require('./scope-drift-check.js');

const CONFIG_PATH = path.resolve(__dirname, '../../metadata/review-interdependence.json');

// Mirrors declaredScope.creationTerms in review-interdependence.json (#2622).
// Held in code as well as config because an empty term list does not fail — it
// silently degrades every declared-scope finding to "no directional signal",
// which reads exactly like a pair with no real dependency. A default that
// disappears when the config does is worse than no default at all.
const DEFAULT_CREATION_TERMS = [
  'create', 'creates', 'creating',
  'add', 'adds', 'adding',
  'new file',
  'introduce', 'introduces',
  'provide', 'provides',
  'export', 'exports'
];

/**
 * Load interdependence configuration.
 * @returns {object} Config object with dimensions
 */
function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    // A file that parses but carries no dimensions is as unusable as one that
    // does not parse — treat it the same rather than letting callers reach into
    // `undefined.overlap`.
    if (parsed && parsed.dimensions) return parsed;
  } catch {
    // fall through to the built-in defaults
  }
  return {
    dimensions: {
      overlap: { enabled: true, severity: 'warning' },
      ordering: { enabled: true, severity: 'info', orderingPatterns: {} },
      conflicts: { enabled: true, severity: 'error', conflictPatterns: {} },
      sharedCriteria: { enabled: true, severity: 'info', similarityThreshold: 0.6 },
      declaredScope: { enabled: true, severity: 'warning', creationTerms: DEFAULT_CREATION_TERMS }
    }
  };
}

/**
 * Extract meaningful tokens from issue text for comparison.
 * Extracts file paths, component names, and significant words.
 */
function extractTokens(text) {
  if (!text) return { files: [], words: [], acs: [] };
  const lower = text.toLowerCase();

  // Extract file-like references (word.ext or path/word)
  const filePattern = /[\w./-]+\.\w{1,4}/g;
  const files = [...new Set((lower.match(filePattern) || []).filter(f =>
    !f.startsWith('e.g') && !f.startsWith('i.e') && f.length > 3
  ))];

  // Extract significant words (5+ chars, not common English)
  const stopWords = new Set(['about', 'above', 'after', 'again', 'being', 'below',
    'between', 'could', 'during', 'every', 'first', 'found', 'given', 'great',
    'having', 'issue', 'issues', 'might', 'never', 'other', 'quite', 'scope',
    'shall', 'should', 'since', 'still', 'their', 'there', 'these', 'thing',
    'think', 'those', 'three', 'under', 'until', 'using', 'value', 'where',
    'which', 'while', 'would', 'added', 'based', 'check', 'defined', 'ensure',
    'existing', 'format', 'proposed', 'solution', 'description', 'enhancement',
    'criteria', 'acceptance']);
  const wordPattern = /\b[a-z][a-z-]{4,}\b/g;
  const words = [...new Set((lower.match(wordPattern) || []).filter(w => !stopWords.has(w)))];

  // Extract acceptance criteria lines. #2600: reads through the shared
  // fence-aware scanner, so criteria a body merely *quotes* no longer enter
  // cross-issue overlap comparison and report two unrelated issues as
  // interdependent. The old pattern was not even line-anchored, so a `- [ ]`
  // appearing mid-sentence matched too.
  const acs = scanCheckboxes(text).map((box) => box.text.toLowerCase());

  return { files, words, acs };
}

/**
 * Compute Jaccard similarity between two sets.
 */
function jaccardSimilarity(setA, setB) {
  if (setA.length === 0 && setB.length === 0) return 0;
  const a = new Set(setA);
  const b = new Set(setB);
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Detect scope overlap between issue pairs.
 */
function detectOverlap(issues, tokens, config) {
  const findings = [];
  const severity = (config.dimensions.overlap && config.dimensions.overlap.severity) || 'warning';

  for (let i = 0; i < issues.length; i++) {
    for (let j = i + 1; j < issues.length; j++) {
      const a = tokens[i];
      const b = tokens[j];

      // File overlap
      const sharedFiles = a.files.filter(f => b.files.includes(f));
      if (sharedFiles.length > 0) {
        findings.push({
          dimension: 'overlap',
          issues: [issues[i].number, issues[j].number],
          severity,
          evidence: `Shared files/modules: ${sharedFiles.join(', ')}`
        });
      }

      // Significant word overlap (high Jaccard = similar scope)
      if (sharedFiles.length === 0) {
        const wordSim = jaccardSimilarity(a.words, b.words);
        if (wordSim > 0.3) {
          const shared = a.words.filter(w => b.words.includes(w)).slice(0, 5);
          findings.push({
            dimension: 'overlap',
            issues: [issues[i].number, issues[j].number],
            severity,
            evidence: `High scope similarity (${(wordSim * 100).toFixed(0)}%): shared terms — ${shared.join(', ')}`
          });
        }
      }
    }
  }
  return findings;
}

/**
 * Detect ordering dependencies between issue pairs.
 */
function detectOrdering(issues, tokens, config) {
  const findings = [];
  const severity = (config.dimensions.ordering && config.dimensions.ordering.severity) || 'info';
  const patterns = (config.dimensions.ordering && config.dimensions.ordering.orderingPatterns) || {};

  for (let i = 0; i < issues.length; i++) {
    for (let j = i + 1; j < issues.length; j++) {
      const bodyA = (issues[i].body || '').toLowerCase();
      const bodyB = (issues[j].body || '').toLowerCase();
      const titleA = (issues[i].title || '').toLowerCase();
      const titleB = (issues[j].title || '').toLowerCase();
      const textA = titleA + ' ' + bodyA;
      const textB = titleB + ' ' + bodyB;

      // Check if they share files/scope (ordering only matters if related)
      const sharedFiles = tokens[i].files.filter(f => tokens[j].files.includes(f));
      const sharedWords = tokens[i].words.filter(w => tokens[j].words.includes(w));
      if (sharedFiles.length === 0 && sharedWords.length < 3) continue;

      // Refactor-first pattern: if one refactors and the other adds features
      const refactorTerms = patterns.refactorFirst || [];
      const aRefactors = refactorTerms.some(t => textA.includes(t));
      const bRefactors = refactorTerms.some(t => textB.includes(t));

      if (aRefactors && !bRefactors) {
        findings.push({
          dimension: 'ordering',
          issues: [issues[i].number, issues[j].number],
          severity,
          evidence: `#${issues[i].number} refactors shared scope — should precede #${issues[j].number}`
        });
      } else if (bRefactors && !aRefactors) {
        findings.push({
          dimension: 'ordering',
          issues: [issues[j].number, issues[i].number],
          severity,
          evidence: `#${issues[j].number} refactors shared scope — should precede #${issues[i].number}`
        });
      }

      // Fix-first pattern
      const fixTerms = patterns.fixFirst || [];
      const aFixes = issues[i].type === 'bug' || fixTerms.some(t => textA.includes(t));
      const bFixes = issues[j].type === 'bug' || fixTerms.some(t => textB.includes(t));

      if (aFixes && !bFixes && (sharedFiles.length > 0 || sharedWords.length >= 3)) {
        findings.push({
          dimension: 'ordering',
          issues: [issues[i].number, issues[j].number],
          severity,
          evidence: `#${issues[i].number} fixes shared component — should precede #${issues[j].number}`
        });
      } else if (bFixes && !aFixes && (sharedFiles.length > 0 || sharedWords.length >= 3)) {
        findings.push({
          dimension: 'ordering',
          issues: [issues[j].number, issues[i].number],
          severity,
          evidence: `#${issues[j].number} fixes shared component — should precede #${issues[i].number}`
        });
      }
    }
  }
  return findings;
}

/**
 * Detect conflicts between issue pairs.
 */
function detectConflicts(issues, tokens, config) {
  const findings = [];
  const severity = (config.dimensions.conflicts && config.dimensions.conflicts.severity) || 'error';
  const addRemove = (config.dimensions.conflicts &&
    config.dimensions.conflicts.conflictPatterns &&
    config.dimensions.conflicts.conflictPatterns.addRemove) || { add: [], remove: [] };

  for (let i = 0; i < issues.length; i++) {
    for (let j = i + 1; j < issues.length; j++) {
      const textA = ((issues[i].title || '') + ' ' + (issues[i].body || '')).toLowerCase();
      const textB = ((issues[j].title || '') + ' ' + (issues[j].body || '')).toLowerCase();

      // Check shared scope first
      const sharedFiles = tokens[i].files.filter(f => tokens[j].files.includes(f));
      if (sharedFiles.length === 0) continue;

      // Add/remove conflict: one adds to a file, the other removes it
      const aAdds = addRemove.add.some(t => textA.includes(t));
      const aRemoves = addRemove.remove.some(t => textA.includes(t));
      const bAdds = addRemove.add.some(t => textB.includes(t));
      const bRemoves = addRemove.remove.some(t => textB.includes(t));

      if ((aAdds && bRemoves) || (aRemoves && bAdds)) {
        findings.push({
          dimension: 'conflicts',
          issues: [issues[i].number, issues[j].number],
          severity,
          evidence: `Potential add/remove conflict on shared files: ${sharedFiles.join(', ')}`
        });
      }
    }
  }
  return findings;
}

/**
 * Detect shared acceptance criteria across issues.
 */
function detectSharedCriteria(issues, tokens, config) {
  const findings = [];
  const severity = (config.dimensions.sharedCriteria && config.dimensions.sharedCriteria.severity) || 'info';
  const threshold = (config.dimensions.sharedCriteria && config.dimensions.sharedCriteria.similarityThreshold) || 0.6;

  for (let i = 0; i < issues.length; i++) {
    for (let j = i + 1; j < issues.length; j++) {
      const acsA = tokens[i].acs;
      const acsB = tokens[j].acs;

      for (const acA of acsA) {
        for (const acB of acsB) {
          const wordsA = acA.split(/\s+/).filter(w => w.length > 3);
          const wordsB = acB.split(/\s+/).filter(w => w.length > 3);
          const sim = jaccardSimilarity(wordsA, wordsB);
          if (sim >= threshold) {
            findings.push({
              dimension: 'sharedCriteria',
              issues: [issues[i].number, issues[j].number],
              severity,
              evidence: `Similar AC: "${acA.slice(0, 60)}..." ↔ "${acB.slice(0, 60)}..."`
            });
            break; // One match per pair per AC is enough
          }
        }
      }
    }
  }
  return findings;
}

// ─── Declared-Scope Ordering (#2622) ───

/**
 * Test whether two declared scopes intersect.
 *
 * Checked in both directions because a glob may be declared by either side: an
 * issue declaring `CommandsSrc/*.md` collides with one declaring
 * `CommandsSrc/fw-gap-analysis.md` regardless of which is listed first. This is
 * the exact pair the engine missed when it compared body mentions instead —
 * `CommandsSrc/*.md` never appears as prose in the other issue.
 *
 * @param {string[]} pathsA
 * @param {string[]} pathsB
 * @returns {string[]} concrete paths on which the two scopes intersect
 */
function intersectDeclaredScopes(pathsA, pathsB) {
  const hits = new Set();
  for (const p of pathsA) {
    if (matchesAny(p, pathsB)) hits.add(p);
  }
  for (const p of pathsB) {
    if (matchesAny(p, pathsA)) hits.add(p);
  }
  return [...hits].sort();
}

/**
 * Test whether an issue's body claims to CREATE one of the shared paths.
 *
 * Line-scoped on purpose: a creation verb anywhere in a long body says nothing
 * about the shared file specifically. Requiring the verb and the path on the
 * same line keeps the signal deterministic and reviewable, at the cost of
 * missing creations phrased across a line break — the conservative direction,
 * since a missed provider yields "no directional signal" rather than a
 * confidently wrong order.
 *
 * @param {string} body
 * @param {string[]} sharedPaths
 * @param {string[]} creationTerms
 * @returns {boolean}
 */
function declaresCreationOf(body, sharedPaths, creationTerms) {
  if (!body || creationTerms.length === 0) return false;
  const lines = body.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!creationTerms.some(t => lower.includes(t))) continue;
    for (const p of sharedPaths) {
      if (line.includes(p) || matchesAny(p, [line.trim()])) return true;
    }
  }
  return false;
}

/**
 * Detect ordering dependencies from DECLARED scope rather than body mentions.
 *
 * Emits `dimension: 'ordering'` so the findings feed computeSuggestedOrder,
 * tagged `source: 'declared-scope'` so a report can tell them apart from the
 * prose-derived ones.
 *
 * Direction is derived only when one issue claims to create a shared path and
 * the other does not — provider before consumer. With no such signal the
 * collision is still reported, and the evidence says the direction was not
 * derivable rather than presenting the numeric tie-break as a dependency.
 * Given the measured miss rate of the surrounding engine, an ordering asserted
 * with more confidence than the evidence supports is worse than one that
 * declines to assert.
 *
 * @param {Array<{number: number, body?: string}>} issues - sorted by number
 * @param {object} config
 * @returns {Array<object>} ordering findings
 */
function detectDeclaredScopeOrdering(issues, config) {
  const dimension = (config && config.dimensions && config.dimensions.declaredScope) || {};
  if (dimension.enabled === false) return [];

  const severity = dimension.severity || 'warning';
  // Falls back to the built-in list rather than to []. An empty list does not
  // error; it turns every pair into "no directional signal", which is
  // indistinguishable from a genuine absence of dependency.
  const configured = Array.isArray(dimension.creationTerms) && dimension.creationTerms.length > 0
    ? dimension.creationTerms
    : DEFAULT_CREATION_TERMS;
  const creationTerms = configured.map(t => t.toLowerCase());

  // parseDeclaredScope reads `**Files to modify:**` / `**Files:**`, falling back
  // to a prior `### Files Changed` history. An issue that declares nothing
  // contributes nothing: absence of a declaration is not evidence of disjoint
  // scope, and inferring a collision from prose is what the other dimensions do.
  const scopes = issues.map(i => parseDeclaredScope(i.body || '').paths);

  const findings = [];
  for (let i = 0; i < issues.length; i++) {
    for (let j = i + 1; j < issues.length; j++) {
      if (scopes[i].length === 0 || scopes[j].length === 0) continue;

      const shared = intersectDeclaredScopes(scopes[i], scopes[j]);
      if (shared.length === 0) continue;

      const aCreates = declaresCreationOf(issues[i].body, shared, creationTerms);
      const bCreates = declaresCreationOf(issues[j].body, shared, creationTerms);

      const pathList = shared.join(', ');
      if (aCreates && !bCreates) {
        findings.push({
          dimension: 'ordering',
          source: 'declared-scope',
          issues: [issues[i].number, issues[j].number],
          severity,
          evidence: `#${issues[i].number} creates declared scope ${pathList} that #${issues[j].number} also declares — provider should precede consumer`
        });
      } else if (bCreates && !aCreates) {
        findings.push({
          dimension: 'ordering',
          source: 'declared-scope',
          issues: [issues[j].number, issues[i].number],
          severity,
          evidence: `#${issues[j].number} creates declared scope ${pathList} that #${issues[i].number} also declares — provider should precede consumer`
        });
      } else {
        findings.push({
          dimension: 'ordering',
          source: 'declared-scope',
          issues: [issues[i].number, issues[j].number],
          severity,
          evidence: `#${issues[i].number} and #${issues[j].number} both declare ${pathList} — collision on declared scope, no directional signal (order shown is the numeric tie-break, not a derived dependency)`
        });
      }
    }
  }
  return findings;
}

/**
 * Compute suggested ordering from ordering findings.
 * Uses a simple topological hint: issues that should come first appear earlier.
 */
function computeSuggestedOrder(issues, orderingFindings) {
  const issueNums = issues.map(i => i.number);
  if (orderingFindings.length === 0) return issueNums;

  // Build precedence map: precedes[a] = set of issues a should come before
  const precedes = {};
  for (const f of orderingFindings) {
    if (f.issues.length >= 2) {
      const first = f.issues[0];
      if (!precedes[first]) precedes[first] = new Set();
      precedes[first].add(f.issues[1]);
    }
  }

  // Sort: issues with more "precedes" entries come first
  return [...issueNums].sort((a, b) => {
    const aScore = precedes[a] ? precedes[a].size : 0;
    const bScore = precedes[b] ? precedes[b].size : 0;
    return bScore - aScore || a - b; // Tie-break by issue number
  });
}

/**
 * Check whether an issue's labels make it eligible for interdependence analysis.
 * Reads typeFilter from config. Excluded labels take precedence over eligible.
 *
 * Eligibility is evaluated against the issue's OWN labels (#2622). That is what
 * lets an epic's sub-issues be analyzed while the epic itself stays out: a
 * sub-issue carries `story`/`bug`/`enhancement`, the tracker carries `epic`, and
 * `excluded` still wins. Admitting `story` therefore needs no change to
 * `excluded` — removing `epic` from it would make epics analyzable as SUBJECTS,
 * which is the one thing the sub-issue ordering path must not do.
 *
 * @param {string[]} labels - Array of label names from the issue
 * @returns {boolean} true if the issue is eligible
 */
function isEligibleForInterdependence(labels) {
  if (!labels || labels.length === 0) return false;
  const config = loadConfig();
  // Keep this fallback in sync with review-interdependence.json — a config that
  // fails to load must not silently narrow the filter back.
  const typeFilter = config.typeFilter || { eligible: ['bug', 'enhancement', 'story', 'prd', 'test-plan'], excluded: ['proposal', 'epic'] };
  // Excluded takes precedence
  if (labels.some(l => typeFilter.excluded.includes(l))) return false;
  // Must have at least one eligible label
  return labels.some(l => typeFilter.eligible.includes(l));
}

/**
 * Analyze interdependence between multiple issues.
 * @param {Array<{number, title, type, labels, body}>} issues
 * @returns {{ issues: number[], findings: Array, suggestedOrder: number[] }}
 */
function analyzeInterdependence(issues) {
  if (!issues || issues.length < 2) {
    return {
      issues: (issues || []).map(i => i.number),
      findings: [],
      suggestedOrder: (issues || []).map(i => i.number)
    };
  }

  const config = loadConfig();

  // Normalize issue order for determinism (sort by number)
  const sorted = [...issues].sort((a, b) => a.number - b.number);

  // Extract tokens for all issues
  const tokens = sorted.map(issue => extractTokens(
    (issue.title || '') + '\n' + (issue.body || '')
  ));

  // Run each enabled dimension
  const findings = [];

  if (config.dimensions.overlap && config.dimensions.overlap.enabled !== false) {
    findings.push(...detectOverlap(sorted, tokens, config));
  }
  if (config.dimensions.ordering && config.dimensions.ordering.enabled !== false) {
    findings.push(...detectOrdering(sorted, tokens, config));
  }
  if (config.dimensions.conflicts && config.dimensions.conflicts.enabled !== false) {
    findings.push(...detectConflicts(sorted, tokens, config));
  }
  if (config.dimensions.sharedCriteria && config.dimensions.sharedCriteria.enabled !== false) {
    findings.push(...detectSharedCriteria(sorted, tokens, config));
  }
  // Declared scope (#2622). Runs unconditionally unless explicitly disabled —
  // unlike the four above, an absent config entry still enables it, so a
  // deployed project on an older config file gains the dimension rather than
  // silently losing the collision detection it was added for.
  findings.push(...detectDeclaredScopeOrdering(sorted, config));

  // Compute suggested order
  const orderingFindings = findings.filter(f => f.dimension === 'ordering');
  const suggestedOrder = computeSuggestedOrder(sorted, orderingFindings);

  return {
    issues: sorted.map(i => i.number),
    findings,
    suggestedOrder
  };
}

// extractTokens is exported for #2600 AC9: the criterion is that quoted
// criteria stop entering overlap comparison, and only the token extractor can
// show that directly. Asserting it through analyzeInterdependence would prove
// a similarity score changed, not which inputs produced it.
module.exports = { analyzeInterdependence, isEligibleForInterdependence, extractTokens };
