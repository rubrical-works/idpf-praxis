// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
 * Screenshot-input validator for --from-screenshot / --from-screenshots
 * on /catalog-screens and /mockups. Enforces NFR-3 mime allowlist.
 * Refs #2342 (PRD #2333)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];
const EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function validateScreenshotFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `File not found: ${filePath}` };
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = EXT_TO_MIME[ext];
  if (!mime || !ALLOWED_MIME.includes(mime)) {
    return {
      ok: false,
      error: `Unsupported file type '${ext}'. Allowed: ${ALLOWED_MIME.join(', ')}`
    };
  }
  return { ok: true, path: filePath };
}

function validateScreenshotDir(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return { ok: false, error: `Directory not found: ${dirPath}` };
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const valid = [];
  const skipped = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const full = path.join(dirPath, ent.name);
    const r = validateScreenshotFile(full);
    if (r.ok) valid.push(full);
    else skipped.push({ path: full, reason: r.error });
  }
  if (valid.length === 0) {
    return { ok: false, error: `No images found in ${dirPath}` };
  }
  return { ok: true, valid, skipped };
}

module.exports = { validateScreenshotFile, validateScreenshotDir, ALLOWED_MIME };
