#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.63.1
 * @description Praxis Diagram configuration utilities for charter integration
 * @checksum sha256:placeholder
 *
 * Detects the appropriate Praxis Diagram shape library from a project's
 * tech stack and generates .praxis-diagram.json configuration.
 *
 * This script is provided by the framework and may be updated.
 * To customize: copy to .claude/scripts/shared/ and modify.
 */

/**
 * Detect the Praxis Diagram shape library from tech stack text.
 * @param {string|null|undefined} techStackText - Tech stack description or charter content
 * @returns {string|null} - Shape library name or null if undetectable
 */
function detectShapeLibrary(techStackText) {
    if (!techStackText) return null;
    const lower = techStackText.toLowerCase();

    // Check for explicit flowbite-svelte mention or svelte + flowbite combo
    if (lower.includes('flowbite-svelte') || (lower.includes('flowbite') && lower.includes('svelte'))) {
        return 'flowbite-svelte';
    }

    // Check for explicit flowbite-react mention or react + flowbite combo
    if (lower.includes('flowbite-react') || (lower.includes('flowbite') && lower.includes('react'))) {
        return 'flowbite-react';
    }

    return null;
}

/**
 * Generate .praxis-diagram.json configuration object.
 * @param {string} shapeLibrary - The shape library to use (e.g., 'flowbite-svelte')
 * @returns {object} - Configuration object for .praxis-diagram.json
 */
function generateConfig(shapeLibrary) {
    return {
        shapes: shapeLibrary
    };
}

/**
 * Get available shape libraries for user selection prompt.
 * @returns {Array<{value: string, label: string, description: string}>}
 */
function getAvailableShapeLibraries() {
    return [
        {
            value: 'flowbite-svelte',
            label: 'Flowbite Svelte',
            description: 'Flowbite components for Svelte/SvelteKit projects'
        },
        {
            value: 'flowbite-react',
            label: 'Flowbite React',
            description: 'Flowbite components for React/Next.js projects'
        }
    ];
}

module.exports = {
    detectShapeLibrary,
    generateConfig,
    getAvailableShapeLibraries
};
