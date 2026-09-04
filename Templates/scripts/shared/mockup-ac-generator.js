/**
 * @framework-script 0.101.0
 * @description Extracts acceptance criteria from issue bodies, generates structured
 *   AC JSON files for mockup sets, and handles merge behavior on re-runs.
 *   Used by /mockups command when an issue reference (#NN) is provided.
 */

// #2600: this file was NOT among the six scanners the issue enumerated, but its
// own @description says it extracts acceptance criteria from issue bodies, so
// AC6 covers it — "every framework code path", not "the six listed". It was
// fence-blind like the rest.
const { extractAcceptanceCriteria: sharedExtractAcceptanceCriteria } = require('./lib/checkbox-scan.js');

/**
 * Extract acceptance criteria checkbox items from an issue body.
 * Looks for a section starting with "Acceptance Criteria" (as heading or bold text)
 * and parses checkbox items until the next section header.
 *
 * @param {string|null|undefined} body - Issue body markdown
 * @returns {Array<{text: string, checked: boolean}>}
 */
function extractAC(body) {
  // #2616: one section anchor, not three. This file used to accept ANY #+ level
  // plus any bold line matching "acceptance criteria", and terminate on any line
  // starting `**` followed by a capital — the last of which was the #2613 defect
  // (an inline bold lead-in ended the section and returned zero criteria).
  //
  // #2613 fixed the terminator by importing isBoldMarker; this completes the
  // move by delegating the whole anchor. What was a local rule "consumers depend
  // on" turned out to be depended on by nothing: 0 headings outside the three
  // shared forms across the measured corpus.
  return sharedExtractAcceptanceCriteria(body).items;
}

/**
 * Generate an AC JSON file structure from extracted criteria.
 *
 * @param {Object} options
 * @param {number} options.issueNumber - Issue number
 * @param {string} options.issueTitle - Issue title
 * @param {Array<{text: string, checked: boolean}>} options.criteria - Extracted ACs
 * @param {string[]} options.mockupFiles - List of mockup file paths
 * @param {Object<string, string[]>} [options.mapping] - Optional AC-ID to mockup file mapping
 * @returns {Object} AC JSON structure
 */
function generateACFile({ issueNumber, issueTitle, criteria, mockupFiles: _mockupFiles, mapping }) {
  if (!criteria || !Array.isArray(criteria) || criteria.length === 0) {
    return { skipped: true, reason: 'No acceptance criteria found' };
  }

  const today = new Date().toISOString().slice(0, 10);

  return {
    issue: issueNumber,
    title: issueTitle,
    generated: today,
    criteria: criteria.map((c, i) => {
      const id = `AC-${i + 1}`;
      return {
        id,
        description: c.text,
        mockups: (mapping && mapping[id]) || [],
        verified: c.checked
      };
    })
  };
}

/**
 * Merge incoming AC data with an existing AC file, preserving verified state
 * and mockup mappings from the existing file.
 *
 * Matching is done by description text (not ID), since IDs can shift when
 * new criteria are inserted.
 *
 * @param {Object} existing - Existing AC file data
 * @param {Object} incoming - Newly generated AC file data
 * @returns {Object} Merged AC file data
 */
function mergeACFile(existing, incoming) {
  // Build lookup from existing criteria by description
  const existingByDesc = new Map();
  for (const c of existing.criteria) {
    existingByDesc.set(c.description, c);
  }

  // Merge: use incoming structure but preserve verified and mockups from existing
  const merged = incoming.criteria.map(c => {
    const prev = existingByDesc.get(c.description);
    if (prev) {
      return {
        ...c,
        verified: prev.verified || c.verified,
        mockups: prev.mockups.length > 0 ? prev.mockups : c.mockups
      };
    }
    return c;
  });

  return {
    ...incoming,
    criteria: merged
  };
}

module.exports = { extractAC, generateACFile, mergeACFile };
