# Contract-Test Classification
**Version:** v0.104.0
**Source:** Reference/Contract-Test-Classification.md
The one rule for whether a test is a **contract** test and how it declares its subject. `/work` Step 3, `/qa`, `/add-story`, `/bad-test-review` point here, never restate it (#2904).
**Why:** `tdd-refactor-coverage-audit` classes tests as **module** (paired to a source by name), **flow** (paired to a journey by annotation) or **contract** (declares a non-code subject). An undeclared contract test counts as a module orphan — a false gap. #2899 applied this rule once to 153 tests; it holds only if every new test declares too.
**Rule — contract when both hold:**
1. It **neither loads nor executes a local module** — no `require`/`import` of code under test, no spawning a project script.
2. It **does not read source code as text** — grepping a `.js` file tests that source.
…and it asserts against a **non-code artifact**: a command spec or rule, a metadata registry or schema, a manifest, a CI workflow file, a directory tree, or git state. **Everything else is a module test.**
| Test | Class |
|---|---|
| Asserts on a command spec's text only | contract |
| Validates a JSON registry against its schema (a shared helper reading it is not code under test) | contract |
| Requires a script and calls its exports | module |
| Reads a script's source to check a string | module |
| Reads a spec **and** calls a helper to cross-check — mixed | module |
**Declare:** one `@subject` per subject in the test's **leading comment block** (the first comment block, before any code). Repeatable; a value with a separator or extension is checked against the tree, anything else is a name.
```js
/**
 * @subject CommandsSrc/qa.md
 * @subject .claude/metadata/review-criteria.json
 */
```
**Grammar is not defined here** — it is `contractAnnotation` in the imported `.claude/skills/tdd-refactor-coverage-audit/resources/test-coverage-conventions.json`, which wins on disagreement. No second declaration form; never move a test under an `exempt` location (`**/fixtures/**`) instead of declaring. Only the leading block is read — a later tag is prose.
**Limitation — Python module docstrings:** the reader accepts a leading block of `//`, `/* … */` or `#` comments. A Python test that **opens with a module docstring** cannot declare — neither a `# @subject` after it nor a tag inside it is read. Put `# @subject` lines **above** the docstring (upstream grammar; measured at #2904).
