#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.118.0
 * @description Fall back to general-purpose when a framework agent type is not found, and report it once per run (#3500)
 *
 * An Agent call naming an unregistered type fails loudly — `Agent type
 * '<name>' not found. Available agents: …` — never a silent general-purpose
 * run (Reference/Agent-Architecture.md, Host Constraints). So the parent can
 * detect it, re-spawn `general-purpose` with the **same brief**, and carry on:
 * no run fails because a type is missing.
 *
 * What it gives up is said once per run, per role: the role's tool
 * restrictions and its instruction setting (and for idpf-diff-reviewer, its
 * cost saving) are not in effect. The reason is read from disk: a definition
 * file that exists is "not registered yet this session" — registration lags a
 * write by minutes — and one that does not is "missing from this project".
 *
 * CLI (for a parent session acting on one failed spawn):
 *   node subagent-fallback.js decide --error "<Agent error text>" [--seen <file>]
 *     → { fallback, role, reason, report } ; report is null when <file>
 *       already names the role, so a run reports each role once.
 *
 * Runtime dependencies: Node built-ins only.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// An agent name only: the captured name becomes part of a path, so a
// separator or a traversal in the host text is never taken from it.
const NOT_FOUND = /Agent type '([A-Za-z0-9_-]+)' not found/;

/** The type named by a host "not found" error, or null for any other error. */
function notFoundType(errorText) {
  if (!errorText) return null;
  const m = String(errorText).match(NOT_FOUND);
  return m ? m[1] : null;
}

/** The same request as general-purpose: every field, the prompt included, kept. */
function fallbackRequest(request) {
  return { ...request, subagent_type: 'general-purpose' };
}

const definitionPath = (role) => `.claude/agents/idpf/${role}.md`;

/** 'not-registered' when the definition file exists on disk, otherwise 'missing'. */
function fallbackReason(role, root = process.cwd()) {
  return fs.existsSync(path.join(root, definitionPath(role))) ? 'not-registered' : 'missing';
}

/** Per-role extra loss beyond tool restrictions and instruction setting. */
const EXTRA_LOSS = {
  'idpf-diff-reviewer': 'its cost saving is not in effect either (a lean prefix of about 6,500 tokens instead of about 77,000)',
  // #3505: the Release Review Gate's reviewer. What the gate splits for —
  // a review outside the release session — survives the fallback.
  'idpf-code-reviewer': 'independence still holds (a fresh context reading the same author-free brief, outside the release session), but the read-only tool pool and the cost saving do not hold',
};

/** One report covering every role that fell back, or '' when none did. */
function formatFallbackReport(missing) {
  if (!missing || missing.length === 0) return '';
  const lines = missing.map(({ role, reason }) => {
    const why = reason === 'not-registered'
      ? `is not registered yet this session (its definition ${definitionPath(role)} exists; registration lags a write by minutes)`
      : `is missing from this project (no ${definitionPath(role)})`;
    const extra = EXTRA_LOSS[role] ? `; ${EXTRA_LOSS[role]}` : '';
    return `- \`${role}\` ${why} — ran as general-purpose with the same brief. Its tool restrictions and its instruction setting are not in effect for this run${extra}.`;
  });
  return ['Agent type fallback:', ...lines].join('\n');
}

/**
 * State for one run: decide each failed spawn, remember which roles fell back,
 * report them once.
 */
function createFallbackRun({ root = process.cwd() } = {}) {
  const missing = new Map();
  return {
    /**
     * @param {object} request    the spawn request that failed
     * @param {string} errorText  the Agent call's error
     * @returns {{fallback: false} | {fallback: true, role: string, reason: string, request: object}}
     */
    decide(request, errorText) {
      const role = notFoundType(errorText);
      if (!role) return { fallback: false };
      const reason = fallbackReason(role, root);
      if (!missing.has(role)) missing.set(role, reason);
      return { fallback: true, role, reason, request: fallbackRequest(request) };
    },
    missing: () => [...missing].map(([role, reason]) => ({ role, reason })),
    report: () => formatFallbackReport([...missing].map(([role, reason]) => ({ role, reason }))),
  };
}

/**
 * Attach the parent's fallback step to a typed spawn request (#3500), so the
 * envelope the parent already acts on says what to do when the type is not
 * registered. An untyped or general-purpose request is returned unchanged.
 */
function withFallback(request) {
  const role = request && request.subagent_type;
  if (!role || role === 'general-purpose') return request;
  return {
    ...request,
    onNotFound: `If this Agent call fails with \`Agent type '${role}' not found\`, the run does not fail: run `
      + '`node .claude/scripts/shared/lib/subagent-fallback.js decide --error "<the error text>" --seen .tmp-fallback-<root>.txt`'
      + " (<root> = the issue the run was invoked on), re-spawn this same request with `subagent_type: 'general-purpose'` and the same prompt, "
      + 'and print its `report` when it is not null — once per role per run.',
  };
}

/** True when `file` resolves inside `root` and its name carries the `.tmp-` scratch prefix. */
function isProjectScratch(file, root) {
  const abs = path.resolve(root, file);
  const rel = path.relative(path.resolve(root), abs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) && path.basename(abs).startsWith('.tmp-');
}

function cli(argv, root = process.cwd()) {
  const [cmd, ...rest] = argv;
  const opt = (name) => { const i = rest.indexOf(name); return i === -1 ? undefined : rest[i + 1]; };
  if (cmd !== 'decide') return { ok: false, error: 'usage: subagent-fallback.js decide --error "<text>" [--seen <file>]' };
  const role = notFoundType(opt('--error'));
  if (!role) return { ok: true, fallback: false };
  const reason = fallbackReason(role, root);
  let report = formatFallbackReport([{ role, reason }]);
  const seenArg = opt('--seen');
  if (seenArg && !isProjectScratch(seenArg, root)) {
    return { ok: false, error: '--seen must name a .tmp- file inside the project root' };
  }
  // Resolved once, so the path checked is the path written.
  const seenFile = seenArg ? path.resolve(root, seenArg) : null;
  if (seenFile) {
    const seen = fs.existsSync(seenFile) ? fs.readFileSync(seenFile, 'utf8').split('\n').filter(Boolean) : [];
    if (seen.includes(role)) report = null;
    else fs.appendFileSync(seenFile, `${role}\n`);
  }
  return { ok: true, fallback: true, role, reason, report };
}

if (require.main === module) {
  const out = cli(process.argv.slice(2));
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(out.ok ? 0 : 1);
}

module.exports = { withFallback, notFoundType, fallbackRequest, fallbackReason, formatFallbackReport, createFallbackRun, cli };
