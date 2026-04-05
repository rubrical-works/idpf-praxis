---
name: eslint-security
description: JS vulnerability detection via eslint-plugin-security (eval, unsafe regex, timing attacks)
extensionPoints:
  - post-recommend
  - pre-validation
  - pre-gate
  - post-implementation
appliesTo:
  - ci:post-recommend
  - prepare-release:pre-validation
  - merge-branch:pre-gate
  - work:post-implementation
prerequisites:
  - "npm install --save-dev eslint-plugin-security"
  - "ESLint flat config (eslint.config.js)"
technology:
  - node
---

### ESLint Security Plugin

Install and configure `eslint-plugin-security` for JS-specific vulnerability detection:

```bash
npm install --save-dev eslint-plugin-security
```

Add to `eslint.config.js` (flat config):

```javascript
import security from "eslint-plugin-security";

// In your config's plugins:
plugins: { security },

// In your config's rules:
rules: {
  "security/detect-buffer-noassert": "error",
  "security/detect-child-process": "warn",
  "security/detect-disable-mustache-escape": "error",
  "security/detect-eval-with-expression": "error",
  "security/detect-new-buffer": "error",
  "security/detect-no-csrf-before-method-override": "error",
  "security/detect-non-literal-fs-filename": "off",
  "security/detect-non-literal-regexp": "off",
  "security/detect-non-literal-require": "off",
  "security/detect-object-injection": "off",
  "security/detect-possible-timing-attacks": "warn",
  "security/detect-pseudoRandomBytes": "warn",
  "security/detect-unsafe-regex": "error"
}
```

**Note:** Four rules are `off` to avoid false positives in Node.js codebases (non-literal fs, require, regexp, object injection). Enable selectively if your codebase can tolerate the noise.

**If security errors are reported, fix before proceeding.**
