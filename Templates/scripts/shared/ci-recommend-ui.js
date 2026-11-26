#!/usr/bin/env node
// Rubrical Works (c) 2026

/**
 * @framework-script 0.123.0
 * @description Format CI recommendations as a numbered interactive menu and parse user selections. Provides the display layer between ci-recommend.js (analysis) and ci-apply.js (execution). Part of the /ci --recommend subcommand.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * The workflow a recommendation that reaches ci-apply.js applyAdd changes
 * (#3789) — an Add, or an Improve with a feature, which applyImprove hands to
 * applyAdd (#3870) — or null for any other. One with no file is shown as
 * refused — ci-apply.js will not guess one.
 * @param {{ type: string, feature?: string, file?: string, createNew?: boolean }} rec
 * @returns {string|null}
 */
function formatTarget(rec) {
  if (!(rec.type === 'Add' || (rec.type === 'Improve' && rec.feature))) return null;
  if (!rec.file) return 'Target: none — will be refused (no workflow named)';
  return `Target: ${rec.file}${rec.createNew ? ' (new file)' : ''}`;
}

/**
 * Format recommendations as a numbered menu with category prefixes.
 * @param {Array<{ type: string, description: string, impact: string }>} recommendations
 * @returns {string} Formatted menu string
 */
function formatRecommendationMenu(recommendations) {
  const lines = [];
  const count = recommendations.length;

  lines.push(`Found ${count} recommendation${count === 1 ? '' : 's'}:\n`);

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    lines.push(`  ${i + 1}. [${rec.type}] ${rec.description}`);
    lines.push(`     Impact: ${rec.impact}`);
    const target = formatTarget(rec);
    if (target) lines.push(`     ${target}`);
    // #3424: a recommendation that removes or defers CI signal says which.
    if (rec.tradeoff) lines.push(`     Gives up: ${rec.tradeoff}`);
  }

  lines.push('');
  lines.push('Select recommendations to apply: enter numbers (e.g., 1,2,4), "all", or "none"');

  return lines.join('\n');
}

/**
 * Parse a user selection string into an array of 0-indexed indices.
 * @param {string} input - User input (e.g., "1,2,4", "all", "none")
 * @param {number} total - Total number of recommendations
 * @returns {number[]} Array of 0-indexed selected indices
 */
function parseSelection(input, total) {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === 'all') {
    return Array.from({ length: total }, (_, i) => i);
  }

  if (trimmed === 'none') {
    return [];
  }

  const seen = new Set();
  const result = [];

  const parts = trimmed.split(',');
  for (const part of parts) {
    const num = parseInt(part.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= total && !seen.has(num)) {
      seen.add(num);
      result.push(num - 1); // Convert to 0-indexed
    }
  }

  return result;
}

/**
 * Format recommendations as plain text (--quiet mode).
 * @param {Array<{ type: string, description: string, impact: string }>} recommendations
 * @returns {string} Plain text output
 */
function formatQuietOutput(recommendations) {
  if (recommendations.length === 0) {
    return 'No recommendations found. Your CI configuration looks good.';
  }

  const lines = [];
  for (const rec of recommendations) {
    lines.push(`[${rec.type}] ${rec.description}`);
    lines.push(`  Impact: ${rec.impact}`);
    const target = formatTarget(rec);
    if (target) lines.push(`  ${target}`);
    if (rec.tradeoff) lines.push(`  Gives up: ${rec.tradeoff}`);
  }
  return lines.join('\n');
}

/**
 * Format the "no recommendations" message with validation tip.
 * @returns {string}
 */
function formatNoRecommendations() {
  return [
    'Your CI configuration looks good — no recommendations found.',
    '',
    'Tip: Run /ci --validate to check for syntax errors and anti-patterns.'
  ].join('\n');
}

// CLI entry point (#3794): ci-recommend-ui.js --input <recs.json>
// prints the numbered menu for the JSON `ci-recommend.js --json` writes.
if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);
  const i = args.indexOf('--input');
  const input = i >= 0 ? args[i + 1] : undefined;
  if (!input) {
    console.error('Usage: ci-recommend-ui.js --input <recs.json>');
    process.exit(2);
  }
  let recommendations;
  try {
    recommendations = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (!Array.isArray(recommendations)) throw new Error('expected a JSON array of recommendations');
  } catch (err) {
    console.error(`ci-recommend-ui: invalid --input: ${err.message}`);
    process.exit(2);
  }
  console.log(recommendations.length === 0 ? formatNoRecommendations() : formatRecommendationMenu(recommendations));
}

module.exports = { formatRecommendationMenu, formatTarget, parseSelection, formatQuietOutput, formatNoRecommendations };
