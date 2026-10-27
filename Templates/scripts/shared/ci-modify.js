#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.113.0
 * @description Modify a workflow YAML file safely, preserving comments and structure. Supports adding top-level keys, inserting steps into jobs, and merging configuration blocks. Used by ci-add.js and ci-remove.js for non-destructive YAML edits.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

/**
 * Modify a workflow YAML file safely, preserving comments and structure.
 * @param {string} filePath - Path to the workflow YAML file
 * @param {Object} operation - The modification operation
 * @param {Object} [operation.addTopLevel] - Add a top-level key
 * @param {string} operation.addTopLevel.key - The key name
 * @param {string} operation.addTopLevel.yaml - YAML content to add
 * @param {Object} [operation.addStep] - Add a step to a job
 * @param {string} operation.addStep.job - Target job name
 * @param {string} operation.addStep.yaml - YAML step content
 * @param {string} [operation.addStep.position] - 'end', 'start', or 'before-last'
 * @returns {{ success: boolean, message: string }}
 */
function modifyWorkflow(filePath, operation) {
  // Read original content
  const original = fs.readFileSync(filePath, 'utf8');

  // Parse with comment preservation
  const doc = yaml.parseDocument(original);

  if (operation.addTopLevel) {
    addTopLevelKey(doc, operation.addTopLevel.key, operation.addTopLevel.yaml);
  }

  if (operation.addStep) {
    addStepToJob(doc, operation.addStep.job, operation.addStep.yaml, operation.addStep.position || 'before-last');
  }

  if (operation.setJobProperty) {
    setJobProperty(doc, operation.setJobProperty.job, operation.setJobProperty.path, operation.setJobProperty.value);
  }

  // Serialize back to string, changing only the lines the edit changed (#3425)
  const output = serializeEdited(original, doc);

  // Validate before writing
  validateYaml(output);

  // Back up only once the edit is known to succeed (#3307): a refused merge
  // leaves no trace on disk. The file still holds the original content here.
  createBackup(filePath);

  // Write using fs (no heredocs — Windows safe)
  fs.writeFileSync(filePath, output);

  return { success: true, message: `Modified ${path.basename(filePath)}` };
}

/**
 * Add a top-level key to a YAML document.
 * @param {yaml.Document} doc - The parsed YAML document
 * @param {string} key - Key name to add
 * @param {string} yamlContent - YAML string for the value
 */
function addTopLevelKey(doc, key, yamlContent) {
  // Parse the new content to get the value
  const parsed = yaml.parseDocument(yamlContent);

  // Extract the value — if yamlContent is a mapping with our key, use its value
  // Otherwise treat the whole thing as the value
  let value;
  const contents = parsed.contents;
  if (contents && (contents instanceof yaml.YAMLMap || contents.items)) {
    // Check if this is a single-key mapping matching our key
    const firstItem = contents.items[0];
    if (firstItem && firstItem.key && String(firstItem.key) === key) {
      value = firstItem.value;
    } else {
      value = contents;
    }
  } else {
    value = contents;
  }

  const incoming = value ? value.toJSON() : yaml.parse(yamlContent);
  const existing = doc.get(key);
  // Only `on:` has a scalar shorthand that means a mapping. Any other scalar —
  // `concurrency: <group>` — is replaced; merging into it turned the string
  // into a key GitHub rejects (#3370).
  const scalarElsewhere = key !== 'on' && existing !== undefined && !yaml.isMap(existing);
  if (existing === undefined || !isPlainObject(incoming) || scalarElsewhere) {
    doc.set(key, incoming);
    return;
  }

  // Merge into the existing value (#3045): replacing it dropped every key the
  // new content did not repeat — adding a tag trigger deleted push/pull_request.
  // A scalar or list `on:` is the event-name shorthand, so it becomes a mapping
  // of those events before the merge.
  const current = toMergeable(yaml.isNode(existing) ? existing.toJSON() : existing);
  if (key === 'on') assertNoExclusiveFilterPair(current, incoming);
  const add = key === 'on' ? keepBranchCoverage(current, incoming) : incoming;
  if (yaml.isMap(existing)) {
    // Merge into the existing node (#3307): rebuilding it from toJSON() lost
    // every comment and flow-style list the author wrote inside it.
    mergeIntoNode(doc, existing, add);
  } else {
    doc.set(key, deepMerge(current, add));
  }
}

/**
 * Merge a plain object into a YAMLMap in place, keeping the comments and
 * styles of every node the merge does not replace.
 * @param {yaml.Document} doc - Owning document (creates the new nodes)
 * @param {yaml.YAMLMap} node - Existing mapping node
 * @param {object} add - Plain object to merge in
 */
