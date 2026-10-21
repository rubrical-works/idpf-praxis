// Rubrical Works (c) 2026
/**
 * @framework-script 0.109.1
 *
 * Line-ending normalization for issue and comment bodies (#3064).
 *
 * Bodies edited in GitHub's web UI can arrive with CRLF endings. Parsers that
 * split on `\n` or anchor on `$` then fail silently: a review comment yields
 * no findings, a **Processing Order:** section reads on into the next prose.
 * Normalizing once where a body enters a parser fixes every pattern behind it,
 * where adding `\r?` to each regex would leave the next new one exposed.
 *
 * Runtime dependency contract: Node built-ins only, and in fact zero requires.
 */

/**
 * Convert CRLF and lone CR line endings to LF.
 * Non-string input is returned unchanged so callers keep their own null checks.
 * @param {*} text
 * @returns {*}
 */
function normalizeEol(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Render a body with CRLF endings — the shared CRLF test pattern: a parser
 * test builds its LF fixture, then asserts the CRLF twin parses identically.
 * @param {string} text
 * @returns {string}
 */
function toCrlf(text) {
  return normalizeEol(text).replace(/\n/g, '\r\n');
}

module.exports = { normalizeEol, toCrlf };
