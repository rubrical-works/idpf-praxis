#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.116.0
 * @description File bug and enhancement issues on the local board — one entry
 * or a batch — with the standard template (#3049). The single creation path
 * for `/bug`, `/enhancement` and `/code-review` Step 8.
 *
 * THE DEFECT THIS REPLACES. `/code-review` Step 8 looped `Skill("bug")` per
 * approved finding. Rule 02 (#2934) states `Skill` transfers control and does
 * not return, so at most one issue-creating command runs per turn, and `/bug`
 * Step 4 ends in STOP: ten approved findings took ten turns of "next", and
 * whatever was still unfiled when the session compacted was lost. Before #2934
 * sessions fell back to a raw `gh pmu create`, which skipped the template and
 * the priority handling; #2934 closed that, and Step 8 was never updated.
 *
 * WHAT IS HERE AND WHAT IS NOT. Only the DETERMINISTIC mechanics: template,
 * label, status, assignee, a unique `.tmp-` body file, `gh pmu create`. The
 * JUDGED steps stay with the caller:
 *   - Priority is SUPPLIED, never derived. `/bug` derives it from the rubric
 *     and confirms it, `/enhancement` defaults to P2, `/code-review` maps
 *     finding severity. An entry without one fails rather than getting a
 *     default here — a default in this file would be a fourth priority rule.
 *   - The AC feasibility gates (`verificationGate`, `phaseFeasibility`) are
 *     judgments over prose. Each result names the ones the caller did NOT
 *     declare applied, so a batch path that skipped them says so instead of
 *     looking identical to `/bug`.
 *
 * THE FILING QUEUE. `/code-review` enqueues approved findings in
 * `.code-review-manifest.json` `filingQueue` BEFORE filing, and the manifest is
 * rewritten after EACH filing. An interrupted batch therefore resumes from
 * exactly the entries still unfiled — on "next", on a later run, or after
 * compaction — and never re-files one already on the board.
 *
 * NOT FOR `--target`. A companion filing must not touch the local board;
 * that path is `file-companion-issue.js`.
 *
 * CLI:
 *   node file-issue.js --input <entries.json>                  file entry/entries now
 *   node file-issue.js --input <entry.json> --render-to <md>   render one body, file nothing (--target path)
 *   node file-issue.js --manifest <path> --enqueue <entries.json>  queue, file nothing
 *   node file-issue.js --manifest <path>                       file every unfiled queue entry
 *   node file-issue.js --manifest <path> --list                report the unfiled entries
 *   node file-issue.js --schema
 *
 * Output: JSON envelope on stdout. Exit 0 when every entry filed, 1 otherwise.
 * Node built-ins and `gh` only, per `04-deployment-awareness.md`.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileTimed } = require('./lib/exec.js');
const { resolveAssignee } = require('./lib/gh-pmu-config.js');

/** Gates `/bug` and `/enhancement` Step 2a apply by judgment; never applied here. */
const JUDGED_GATES = ['verificationGate', 'phaseFeasibility'];

const TYPES = {
  bug: { label: 'bug', prefix: '[Bug]: ' },
  enhancement: { label: 'enhancement', prefix: '[Enhancement]: ' },
};

const VALID_PRIORITIES = ['p0', 'p1', 'p2'];

const TBD = 'To be documented';

/** `prior-art-sweep.json` `bodyFormat.heading` — the emitted marker. */
const PRIOR_ART_HEADING = '**Prior Art:**';

/** Queue entries in these states are still unfiled. */
const UNFILED = ['queued', 'failed'];

const ENVELOPE_SCHEMA = {
  ok: 'boolean — true when every entry filed or updated',
  filed: 'number — new issues created',
  updated: 'number — confirmed duplicates that commented on (and possibly edited) an existing issue instead (#3516)',
  failed: 'number',
  results: '[{index, id?, type, title, ok, number|null, url|null, priority, gatesNotApplied: string[], action?: "updated", bodyUpdated?: boolean, error?, warning?}]',
  checkDuplicates: '--check-duplicates: {ok, searchError?, searched?, results: [{index, title, classification: new|duplicate|related|unchecked, match: number|null, similarity?, reasons: string[]}]}',
};

// ─── Template ───────────────────────────────────────────────

function text(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : TBD;
}

function acLines(list) {
  const items = Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s.trim()) : [];
  return items.length ? items.map((s) => `- [ ] ${s.trim()}`).join('\n') : `- [ ] ${TBD}`;
}

