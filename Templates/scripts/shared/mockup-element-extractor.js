/**
 * @framework-script 0.88.0
 * mockup-element-extractor.js
 *
 * Extracts UI elements from ASCII mockup files and HTML mockup files.
 * Used by /catalog-screens when scanning mockup directories.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { readFileSafe } = require('./lib/shell-safe.js');

/**
 * Extract elements from an ASCII mockup file.
 * Detects: text inputs [___], buttons [ Label ], checkboxes [x]/[ ],
 * dropdowns, labels, and table headers.
 */
function extractFromAscii(content, filePath) {
  const elements = [];
  const lines = content.split('\n');
  const fileName = path.basename(filePath, path.extname(filePath));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Text inputs: [____] or [_______________]
    const inputMatches = line.matchAll(/(\w[\w\s]*?):\s*\[_{2,}\]/g);
    for (const match of inputMatches) {
      elements.push({
        type: 'text-input',
        label: match[1].trim(),
        line: i + 1,
        source: fileName,
      });
    }

    // Buttons: [ Label ] (space-padded text in brackets, not underscores)
    const buttonMatches = line.matchAll(/\[\s+([A-Z][\w\s]*?)\s+\]/g);
    for (const match of buttonMatches) {
      const label = match[1].trim();
      // Skip if looks like a checkbox
      if (label === 'x' || label === 'X' || label === ' ') continue;
      elements.push({
        type: 'button',
        label,
        line: i + 1,
        source: fileName,
      });
    }

    // Checkboxes: [x] Label or [ ] Label
    const checkboxMatches = line.matchAll(/\[([xX ])\]\s+(.+?)(?:\s{2,}|$)/g);
    for (const match of checkboxMatches) {
      elements.push({
        type: 'checkbox',
        label: match[2].trim(),
        checked: match[1].toLowerCase() === 'x',
        line: i + 1,
        source: fileName,
      });
    }

    // Links: text ending with ? (standalone, not inside brackets)
    const linkMatches = line.matchAll(/(?:^|[\s|])([A-Z][\w\s]*\?)\s*(?:[|]?\s*$)/g);
    for (const match of linkMatches) {
      elements.push({
        type: 'link',
        label: match[1].trim(),
        line: i + 1,
        source: fileName,
      });
    }
  }

  return elements;
}

/**
 * Extract elements from an HTML mockup file.
 * Parses form elements, buttons, inputs, selects, and interactive components.
 */
function extractFromHtml(content, filePath) {
  const elements = [];
  const fileName = path.basename(filePath, path.extname(filePath));

  // Input elements
  const inputRegex = /<input\b[^>]*>/gi;
  let match;
  while ((match = inputRegex.exec(content)) !== null) {
    const tag = match[0];
    const type = tag.match(/type=["'](\w+)["']/i)?.[1] || 'text';
    const name = tag.match(/name=["']([^"']+)["']/i)?.[1];
    const placeholder = tag.match(/placeholder=["']([^"']+)["']/i)?.[1];
    const id = tag.match(/id=["']([^"']+)["']/i)?.[1];

    if (type === 'hidden') continue;

    elements.push({
      type: type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : 'text-input',
      label: placeholder || name || id || type,
      htmlType: type,
      source: fileName,
    });
  }

  // Button elements
  const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  while ((match = buttonRegex.exec(content)) !== null) {
    let innerText = match[1];
    const MAX_STRIP_PASSES = 10;
    for (let i = 0; i < MAX_STRIP_PASSES; i++) {
      const next = innerText.replace(/<[^>]+>/g, '');
      if (next === innerText) break;
      innerText = next;
    }
    innerText = innerText.trim();
    if (innerText) {
      elements.push({
        type: 'button',
        label: innerText,
        source: fileName,
      });
    }
  }

  // Select elements
  const selectRegex = /<select\b[^>]*>[\s\S]*?<\/select>/gi;
  while ((match = selectRegex.exec(content)) !== null) {
    const tag = match[0];
    const name = tag.match(/name=["']([^"']+)["']/i)?.[1];
    const id = tag.match(/id=["']([^"']+)["']/i)?.[1];
    const optionCount = (tag.match(/<option/gi) || []).length;
    elements.push({
      type: 'dropdown',
      label: name || id || 'select',
      optionCount,
      source: fileName,
    });
  }

  // Textarea elements
  const textareaRegex = /<textarea\b[^>]*>/gi;
  while ((match = textareaRegex.exec(content)) !== null) {
    const tag = match[0];
    const name = tag.match(/name=["']([^"']+)["']/i)?.[1];
    const placeholder = tag.match(/placeholder=["']([^"']+)["']/i)?.[1];
    elements.push({
      type: 'textarea',
      label: placeholder || name || 'textarea',
      source: fileName,
    });
  }

  return elements;
}

/**
 * Detect if a directory contains mockup files.
 * Returns { hasMockups, asciiFiles, htmlFiles }
 */
function detectMockupFiles(dirPath) {
  const asciiFiles = [];
  const htmlFiles = [];

  let files;
  try {
    files = fs.readdirSync(dirPath, { recursive: true });
  } catch {
    return { hasMockups: false, asciiFiles, htmlFiles };
  }

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch { continue; }
    if (!stat.isFile()) continue;

    const ext = path.extname(file).toLowerCase();

    if (ext === '.md' || ext === '.txt') {
      const content = readFileSafe(fullPath);
      if (content === null) continue;
      // Check for ASCII art patterns: box-drawing chars or input placeholders
      if (/[┌┐└┘├┤─│]|[+\-|]{3,}|\[_{2,}\]|\[\s+\w+\s+\]/.test(content)) {
        asciiFiles.push(fullPath);
      }
    }

    if (ext === '.html') {
      const content = readFileSafe(fullPath);
      if (content === null) continue;
      if (/tailwindcss|<form|<input|<button|<select/i.test(content)) {
        htmlFiles.push(fullPath);
      }
    }
  }

  return {
    hasMockups: asciiFiles.length > 0 || htmlFiles.length > 0,
    asciiFiles,
    htmlFiles,
  };
}

module.exports = { extractFromAscii, extractFromHtml, detectMockupFiles };
