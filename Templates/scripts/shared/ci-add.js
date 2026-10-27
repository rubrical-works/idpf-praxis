#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.112.0
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
const { modifyWorkflow, validateYaml, createBackup } = require('./ci-modify.js');
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
  if (!relTarget || typeof relTarget !== 'string') {
    return { ok: false, message: 'Feature template names no script to copy.' };
  }
  const source = path.join(__dirname, path.basename(relTarget));
  if (!fs.existsSync(source)) {
    return { ok: false, message: `Feature script not found beside ci-add.js: ${path.basename(relTarget)}` };
  }
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

  // Check if already enabled — in the named workflow when there is one (#3370)
  if (isFeatureAlreadyEnabled(projectDir, featureId, options.file)) {
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
  } else {
    target = suggestWorkflowForFeature(projectDir, featureId);
  }

  let created = null;
  if (target.createNew) {
    created = createMinimalWorkflow(projectDir, target.suggestedName);
    target.file = created.file;
  }

  const result = applyFeatureToWorkflow(projectDir, featureId, target);
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

/**
 * Apply a feature to the resolved target workflow.
 * @param {string} projectDir
 * @param {string} featureId
 * @param {{file: string}} target
 * @returns {{ success: boolean, message: string, file?: string, feature?: string }}
 */
function applyFeatureToWorkflow(projectDir, featureId, target) {
  const registry = loadFeatureRegistry();
  const feature = registry[featureId];
  const featureType = FEATURE_TYPE_MAP[featureId] || 'step';
  const templateYaml = feature.template.yaml;

  try {
    let operation;
    let scriptNote = '';

    if (featureType === 'step-with-script') {
      const copied = copyFeatureScript(projectDir, feature.template.script);
      if (!copied.ok) {
        return { success: false, message: copied.message };
      }
      scriptNote = copied.message;
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
      // Step-type features (and step-with-script, once its copy landed) — add to first test job
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
  const doc = yaml.parseDocument(fs.readFileSync(filePath, 'utf8'));
  const result = edit(doc);
  if (!result.ok) return { ok: false, changed: false, message: result.message };
  if (result.changed === false) return { ok: true, changed: false };
  const output = doc.toString();
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

// CLI entry point
if (require.main === module) {
  const featureId = process.argv[2];
  const projectDir = process.argv[3] || process.cwd();

  if (!featureId) {
    console.log('Usage: ci-add.js <feature-id> [project-dir]');
    process.exit(1);
  }

  const result = addCIFeature(projectDir, featureId, { skipConfirm: true });
  console.log(result.message);
  process.exit(result.success ? 0 : 1);
}

module.exports = { addCIFeature, validateFeatureName, isFeatureAlreadyEnabled };
