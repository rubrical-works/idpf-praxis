// Rubrical Works (c) 2026
/**
 * @framework-script 0.103.0
 * @description Detect technology stack from project root file indicators.
 * Used by recipe filtering and domain specialist selection.
 * @checksum sha256:placeholder
 *
 * @module .claude/scripts/shared/lib/detect-tech-stack
 */

const fs = require('fs');
const path = require('path');

/**
 * Technology detection heuristics.
 *
 * Each entry maps a project file to a technology identifier. `file` is a path
 * relative to the project root, or an ARRAY of candidate paths any one of
 * which satisfies the entry (#2900) — needed because `AndroidManifest.xml` is
 * never at the root of a real Android project, so a root-only check would
 * never fire for the very layout it names.
 *
 * `mobile` is a PLATFORM, not a language: it names the surface a project
 * targets rather than what it is written in, and a React Native project is
 * detected as both `node` and `mobile`. `charter-testing-audit.js` maps it
 * through TECH_TO_PLATFORMS onto the registry's `platforms` group.
 */
const HEURISTICS = [
  { file: 'package.json', tech: 'node' },
  { file: 'pyproject.toml', tech: 'python' },
  { file: 'setup.py', tech: 'python' },
  { file: 'go.mod', tech: 'go' },
  { file: 'Cargo.toml', tech: 'rust' },
  { file: 'pom.xml', tech: 'java' },
  { file: 'build.gradle', tech: 'java' },
  { file: 'Gemfile', tech: 'ruby' },
  // Expo/React Native. `app.json` is the weakest signal here — it is an Expo
  // convention rather than a reserved name — so it is deliberately paired
  // with the stronger manifests below rather than relied on alone.
  { file: 'app.json', tech: 'mobile' },
  { file: 'pubspec.yaml', tech: 'mobile' },
  {
    file: [
      'AndroidManifest.xml',
      'app/src/main/AndroidManifest.xml',
      'android/app/src/main/AndroidManifest.xml',
    ],
    tech: 'mobile',
  },
];

/**
 * Glob include patterns per detected technology. Used by /code-review Step 3
 * to resolve default include patterns from the charter's detected tech stack.
 */
const TECH_GLOB_PATTERNS = {
  node: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.mjs', '**/*.cjs'],
  python: ['**/*.py'],
  go: ['**/*.go'],
  rust: ['**/*.rs'],
  java: ['**/*.java'],
  ruby: ['**/*.rb'],
  // The native-surface languages a mobile project adds. `.js`/`.ts` are
  // deliberately absent: a React Native project also carries `package.json`,
  // so `node` already supplies them and repeating them here would say the
  // platform owns sources the language entry already claims.
  mobile: ['**/*.dart', '**/*.swift', '**/*.kt', '**/*.m', '**/*.mm'],
};

/**
 * Detect technology stack by checking for indicator files in the project root.
 * @param {string} projectRoot - Path to the project root directory
 * @returns {string[]} Array of detected technology identifiers (deduplicated)
 */
function detectTechStack(projectRoot) {
  const detected = new Set();
  for (const { file, tech } of HEURISTICS) {
    const candidates = Array.isArray(file) ? file : [file];
    if (candidates.some((c) => fs.existsSync(path.join(projectRoot, c)))) {
      detected.add(tech);
    }
  }
  return [...detected];
}

/**
 * Resolve glob include patterns for a list of tech identifiers. Unknown techs
 * are skipped silently. Patterns are deduplicated across techs.
 * @param {string[]} techs - Technology identifiers from detectTechStack()
 * @returns {string[]} Deduplicated glob patterns
 */
function getGlobPatternsForTechs(techs) {
  const patterns = new Set();
  for (const tech of techs) {
    const forTech = TECH_GLOB_PATTERNS[tech];
    if (forTech) forTech.forEach(p => patterns.add(p));
  }
  return [...patterns];
}

module.exports = { detectTechStack, getGlobPatternsForTechs, HEURISTICS, TECH_GLOB_PATTERNS };
