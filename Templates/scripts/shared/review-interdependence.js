#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.82.0
 * @description Analyze interdependence between multiple issues.
 * Detects overlap, ordering dependencies, conflicts, and shared criteria
 * using config-driven evaluation dimensions.
 * @checksum sha256:placeholder
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../../metadata/review-interdependence.json');

/**
 * Load interdependence configuration.
 * @returns {object} Config object with dimensions
 */
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {
      dimensions: {
        overlap: { enabled: true, severity: 'warning' },
        ordering: { enabled: true, severity: 'info', orderingPatterns: {} },
        conflicts: { enabled: true, severity: 'error', conflictPatterns: {} },
        sharedCriteria: { enabled: true, severity: 'info', similarityThreshold: 0.6 }
      }
    };
  }
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

  // Extract acceptance criteria lines
  const acPattern = /- \[[ x]\] (.+)/g;
  const acs = [];
  let match;
  while ((match = acPattern.exec(text)) !== null) {
    acs.push(match[1].trim().toLowerCase());
  }

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

  // Compute suggested order
  const orderingFindings = findings.filter(f => f.dimension === 'ordering');
  const suggestedOrder = computeSuggestedOrder(sorted, orderingFindings);

  return {
    issues: sorted.map(i => i.number),
    findings,
    suggestedOrder
  };
}

module.exports = { analyzeInterdependence };
