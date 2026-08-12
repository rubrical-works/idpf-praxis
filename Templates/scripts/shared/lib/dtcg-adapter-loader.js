// Rubrical Works (c) 2026
/**
 * @framework-script 0.96.2
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
/**
 * Whether a node is a DTCG token leaf rather than a group. A leaf carries
 * $value; groups are plain nested objects.
 * @param {*} node
 * @returns {boolean}
 */
function isLeafNode(node) {
  return node !== null
    && typeof node === 'object'
    && !Array.isArray(node)
    && Object.prototype.hasOwnProperty.call(node, '$value');
}

/**
 * Recursively merge `incoming` into `target`, preserving tokens already
 * present. Every discovery adapter emits top-level groups named
 * color/dimension/gradient, so a shallow Object.assign made the last adapter
 * to run wipe out every earlier adapter's tokens in the same group (#2466).
 *
 * First writer wins on a genuine leaf collision — discovery order is
 * deterministic (adapters are listed sorted), so this is stable — and each
 * collision is recorded for the caller to report.
 *
 * @param {object} target - Accumulated tokens, mutated in place
 * @param {object} incoming - Tokens from the current adapter
 * @param {string} adapterName - Name of the adapter supplying `incoming`
 * @param {Map<string,string>} owners - path → adapter that first wrote it
 * @param {Array<object>} collisions - Collected collision records
 * @param {string} [prefix] - Dotted path accumulated so far
 */
function deepMergeTokens(target, incoming, adapterName, owners, collisions, prefix = '') {
  const recordCollision = (dottedPath) => {
    collisions.push({
      path: dottedPath,
      adapter: adapterName,
      keptFrom: owners.get(dottedPath) || null
    });
  };

  const claim = (key, dottedPath, value) => {
    target[key] = value;
    owners.set(dottedPath, adapterName);
  };

  for (const [key, value] of Object.entries(incoming)) {
    const dottedPath = prefix ? `${prefix}.${key}` : key;
    const occupied = Object.prototype.hasOwnProperty.call(target, key);
    const isGroup = value !== null && typeof value === 'object'
      && !Array.isArray(value) && !isLeafNode(value);

    if (isGroup) {
      // A leaf already sitting where a group wants to go is a real clash —
      // do not clobber it.
      if (isLeafNode(target[key])) {
        recordCollision(dottedPath);
        continue;
      }
      if (!occupied || typeof target[key] !== 'object') {
        target[key] = {};
      }
      deepMergeTokens(target[key], value, adapterName, owners, collisions, dottedPath);
      continue;
    }

    // Leaf, scalar, or array — first writer wins.
    if (occupied) {
      recordCollision(dottedPath);
      continue;
    }
    claim(key, dottedPath, value);
  }
}

function runDiscoveryAdapters(adapterDir, projectRoot) {
  const adapters = listAdapters(adapterDir);
  const mergedTokens = {};
  const results = [];
  const collisions = [];
  const owners = new Map();

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
      // Merge discovered tokens group-wise — a shallow assign here dropped
      // every earlier adapter's tokens in a shared group (#2466).
      if (tokens && typeof tokens === 'object') {
        deepMergeTokens(mergedTokens, tokens, adapter.name, owners, collisions);
      }
      results.push({ name: adapter.name, detected: true });
    } catch (err) {
      results.push({ name: adapter.name, detected: false, error: err.message });
    }
  }

  return { tokens: mergedTokens, results, collisions };
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
  runAllExportAdapters,
  deepMergeTokens,
  isLeafNode
};
