#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.113.0
 * @description Add selected CI features to a project's GitHub Actions workflows. Applies feature templates with YAML merging, handles confirmation prompts, and provides error recovery. Part of the /ci --add subcommand.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { loadFeatureRegistry } = require('./ci-list.js');
const { modifyWorkflow, validateYaml, createBackup, serializeEdited } = require('./ci-modify.js');
const { suggestWorkflowForFeature } = require('./ci-detect-workflow.js');

/**
 * Feature types determine how the template is applied to the workflow.
 * 'top-level' features add a root-level YAML key (e.g., concurrency:).
 * 'step' features add a step to an existing job.
 * 'trigger' features modify the on: block.
 * 'step-with-script' features copy `template.script` from this directory into
 * the project, then add a step that runs the copy (#3016): the shared tree is a
 * symlink into the hub in a user project and does not exist on a CI runner.
 * 'config-files' features write `template.yaml` to `template.configFile` and
 * `template.workflow` to `template.workflowFile`, touching no existing workflow
 * (#3016). Neither file is ever overwritten.
 */
const FEATURE_TYPE_MAP = {
  'cross-os-testing': 'strategy',
  'multi-node-versions': 'strategy',
  'paths-ignore': 'trigger',
  'trigger-scope': 'trigger',
  'concurrency-groups': 'top-level',
  'push-pr-dedup': 'top-level',
  'dependency-caching': 'step',
  'dependency-audit': 'step-with-script',
  'dependabot': 'config-files',
  'deploy-on-tag': 'trigger',
  'codeql-analysis': 'step',
  'coverage-upload': 'step',
  'conventional-commits': 'step',
  'stale-cleanup': 'step',
  'artifact-retention': 'step-modify',
  'artifact-conditional-upload': 'step-modify',
  'artifact-cleanup': 'step'
};

/**
 * Top-level key for features that use addTopLevel operation.
 */
const TOP_LEVEL_KEY_MAP = {
  'concurrency-groups': 'concurrency',
  // Merged into an existing concurrency mapping, so a github.ref-keyed block
  // has its group and cancel-in-progress replaced rather than a second added.
  'push-pr-dedup': 'concurrency'
};

/**
 * Validate a feature name against the registry.
 * @param {string} featureName - Feature identifier
 * @returns {{ valid: boolean, feature?: object, available?: string[] }}
 */
function validateFeatureName(featureName) {
  const registry = loadFeatureRegistry();
  const feature = registry[featureName];

  if (feature) {
    return { valid: true, feature };
  }

  return {
    valid: false,
    available: Object.keys(registry)
  };
}

/**
 * Check if a feature is already enabled in the workflow files.
 * @param {string} projectDir - Path to project root
 * @param {string} featureId - Feature identifier
 * @param {string} [fileName] - Check this workflow only (#3370): a feature
 *   recommended per workflow is enabled per workflow, not project-wide
 * @returns {boolean} True if feature is already enabled
 */
function isFeatureAlreadyEnabled(projectDir, featureId, fileName) {
  const registry = loadFeatureRegistry();
  const feature = registry[featureId];
  if (!feature) return false;

  if (FEATURE_TYPE_MAP[featureId] === 'config-files') {
    return configFilesPresent(projectDir, feature.template).every(Boolean);
  }

  const workflowsDir = path.join(projectDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return false;

  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .filter(f => !fileName || f === fileName);

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      for (const pattern of feature.detectionPatterns.yaml) {
        let regex;
        try { regex = new RegExp(pattern, 'i'); } catch { continue; }
        if (regex.test(content)) return true;
      }
    } catch (_e) {
      continue;
    }
  }

  return false;
}

/**
 * Locate a feature's script beside this module without writing anything, so
 * a missing source refuses the feature before the workflow is touched (#3411).
 * @param {string} relTarget - Project-relative path the script is copied to
 * @returns {{ok: true, source: string}|{ok: false, message: string}}
 */
function featureScriptSource(relTarget) {
  if (!relTarget || typeof relTarget !== 'string') {
    return { ok: false, message: 'Feature template names no script to copy.' };
  }
  const source = path.join(__dirname, path.basename(relTarget));
  if (!fs.existsSync(source)) {
    return { ok: false, message: `Feature script not found beside ci-add.js: ${path.basename(relTarget)}` };
  }
  return { ok: true, source };
}

/**
 * Copy a feature's script from this directory into the project (#3016).
 *
 * Source is the sibling file named by `template.script`'s basename: this
 * module and the gate both live in `.claude/scripts/shared/`, so the relative
 * read resolves through the hub symlink wherever the project is. The copy is
 * never overwritten — a project copy that differs from the framework's is
 * reported and left alone, so a local edit survives a re-add.
 *
 * @param {string} projectDir Project root.
 * @param {string} relTarget Project-relative path to write, e.g. `.github/scripts/x.js`.
 * @returns {{ok: boolean, message: string}} `message` is a note for the result line.
 */
