// Rubrical Works (c) 2026
/**
 * @framework-script 0.113.0
 * git-path.js — Undo git's C-style quoting of a path (#3382).
 *
 * git wraps a path holding a quote, a backslash or a control character in
 * double quotes and escapes it C-style; under core.quotePath (the default) a
 * non-ASCII byte is quoted too, as octal — `café.js` is `"caf\303\251.js"`.
 * Kept quoted, the path never equals the file it names.
 *
 * The one implementation shared by lib/issue-ref-match.js (name-status
 * parsing), lib/merge-back-gate.js (#3377) and lib/branch-diff.js (#3170),
 * which each carried a private copy before.
 *
 * Built-ins only (runtime dependency contract, #2418).
 */

const C_ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

/**
 * A path as git wrote it, unquoted. A path not wrapped in double quotes is
 * returned unchanged.
 * @param {string} p
 * @returns {string}
 */
function unquoteGitPath(p) {
  const s = String(p);
  if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') return s;
  const inner = s.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }
    const next = inner[i + 1];
    if (/[0-7]/.test(next || '')) {
      const oct = inner.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)[0];
      bytes.push(parseInt(oct, 8));
      i += oct.length;
    } else if (next !== undefined) {
      bytes.push(C_ESCAPES[next] !== undefined ? C_ESCAPES[next] : next.charCodeAt(0));
      i += 1;
    } else {
      bytes.push(92);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

module.exports = { unquoteGitPath };
