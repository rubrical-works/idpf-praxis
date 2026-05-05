// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.0
 * @description Generate charter questions from domain-entities-schema.json.
 * Maps required schema fields to contextual follow-up questions.
 * Used by /charter inception and update flows.
 * @checksum sha256:placeholder
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.resolve(__dirname, '../../../metadata/domain-entities-schema.json');

// Fields already covered by essential charter questions — no duplicate questions needed
const COVERED_BY_ESSENTIAL = [
    'boundedContext.name',     // Derived from project name
    'boundedContext.purpose',  // Essential Q1: "What are you building?"
    'boundedContext.boundary', // Essential Q4: "What's in scope?"
    'techStack',               // Essential Q3: "What technology?"
    'scopeBoundaries',         // Essential Q4: "What's in scope?"
    'driftSignals',            // Auto-generated from scope answers
];

// Schema fields that map to charter questions
const FIELD_QUESTION_MAP = {
    'entities': {
        question: 'What are the key entities/models in your project? (e.g., User, Order, Product)',
        header: 'Entities',
        condition: null, // Always asked if not covered
        description: 'List the main data entities, domain objects, or models your project works with.'
    },
    'architecture.components': {
        question: 'What are the main components or modules in your architecture?',
        header: 'Components',
        condition: (answers) => {
            // Only ask if entities answer suggests complexity (>3 items or complex descriptions)
            const entities = answers.entities;
            if (!entities) return false;
            if (Array.isArray(entities)) return entities.length > 3;
            if (typeof entities === 'string') return entities.split(',').length > 3;
            return false;
        },
        description: 'Components are larger groupings that contain entities (e.g., Auth Module, API Gateway, Data Pipeline).'
    }
};

/**
 * Load the domain-entities schema.
 * @returns {object|null} Schema object or null if not found
 */
function loadSchema() {
    try {
        return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * Generate questions from schema for charter inception.
 * Returns only questions for required fields not already covered by essential questions.
 * @param {object} [answers] - Answers collected so far (for conditional questions)
 * @returns {Array<{field: string, question: string, header: string, description: string, conditional: boolean}>}
 */
function generateQuestions(answers = {}) {
    const schema = loadSchema();
    if (!schema) return [];

    const questions = [];

    for (const [field, mapping] of Object.entries(FIELD_QUESTION_MAP)) {
        // Skip if already covered by essential questions
        if (COVERED_BY_ESSENTIAL.includes(field)) continue;

        // Check condition if present
        const conditional = !!mapping.condition;
        if (mapping.condition && !mapping.condition(answers)) continue;

        questions.push({
            field,
            question: mapping.question,
            header: mapping.header,
            description: mapping.description,
            conditional
        });
    }

    return questions;
}

/**
 * For charter update: identify which schema-required fields are missing/empty in current domain-entities.json.
 * @param {object} currentEntities - Current domain-entities.json content
 * @returns {Array<{field: string, question: string, header: string, description: string, conditional: boolean}>}
 */
function generateUpdateQuestions(currentEntities) {
    if (!currentEntities) return generateQuestions();

    const schema = loadSchema();
    if (!schema) return [];

    const missing = [];

    for (const [field, mapping] of Object.entries(FIELD_QUESTION_MAP)) {
        if (COVERED_BY_ESSENTIAL.includes(field)) continue;

        // Check if field has content in current entities
        const value = getNestedValue(currentEntities, field);
        if (value && !isEmpty(value)) continue;

        missing.push({
            field,
            question: mapping.question,
            header: mapping.header,
            description: mapping.description,
            conditional: false // During update, ask regardless of condition
        });
    }

    return missing;
}

/**
 * Get nested value from object using dot notation.
 * @param {object} obj
 * @param {string} path - Dot-separated path (e.g., 'architecture.components')
 * @returns {*}
 */
function getNestedValue(obj, dotPath) {
    return dotPath.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
}

/**
 * Check if a value is empty (null, undefined, empty object, empty array, empty string).
 * @param {*} value
 * @returns {boolean}
 */
function isEmpty(value) {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

module.exports = {
    generateQuestions,
    generateUpdateQuestions,
    loadSchema,
    getNestedValue,
    isEmpty,
    COVERED_BY_ESSENTIAL,
    FIELD_QUESTION_MAP
};
