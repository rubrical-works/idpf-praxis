#!/usr/bin/env node
// Rubrical Works (c) 2026

/**
 * @framework-script 0.76.0
 * @description Format CI recommendations as a numbered interactive menu and parse user selections. Provides the display layer between ci-recommend.js (analysis) and ci-apply.js (execution). Part of the /ci recommend subcommand.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

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
    'Tip: Run /ci validate to check for syntax errors and anti-patterns.'
  ].join('\n');
}

// CLI entry point
if (require.main === module) {
  console.log(formatNoRecommendations());
}

module.exports = { formatRecommendationMenu, parseSelection, formatQuietOutput, formatNoRecommendations };