function mergeIntoNode(doc, node, add) {
  for (const [k, v] of Object.entries(add)) {
    const child = node.get(k, true);
    if (yaml.isMap(child) && isPlainObject(v)) {
      mergeIntoNode(doc, child, v);
    } else {
      node.set(k, doc.createNode(v));
    }
  }
}

/** Filter pairs GitHub refuses to see together on one event. */
const EXCLUSIVE_FILTER_PAIRS = [
  ['paths', 'paths-ignore'],
  ['branches', 'branches-ignore'],
  ['tags', 'tags-ignore'],
];

/**
 * Refuse a merge that would set both halves of an exclusive filter pair on
 * one event (#3307). GitHub rejects such a workflow, and validateYaml only
 * checks that the YAML parses, so the write would otherwise succeed.
 *
 * @param {object} current - Existing `on:` mapping (shorthand already expanded)
 * @param {object} incoming - `on:` mapping being added
 * @throws {Error} naming the event and the two filters
 */
function assertNoExclusiveFilterPair(current, incoming) {
  for (const [event, value] of Object.entries(incoming)) {
    const have = current[event];
    if (!isPlainObject(have) || !isPlainObject(value)) continue;
    for (const [a, b] of EXCLUSIVE_FILTER_PAIRS) {
      const clash = (has(value, a) && has(have, b) && [b, a]) || (has(value, b) && has(have, a) && [a, b]);
      if (clash) {
        throw new Error(
          `Cannot add "${clash[1]}" to the "${event}" trigger: it already declares "${clash[0]}", ` +
          `and GitHub rejects an event that sets both ${a} and ${b}. No changes were written.`
        );
      }
    }
  }
}

function has(obj, k) {
  return Object.prototype.hasOwnProperty.call(obj, k);
}

/** Ref filters that restrict an event to tags without saying anything about branches. */
const TAG_ONLY_FILTERS = new Set(['tags', 'tags-ignore']);

/**
 * Keep branch coverage when a tag filter lands on a catch-all event (#3289).
 *
 * A null event (`on: push`, `on: [push]`, `push:`) runs for every ref. GitHub
 * runs an event that defines only `tags`/`tags-ignore` for tag pushes alone,
 * so merging `{tags: [...]}` into it silently stopped CI on branch pushes.
 * The incoming value gains `branches: ['**']`, keeping every branch. An event
 * that already filters branches is left to the plain merge.
 *
 * @param {object} current - Existing `on:` mapping (shorthand already expanded)
 * @param {object} incoming - `on:` mapping being added
 * @returns {object} incoming, with `branches: ['**']` on each narrowed event
 */
