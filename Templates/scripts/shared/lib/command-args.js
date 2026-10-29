// Rubrical Works (c) 2026
/**
 * @framework-script 0.114.0
 * @description The argument rule for deployed commands (#3030): main input
 *   (prose, issue numbers, a single name) is typed bare and every other option
 *   is a `--flag`. Holds the table of bare forms the rule replaced, each
 *   rejected with a message naming the new form, and `--help` precedence.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * NO DEPRECATION PERIOD. The project is pre-production and the affected forms
 * are few, so a retired form is refused outright rather than accepted with a
 * warning. Each entry checks only the position the old form occupied: `all`
 * is retired as /audit-commands' whole argument, not as a word in a group
 * description. /charter's `validate` is not retired but removed (#3418): with
 * no `--validate` to name, a bare `validate` is an unknown argument.
 */

/** A token at the head of the arguments, as the old subcommand word was. */
const leading = (word, replacement) => ({
  form: word, replacement, matches: (tokens) => (tokens[0] || '').toLowerCase() === word,
});

/**
 * Per command: the replaced forms, the flag that replaces each, and where the
 * old form sat. Keys are command names without the leading `/`.
 */
const RETIRED_FORMS = {
  charter: ['update', 'refresh'].map((w) => leading(w, `--${w}`)),
  // `watch` is not in the #3030 decisions table (it was missing from /ci's
  // argument-hint) but falls under the same rule, so it is retired with the rest.
  ci: ['list', 'validate', 'add', 'recommend', 'watch'].map((w) => leading(w, `--${w}`)),
  extensions: ['list', 'view', 'edit', 'validate', 'summary', 'matrix', 'recipes'].map((w) => leading(w, `--${w}`)),
  'create-prd': [leading('extract', '--extract')],
  'audit-commands': [{
    form: 'all', replacement: '--all',
    matches: (tokens) => tokens.length === 1 && tokens[0].toLowerCase() === 'all',
  }],
  qa: [{
    form: 'PASS', replacement: '--pass',
    matches: (tokens) => tokens.slice(1).some((t) => /^pass$/i.test(t)),
  }],
  work: [{
    form: 'all in <status>', replacement: '--status',
    matches: (tokens) => (tokens[0] || '').toLowerCase() === 'all' && (tokens[1] || '').toLowerCase() === 'in',
  }],
  done: [{
    form: '-y', replacement: '--yes',
    matches: (tokens) => tokens.includes('-y'),
  }],
  'assign-branch': [{
    form: '[branch/name]', replacement: '--branch',
    matches: (tokens) => tokens.some((t, i) => !t.startsWith('-') && t.includes('/') && tokens[i - 1] !== '--branch'),
  }],
};

/**
 * @param {string} command  Command name, with or without a leading `/`.
 * @param {string[]} tokens  The arguments as typed.
 * @returns {{form: string, replacement: string, message: string} | null}
 */
function findRetired(command, tokens) {
  const name = String(command || '').replace(/^\//, '');
  const entry = (RETIRED_FORMS[name] || []).find((f) => f.matches(tokens || []));
  if (!entry) return null;
  return {
    form: entry.form,
    replacement: entry.replacement,
    message: `\`${entry.form}\` is no longer accepted by /${name} — use \`${entry.replacement}\` instead.`,
  };
}

/** `--help` anywhere in the arguments. It takes precedence over every other argument. */
function wantsHelp(tokens) {
  return Array.isArray(tokens) && tokens.includes('--help');
}

/**
 * What a script prints when `--help` is present: it performs no action and names
 * the docs helper the command spec runs.
 * @param {string} command
 */
function helpEnvelope(command) {
  const name = String(command || '').replace(/^\//, '');
  return {
    ok: true,
    help: true,
    command: name,
    run: `node .claude/scripts/shared/command-help.js ${name}`,
    message: `--help takes precedence over every other argument; no action was taken. Open the /${name} docs with the command in \`run\`.`,
  };
}

module.exports = {
  RETIRED_FORMS,
  findRetired,
  wantsHelp,
  helpEnvelope,
};