function scopeLines(f) {
  return `- **In scope:** ${text(f.inScope)}\n- **Out of scope:** ${text(f.outOfScope)}`;
}

/**
 * Render the issue body — the same template `/bug` and `/enhancement` Step 3
 * carry. `**Deployment Impact:**` and `**External source:**` are emitted only
 * when supplied: they are FRAMEWORK-ONLY lines in the specs, so a deployed
 * caller never supplies them.
 */
function renderBody(entry) {
  const f = (entry && entry.fields) || {};
  const parts = [];
  if (entry.type === 'bug') {
    parts.push('## Bug Report', '', '**Description:**', text(f.description), '');
    parts.push('**Version:**', text(f.version), '');
    parts.push('**Steps to Reproduce:**', text(f.stepsToReproduce), '');
    parts.push('**Expected Behavior:**', text(f.expectedBehavior), '');
    parts.push('**Actual Behavior:**', text(f.actualBehavior), '');
  } else {
    parts.push('## Enhancement', '', '**Description:**', text(f.description), '');
    if (typeof f.priorArt === 'string' && f.priorArt.trim()) {
      // Accepts the full prior-art-sweep.json bodyFormat line or just its text.
      const pa = f.priorArt.trim();
      parts.push(pa.startsWith(PRIOR_ART_HEADING) ? pa : `${PRIOR_ART_HEADING} ${pa}`, '');
    }
    parts.push('**Motivation:**', text(f.motivation), '');
    parts.push('**Proposed Solution:**', text(f.proposedSolution), '');
    // FRAMEWORK-ONLY in /enhancement, like Deployment Impact (#3039).
    if (typeof f.externalSource === 'string' && f.externalSource.trim()) {
      parts.push(`**External source:** ${f.externalSource.trim()}`, '');
    }
  }
  // #3516: a finding /code-review classified related to an open issue.
  if (Number.isInteger(entry.relatedTo)) parts.push(`Related to #${entry.relatedTo}`, '');
  parts.push('**Scope:**', scopeLines(f), '');
  if (typeof f.deploymentImpact === 'string' && f.deploymentImpact.trim()) {
    parts.push(`**Deployment Impact:** ${f.deploymentImpact.trim()}`, '');
  }
  parts.push('**Acceptance Criteria:**', acLines(f.acceptanceCriteria));
  if (entry.type === 'bug') {
    parts.push('', '**Proposed Fix:**', text(f.proposedFix));
  }
  return parts.join('\n') + '\n';
}

// ─── Arguments ──────────────────────────────────────────────

function fullTitle(entry) {
  const t = String(entry.title).trim();
  const { prefix } = TYPES[entry.type];
  return t.startsWith(prefix) ? t : prefix + t;
}

/**
 * `gh pmu create` argv. Always `gh pmu`, never the bare `gh issue` form, which
 * files off the board (rule 02). Always `-F`, never inline `--body`.
 */
function buildCreateArgs({ entry, bodyFile }) {
  const args = ['pmu', 'create', '--title', fullTitle(entry), '--label', TYPES[entry.type].label];
  for (const l of Array.isArray(entry.labels) ? entry.labels : []) {
    if (l && l !== TYPES[entry.type].label) args.push('--label', String(l));
  }
  args.push('--status', entry.status || 'backlog');
  args.push('--priority', entry.priority);
  args.push('--assignee', resolveAssignee(entry.assignee));
  args.push('-F', bodyFile);
  return args;
}

/** First problem with an entry, or null. Checked before anything is created. */
function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') return 'entry is not an object';
  if (!TYPES[entry.type]) return `type must be "bug" or "enhancement" (got "${entry.type}")`;
  if (typeof entry.title !== 'string' || !entry.title.trim()) return 'title is required';
  if (entry.duplicateOf !== undefined) {
    // A confirmed duplicate files nothing, so it needs a target, not a priority.
    const n = entry.duplicateOf && entry.duplicateOf.issue;
    return Number.isInteger(n) && n > 0 ? null : 'duplicateOf.issue must be a positive issue number';
  }
  if (!VALID_PRIORITIES.includes(entry.priority)) {
    return `priority is required (${VALID_PRIORITIES.join('|')}, got "${entry.priority}") — `
      + 'the caller supplies it; this script never derives one';
  }
  return null;
}

function gatesNotApplied(entry) {
  const applied = Array.isArray(entry && entry.gatesApplied) ? entry.gatesApplied : [];
  return JUDGED_GATES.filter((g) => !applied.includes(g));
}

