#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.117.0
 * @description Validate a framework subagent's returned result against its role's schema before the parent uses it (#3499)
 *
 * The role contract (`Reference/Agent-Architecture.md` § Role Contract,
 * Return) says every framework role returns JSON that the parent validates
 * before it enters a gate, roster or merge-back. This module is that check,
 * one implementation for every role:
 *
 *   idpf-implementer    → .claude/metadata/implementer-result-schema.json
 *   idpf-issue-reviewer → .claude/metadata/issue-reviewer-result-schema.json
 *   idpf-diff-reviewer  → .claude/skills/diff-review/output-schema.json
 *   idpf-code-reviewer  → .claude/scripts/shared/lib/code-review-findings-schema.json
 *
 * A reply that is empty, not JSON, invalid against the schema, or the result
 * of an errored Agent call is that instance's error — `ok: false`, with the
 * brief it was spawned with kept (`respawnable: true`) — and never parsed into
 * a guessed verdict. `validateResults()` validates each instance on its own,
 * so one bad reply never affects a sibling's.
 *
 * Runtime dependencies: Node built-ins and `ajv` (declared in
 * framework-manifest.json runtimeNpmDependencies).
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Role → schema path, relative to the project root. */
const ROLE_SCHEMAS = Object.freeze({
  'idpf-implementer': '.claude/metadata/implementer-result-schema.json',
  'idpf-issue-reviewer': '.claude/metadata/issue-reviewer-result-schema.json',
  'idpf-diff-reviewer': '.claude/skills/diff-review/output-schema.json',
  'idpf-code-reviewer': '.claude/scripts/shared/lib/code-review-findings-schema.json',
});

const compiled = new Map();

/** Compile a schema object with the Ajv dialect its `$schema` names. */
function compileObject(schema) {
  const is2020 = typeof schema.$schema === 'string' && schema.$schema.includes('2020-12');
  const AjvClass = is2020 ? require('ajv/dist/2020') : require('ajv');
  const ajv = new AjvClass({ allErrors: true, strict: false });
  const body = { ...schema };
  // Ajv uses its own meta-schema for its dialect; a named $schema would make
  // it look the meta-schema up instead.
  delete body.$schema;
  return ajv.compile(body);
}

/** Compile a schema file once per absolute path. */
function compileSchema(schemaPath) {
  if (!compiled.has(schemaPath)) compiled.set(schemaPath, compileObject(JSON.parse(fs.readFileSync(schemaPath, 'utf8'))));
  return compiled.get(schemaPath);
}

/**
 * Validate one instance's return.
 *
 * @param {object} input
 * @param {string} input.role         Agent type name (a key of ROLE_SCHEMAS)
 * @param {string} [input.text]       The reply text, when the result is the reply itself
 * @param {*}      [input.value]      An already-parsed result (e.g. read from the role's output file)
 * @param {string} [input.agentError] The Agent call's error, when the call itself failed
 * @param {string} [input.brief]      The prompt the instance was spawned with, kept for a re-spawn
 * @param {string} [input.instance]   A label for the instance (e.g. `#42`, `shard 2`)
 * @param {string} [input.root]       Project root (default: cwd)
 * @param {object} [input.schema]     A schema object that replaces the role default (tests, callers holding their own copy)
 * @returns {{ok: true, role: string, instance: string|null, result: object}
 *         | {ok: false, role: string, instance: string|null, error: string, errors: string[], brief: string|null, respawnable: boolean}}
 */
function validateResult({ role, text, value, agentError, brief = null, instance = null, root = process.cwd(), schema } = {}) {
  // An instance's own failure can be re-spawned with its brief; a failure in
  // the parent's setup (unknown role, unreadable schema) cannot.
  const fail = (error, errors, respawnable = true) => ({ ok: false, role, instance, error, errors, brief, respawnable });

  const rel = ROLE_SCHEMAS[role];
  if (!rel) return fail('unknown-role', [`No result schema is declared for role "${role}".`], false);

  if (agentError) return fail('agent-error', [String(agentError)]);

  let doc = value;
  if (doc === undefined) {
    if (text === undefined || text === null || String(text).trim() === '') {
      return fail('empty', ['The instance returned nothing.']);
    }
    try {
      doc = JSON.parse(String(text).trim());
    } catch (e) {
      return fail('not-json', [`The reply is not one JSON document: ${e.message}`]);
    }
  }
  if (doc === null || doc === undefined) return fail('empty', ['The instance returned nothing.']);

  let validate;
  try {
    validate = schema ? compileObject(schema) : compileSchema(path.join(root, rel));
  } catch (e) {
    return fail('schema-unreadable', [`Cannot read the ${role} result schema ${rel}: ${e.message}`], false);
  }
  if (!validate(doc)) {
    return fail('schema', validate.errors.map((e) => `${e.instancePath || '(root)'} ${e.message}`));
  }
  return { ok: true, role, instance, result: doc };
}

/**
 * Validate several instances independently. One instance's error never
 * changes another's result.
 *
 * @param {Array<object>} inputs  each as for validateResult
 * @param {{root?: string}} [opts]
 * @returns {{valid: object[], errored: object[]}}
 */
function validateResults(inputs, { root } = {}) {
  const valid = [];
  const errored = [];
  for (const input of inputs || []) {
    const r = validateResult({ root, ...input });
    (r.ok ? valid : errored).push(r);
  }
  return { valid, errored };
}

/** True when `file` resolves inside `root` and its name carries the `.tmp-` scratch prefix. */
function isProjectScratch(file, root) {
  const abs = path.resolve(root, file);
  const rel = path.relative(path.resolve(root), abs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) && path.basename(abs).startsWith('.tmp-');
}

/**
 * CLI: `validate --role <role> --file <.tmp- file at the root>` — the parent's
 * check on a result an instance wrote (#3502). A missing file is an empty result.
 */
function cli(argv, root = process.cwd()) {
  const [cmd, ...rest] = argv;
  const opt = (name) => { const i = rest.indexOf(name); return i === -1 ? undefined : rest[i + 1]; };
  const role = opt('--role');
  const file = opt('--file');
  if (cmd !== 'validate' || !role || !file || !isProjectScratch(file, root)) {
    return { ok: false, error: 'usage', errors: ['usage: subagent-result.js validate --role <role> --file <.tmp- file inside the project root>'] };
  }
  const abs = path.resolve(root, file);
  const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  return validateResult({ role, text, root, instance: file });
}

if (require.main === module) {
  const out = cli(process.argv.slice(2));
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(out.ok ? 0 : 1);
}

module.exports = { ROLE_SCHEMAS, validateResult, validateResults, cli };