function copyFeatureScript(projectDir, relTarget) {
  const available = featureScriptSource(relTarget);
  if (!available.ok) return available;
  const source = available.source;
  const target = path.join(projectDir, ...relTarget.split('/'));
  const body = fs.readFileSync(source, 'utf8');
  if (fs.existsSync(target)) {
    if (fs.readFileSync(target, 'utf8') === body) {
      return { ok: true, message: ` (${relTarget} already current)` };
    }
    return { ok: true, message: ` (${relTarget} differs from the framework copy and was left as is)` };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return { ok: true, message: ` and copied ${relTarget}` };
}

/**
 * Which of a config-files feature's two targets already exist (#3016).
 *
 * @param {string} projectDir Project root.
 * @param {object} template The feature's template object.
 * @returns {boolean[]} [configFile present, workflowFile present]
 */
function configFilesPresent(projectDir, template) {
  return [template.configFile, template.workflowFile].map((rel) =>
    Boolean(rel) && fs.existsSync(path.join(projectDir, ...rel.split('/'))));
}

/**
 * Write a config-files feature: the config and its companion workflow (#3016).
 *
 * Neither is overwritten — a file that exists is reported and left as is, so
 * a project's own Dependabot policy survives a re-add.
 *
 * @param {string} projectDir Project root.
 * @param {string} featureId Feature identifier.
 * @returns {{ success: boolean, message: string, feature: string, files: string[] }}
 */
function writeConfigFiles(projectDir, featureId) {
  const feature = loadFeatureRegistry()[featureId];
  const t = feature.template;
  const plan = [
    [t.configFile, t.yaml],
    [t.workflowFile, t.workflow],
  ];
  const written = [];
  const left = [];
  for (const [rel, body] of plan) {
    if (!rel || typeof body !== 'string') continue;
    const target = path.join(projectDir, ...rel.split('/'));
    if (fs.existsSync(target)) {
      left.push(rel);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    written.push(rel);
  }
  const parts = [];
  if (written.length) parts.push(`wrote ${written.join(' and ')}`);
  if (left.length) parts.push(`${left.join(' and ')} already exists and was left as is`);
  return {
    success: true,
    message: `Added "${feature.name}": ${parts.join('; ')}`,
    feature: featureId,
    files: written
  };
}

/**
 * Add a CI feature to the appropriate workflow file.
 * @param {string} projectDir - Path to project root
 * @param {string} featureId - Feature identifier
 * @param {Object} [options] - Options
 * @param {boolean} [options.skipConfirm] - Skip user confirmation (for testing)
 * @param {string} [options.file] - Target workflow file name in .github/workflows/ (#3370)
 * @param {string[]} [options.paths] - Explicit patterns for paths-ignore (#3427)
 * @returns {{ success: boolean, message: string, file?: string, feature?: string }}
 */
function addCIFeature(projectDir, featureId, options = {}) {
  // Validate feature name
  const validation = validateFeatureName(featureId);
  if (!validation.valid) {
    return {
      success: false,
      message: `Unknown feature: "${featureId}". Available features: ${validation.available.join(', ')}`
    };
  }
  if (options.paths && featureId !== 'paths-ignore') {
    return { success: false, message: `--paths applies only to paths-ignore, not "${featureId}". No changes were written.` };
  }

  // Check if already enabled — in the named workflow when there is one (#3370).
  // paths-ignore is per event (#3424): one filtered event does not cover the
  // other, so addLayoutPathsIgnore decides and names what it found.
  // trigger-scope likewise: its classifier refuses a workflow already filtered.
  if (!['paths-ignore', 'trigger-scope'].includes(featureId) && isFeatureAlreadyEnabled(projectDir, featureId, options.file)) {
    return {
      success: false,
      message: `Feature "${featureId}" is already enabled. Use /ci remove first if you want to reconfigure it.`
    };
  }

  if (FEATURE_TYPE_MAP[featureId] === 'config-files') {
    return writeConfigFiles(projectDir, featureId);
  }

  // Find target workflow file — the caller's, when it names one (#3370): a
  // recommendation is made for a specific workflow, and the suggestion
  // heuristic can pick an unrelated one.
  let target;
  if (options.file) {
    const named = resolveTargetFile(projectDir, options.file);
    if (!named.ok) return { success: false, message: named.message };
    target = { file: named.file, createNew: false };
  } else if (featureId === 'trigger-scope') {
    // Only a classified workflow qualifies; a category guess could narrow a test workflow.
    const found = findTriggerScopeTarget(projectDir);
    if (!found.ok) return { success: false, message: found.message };
    target = { file: found.file, createNew: false };
  } else {
    target = suggestWorkflowForFeature(projectDir, featureId);
  }

  let created = null;
  if (target.createNew) {
    created = createMinimalWorkflow(projectDir, target.suggestedName);
    target.file = created.file;
  }

  const result = applyFeatureToWorkflow(projectDir, featureId, target, { paths: options.paths });
  // A feature that fails on the workflow it just created takes it back out
  // (#3369): the stub is scaffolding for this feature, not the user's file.
  if (!result.success && created) removeCreated(created);
  return result;
}

/**
 * Resolve a caller-named workflow file inside .github/workflows/.
 * @param {string} projectDir
 * @param {string} name - Bare file name, e.g. `ci.yml`
 * @returns {{ok: true, file: string}|{ok: false, message: string}}
 */
function resolveTargetFile(projectDir, name) {
  const { validateFilename } = require('./lib/input-validation');
  let safe;
  try {
    safe = validateFilename(name);
  } catch (err) {
    return { ok: false, message: `Invalid target workflow "${name}": ${err.message}` };
  }
  const file = path.join(projectDir, '.github', 'workflows', safe);
  if (!fs.existsSync(file)) {
    return { ok: false, message: `Target workflow ${safe} not found in .github/workflows/. No changes were written.` };
  }
  return { ok: true, file };
}

/**
 * Write the minimal workflow a feature needs when the project has none,
 * recording which directories this call created so a failure can undo it.
 * @param {string} projectDir
 * @param {string} suggestedName
 * @returns {{file: string, dirs: string[]}} dirs deepest-first
 */
function createMinimalWorkflow(projectDir, suggestedName) {
  const githubDir = path.join(projectDir, '.github');
  const workflowsDir = path.join(githubDir, 'workflows');
  const dirs = [workflowsDir, githubDir].filter(d => !fs.existsSync(d));
  fs.mkdirSync(workflowsDir, { recursive: true });
  const { validateFilename } = require('./lib/input-validation');
  const newFile = path.join(workflowsDir, validateFilename(suggestedName));
  fs.writeFileSync(newFile, `name: CI\non: push\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n`);
  return { file: newFile, dirs };
}

/**
 * Remove a workflow createMinimalWorkflow wrote, and the directories it
 * created when they are empty again. A directory holding anything else is kept.
 * @param {{file: string, dirs: string[]}} created
 */
function removeCreated({ file, dirs }) {
  fs.rmSync(file, { force: true });
  for (const dir of dirs) {
    try { fs.rmdirSync(dir); } catch (_e) { /* not empty — keep it */ }
  }
}

/** Documentation directories ignored when the repo has them. */
const DOC_DIRS = ['docs', 'Docs', 'doc', 'documentation'];

/** IDPF artifact directories: planning and design records no test reads. */
const IDPF_ARTIFACT_DIRS = ['Proposal', 'Construction', 'Inception', 'Mockups'];

/**
 * Markdown a project runs rather than reads: command specs, rules and skills.
 * A paths-ignore pattern that matches one skips CI on a change that alters
 * behavior (#3424) — `'**.md'` matches `.claude/commands/*.md`.
 */
const RUNTIME_MARKDOWN = ['.claude/commands/example.md', '.claude/rules/example.md', '.claude/skills/example/SKILL.md'];

/**
 * A GitHub path-filter pattern as a RegExp: `**` crosses `/`, `*` and `?`
 * do not, and a pattern is anchored at the repository root.
 * @param {string} pattern
 * @returns {RegExp}
 */
function filterPatternToRegex(pattern) {
  let out = '';
  const p = String(pattern).replace(/^\.\//, '');
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      out += '.*';
      i++;
      if (p[i + 1] === '/') i++;
    } else if (c === '*') {
      out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/**
 * The runtime-markdown paths a pattern would ignore (#3424).
 * @param {string} pattern
 * @returns {string[]}
 */
function runtimeMarkdownMatches(pattern) {
  const re = filterPatternToRegex(pattern);
  return RUNTIME_MARKDOWN.filter((p) => re.test(p));
}

/**
 * paths-ignore patterns derived from the repository's own layout (#3424),
 * replacing a fixed `'**.md'` + `'docs/**'`: each documentation directory and
 * IDPF artifact directory that exists, and root-level markdown (`'*.md'`,
 * which stops at the root, so `.claude/commands/*.md` stays watched).
 * `warnings` names every pattern — generated, or already in the workflow —
 * that would ignore runtime markdown.
 * @param {string} projectDir
 * @param {string[]} [existingPatterns] - patterns the target workflow already ignores
 * @returns {{patterns: string[], warnings: string[]}}
 */
function layoutPathsIgnore(projectDir, existingPatterns = []) {
  const isDir = (d) => {
    try { return fs.statSync(path.join(projectDir, d)).isDirectory(); } catch (_e) { return false; }
  };
  const present = (dirs) => {
    let names = [];
    try { names = fs.readdirSync(projectDir); } catch (_e) { /* empty layout */ }
    // Exact-case match: a case-insensitive filesystem would report Docs/ for docs/.
    return dirs.filter((d) => names.includes(d) && isDir(d));
  };
  const patterns = [...present(DOC_DIRS), ...present(IDPF_ARTIFACT_DIRS)].map((d) => `${d}/**`);
  let rootMarkdown = false;
  try {
    rootMarkdown = fs.readdirSync(projectDir).some((f) => /\.md$/i.test(f) && !isDir(f));
  } catch (_e) { /* no root */ }
  if (rootMarkdown) patterns.push('*.md');
  const warnings = runtimeMarkdownWarnings([...existingPatterns, ...patterns]);
  return { patterns: patterns.filter((p) => !runtimeMarkdownMatches(p).length), warnings };
}

/**
 * One warning per distinct pattern that would ignore runtime markdown (#3424).
 * @param {string[]} patterns
 * @returns {string[]}
 */
function runtimeMarkdownWarnings(patterns) {
  const warnings = [];
  for (const p of [...new Set(patterns)]) {
    const hits = runtimeMarkdownMatches(p);
    if (hits.length) {
      warnings.push(`'${p}' matches runtime markdown (${hits.map((h) => h.replace(/example(\/SKILL)?\.md$/, '*.md')).join(', ')}): a change there would skip CI`);
    }
  }
  return warnings;
}

/**
 * What ignoring these patterns costs (#3427): CI skips a change to them, and
 * /done reads paths-ignore to decide it need not wait for CI (#2897).
 * @param {string[]} patterns
 * @returns {string}
 */
function pathsIgnoreTradeoff(patterns) {
  return `Removes CI on pushes and pull requests that change only ${patterns.join(', ')}: a test that reads one of those files `
    + 'is not run for that change, and /done does not wait for CI on such a push';
}

/**
 * Add the caller's paths-ignore patterns to every push / pull_request trigger
 * the workflow already has (#3427): merged into an existing list without
 * duplicates, existing entries kept as written, or set as a new list on a
 * trigger with no path filter. Never adds a trigger. A trigger declaring
 * `paths:` refuses the whole edit (GitHub rejects both on one event, #3307);
 * a tag-only push is skipped (it ignores path filters).
 * @param {string} file - Workflow path
 * @param {string[]} patterns
 * @returns {{ success: boolean, message: string, file?: string, feature?: string, warnings?: string[] }}
 */
function addExplicitPathsIgnore(file, patterns) {
  const { eventPathFilters, acceptsPathFilter } = require('./ci-recommend.js');
  const parsed = yaml.parse(fs.readFileSync(file, 'utf8') || '') || {};
  const filters = eventPathFilters(parsed.on);
  const base = path.basename(file);
  const warnings = runtimeMarkdownWarnings(patterns);
  const filterable = Object.keys(filters).filter((e) => acceptsPathFilter(parsed.on, e));
  const tagOnly = Object.keys(filters).filter((e) => e === 'push' && !filterable.includes(e));
  if (!filterable.length) {
    return { success: false, message: noFilterableTrigger(base), warnings };
  }
  const withPaths = filterable.filter((e) => filters[e].paths);
  if (withPaths.length) {
    return {
      success: false,
      message: `${withPaths.map((e) => `${e} declares paths:`).join(', ')} in ${base}; GitHub rejects paths and paths-ignore on one event. No changes were written.`,
      warnings
    };
  }
  const added = {};
  const edited = editWorkflowDocument(file, (doc) => {
    const on = onAsMap(doc);
    for (const event of filterable) {
      const have = filters[event].pathsIgnore || [];
      const missing = [...new Set(patterns)].filter((p) => !have.includes(p));
      if (!missing.length) continue;
      added[event] = missing;
      const ev = on.get(event, true);
      const list = yaml.isMap(ev) ? ev.get('paths-ignore', true) : null;
      if (yaml.isSeq(list)) {
        // A new entry takes the quoting of the list it joins.
        const last = list.items[list.items.length - 1];
        const style = yaml.isScalar(last) ? last.type : undefined;
        for (const p of missing) {
          const node = doc.createNode(p);
          if (style) node.type = style;
          list.add(node);
        }
      } else if (yaml.isMap(ev)) {
        ev.set('paths-ignore', doc.createNode([...have, ...missing]));
      } else {
        on.set(event, doc.createNode({ 'paths-ignore': missing }));
      }
    }
    return { ok: true, changed: Object.keys(added).length > 0 };
  });
  if (!edited.ok) return { success: false, message: edited.message, warnings };
  const skipped = tagOnly.length ? ` Skipped push: a tag-only push ignores path filters.` : '';
  const note = warnings.length ? ` Warning: ${warnings.join('; ')}.` : '';
  if (!edited.changed) {
    return { success: true, message: `${base} already ignores ${patterns.join(', ')} on ${filterable.join(', ')}. No changes were written.${skipped}${note}`, file, feature: 'paths-ignore', warnings };
  }
  const how = Object.entries(added).map(([e, ps]) => `${e} +${ps.join(', ')}`).join('; ');
  return {
    success: true,
    message: `Added "Paths Ignore" to ${base} (${how}).${skipped}${note} Gives up: ${pathsIgnoreTradeoff(patterns)}.`,
    file,
    feature: 'paths-ignore',
    warnings
  };
}

/**
 * The refusal when no push / pull_request trigger can take a path filter.
 * @param {string} base - Workflow file name
 * @returns {string}
 */
function noFilterableTrigger(base) {
  return `${base} has no push or pull_request trigger a path filter applies to (a tag-only push ignores one), so paths-ignore has nothing to filter. No trigger was added.`;
}

/**
 * The workflow's `on:` as a mapping node, converting the string
 * (`on: push`) and list (`on: [push, pull_request]`) forms in place.
 * @param {yaml.Document} doc
 * @returns {yaml.YAMLMap}
 */
function onAsMap(doc) {
  const on = doc.get('on', true);
  if (yaml.isMap(on)) return on;
  const plain = on == null ? {} : on.toJSON();
  const events = typeof plain === 'string' ? { [plain]: null }
    : Array.isArray(plain) ? Object.fromEntries(plain.map((e) => [e, null])) : {};
  doc.set('on', doc.createNode(events));
  return doc.get('on', true);
}

/**
 * Add layout-derived paths-ignore to the push / pull_request events the
 * workflow already has and that filter no paths (#3424). Never adds a
 * trigger: the merge names existing events only, so a push-only workflow
 * stays push-only.
 * @param {string} projectDir
 * @param {string} file - Workflow path
 * @returns {{ success: boolean, message: string, file?: string, feature?: string, warnings?: string[] }}
 */
function addLayoutPathsIgnore(projectDir, file) {
  const { unfilteredEvents, eventPathFilters, acceptsPathFilter } = require('./ci-recommend.js');
  const parsed = yaml.parse(fs.readFileSync(file, 'utf8') || '') || {};
  const filters = eventPathFilters(parsed.on);
  const existing = Object.values(filters).flatMap((f) => f.pathsIgnore || []);
  const { patterns, warnings } = layoutPathsIgnore(projectDir, existing);
  const events = unfilteredEvents(parsed.on);
  const base = path.basename(file);
  const filterable = Object.keys(filters).filter((e) => acceptsPathFilter(parsed.on, e));
  if (!filterable.length) {
    return { success: false, message: noFilterableTrigger(base), warnings };
  }
  if (!events.length) {
    const how = filterable.map((e) => `${e}: ${filters[e].paths ? 'paths' : 'paths-ignore'}`).join(', ');
    return { success: false, message: `Every trigger paths-ignore could filter in ${base} already declares a path filter (${how}). No changes were written.`, warnings };
  }
  if (!patterns.length) {
    return { success: false, message: `No documentation or IDPF artifact directories, and no root markdown, found in the repo layout — nothing for paths-ignore to skip in ${base}. No changes were written.`, warnings };
  }
  const add = Object.fromEntries(events.map((e) => [e, { 'paths-ignore': patterns }]));
  modifyWorkflow(file, { addTopLevel: { key: 'on', yaml: yaml.stringify({ on: add }) } });
  const note = warnings.length ? ` Warning: ${warnings.join('; ')}.` : '';
  return {
    success: true,
    message: `Added "Paths Ignore" to ${base} (${events.join(', ')}): ${patterns.join(', ')}.${note}`,
    file,
    feature: 'paths-ignore',
    warnings
  };
}

/** Dependency manifests and lockfiles a dependency audit reads. */
const MANIFEST_FILES = [
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'requirements.txt', 'requirements-dev.txt', 'pyproject.toml', 'poetry.lock', 'Pipfile', 'Pipfile.lock',
  'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.sum', 'Gemfile', 'Gemfile.lock', 'composer.json', 'composer.lock'
];

/** Top-level directories that usually hold source a code scanner reads. */
const SOURCE_DIRS = ['src', 'lib', 'app', 'apps', 'packages', 'server', 'client', 'cmd', 'internal', 'scripts', '.claude'];

/** The weekly run trigger-scope adds, so an unchanged branch is still scanned. */
const TRIGGER_SCOPE_CRON = '0 6 * * 1';

/**
 * The `paths:` list trigger-scope narrows a workflow to (#3424): manifests
 * and lockfiles present for a dependency audit, top-level source
 * directories present for a code scanner, and the workflow file itself, so
 * editing the scan re-runs it.
 * @param {string} projectDir
 * @param {{kind: string}[]} scanners - classifyTriggerScope's scanners
 * @param {string} fileName - The workflow's file name
 * @returns {{paths: string[]}}
 */
function triggerScopePaths(projectDir, scanners, fileName) {
  let names = [];
  try { names = fs.readdirSync(projectDir); } catch (_e) { /* empty layout */ }
  const isDir = (d) => {
    try { return fs.statSync(path.join(projectDir, d)).isDirectory(); } catch (_e) { return false; }
  };
  const kinds = new Set(scanners.map((s) => s.kind));
  const paths = [];
  if (kinds.has('dependency')) paths.push(...MANIFEST_FILES.filter((f) => names.includes(f) && !isDir(f)));
  if (kinds.has('code')) paths.push(...SOURCE_DIRS.filter((d) => names.includes(d) && isDir(d)).map((d) => `${d}/**`));
  if (paths.length) paths.push(`.github/workflows/${fileName}`);
  return { paths };
}

/**
 * Narrow an audit or scanner workflow to `paths:`, a weekly `schedule` and
 * `workflow_dispatch` (#3424). push and pull_request, where present, get the
 * paths list in place of any paths-ignore; their branch and tag filters are
 * kept. Edited on the document so comments survive.
 * @param {string} projectDir
 * @param {string} file - Workflow path
 * @returns {{ success: boolean, message: string, file?: string, feature?: string }}
 */
function addTriggerScope(projectDir, file) {
  const { classifyTriggerScope, inventoryWorkflows, TRIGGER_SCOPE_TRADEOFF } = require('./ci-recommend.js');
  const base = path.basename(file);
  const wf = inventoryWorkflows(projectDir).find((w) => w.file === file || w.fileName === base);
  const verdict = wf ? classifyTriggerScope(wf) : { eligible: false, reason: 'could not be parsed', scanners: [] };
  if (!verdict.eligible) {
    return { success: false, message: `trigger-scope does not apply to ${base}: it ${verdict.reason}. No changes were written.` };
  }
  const { paths } = triggerScopePaths(projectDir, verdict.scanners, base);
  if (!paths.length) {
    return {
      success: false,
      message: `No manifest or source directory found for ${verdict.scanners.map((s) => s.name).join(', ')} to watch in ${base}. `
        + 'Add a paths: filter by hand. No changes were written.'
    };
  }
  const edited = editWorkflowDocument(file, (doc) => {
    const on = onAsMap(doc);
    for (const event of ['push', 'pull_request']) {
      if (!on.has(event)) continue;
      const ev = on.get(event, true);
      if (yaml.isMap(ev)) {
        ev.delete('paths-ignore');
        ev.set('paths', doc.createNode(paths));
      } else {
        on.set(event, doc.createNode({ paths }));
      }
    }
    if (!on.has('schedule')) on.set('schedule', doc.createNode([{ cron: TRIGGER_SCOPE_CRON }]));
    if (!on.has('workflow_dispatch')) on.set('workflow_dispatch', null);
    return { ok: true, changed: true };
  });
  if (!edited.ok) return { success: false, message: edited.message };
  return {
    success: true,
    message: `Added "Trigger Scope" to ${base}: paths ${paths.join(', ')}; schedule '${TRIGGER_SCOPE_CRON}'; workflow_dispatch. `
      + `Gives up: ${TRIGGER_SCOPE_TRADEOFF}.`,
    file,
    feature: 'trigger-scope'
  };
}

/**
 * The one workflow trigger-scope applies to when the caller names none.
 * @param {string} projectDir
 * @returns {{ok: true, file: string}|{ok: false, message: string}}
 */
function findTriggerScopeTarget(projectDir) {
  const { classifyTriggerScope, inventoryWorkflows } = require('./ci-recommend.js');
  const eligible = inventoryWorkflows(projectDir).filter((w) => classifyTriggerScope(w).eligible);
  if (eligible.length === 1) return { ok: true, file: eligible[0].file };
  if (eligible.length === 0) {
    return { ok: false, message: 'No workflow qualifies for trigger-scope (every-push, no test step, an audit or scanner step). No changes were written.' };
  }
  return {
    ok: false,
    message: `${eligible.length} workflows qualify for trigger-scope (${eligible.map((w) => w.fileName).join(', ')}). `
      + 'Name one with --file <workflow>. No changes were written.'
  };
}

/**
 * Apply a feature to the resolved target workflow.
 * @param {string} projectDir
 * @param {string} featureId
 * @param {{file: string}} target
 * @param {{paths?: string[]}} [options] - `paths`: explicit paths-ignore patterns (#3427)
 * @returns {{ success: boolean, message: string, file?: string, feature?: string }}
 */
function applyFeatureToWorkflow(projectDir, featureId, target, options = {}) {
  const registry = loadFeatureRegistry();
  const feature = registry[featureId];
  const featureType = FEATURE_TYPE_MAP[featureId] || 'step';
  const templateYaml = feature.template.yaml;

  try {
    let operation;
    let scriptNote = '';

    // The script is checked here but copied only after the step lands (#3411):
    // a workflow that cannot take the step must not leave a file behind.
    if (featureType === 'step-with-script') {
      const available = featureScriptSource(feature.template.script);
      if (!available.ok) {
        return { success: false, message: available.message };
      }
    }

    if (featureId === 'paths-ignore') {
      return options.paths ? addExplicitPathsIgnore(target.file, options.paths) : addLayoutPathsIgnore(projectDir, target.file);
    }
    if (featureId === 'trigger-scope') {
      return addTriggerScope(projectDir, target.file);
    }

    if (featureType === 'top-level') {
      const key = TOP_LEVEL_KEY_MAP[featureId] || featureId;
      operation = { addTopLevel: { key, yaml: templateYaml } };
    } else if (featureType === 'trigger') {
      // Trigger modifications are applied as top-level 'on' changes
      operation = { addTopLevel: { key: 'on', yaml: templateYaml } };
    } else if (featureType === 'strategy') {
      // Strategy features modify job-level properties (strategy.matrix, runs-on)
      const firstJob = getFirstJobName(target.file);
      if (!firstJob) {
        return {
          success: false,
          message: `No jobs found in ${path.basename(target.file)} to modify strategy.`
        };
      }
      // A matrix the job never reads runs one configuration N times, so the
      // strategy is set together with the job field it varies (#3369).
      const strategyData = yaml.parse(templateYaml);
      const strategy = strategyData && strategyData.strategy ? strategyData.strategy : strategyData;
      const wired = editWorkflowDocument(target.file, doc => wireStrategy(doc, firstJob, featureId, strategy));
      if (!wired.ok) {
        return { success: false, message: wired.message };
      }
      return {
        success: true,
        message: `Added "${feature.name}" to ${path.basename(target.file)}`,
        file: target.file,
        feature: featureId
      };
    } else if (featureType === 'step-modify') {
      // Modify existing upload-artifact steps in-place
      const modified = modifyUploadArtifactSteps(target.file, featureId, templateYaml);
      if (!modified) {
        return {
          success: false,
          message: `No upload-artifact steps found in ${path.basename(target.file)} to modify.`
        };
      }
      return {
        success: true,
        message: `Added "${feature.name}" to ${path.basename(target.file)}`,
        file: target.file,
        feature: featureId
      };
    } else {
      // Step-type features (and step-with-script, whose copy follows the step) — add to first test job
      const firstJob = getFirstJobName(target.file);
      if (!firstJob) {
        return {
          success: false,
          message: `No jobs found in ${path.basename(target.file)} to add step to.`
        };
      }
      operation = { addStep: { job: firstJob, yaml: templateYaml, position: 'before-last' } };
    }

    modifyWorkflow(target.file, operation);

    if (featureType === 'step-with-script') {
      const copied = copyFeatureScript(projectDir, feature.template.script);
      if (!copied.ok) {
        return { success: false, message: `${copied.message} The step was added to ${path.basename(target.file)}; copy the script by hand.` };
      }
      scriptNote = copied.message;
    }

    return {
      success: true,
      message: `Added "${feature.name}" to ${path.basename(target.file)}${scriptNote}`,
      file: target.file,
      feature: featureId
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to add feature: ${err.message}`
    };
  }
}

/**
 * Get the name of the first job in a workflow file.
 * @param {string} filePath - Path to workflow file
 * @returns {string|null} First job name or null
 */
function getFirstJobName(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.parse(content);
    if (parsed && parsed.jobs) {
      const jobNames = Object.keys(parsed.jobs);
      return jobNames.length > 0 ? jobNames[0] : null;
    }
  } catch (_e) {
    // Ignore
  }
  return null;
}

/**
 * Edit a workflow through its YAML document so comments and formatting
 * survive, then validate, back up and write — the order modifyWorkflow uses
 * (#3307). Nothing is written when `edit` reports a refusal or no change.
 * @param {string} filePath - Path to workflow file
 * @param {(doc: yaml.Document) => {ok: boolean, changed?: boolean, message?: string}} edit
 * @returns {{ok: boolean, changed: boolean, message?: string}}
 */
function editWorkflowDocument(filePath, edit) {
  const original = fs.readFileSync(filePath, 'utf8');
  const doc = yaml.parseDocument(original);
  const result = edit(doc);
  if (!result.ok) return { ok: false, changed: false, message: result.message };
  if (result.changed === false) return { ok: true, changed: false };
  const output = serializeEdited(original, doc);
  validateYaml(output);
  createBackup(filePath);
  fs.writeFileSync(filePath, output);
  return { ok: true, changed: true };
}

/**
 * Set a strategy feature's matrix and the job field that consumes it:
 * runs-on for cross-os-testing, setup-node's node-version for
 * multi-node-versions (#3369). The template's matrix keys are merged into an
 * existing strategy, never replacing it, so a second strategy feature keeps
 * the first's matrix key and the field that reads it (#3390).
 * @param {yaml.Document} doc
 * @param {string} job - Job name
 * @param {string} featureId
 * @param {object} strategy - Parsed `strategy` mapping from the template
 * @returns {{ok: boolean, message?: string}}
 */
function wireStrategy(doc, job, featureId, strategy) {
  const existing = doc.getIn(['jobs', job, 'strategy']);
  const existingMatrix = yaml.isMap(existing) ? existing.get('matrix') : undefined;
  if ((existing != null && !yaml.isMap(existing)) ||
      (existingMatrix != null && !yaml.isMap(existingMatrix))) {
    return {
      ok: false,
      message: `Job "${job}" has a strategy matrix that is not a mapping (e.g. an expression), ` +
        'so its keys cannot be merged. Add the matrix entries by hand, then re-run.'
    };
  }
  if (featureId === 'multi-node-versions') {
    const steps = doc.getIn(['jobs', job, 'steps']);
    const setupNode = (steps && steps.items ? steps.items : [])
      .filter(s => yaml.isMap(s) && /actions\/setup-node/.test(String(s.get('uses') || '')));
    if (setupNode.length === 0) {
      return {
        ok: false,
        message: `Job "${job}" has no actions/setup-node step, so a node-version matrix would test one version. ` +
          'Add an actions/setup-node step with node-version: ${{ matrix.node-version }}, then re-run.'
      };
    }
    for (const step of setupNode) step.setIn(['with', 'node-version'], '${{ matrix.node-version }}');
  }
  for (const [key, value] of Object.entries(strategy || {})) {
    if (key === 'matrix' && value && typeof value === 'object') {
      for (const [axis, values] of Object.entries(value)) {
        doc.setIn(['jobs', job, 'strategy', 'matrix', axis], values);
      }
    } else {
      doc.setIn(['jobs', job, 'strategy', key], value);
    }
  }
  if (featureId === 'cross-os-testing') {
    doc.setIn(['jobs', job, 'runs-on'], '${{ matrix.os }}');
  }
  return { ok: true };
}

/**
 * Modify existing upload-artifact steps in a workflow file.
 * For artifact-retention: adds retention-days to with: block.
 * For artifact-conditional-upload: adds if: condition to step.
 * @param {string} filePath - Path to workflow file
 * @param {string} featureId - Feature identifier
 * @param {string} templateYaml - Template content to inject
 * @returns {boolean} True if modifications were made
 */
function modifyUploadArtifactSteps(filePath, featureId, templateYaml) {
  // Edited in place on the document, so comments and formatting survive and
  // the write is validated and backed up like every modifyWorkflow edit (#3369).
  const result = editWorkflowDocument(filePath, (doc) => {
    const jobs = doc.get('jobs');
    if (!yaml.isMap(jobs)) return { ok: true, changed: false };

    let changed = false;
    for (const jobPair of jobs.items) {
      const steps = yaml.isMap(jobPair.value) ? jobPair.value.get('steps') : null;
      if (!yaml.isSeq(steps)) continue;

      for (const step of steps.items) {
        if (!yaml.isMap(step) || !/actions\/upload-artifact/.test(String(step.get('uses') || ''))) continue;

        if (featureId === 'artifact-retention') {
          if (!step.getIn(['with', 'retention-days'])) {
            step.setIn(['with', 'retention-days'], parseInt(templateYaml.match(/\d+/)?.[0] || '1', 10));
            changed = true;
          }
        } else if (featureId === 'artifact-conditional-upload') {
          if (!step.get('if')) {
            // The template is `if: <expr>`; only the expression is the value (#3369).
            step.set('if', yaml.parse(templateYaml).if);
            changed = true;
          }
        }
      }
    }
    return { ok: true, changed };
  });

  return result.changed;
}

/**
 * Parse `ci-add.js <feature-id> [--file <workflow>] [--paths <p1,p2>] [project-dir]`
 * (#3424, #3427). `--file` names the workflow in .github/workflows/ to edit
 * and skips auto-detection; `--paths` names paths-ignore patterns,
 * comma-separated. Both accept the `--flag=value` form.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{featureId?: string, file?: string, paths?: string[], projectDir?: string, error?: string}}
 */
function parseCliArgs(argv) {
  const out = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a.startsWith('--file=')) {
      const value = a === '--file' ? argv[++i] : a.slice('--file='.length);
      if (!value || value.startsWith('--')) return { error: '--file needs a workflow file name, e.g. --file security.yml' };
      out.file = value;
    } else if (a === '--paths' || a.startsWith('--paths=')) {
      const value = a === '--paths' ? argv[++i] : a.slice('--paths='.length);
      const paths = (value && !value.startsWith('--') ? value.split(',') : []).map((p) => p.trim()).filter(Boolean);
      if (!paths.length) return { error: "--paths needs one or more comma-separated patterns, e.g. --paths 'Proposal/**,docs/**'" };
      out.paths = paths;
    } else if (a.startsWith('--')) {
      return { error: `Unknown option: ${a}` };
    } else {
      positional.push(a);
    }
  }
  [out.featureId, out.projectDir] = positional;
  return out;
}

// CLI entry point
if (require.main === module) {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.error || !args.featureId) {
    if (args.error) console.log(args.error);
    console.log('Usage: ci-add.js <feature-id> [--file <workflow>] [--paths <p1,p2>] [project-dir]');
    process.exit(1);
  }
  const projectDir = args.projectDir || process.cwd();

  const result = addCIFeature(projectDir, args.featureId, { skipConfirm: true, file: args.file, paths: args.paths });
  console.log(result.message);
  process.exit(result.success ? 0 : 1);
}

module.exports = {
  addCIFeature, validateFeatureName, isFeatureAlreadyEnabled,
  layoutPathsIgnore, filterPatternToRegex, runtimeMarkdownMatches, IDPF_ARTIFACT_DIRS,
  triggerScopePaths, TRIGGER_SCOPE_CRON, parseCliArgs
};