function parseCreated(raw) {
  const s = String(raw || '');
  const url = (s.match(/https:\/\/\S+\/issues\/\d+/) || [])[0] || null;
  const m = url ? url.match(/\/issues\/(\d+)$/) : s.match(/#(\d+)/);
  return { number: m ? Number(m[1]) : null, url };
}

function firstLine(err) {
  return (err && err.message ? String(err.message) : String(err)).split('\n')[0];
}

// ─── Filing ─────────────────────────────────────────────────

function defaultRunGh(args) {
  return execFileTimed('gh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

// ─── Duplicates (#3516) ─────────────────────────────────────

function orNotRecorded(v) {
  return v === undefined || v === null || String(v).trim() === '' ? 'not recorded' : String(v).trim();
}

/**
 * The comment a confirmed duplicate posts on the matched issue: the new
 * finding's evidence, so the existing issue carries it instead of a second
 * issue carrying it alone.
 */
function renderDuplicateComment(entry) {
  const s = (entry && entry.source) || {};
  const r = (entry && entry.review) || {};
  const f = (entry && entry.fields) || {};
  const lines = [
    '## Code review finding (duplicate of this issue)',
    '',
    `**Finding:** ${String(entry.title).trim()}`,
    `- **File:** \`${orNotRecorded(s.file)}\``,
    `- **Lines:** ${orNotRecorded(s.lines)}`,
    `- **Severity:** ${orNotRecorded(s.severity)}`,
    `- **Diff tag:** ${orNotRecorded(s.diffTag)}`,
    `- **Review date:** ${orNotRecorded(r.date)}`,
    `- **Base SHA:** ${orNotRecorded(r.baseSha)}`,
  ];
  if (typeof f.description === 'string' && f.description.trim()) lines.push('', f.description.trim());
  return lines.join('\n') + '\n';
}

/** Index of the line after a `**Heading:**` block's last list item, or -1 when absent. */
function blockEnd(lines, headings, itemRe) {
  const at = lines.findIndex((l) => headings.includes(l.trim()));
  if (at === -1) return -1;
  let end = at + 1;
  for (let i = at + 1; i < lines.length; i++) {
    if (itemRe.test(lines[i])) end = i + 1;
    else if (lines[i].trim() !== '' || i > end) break;
  }
  return end;
}

/**
 * Add confirmed scope to an existing issue body: new paths to its
 * `Files to modify:` list and new acceptance criteria to its checklist. A path
 * or criterion already present is not repeated; a missing section is appended
 * rather than the addition dropped.
 */
function applyScopeAdditions(body, { files = [], acceptanceCriteria = [] } = {}) {
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const text = lines.join('\n');
  const newFiles = files.filter((p) => typeof p === 'string' && p.trim() && !text.includes(`\`${p.trim()}\``)).map((p) => `- \`${p.trim()}\``);
  const newAcs = acceptanceCriteria.filter((a) => typeof a === 'string' && a.trim() && !text.includes(a.trim())).map((a) => `- [ ] ${a.trim()}`);
  const insert = (headings, items, heading) => {
    if (!items.length) return;
    const end = blockEnd(lines, headings, /^\s*[-*] /);
    if (end === -1) {
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      lines.push('', heading, ...items, '');
    } else {
      lines.splice(end, 0, ...items);
    }
  };
  insert(['**Files to modify:**', '**Files:**'], newFiles, '**Files to modify:**');
  insert(['**Acceptance Criteria:**'], newAcs, '**Acceptance Criteria:**');
  return lines.join('\n');
}

/**
 * Update the issue a confirmed duplicate matched: comment with the evidence,
 * then — only for confirmed scope additions — edit its body through the
 * body-file flow (`gh pmu view --body-stdout` → edit → `gh pmu edit -F`).
 * Never files an issue. NEVER THROWS.
 */
function updateOne(entry, result, d) {
  const n = entry.duplicateOf.issue;
  const suffix = d.randomSuffix();
  const commentFile = path.join(d.cwd, `.tmp-dup-comment-${suffix}.md`);
  const bodyFile = path.join(d.cwd, `.tmp-${n}-${suffix}.md`);
  const out = { ...result, action: 'updated', number: n, bodyUpdated: false };
  try {
    d.writeFile(commentFile, renderDuplicateComment(entry));
    d.runGh(['issue', 'comment', String(n), '-F', commentFile]);
    const { files, acceptanceCriteria } = entry.duplicateOf;
    if ((Array.isArray(files) && files.length) || (Array.isArray(acceptanceCriteria) && acceptanceCriteria.length)) {
      const current = String(d.runGh(['pmu', 'view', String(n), '--body-stdout']));
      const next = applyScopeAdditions(current, { files: files || [], acceptanceCriteria: acceptanceCriteria || [] });
      if (next !== current.replace(/\r\n/g, '\n')) {
        d.writeFile(bodyFile, next);
        d.runGh(['pmu', 'edit', String(n), '-F', bodyFile]);
        out.bodyUpdated = true;
      }
    }
    return { ...out, ok: true };
  } catch (err) {
    return { ...result, number: null, error: firstLine(err) };
  } finally {
    for (const f of [commentFile, bodyFile]) {
      try { if (fs.existsSync(f)) d.removeFile(f); } catch { /* best effort; the startup sweep collects .tmp-* */ }
    }
  }
}

/**
 * File one entry. NEVER THROWS — the caller is a command spec that reports.
 * An unparseable success is still a success: the issue exists, so it is
 * reported with a warning rather than as a failure that invites a re-file.
 */
function fileOne(entry, index, d) {
  const result = {
    index,
    type: entry && entry.type,
    title: entry && entry.title,
    ok: false,
    number: null,
    url: null,
    priority: entry && entry.priority,
    gatesNotApplied: gatesNotApplied(entry),
  };
  const problem = validateEntry(entry);
  if (problem) return { ...result, error: problem };
  if (entry.duplicateOf !== undefined) return updateOne(entry, result, d);

  const suffix = d.randomSuffix();
  const bodyFile = path.join(d.cwd, `.tmp-${entry.type}-body-${suffix}.md`);
  try {
    d.writeFile(bodyFile, renderBody(entry));
    const created = parseCreated(d.runGh(buildCreateArgs({ entry, bodyFile })));
    const out = { ...result, ok: true, number: created.number, url: created.url };
    if (created.number === null) out.warning = 'gh pmu create succeeded but printed no issue number';
    return out;
  } catch (err) {
    return { ...result, error: firstLine(err) };
  } finally {
    try { d.removeFile(bodyFile); } catch { /* best effort; the startup sweep collects .tmp-* */ }
  }
}

function withDefaults(d) {
  const x = d || {};
  return {
    cwd: x.cwd || process.cwd(),
    runGh: typeof x.runGh === 'function' ? x.runGh : defaultRunGh,
    writeFile: x.writeFile || ((p, body) => fs.writeFileSync(p, body, 'utf-8')),
    removeFile: x.removeFile || ((p) => fs.unlinkSync(p)),
    randomSuffix: x.randomSuffix || (() => crypto.randomBytes(4).toString('hex')),
  };
}

function summarize(results) {
  const ok = results.filter((r) => r.ok);
  const updated = ok.filter((r) => r.action === 'updated').length;
  return { ok: ok.length === results.length, filed: ok.length - updated, updated, failed: results.length - ok.length, results };
}

/**
 * File every entry in one invocation. A failure is recorded and the batch
 * continues — one bad entry must not strand the rest.
 */
function fileIssues(entries, deps) {
  const d = withDefaults(deps);
  const list = Array.isArray(entries) ? entries : [entries];
  return summarize(list.map((e, i) => fileOne(e, i, d)));
}

// ─── Queue (.code-review-manifest.json filingQueue) ────────

/** Add entries to the manifest's queue as `queued`. Mutates and returns ids. */
function enqueue(manifest, entries, now = new Date().toISOString()) {
  if (!Array.isArray(manifest.filingQueue)) manifest.filingQueue = [];
  const ids = [];
  for (const entry of Array.isArray(entries) ? entries : [entries]) {
    const id = `q-${crypto.randomBytes(4).toString('hex')}`;
    manifest.filingQueue.push({ id, status: 'queued', queuedAt: now, entry });
    ids.push(id);
  }
  return { ids };
}

/** Queue items not yet on the board: `queued`, or `failed` and due a retry. */
function queuedEntries(manifest) {
  const q = manifest && Array.isArray(manifest.filingQueue) ? manifest.filingQueue : [];
  return q.filter((item) => UNFILED.includes(item.status));
}

function writeManifest(p, manifest) {
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/**
 * File every unfiled queue entry, rewriting the manifest after EACH one so an
 * interruption loses nothing already filed. A filed entry whose `source.file`
 * is in `files` also gets the number appended to that file's `issueRefs`.
 */
function fileQueue(manifestPath, deps) {
  const d = withDefaults(deps);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const results = [];
  for (const item of queuedEntries(manifest)) {
    const r = { id: item.id, ...fileOne(item.entry, results.length, d) };
    if (r.ok) {
      // A confirmed duplicate updated an existing issue (#3516): `updated`, not
      // `filed`, so the report and the record can list it separately.
      const updated = r.action === 'updated';
      item.status = updated ? 'updated' : 'filed';
      item.issue = r.number;
      item[updated ? 'updatedAt' : 'filedAt'] = new Date().toISOString();
      delete item.error;
      const src = item.entry && item.entry.source && item.entry.source.file;
      const fileEntry = src && manifest.files ? manifest.files[src] : null;
      if (fileEntry && r.number !== null) {
        fileEntry.issueRefs = Array.isArray(fileEntry.issueRefs) ? fileEntry.issueRefs : [];
        if (!fileEntry.issueRefs.includes(r.number)) fileEntry.issueRefs.push(r.number);
      }
    } else {
      item.status = 'failed';
      item.error = r.error;
    }
    writeManifest(manifestPath, manifest);
    results.push(r);
  }
  return summarize(results);
}

// ─── CLI ────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--schema' || a === '--list') out[a.slice(2)] = true;
    else if (['--input', '--manifest', '--enqueue', '--render-to', '--check-duplicates'].includes(a) && i + 1 < argv.length) {
      out[a.slice(2)] = argv[++i];
    }
  }
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function main(argv, deps) {
  const args = parseArgs(argv);
  if (args.schema) return { code: 0, out: ENVELOPE_SCHEMA };
  if (args['check-duplicates']) {
    // #3516: classify approved entries against open bugs and enhancements.
    // Read-only — files and edits nothing. A failed search exits 1 with every
    // entry `unchecked`, so it is reported rather than read as "all new".
    const { checkDuplicates } = require('./lib/issue-duplicates.js');
    const manifest = args.manifest ? readJson(args.manifest) : {};
    const r = checkDuplicates({ entries: readJson(args['check-duplicates']), manifest, ...withDefaults(deps) });
    return { code: r.ok ? 0 : 1, out: r };
  }
  if (args.manifest && args.enqueue) {
    const manifest = readJson(args.manifest);
    const { ids } = enqueue(manifest, readJson(args.enqueue));
    writeManifest(args.manifest, manifest);
    return { code: 0, out: { ok: true, queued: ids } };
  }
  if (args.manifest && args.list) {
    const items = queuedEntries(readJson(args.manifest));
    return { code: 0, out: { ok: true, unfiled: items.map((q) => ({ id: q.id, status: q.status, title: q.entry && q.entry.title, error: q.error })) } };
  }
  if (args.manifest) {
    const r = fileQueue(args.manifest, deps);
    return { code: r.ok ? 0 : 1, out: r };
  }
  if (args.input && args['render-to']) {
    // The --target companion path: same template, but file-companion-issue.js
    // does the filing, because the local board must not be touched.
    const entry = readJson(args.input);
    const problem = Array.isArray(entry) ? '--render-to takes one entry, not a batch' : validateEntry(entry);
    if (problem) return { code: 1, out: { ok: false, error: problem } };
    fs.writeFileSync(args['render-to'], renderBody(entry), 'utf-8');
    return { code: 0, out: { ok: true, rendered: args['render-to'], gatesNotApplied: gatesNotApplied(entry) } };
  }
  if (args.input) {
    const r = fileIssues(readJson(args.input), deps);
    return { code: r.ok ? 0 : 1, out: r };
  }
  return { code: 1, out: { ok: false, error: 'Usage: file-issue.js --input <json> [--render-to <md>] | --manifest <path> [--enqueue <json> | --list] | --check-duplicates <json> [--manifest <path>] | --schema' } };
}

if (require.main === module) {
  let res;
  try {
    res = main(process.argv.slice(2));
  } catch (err) {
    res = { code: 1, out: { ok: false, error: firstLine(err) } };
  }
  process.stdout.write(JSON.stringify(res.out, null, 2) + '\n');
  process.exitCode = res.code;
}

module.exports = {
  JUDGED_GATES,
  TYPES,
  VALID_PRIORITIES,
  renderBody,
  buildCreateArgs,
  validateEntry,
  fileIssues,
  enqueue,
  queuedEntries,
  fileQueue,
  renderDuplicateComment,
  applyScopeAdditions,
  main,
};
