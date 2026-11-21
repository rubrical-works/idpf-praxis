// Rubrical Works (c) 2026
/**
 * @framework-script 0.122.0
 * @description Input validation utilities to prevent command injection, path traversal, and ReDoS from externally-sourced inputs. Exports validateIssueNumber(), validateBranchName(), validatePath(), and related guards. Used by all preamble scripts accepting user input.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/input-validation.js - Input validation utilities for shell safety
 *
 * @see #1875 (command injection), #1876 (ReDoS), #1877 (path traversal)
 */

const path = require('path');

// Shell metacharacters that enable command injection. Includes \n and \r:
// an embedded newline acts as a command separator when a "validated" value is
// interpolated into a shell string (lib/gh.js) (#2456).
// Also any whitespace and both quote characters (#3692): a space or tab splits
// one value into several arguments, and a quote breaks out of the quoting a
// caller wraps the value in. Git forbids spaces in ref names, so a real branch
// or tag never carries one. \s covers \n and \r.
// Also the glob characters * ? [ ] (#3702): interpolated unquoted, they expand
// against the filesystem. Git forbids them in ref names too.
// sanitizeShellArg in lib/shell-safe.js imports this set and
// rejectUnsafeLeadingChar rather than repeating them (#3702).
// '#' is deliberately absent (#3768): git allows it in ref names, and only a
// word that STARTS with '#' opens a sh comment, so 'fix/issue#12' is safe.
// A leading '#' is rejected for refs by rejectLeadingHash instead — not in
// rejectUnsafeLeadingChar, which quoteShellPath (lib/shell-safe.js) shares and
// which wraps a '#'-led path in double quotes rather than refusing it.
const SHELL_META = /[`$(){}|;&<>!\\\s'"*?[\]]/;

/**
 * Throw when a ref name starts with '#' (#3768). Interpolated unquoted into a
 * sh command string, a leading '#' starts a comment, so the shell silently
 * drops the value and every argument after it: 'git push origin #foo
 * --force-with-lease' runs 'git push origin'.
 * @param {string} value
 * @param {string} label - e.g. 'Branch name'
 * @throws {Error} If value starts with '#'
 */
function rejectLeadingHash(value, label) {
  if (value.startsWith('#')) {
    throw new Error(`${label} must not start with '#': ${value.substring(0, 30)}`);
  }
}

/**
 * Throw when `value` starts with '-' or '~'. A leading '-' (#3692) is read as
 * an option even when spawned through execFile, where no shell is involved — a
 * branch named '-D', or '--upload-pack=...'. A leading '~' (#3702) is
 * tilde-expanded to a home directory when interpolated unquoted. Git refuses
 * ref names starting with either.
 * @param {string} value
 * @param {string} label - e.g. 'Branch name'
 * @throws {Error} If value starts with '-' or '~'
 */
function rejectUnsafeLeadingChar(value, label) {
  if (value.startsWith('-') || value.startsWith('~')) {
    throw new Error(`${label} must not start with '${value[0]}': ${value.substring(0, 30)}`);
  }
}

/**
 * Whether `value` is an issue number written as one (#3675): a string of
 * digits with no leading zero, sign, space, exponent or radix prefix, or a
 * positive safe integer. The text is tested, not the conversion — Number()
 * reads '1e2' as 100, '0x1A' as 26 and ' 7' as 7.
 * @param {*} value
 * @returns {boolean}
 */
function isIssueNumber(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

/**
 * Validate an issue number is a positive integer written as one.
 * @param {string|number} value
 * @returns {number} Validated integer
 * @throws {Error} If not an issue number per isIssueNumber()
 */
function validateIssueNumber(value) {
  if (!isIssueNumber(value)) {
    throw new Error(`Invalid issue number: ${String(value).substring(0, 20)}`);
  }
  return Number(value);
}

/**
 * Validate a branch name is safe for shell use.
 * Git branch names can contain /, -, ., _ but not shell metacharacters,
 * whitespace, quotes, glob characters or a leading '-', '~' or '#' (#3692,
 * #3702, #3768).
 * @param {string} name
 * @returns {string} Validated branch name
 * @throws {Error} If branch name contains shell metacharacters
 */
function validateBranchName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Branch name is required');
  }
  if (SHELL_META.test(name)) {
    throw new Error(`Branch name contains unsafe characters: ${name.substring(0, 30)}`);
  }
  rejectUnsafeLeadingChar(name, 'Branch name');
  rejectLeadingHash(name, 'Branch name');
  return name;
}

/**
 * Validate a git tag is safe for shell use.
 * @param {string} tag
 * @returns {string} Validated tag
 * @throws {Error} If tag contains shell metacharacters
 */
function validateTag(tag) {
  if (typeof tag !== 'string' || !tag.trim()) {
    throw new Error('Tag is required');
  }
  if (SHELL_META.test(tag)) {
    throw new Error(`Tag contains unsafe characters: ${tag.substring(0, 30)}`);
  }
  rejectUnsafeLeadingChar(tag, 'Tag');
  rejectLeadingHash(tag, 'Tag');
  return tag;
}

/**
 * Validate a GitHub repository in owner/repo format. Interpolated into `gh`
 * command strings (lib/gh.js); GitHub owner/name allow [A-Za-z0-9._-] only, so
 * anything else is rejected before it can reach the shell (#2456).
 * @param {string} repo
 * @returns {string} Validated owner/repo
 * @throws {Error} If not a valid owner/repo string
 */
const REPO_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
function validateRepo(repo) {
  if (typeof repo !== 'string' || !repo.trim()) {
    throw new Error('Repository is required');
  }
  if (!REPO_NAME.test(repo)) {
    throw new Error(`Invalid repository (expected owner/repo): ${repo.substring(0, 40)}`);
  }
  return repo;
}

/**
 * Validate a workflow run ID is a positive integer, returned as a string for
 * safe interpolation. Run IDs come from API responses; guard before shell use.
 * The text is tested, not the conversion (#3702), by the same rule as
 * isIssueNumber() (#3675): Number() read '1e2' as 100, '0x1A' as 26 and ' 7'
 * as 7.
 * @param {string|number} runId
 * @returns {string} Validated run ID as a string
 * @throws {Error} If not a positive integer written as digit text
 */
function validateRunId(runId) {
  if (!isIssueNumber(runId)) {
    throw new Error(`Invalid run ID: ${String(runId).substring(0, 20)}`);
  }
  return String(runId);
}

/**
 * Validate an npm package name against the npm name grammar.
 * Dependency keys read from a (possibly hostile) package.json are otherwise
 * interpolated into `npm view ...` — a crafted key executes shell code (#2456).
 * Rules: <= 214 chars; optional @scope/ prefix; url-safe chars only — capitals
 * included, as the registry still serves legacy names such as `JSONStream` (#3757);
 * no leading dot or underscore; no leading '-' on the whole name (#3748) —
 * npm reads such a word as an option, and its own validator rejects it; no
 * leading '~' on the whole name (#3752) — the name reaches a shell, where sh
 * tilde-expands '~user' to a home directory. A scope or package segment may
 * still start with '-' or '~', as npm allows: a scoped name starts with '@',
 * so npm never parses it as a flag and sh never expands it.
 * @param {string} name
 * @returns {string} Validated package name
 * @throws {Error} If the name is not a valid npm package name
 */
// One name segment (scope or package): starts with a url-safe char that is not
// '.' or '_', rest url-safe. Single linear char-classes (no nested quantifiers)
// to stay clear of ReDoS — validated per-segment rather than one combined regex.
const NPM_SEGMENT = /^[A-Za-z0-9~-][A-Za-z0-9._~-]*$/;
function validateNpmPackageName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Package name is required');
  }
  const invalid = () => new Error(`Invalid npm package name: ${name.substring(0, 40)}`);
  if (name.length > 214 || name[0] === '-' || name[0] === '~') {
    throw invalid();
  }
  let pkg = name;
  if (name[0] === '@') {
    const slash = name.indexOf('/');
    if (slash < 0) {
      throw invalid();
    }
    const scope = name.slice(1, slash);
    pkg = name.slice(slash + 1);
    if (!NPM_SEGMENT.test(scope)) {
      throw invalid();
    }
  }
  if (!NPM_SEGMENT.test(pkg)) {
    throw invalid();
  }
  return name;
}

/**
 * Validate a version string: an optional 'v', MAJOR.MINOR.PATCH, and an
 * optional prerelease and build suffix of at most 64 identifier characters
 * each. Anchored at both ends (#3702): anchored only at the start,
 * '1.2.3; rm -rf ~' passed. The bounds are checked in code, not as regex
 * repetition counts, which security/detect-unsafe-regex rejects (#3702).
 * @param {string} version
 * @returns {string} Validated version
 * @throws {Error} If version format is invalid
 */
const VERSION_CORE = /^v?(\d+)\.(\d+)\.(\d+)(.*)$/;
const VERSION_IDENT = /^[0-9A-Za-z.-]+$/;
const isVersionSuffix = (s) => s.length <= 64 && VERSION_IDENT.test(s);

/**
 * Whether `version` is an optional 'v', MAJOR.MINOR.PATCH of at most nine
 * digits each, then an optional `-prerelease` and an optional `+build`.
 * @param {string} version
 * @returns {boolean}
 */
function isVersionFormat(version) {
  const m = VERSION_CORE.exec(version);
  if (!m || m.slice(1, 4).some((d) => d.length > 9)) return false;
  const rest = m[4];
  if (!rest) return true;
  if (rest[0] !== '-' && rest[0] !== '+') return false;
  const plus = rest.indexOf('+');
  const pre = rest[0] === '-' ? rest.slice(1, plus < 0 ? undefined : plus) : null;
  const build = plus < 0 ? null : rest.slice(plus + 1);
  return (pre === null || isVersionSuffix(pre)) && (build === null || isVersionSuffix(build));
}

function validateVersion(version) {
  if (typeof version !== 'string') {
    throw new Error('Version must be a string');
  }
  if (!isVersionFormat(version)) {
    throw new Error(`Invalid version format: ${version.substring(0, 30)}`);
  }
  return version;
}

/**
 * Validate a file path stays within a base directory (prevents traversal).
 * @param {string} base - Base directory (must be absolute)
 * @param {string} userPath - User-provided path (relative or absolute)
 * @returns {string} Resolved, validated absolute path
 * @throws {Error} If path escapes base directory
 */
function safePath(base, userPath) {
  const resolved = path.resolve(base, userPath);
  const normalizedBase = path.resolve(base);
  // path.relative, not a `base + sep` prefix check (#3770): a filesystem root
  // keeps its trailing separator, so the prefix became 'C:\\\\' or '//' and every
  // child was rejected. On win32 path.relative also compares case-insensitively.
  const rel = path.relative(normalizedBase, resolved);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`Path traversal detected: ${String(userPath).substring(0, 60)} escapes ${base}`);
  }
  return resolved;
}

// Reserved DOS device names (#3772). Matched against the part before the first
// dot, since win32 reserves them with or without an extension (NUL.txt).
const WIN32_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Validate a filename is a simple name (no path separators) that is safe to
 * create. Rejects the exact names `.` and `..` (a `..` inside a name such as
 * `v1..2.txt` is not a traversal once separators are rejected), NUL and other
 * control characters, and on win32 `:` (NTFS alternate data streams) and the
 * reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9).
 * @param {string} name
 * @param {string} [platform=process.platform] - Platform whose filesystem rules apply
 * @returns {string} Validated filename
 * @throws {Error} If name is unsafe
 */
function validateFilename(name, platform = process.platform) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Filename is required');
  }
  const unsafe =
    /[/\\]/.test(name) ||
    name === '.' || name === '..' ||
    /[\x00-\x1f\x7f]/.test(name) ||
    (platform === 'win32' && (name.includes(':') || WIN32_DEVICE_NAME.test(name.split('.')[0])));
  if (unsafe) {
    // JSON.stringify so a control character in the name cannot reach the message raw
    throw new Error(`Unsafe filename: ${JSON.stringify(name.substring(0, 30))}`);
  }
  return name;
}

const DIGITS = /^\d+$/;

/**
 * Parse a `{n}`, `{n,}` or `{n,m}` quantifier at the start of `s`.
 * @returns {{length: number, max: number}|null} null when `s` is a literal '{'
 */
function readBrace(s) {
  const close = s.indexOf('}');
  if (close < 0) return null;
  const [min, max, extra] = s.slice(1, close).split(',');
  if (extra !== undefined || !DIGITS.test(min)) return null;
  if (max === undefined) return { length: close + 1, max: Number(min) };
  if (max === '') return { length: close + 1, max: Infinity };
  return DIGITS.test(max) ? { length: close + 1, max: Number(max) } : null;
}

/**
 * Read the quantifier starting at `pattern[i]`, if any (#3771).
 * `rep` is true when it can repeat its atom more than once.
 * @returns {{length: number, rep: boolean}|null}
 */
function readQuantifier(pattern, i) {
  const c = pattern[i];
  let q = null;
  if (c === '+' || c === '*') q = { length: 1, rep: true };
  else if (c === '?') q = { length: 1, rep: false };
  else if (c === '{') {
    const b = readBrace(pattern.slice(i));
    if (b) q = { length: b.length, rep: b.max > 1 };
  }
  if (q && pattern[i + q.length] === '?') q.length += 1;   // lazy suffix
  return q;
}

/**
 * Whether two or more alternatives can begin with the same character.
 * An alternative whose first atom is not a plain literal (a class, an escape
 * such as \d, a dot, a group, or nothing) counts as overlapping.
 */
function alternativesOverlap(firsts) {
  const seen = new Set();
  for (const f of firsts) {
    if (typeof f !== 'string') return true;
    const k = f.toLowerCase();
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

/**
 * Heuristic scan for catastrophic-backtracking shapes (#3771). Flags a group
 * under a repeating quantifier (+, *, {n,}, {n,m} with m > 1) when the group
 * itself contains any quantifier (greedy, lazy, brace or ?, including one on a
 * nested group), or when its alternatives can begin with the same character.
 * @param {string} pattern
 * @returns {boolean}
 */
function hasReDoSShape(pattern) {
  const newFrame = () => ({ quantified: false, firsts: [undefined] });
  const stack = [newFrame()];
  const top = () => stack[stack.length - 1];
  const recordAtom = (atom) => {
    const f = top();
    const last = f.firsts.length - 1;
    if (f.firsts[last] === undefined) f.firsts[last] = atom;
  };
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '\\') {
      const next = pattern[i + 1] || '';
      recordAtom(/[A-Za-z0-9]/.test(next) ? null : next);
      i += 2;
    } else if (c === '[') {
      let j = i + 1;
      if (pattern[j] === '^') j += 1;
      // No literal-']' special case: in JavaScript '[]' and '[^]' close at once
      while (j < pattern.length && pattern[j] !== ']') j += pattern[j] === '\\' ? 2 : 1;
      recordAtom(null);
      i = j + 1;
    } else if (c === '(') {
      stack.push(newFrame());
      i += 1;
      if (pattern[i] === '?') {
        const named = /^\?<(?![=!])[^>]*>/.exec(pattern.slice(i));
        if (named) i += named[0].length;
        else i += pattern[i + 1] === '<' ? 3 : 2;   // ?: ?= ?! or ?<= ?<!
      }
      continue;
    } else if (c === ')') {
      const group = stack.length > 1 ? stack.pop() : newFrame();
      i += 1;
      const q = readQuantifier(pattern, i);
      if (q && q.rep && (group.quantified ||
          (group.firsts.length > 1 && alternativesOverlap(group.firsts)))) {
        return true;
      }
      if (q) i += q.length;
      if (q || group.quantified) top().quantified = true;
      recordAtom(group.firsts.length === 1 ? group.firsts[0] || null : null);
      continue;
    } else if (c === '|') {
      top().firsts.push(undefined);
      i += 1;
      continue;
    } else if (c === '^' || c === '$') {
      i += 1;
      continue;
    } else {
      recordAtom(c === '.' ? null : c);
      i += 1;
    }
    const q = readQuantifier(pattern, i);
    if (q) {
      top().quantified = true;
      i += q.length;
    }
  }
  return false;
}

/**
 * Safely construct a RegExp from external input.
 *
 * Returns null if the pattern does not compile or matches the ReDoS
 * heuristic in `hasReDoSShape`. The check is a **heuristic**, not a proof of
 * safety: it rejects a repeated group that contains a quantifier ('(a+)+',
 * '(a+?)+', '(a{1,})+', '((a+)?)+') or overlapping alternatives ('(a|a)*',
 * '(a|aa)+'). Alternatives are compared on their first character only, so
 * '(ab|ac)+' is rejected and '(\d|x)+' is rejected conservatively.
 * It does NOT detect: adjacent overlapping quantifiers outside a group
 * ('a*a*', '\d+\d+$'); overlapping alternation one group below the repeat
 * ('((a|aa))+'); overlap between alternatives that start with different
 * characters; backreferences; or polynomial blow-up from sequential unbounded
 * quantifiers. It also rejects some safe patterns, such as '(\.\d+)*'.
 * @param {string} pattern - Regex pattern from external source
 * @param {string} flags - Regex flags (default: '')
 * @returns {RegExp|null} Compiled regex or null on failure
 */
function safeRegex(pattern, flags = '') {
  if (typeof pattern !== 'string' || !pattern.trim()) {
    return null;
  }
  if (hasReDoSShape(pattern)) {
    return null;
  }
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Escape a string for safe use in a RegExp.
 * @param {string} str
 * @returns {string} Escaped string
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  isIssueNumber,
  validateIssueNumber,
  validateBranchName,
  validateTag,
  validateRepo,
  validateRunId,
  validateNpmPackageName,
  validateVersion,
  safePath,
  validateFilename,
  safeRegex,
  escapeRegExp,
  rejectUnsafeLeadingChar,
  SHELL_META
};
