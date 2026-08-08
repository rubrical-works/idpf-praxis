// Rubrical Works (c) 2026
/**
 * @framework-script 0.96.0
 *
 * Boundary-anchored issue-reference matching and name-status parsing (#2467).
 *
 * Five scripts previously matched issue references by substring, so a low
 * issue number cross-matched every longer number containing it as a prefix
 * (#24 matched #245, #2453, ...). In a repo with 2400+ issues that corrupted
 * two BLOCKING gates -- /work Step 4c scope-drift and the /done confirmation
 * gate -- plus three reports. `readLatestCommitMessage` shared the flaw, so a
 * `Scope-Override:` could be honoured from an unrelated issue's commit.
 *
 * Separately, name-status parsing matched only `^([AMD])\t`, so rename and
 * copy lines (`R100\told\tnew`) were never recorded as touched. `git mv` of an
 * always-protected path (framework-config.json, .claude/metadata/**, ...)
 * passed the scope-drift gate entirely.
 *
 * Centralised here so the five call sites cannot drift apart -- five
 * separately-corrected regexes would.
 *
 * Runtime dependency contract: Node built-ins only, and in fact zero requires.
 * Deployed helpers run from the framework root, whose node_modules contains
 * only the packages declared in framework-manifest.json runtimeNpmDependencies.
 */

/**
 * Git `--grep` uses POSIX BASIC regular expressions by default, where the
 * grouping and alternation metacharacters are backslash-escaped: `\(`, `\|`,
 * `\)`. `[^0-9]` is a bracket expression and needs no escaping. Anchoring with
 * `\([^0-9]\|$\)` means "followed by a non-digit, or end of line", which is
 * what stops #24 from matching #245.
 *
 * Note this is a TRAILING boundary only. A leading boundary is unnecessary
 * because the literal `#` already terminates any preceding digit run.
 *
 * @param {number|string} issueNumber Issue number (digits only)
 * @param {{ keyword?: string|null }} [options] `keyword` defaults to 'Refs';
 *   pass null for a bare `#N` match (done-verify.js greps without a keyword).
 * @returns {string} git basic-regex pattern
 * @throws {TypeError} if issueNumber is not a positive integer
 */
function issueRefGrepPattern(issueNumber, options = {}) {
  assertIssueNumber(issueNumber);
  const keyword = options.keyword === undefined ? 'Refs' : options.keyword;
  const prefix = keyword ? `${keyword} ` : '';
  return `${prefix}#${issueNumber}\\([^0-9]\\|$\\)`;
}

/**
 * Test whether free text references an issue with a numeric boundary.
 *
 * Used where the text is already in hand rather than being filtered by git
 * (reset-issue-preamble.js scans Construction/Test-Plans/ file contents).
 *
 * @param {string|null|undefined} text
 * @param {number|string} issueNumber
 * @returns {boolean}
 */
function bodyMentionsIssue(text, issueNumber) {
  if (!text || typeof text !== 'string') return false;
  assertIssueNumber(issueNumber);
  // JS regex here (not git BRE) -- this runs in-process, not through git.
  return new RegExp(`#${issueNumber}(?![0-9])`).test(text);
}

/**
 * Parse one `git log --name-status` / `git diff --name-status` line.
 *
 * Handles rename (`R`) and copy (`C`) lines, which carry a similarity score
 * and TWO tab-separated paths: `R100\told\tnew`. Both paths are returned --
 * the old path leaving the declared scope and the new path entering it are
 * both scope-relevant, and recording only one is what let `git mv` of a
 * protected file pass the gate.
 *
 * @param {string} line
 * @returns {{ status: string, paths: string[] }|null} null for blank lines,
 *   commit headers, and unrecognised statuses
 */
function parseNameStatusLine(line) {
  if (!line || typeof line !== 'string') return null;

  const m = line.match(/^([AMDTRC])(\d*)\t(.+)$/);
  if (!m) return null;

  const status = m[1];
  const rest = m[3];

  if (status === 'R' || status === 'C') {
    const parts = rest.split('\t');
    // A rename/copy line without both paths is malformed; treat as unparseable
    // rather than silently recording a half-move.
    if (parts.length < 2) return null;
    const paths = parts.slice(0, 2).map(p => p.trim()).filter(Boolean);
    if (paths.length < 2) return null;
    return { status, paths };
  }

  const single = rest.split('\t')[0].trim();
  if (!single) return null;
  return { status, paths: [single] };
}

/**
 * Collect every path touched in raw name-status output, rename/copy aware.
 *
 * @param {string} raw
 * @returns {string[]} de-duplicated paths, insertion-ordered
 */
function collectTouchedPaths(raw) {
  const seen = new Set();
  if (!raw || typeof raw !== 'string') return [];
  for (const line of raw.split('\n')) {
    const parsed = parseNameStatusLine(line);
    if (!parsed) continue;
    for (const p of parsed.paths) seen.add(p);
  }
  return [...seen];
}

function assertIssueNumber(issueNumber) {
  const s = String(issueNumber);
  if (!/^[0-9]+$/.test(s)) {
    throw new TypeError(`Invalid issue number: ${JSON.stringify(issueNumber)} (expected digits only)`);
  }
}

module.exports = {
  issueRefGrepPattern,
  bodyMentionsIssue,
  parseNameStatusLine,
  collectTouchedPaths
};
