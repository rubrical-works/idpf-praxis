// Rubrical Works (c) 2026
/**
 * @framework-script 0.75.0
 * @description DTCG adapter loader with auto-discovery and fault isolation.
 *   Loads discovery and export adapters from Design-System/adapters/ directories.
 *   Discovery adapters implement detect()/extract(); export adapters implement translate().
 *   Broken adapters are isolated — errors are reported without crashing the pipeline.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/dtcg-adapter-loader.js - Adapter loading, discovery, and execution
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * List all adapter files (.js) in a directory.
 * @param {string} adapterDir - Path to the adapter directory
 * @returns {Array<{ name: string, path: string }>} Adapter entries
 */
function listAdapters(adapterDir) {
  if (!fs.existsSync(adapterDir)) return [];

  return fs.readdirSync(adapterDir)
    .filter(f => f.endsWith('.js'))
    .sort()
    .map(f => ({
      name: path.basename(f, '.js'),
      path: path.join(adapterDir, f)
    }));
}

/**
 * Safely load and validate a module from a file path.
 * @param {string} filePath - Path to the adapter file
 * @returns {{ module: object|null, error: string|null }}
 */
function safeRequire(filePath) {
  try {
    const mod = require(filePath);
    return { module: mod, error: null };
  } catch (err) {
    return { module: null, error: `Failed to load: ${err.message}` };
  }
}

/**
 * Run all discovery adapters in a directory against a project root.
 * Adapters with detect() returning true have extract() called.
 * Broken adapters are reported but do not stop other adapters.
 *
 * @param {string} adapterDir - Path to discovery adapter directory
 * @param {string} projectRoot - Project root to pass to adapters
 * @returns {{ tokens: object, results: Array<{ name: string, detected: boolean, error?: string }> }}
 */
function runDiscoveryAdapters(adapterDir, projectRoot) {
  const adapters = listAdapters(adapterDir);
  const mergedTokens = {};
  const results = [];

  for (const adapter of adapters) {
    const { module: mod, error: loadError } = safeRequire(adapter.path);

    if (loadError) {
      results.push({ name: adapter.name, detected: false, error: loadError });
      continue;
    }

    if (typeof mod.detect !== 'function' || typeof mod.extract !== 'function') {
      results.push({
        name: adapter.name,
        detected: false,
        error: 'Adapter missing required methods: detect() and extract()'
      });
      continue;
    }

    try {
      const detected = mod.detect(projectRoot);
      if (!detected) {
        results.push({ name: adapter.name, detected: false });
        continue;
      }

      const tokens = mod.extract(projectRoot);
      // Merge discovered tokens
      if (tokens && typeof tokens === 'object') {
        Object.assign(mergedTokens, tokens);
      }
      results.push({ name: adapter.name, detected: true });
    } catch (err) {
      results.push({ name: adapter.name, detected: false, error: err.message });
    }
  }

  return { tokens: mergedTokens, results };
}

/**
 * Run a single export adapter against DTCG tokens.
 *
 * @param {string} adapterPath - Path to the export adapter file
 * @param {object} dtcgTokens - DTCG token object
 * @param {object} options - Export options
 * @returns {{ outputs: Array<{ path: string, content: string }>, error?: string }}
 */
function runExportAdapter(adapterPath, dtcgTokens, options) {
  const { module: mod, error: loadError } = safeRequire(adapterPath);

  if (loadError) {
    return { outputs: [], error: loadError };
  }

  if (typeof mod.translate !== 'function') {
    return { outputs: [], error: 'Adapter missing required method: translate()' };
  }

  try {
    const outputs = mod.translate(dtcgTokens, options || {});
    if (!Array.isArray(outputs)) {
      return { outputs: [], error: 'translate() must return an array of FileOutput objects' };
    }
    return { outputs };
  } catch (err) {
    return { outputs: [], error: err.message };
  }
}

/**
 * Run all export adapters in a directory.
 *
 * @param {string} adapterDir - Path to export adapter directory
 * @param {object} dtcgTokens - DTCG token object
 * @param {object} options - Export options
 * @returns {{ results: Array<{ name: string, outputs: Array, error?: string }> }}
 */
function runAllExportAdapters(adapterDir, dtcgTokens, options) {
  const adapters = listAdapters(adapterDir);
  const results = [];

  for (const adapter of adapters) {
    const result = runExportAdapter(adapter.path, dtcgTokens, options);
    results.push({ name: adapter.name, ...result });
  }

  return { results };
}

module.exports = {
  listAdapters,
  runDiscoveryAdapters,
  runExportAdapter,
  runAllExportAdapters
};
