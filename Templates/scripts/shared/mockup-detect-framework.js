#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.79.0
 * @description Detect UI framework for mockup generation.
 * Used by /mockups to decide between framework-native components and .drawio.svg fallback.
 * @checksum sha256:placeholder
 */

const SUPPORTED_FRAMEWORKS = {
  react: {
    packages: ['react', 'react-dom', 'next', 'gatsby', 'remix'],
    extensions: ['.tsx', '.jsx'],
    charterKeywords: ['react', 'next.js', 'nextjs', 'gatsby', 'remix']
  },
  svelte: {
    packages: ['svelte', '@sveltejs/kit', 'sveltekit'],
    extensions: ['.svelte'],
    charterKeywords: ['svelte', 'sveltekit']
  },
  vue: {
    packages: ['vue', 'nuxt', '@nuxt/core'],
    extensions: ['.vue'],
    charterKeywords: ['vue', 'nuxt', 'nuxtjs']
  },
  angular: {
    packages: ['@angular/core', '@angular/cli'],
    extensions: ['.component.ts', '.component.html'],
    charterKeywords: ['angular']
  }
};

const NON_WEB_PACKAGES = ['electron', 'tauri', 'neutralinojs', 'nw'];
const STATIC_SITE_PACKAGES = ['astro', 'hugo', '@11ty/eleventy', 'gatsby-plugin-mdx', 'jekyll'];

const FALLBACK_REASONS = {
  NO_UI_FRAMEWORK: 'no_ui_framework',
  NON_WEB_FRAMEWORK: 'non_web_framework',
  MULTIPLE_FRAMEWORKS: 'multiple_frameworks',
  NOT_YET_CHOSEN: 'not_yet_chosen',
  STATIC_SITE: 'static_site'
};

/**
 * Detect UI framework from project context.
 * @param {object} context
 * @param {object} [context.packageJson] - parsed package.json
 * @param {object} [context.charter] - charter info with techStack string
 * @returns {{ framework: string|null, fallback: boolean, reason?: string, extensions?: string[] }}
 */
function detectFramework(context) {
  const { packageJson, charter } = context;
  const allDeps = {};

  if (packageJson) {
    Object.assign(allDeps, packageJson.dependencies || {}, packageJson.devDependencies || {});
  }

  const depNames = Object.keys(allDeps);

  // Check for non-web frameworks first (Electron without a supported UI framework)
  const hasNonWeb = depNames.some(d => NON_WEB_PACKAGES.includes(d));

  // Check for static site generators
  const hasStaticSite = depNames.some(d => STATIC_SITE_PACKAGES.includes(d));

  // Detect supported UI frameworks from packages
  const detected = [];
  for (const [name, config] of Object.entries(SUPPORTED_FRAMEWORKS)) {
    if (config.packages.some(pkg => depNames.includes(pkg))) {
      detected.push(name);
    }
  }

  // Multiple UI frameworks = ambiguity
  if (detected.length > 1) {
    return { framework: null, fallback: true, reason: FALLBACK_REASONS.MULTIPLE_FRAMEWORKS };
  }

  // Single framework detected
  if (detected.length === 1) {
    const fw = detected[0];
    return {
      framework: fw,
      fallback: false,
      extensions: SUPPORTED_FRAMEWORKS[fw].extensions
    };
  }

  // Static site without a supported UI framework
  if (hasStaticSite) {
    return { framework: null, fallback: true, reason: FALLBACK_REASONS.STATIC_SITE };
  }

  // Non-web framework without a supported UI framework
  if (hasNonWeb) {
    return { framework: null, fallback: true, reason: FALLBACK_REASONS.NON_WEB_FRAMEWORK };
  }

  // No package.json detected frameworks — try charter
  if (charter && charter.techStack) {
    const stack = charter.techStack.toLowerCase();

    // Check for TBD / placeholder
    if (/^(tbd|to be determined|not decided|\.\.\.)$/i.test(stack.trim())) {
      return { framework: null, fallback: true, reason: FALLBACK_REASONS.NOT_YET_CHOSEN };
    }

    // Search charter for framework keywords
    const charterDetected = [];
    for (const [name, config] of Object.entries(SUPPORTED_FRAMEWORKS)) {
      if (config.charterKeywords.some(kw => stack.includes(kw))) {
        charterDetected.push(name);
      }
    }

    if (charterDetected.length === 1) {
      const fw = charterDetected[0];
      return {
        framework: fw,
        fallback: false,
        extensions: SUPPORTED_FRAMEWORKS[fw].extensions
      };
    }

    if (charterDetected.length > 1) {
      return { framework: null, fallback: true, reason: FALLBACK_REASONS.MULTIPLE_FRAMEWORKS };
    }
  }

  // Nothing detected
  return { framework: null, fallback: true, reason: FALLBACK_REASONS.NO_UI_FRAMEWORK };
}

// CLI mode
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');

  const context = {};

  // Try reading package.json
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      context.packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch { /* ignore parse errors */ }
  }

  // Try reading CHARTER.md for tech stack
  const charterPath = path.join(process.cwd(), 'CHARTER.md');
  if (fs.existsSync(charterPath)) {
    try {
      const content = fs.readFileSync(charterPath, 'utf8');
      const match = content.match(/\|\s*(?:Tech Stack|Frontend|UI)\s*\|\s*(.+?)\s*\|/i);
      if (match) {
        context.charter = { techStack: match[1] };
      }
    } catch { /* ignore */ }
  }

  const result = detectFramework(context);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.fallback ? 1 : 0);
}

module.exports = { detectFramework, SUPPORTED_FRAMEWORKS, FALLBACK_REASONS };
