/**
 * @framework-script 0.91.0
 * @description Extracts acceptance criteria from issue bodies, generates structured
 *   AC JSON files for mockup sets, and handles merge behavior on re-runs.
 *   Used by /mockups command when an issue reference (#NN) is provided.
 */

/**
 * Extract acceptance criteria checkbox items from an issue body.
 * Looks for a section starting with "Acceptance Criteria" (as heading or bold text)
 * and parses checkbox items until the next section header.
 *
 * @param {string|null|undefined} body - Issue body markdown
 * @returns {Array<{text: string, checked: boolean}>}
 */
function extractAC(body) {
  if (!body) return [];

  const criteria = [];
  const lines = body.split('\n');
  let inAC = false;

  for (const line of lines) {
    // Detect AC section — markdown heading or bold text
    if (/^(?:#+\s*|\*\*)\s*Acceptance\s*Criteria/i.test(line)) {
      inAC = true;
      continue;
    }

    // End of AC section at next heading (but not another AC heading)
    if (inAC && /^#+\s/.test(line) && !/acceptance\s*criteria/i.test(line)) {
      inAC = false;
      continue;
    }

    // End of AC section at next bold section header (e.g., **Reviews:** or **Scope:**)
    if (inAC && /^\*\*[A-Z]/.test(line) && !/acceptance\s*criteria/i.test(line)) {
      inAC = false;
      continue;
    }

    // Parse checkbox items
    if (inAC) {
      const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)/);
      if (match) {
        criteria.push({
          text: match[2].trim(),
          checked: match[1].toLowerCase() === 'x'
        });
      }
    }
  }

  return criteria;
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