function keepBranchCoverage(current, incoming) {
  const out = { ...incoming };
  for (const [event, value] of Object.entries(incoming)) {
    const catchAll = Object.prototype.hasOwnProperty.call(current, event) && current[event] === null;
    const keys = isPlainObject(value) ? Object.keys(value) : [];
    if (catchAll && keys.length > 0 && keys.every((k) => TAG_ONLY_FILTERS.has(k))) {
      out[event] = { branches: ['**'], ...value };
    }
  }
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function toMergeable(v) {
  if (isPlainObject(v)) return v;
  if (typeof v === 'string') return { [v]: null };
  if (Array.isArray(v) && v.every((e) => typeof e === 'string')) {
    return Object.fromEntries(v.map((e) => [e, null]));
  }
  return {};
}

function deepMerge(base, add) {
  const out = { ...base };
  for (const [k, v] of Object.entries(add)) {
    out[k] = isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}

/**
 * Add a step to a specific job in the workflow.
 * @param {yaml.Document} doc - The parsed YAML document
 * @param {string} jobName - Name of the job
 * @param {string} stepYaml - YAML content for the step(s)
 * @param {string} position - Where to insert: 'start', 'end', or 'before-last'
 */
function addStepToJob(doc, jobName, stepYaml, position) {
  const jobs = doc.get('jobs');
  if (!jobs) {
    throw new Error('No jobs found in workflow');
  }

  // Navigate to the job's steps using the document model
  const jobNode = doc.getIn(['jobs', jobName]);
  if (!jobNode) {
    throw new Error(`Job "${jobName}" not found in workflow`);
  }

  // Parse the template on its own (#3411): a sequence is the steps; a mapping
  // is one step. Prefixing "- " to the first line alone left every following
  // line mis-indented under it.
  const parsedSteps = yaml.parse(stepYaml);
  const newSteps = Array.isArray(parsedSteps) ? parsedSteps : [parsedSteps];
  if (newSteps.some((s) => !s || typeof s !== 'object' || Array.isArray(s))) {
    throw new Error('Step template must be a mapping (one step) or a sequence of mappings');
  }

  // Get existing steps — doc.getIn returns YAMLSeq node, not plain array
  const existingStepsNode = doc.getIn(['jobs', jobName, 'steps']);
  if (!existingStepsNode) {
    doc.setIn(['jobs', jobName, 'steps'], newSteps);
    return;
  }

  // Insert into the existing sequence node (#3411): rebuilding it from
  // toJSON() and replacing it dropped every comment and flow-style value in
  // the job's steps. The new nodes take the document's default style.
  if (yaml.isSeq(existingStepsNode)) {
    const items = existingStepsNode.items;
    const at = position === 'start' ? 0
      : position === 'before-last' ? Math.max(0, items.length - 1)
        : items.length;
    items.splice(at, 0, ...newSteps.map((s) => doc.createNode(s)));
    return;
  }

  // Not a sequence node (an empty or scalar value): rebuild it as before.
  const existingSteps = existingStepsNode.toJSON
    ? existingStepsNode.toJSON()
    : (Array.isArray(existingStepsNode) ? existingStepsNode : []);

  if (existingSteps.length === 0) {
    doc.setIn(['jobs', jobName, 'steps'], newSteps);
    return;
  }

  // Insert at position
  if (position === 'start') {
    doc.setIn(['jobs', jobName, 'steps'], [...newSteps, ...existingSteps]);
  } else if (position === 'before-last') {
    const updated = [...existingSteps];
    const insertIndex = Math.max(0, updated.length - 1);
    updated.splice(insertIndex, 0, ...newSteps);
    doc.setIn(['jobs', jobName, 'steps'], updated);
  } else {
    // 'end' or default
    doc.setIn(['jobs', jobName, 'steps'], [...existingSteps, ...newSteps]);
  }
}

/**
 * Set a property on a specific job in the workflow.
 * @param {yaml.Document} doc - The parsed YAML document
 * @param {string} jobName - Name of the job
 * @param {string[]} propPath - Path within the job (e.g., ['strategy', 'matrix', 'os'])
 * @param {*} value - The value to set
 */
function setJobProperty(doc, jobName, propPath, value) {
  const fullPath = ['jobs', jobName, ...propPath];
  doc.setIn(fullPath, value);
}

/**
 * Create a timestamped backup of a workflow file.
 * @param {string} filePath - Path to the workflow file
 */
function createBackup(filePath) {
  const dir = path.dirname(filePath);
  const backupDir = path.join(dir, '.backup');
  const fileName = path.basename(filePath);

  fs.mkdirSync(backupDir, { recursive: true });

  // Full millisecond timestamp, plus a counter for a same-millisecond repeat
  // (#3387): minute resolution let a second edit overwrite the .bak of the true
  // original. `_` sorts after `.`, so `T…123.bak` < `T…123_01.bak` < `T…124.bak`,
  // and an old minute-only name sorts before a new one from the same minute.
  // The counter is one past the highest already used for this timestamp, never
  // the first free slot: cleanupBackups deletes the oldest name first, and a
  // reused slot sorts oldest, so the newest backup was deleted at once.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', '');
  const prefix = `${fileName}.${timestamp}`;
  let highest = -1;
  for (const f of fs.readdirSync(backupDir)) {
    if (f === `${prefix}.bak`) highest = Math.max(highest, 0);
    const m = f.startsWith(`${prefix}_`) && /_(\d+)\.bak$/.exec(f);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  const backupName = highest < 0
    ? `${prefix}.bak`
    : `${prefix}_${String(highest + 1).padStart(2, '0')}.bak`;

  fs.copyFileSync(filePath, path.join(backupDir, backupName));

  // Clean up old backups
  cleanupBackups(backupDir, fileName);
}

/**
 * Keep only the last 5 backups for a given workflow file.
 * @param {string} backupDir - Path to backup directory
 * @param {string} fileName - Original workflow file name
 */
function cleanupBackups(backupDir, fileName) {
  if (!fs.existsSync(backupDir)) return;

  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith(fileName + '.') && f.endsWith('.bak'))
    .sort(); // Alphabetical sort = chronological for ISO timestamps

  // Keep last 5, delete the rest
  const toDelete = backups.slice(0, Math.max(0, backups.length - 5));

  for (const file of toDelete) {
    fs.unlinkSync(path.join(backupDir, file));
  }
}

/**
 * Serializer options for an edited workflow: no padding inside flow
 * collections (`['**']`, not `[ '**' ]`) and no folding of long lines, so
 * content an edit inserts reads like the file around it.
 */
const TO_STRING_OPTIONS = { flowCollectionPadding: false, lineWidth: 0 };

/** Longest-common-subsequence match of two line arrays: [aIndex, bIndex] pairs, ascending. */
function matchLines(a, b) {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const len = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      len[i * w + j] = a[i] === b[j] ? len[(i + 1) * w + j + 1] + 1 : Math.max(len[(i + 1) * w + j], len[i * w + j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (len[(i + 1) * w + j] >= len[i * w + j + 1]) i++; else j++;
  }
  return pairs;
}

/**
 * Serialize an edited workflow document so that only the lines the edit
 * changed differ from the original text (#3425).
 *
 * Re-serializing a whole document rewrites lines the edit never touched:
 * the serializer pads flow lists, folds long lines and re-attaches a comment
 * that follows a key with an empty value (`workflow_dispatch:`) to that key.
 * Serializer options remove the first two; the third is how the library reads
 * the comment, so no option reaches it. Instead this is a line-level three-way
 * merge: the original document serialized as-is (`base`) and the edited one
 * (`edited`) differ only by the edit, so each changed run of `base` lines is
 * replaced, at the matching place in the original text, by its `edited` lines.
 *
 * The merge is verified, never trusted: unless the result parses to exactly
 * the edited document, the full serialization is returned instead — correct
 * content with the formatting drift, never a wrong workflow.
 *
 * @param {string} original - The file's text before the edit
 * @param {yaml.Document} doc - The document parsed from `original`, edited
 * @returns {string}
 */
function serializeEdited(original, doc) {
  const edited = doc.toString(TO_STRING_OPTIONS);
  const eol = /\r\n/.test(original) ? '\r\n' : '\n';
  const fallback = eol === '\r\n' ? edited.replace(/\r?\n/g, '\r\n') : edited;
  let base;
  try {
    base = yaml.parseDocument(original).toString(TO_STRING_OPTIONS);
  } catch (_e) {
    return fallback;
  }
  if (base === edited) return original;

  const S = original.split(/\r?\n/);
  const B = base.split('\n');
  const E = edited.split('\n');
  // Where each base line sits in the original, for the lines they share.
  const bToS = new Map(matchLines(S, B).map(([s, b]) => [b, s]));
  const anchors = matchLines(B, E);
  anchors.push([B.length, E.length]);

  // Each changed run of base lines becomes two operations on the original:
  // delete the original lines those base lines came from, and insert the
  // run's edited lines. An insertion goes where the run's first deleted line
  // was, else straight after the original line of the last base line before
  // the run. Every other original line is kept as written — including lines
  // the serializer rendered differently (a moved comment, a padded list),
  // which therefore keep their own text and place.
  const deleted = new Set();
  const inserts = new Map(); // original index → lines inserted before it
  let prevB = -1;
  let prevE = -1;
  let lastMapped = -1; // original index of the last base line seen that has one
  for (const [bi, ei] of anchors) {
    if (bi - prevB > 1 || ei - prevE > 1) {
      const removed = [];
      for (let k = prevB + 1; k < bi; k++) if (bToS.has(k)) removed.push(bToS.get(k));
      removed.forEach((s) => deleted.add(s));
      const at = removed.length ? Math.min(...removed) : lastMapped + 1;
      if (ei - prevE > 1) {
        if (!inserts.has(at)) inserts.set(at, []);
        inserts.get(at).push(...E.slice(prevE + 1, ei));
      }
      for (let k = prevB + 1; k < bi; k++) if (bToS.has(k)) lastMapped = Math.max(lastMapped, bToS.get(k));
    }
    if (bi < B.length && bToS.has(bi)) lastMapped = bToS.get(bi);
    prevB = bi;
    prevE = ei;
  }
  const out = [];
  for (let s = 0; s <= S.length; s++) {
    if (inserts.has(s)) out.push(...inserts.get(s));
    if (s < S.length && !deleted.has(s)) out.push(S[s]);
  }
  // An insertion at the end belongs before the trailing newline's empty line.
  if (inserts.has(S.length) && S[S.length - 1] === '' && out[out.length - 1] !== '') {
    const tail = inserts.get(S.length);
    out.splice(out.length - tail.length - 1, 1);
    out.push('');
  }

  const merged = out.join(eol);
  try {
    if (JSON.stringify(yaml.parse(merged)) === JSON.stringify(doc.toJS())) return merged;
  } catch (_e) { /* fall through to the full serialization */ }
  return fallback;
}

/**
 * Validate that a string is valid YAML.
 * @param {string} content - YAML string to validate
 * @throws {Error} If YAML is invalid
 */
function validateYaml(content) {
  try {
    yaml.parse(content);
  } catch (err) {
    throw new Error(`YAML validation failed: ${err.message}`);
  }
}

// CLI entry point
if (require.main === module) {
  console.log('ci-modify.js - YAML-safe workflow modification library');
  console.log('This module is used programmatically by /ci --add and /ci remove.');
}

module.exports = { modifyWorkflow, createBackup, cleanupBackups, validateYaml, setJobProperty, serializeEdited, TO_STRING_OPTIONS };
