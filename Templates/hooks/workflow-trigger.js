#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.105.0
 * workflow-trigger.js
 *
 * UserPromptSubmit hook that:
 * 1. Detects workflow trigger prefixes and injects reminders
 * 2. Responds to 'commands' with available triggers and slash commands
 * 3. Validates branch assignment for 'work #N' commands
 * 4. Detects analysis keywords and injects STOP reminder (#1056)
 * 5. Auto-moves PRD tracker to in_progress for work commands (#1193)
 * 6. Detects 'done' trigger and routes to /done command (#1200)
 * 7. Detects 'review #N' and routes to /review-issue command (#1210)
 *
 * Trigger prefixes: bug:, enhancement:, idea:, proposal:
 * Work command: work #N (validates branch assignment, provides branch context)
 * Done command: done [#N...] (contextual - only triggers with active issues)
 * Review command: review #N [#N...] (routes to /review-issue)
 * Analysis keywords: evaluate, analyze, assess, investigate, check, verify
 *   - When combined with issue reference, injects STOP reminder
 *   - Prevents analysis requests from drifting into implementation
 *
 * Performance optimizations:
 * - Early exit for non-matching prompts (no I/O)
 * - Single detectFramework() function (no duplication)
 * - Cached command help (regenerated on demand)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Diagnostic crash handler (#2314, hardened in #2322): captures full stack
// traces for intermittent require() failures that Claude Code truncates to
// just the innermost Node frame. Paths are anchored to __dirname so captures
// land in the hook directory regardless of invocation CWD. Handler is kept
// permanently as cheap insurance; removal is evaluated in #2328 after the
// underlying loader:1459 failure is fixed.
process.on('uncaughtException', (e) => {
  try {
    fs.appendFileSync(
      path.resolve(__dirname, 'crash.log'),
      `[${new Date().toISOString()}] ${e.stack}\n\n`
    );
  } catch (_) { /* swallow logging failure so handler never crashes the hook */ }
  console.error(e.stack);
  process.exit(1);
});

// Startup breadcrumb (#2322): unconditional per-invocation trace so we can
// distinguish "hook never started" vs "hook crashed mid-execution" on the
// next reproduction. Wrapped in try/catch — a breadcrumb failure must never
// crash the hook itself.
try {
  fs.appendFileSync(
    path.resolve(__dirname, 'startup.log'),
    `[${new Date().toISOString()}] pid=${process.pid} cwd=${process.cwd()}\n`
  );
} catch (_) { /* swallow breadcrumb failure */ }

// Heartbeat (#2917): records this hook's outcome under the project root for the
// startup Hook Health row. Installed only when run as the hook — the test suite
// requires this module and must not write a heartbeat for its own process.
let heartbeat = { fail() {}, setCwd() {} };
if (require.main === module) {
  try { heartbeat = require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('workflow-trigger'); } catch (_) { /* reported by the load check */ }
}
// crash.log above is unchanged: an uncaught error still writes it and exits 1,
// and the heartbeat records the same error through its exit recorder.

// Cache file location (#2322: anchored to __dirname for CWD invariance)
const CACHE_FILE = path.resolve(__dirname, '.command-cache.json');

// Per-command flag allowlist (#2515). Anchored to __dirname so it resolves
// through the hub symlink in user projects regardless of invocation CWD.
const FLAG_ALLOWLIST_FILE = path.resolve(__dirname, '..', 'metadata', 'trigger-flag-allowlist.json');

// A token is flag-shaped when it is "--" followed by a letter. The boundary is
// shape, not membership: a bare "--" separator, a "---" rule, and "--" inside
// prose are NOT flag-shaped and stay in the title (#2515). Membership in the
// allowlist decides only whether a flag may claim the following token as its
// value — never whether it is extracted.
const FLAG_TOKEN = /^--[A-Za-z]/;

// Trigger phrase patterns (#2816). Adding or widening a trigger PHRASE is a
// data edit here, matching the policy 02-github-workflow.md already states for
// trigger-flag-allowlist.json. Anchored to __dirname for the same reason.
const TRIGGER_PATTERNS_FILE = path.resolve(__dirname, '..', 'metadata', 'trigger-patterns.json');

/**
 * Read the trigger pattern data, or an inert shape when it cannot be read.
 *
 * Same failure posture as the flag allowlist, for the same reason:
 * UserPromptSubmit runs on every prompt, so a throwing hook is worse than an
 * unrouted phrase. Degradation means "no trigger fires" — the prompt reaches
 * the model untouched.
 *
 * NO built-in fallback copy of the patterns (#2816). A second source of the
 * same data is the drift #2812 spent an issue removing one directory away.
 * The file ships beside this hook, so its absence is a broken install rather
 * than a runtime state to paper over, and CI guards its presence and validity.
 *
 * @returns {{analysisKeywords: string[], commandRequests: string[], patterns: object}}
 */
function readTriggerPatterns() {
    const inert = { analysisKeywords: [], commandRequests: [], patterns: {} };
    try {
        const parsed = JSON.parse(fs.readFileSync(TRIGGER_PATTERNS_FILE, 'utf-8'));
        return {
            analysisKeywords: Array.isArray(parsed.analysisKeywords) ? parsed.analysisKeywords : [],
            commandRequests: Array.isArray(parsed.commandRequests) ? parsed.commandRequests : [],
            patterns: (parsed.patterns && typeof parsed.patterns === 'object') ? parsed.patterns : {}
        };
    } catch (_e) {
        return inert;
    }
}

/**
 * Compile one named pattern, or null when it is absent or unparseable.
 *
 * Null is the caller's signal that the trigger cannot be evaluated, and every
 * call site treats that as "this trigger does not fire". A pattern that is
 * schema-valid can still fail here — `source` is typed as a string, and no
 * string type can express "compiles as a regex".
 *
 * @param {object} patterns - the `patterns` map from the data file
 * @param {string} name
 * @returns {RegExp|null}
 */
function compilePattern(patterns, name) {
    const entry = patterns[name];
    if (!entry || typeof entry.source !== 'string') return null;
    try {
        return new RegExp(entry.source, typeof entry.flags === 'string' ? entry.flags : '');
    } catch (_e) {
        return null;
    }
}

/** Test a compiled pattern that may be null. An absent pattern matches nothing. */
function matches(re, value) {
    return re ? re.test(value) : false;
}

const TRIGGER_DATA = readTriggerPatterns();
const TRIGGER_RE = {
    workflowTriggerPrefix: compilePattern(TRIGGER_DATA.patterns, 'workflowTriggerPrefix'),
    workTrigger: compilePattern(TRIGGER_DATA.patterns, 'workTrigger'),
    doneTrigger: compilePattern(TRIGGER_DATA.patterns, 'doneTrigger'),
    reviewAtStart: compilePattern(TRIGGER_DATA.patterns, 'reviewAtStart'),
    strictIssueRef: compilePattern(TRIGGER_DATA.patterns, 'strictIssueRef'),
    looseIssueRef: compilePattern(TRIGGER_DATA.patterns, 'looseIssueRef'),
    approvalVerb: compilePattern(TRIGGER_DATA.patterns, 'approvalVerb'),
    testPlanRef: compilePattern(TRIGGER_DATA.patterns, 'testPlanRef'),
    refreshFlag: compilePattern(TRIGGER_DATA.patterns, 'refreshFlag')
};

// Analysis keywords that trigger STOP-after-report behavior
// When these appear with an issue reference, inject reminder to report only
const ANALYSIS_KEYWORDS = TRIGGER_DATA.analysisKeywords;

let input = '';

process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
    try {
        const data = JSON.parse(input);
        heartbeat.setCwd(data && data.cwd);
        const prompt = (data.prompt || '').trim();
        const promptLower = prompt.toLowerCase();

        // FAST PATH: Early exit for non-matching prompts (no I/O needed)
        // Check for --refresh flag
        // Patterns come from trigger-patterns.json (#2816); the COMPOSITION
        // below stays here. The co-requirements and mutual exclusions are a
        // three-node ordered graph, and expressing them as data would need a
        // resolver in a hook that must never throw — see
        // Construction/Design-Decisions/2026-09-07-trigger-patterns-composition-stays-in-code.md
        const hasRefreshFlag = matches(TRIGGER_RE.refreshFlag, prompt);
        const basePrompt = promptLower.replace(/\s*--refresh\s*/gi, '').trim();
        const isCommandRequest = TRIGGER_DATA.commandRequests.includes(basePrompt);
        const triggerMatch = TRIGGER_RE.workflowTriggerPrefix
            ? prompt.match(TRIGGER_RE.workflowTriggerPrefix)
            : null;
        // Broad "work" trigger - matches any prompt starting with "work "
        // We'll opportunistically extract issue numbers or status later
        const workTrigger = matches(TRIGGER_RE.workTrigger, prompt);
        // Done trigger - matches standalone "done" or "done #N" at message start
        // Contextual detection happens later (queries active issues)
        const doneTrigger = matches(TRIGGER_RE.doneTrigger, promptLower);
        // Review trigger - "review" with issue reference routes to /review-issue (#1210, #1836, #1869)
        // review is a tracked action (not passive analysis like evaluate/assess/etc.)
        // Require "review" at or near start of prompt to avoid triggering on assistant output
        // that mentions review commands (e.g., "Say /review-issue #N to start")
        const reviewAtStart = matches(TRIGGER_RE.reviewAtStart, prompt);
        // STRICT issue reference: an explicit #N or "issue N". Distinct from
        // looseIssueRef below, which also accepts a bare number — the split is
        // load-bearing and must not be collapsed (#2816).
        const hasStrictIssueRef = matches(TRIGGER_RE.strictIssueRef, prompt);
        const reviewTrigger = reviewAtStart && hasStrictIssueRef && !workTrigger;
        // Verbal test-plan approval (#2815) - "I approve test-plan #12" never
        // reached /review-test-plan, so its Step 5a gate rollup never ran: no
        // blocked gate was surfaced for a risk decision and both checklists
        // stayed unchecked while the user believed the plan was approved.
        //
        // ALL THREE elements are required, and the narrowness is the design.
        // An approval verb alone false-positives on ordinary prose - including
        // on the text of the issue that specified this trigger.
        const hasApprovalVerb = matches(TRIGGER_RE.approvalVerb, prompt);
        const hasTestPlanRef = matches(TRIGGER_RE.testPlanRef, prompt);
        const testPlanApprovalTrigger =
            hasApprovalVerb && hasTestPlanRef && hasStrictIssueRef && !workTrigger && !reviewTrigger;
        // Analysis trigger - detect analysis keywords with issue references
        // This prevents "evaluate #123" from drifting into implementation
        // Analysis keeps loose matching (bare numbers) since it's non-mutating (read-only)
        const hasIssueRef = matches(TRIGGER_RE.looseIssueRef, prompt);
        const hasAnalysisKeyword = ANALYSIS_KEYWORDS.some(kw => promptLower.includes(kw));
        // Excluded alongside workTrigger/reviewTrigger so two handlers cannot
        // both console.log - the analysis keyword match is a substring test, so
        // an approval phrase mentioning a "checklist" would otherwise satisfy
        // both and emit two JSON objects on one stdout.
        const analysisMatch = hasAnalysisKeyword && hasIssueRef && !workTrigger && !reviewTrigger
            && !testPlanApprovalTrigger;

        if (!isCommandRequest && !triggerMatch && !workTrigger && !doneTrigger && !reviewTrigger && !testPlanApprovalTrigger && !analysisMatch) {
            process.exit(0);
        }

        // Handle 'commands' request
        if (basePrompt === 'commands') {
            const helpText = generateCommandsHelp(hasRefreshFlag);
            const output = {
                systemMessage: `Success`,
                hookSpecificOutput: {
                    hookEventName: "UserPromptSubmit",
                    additionalContext: `[COMMANDS HELP: Display the following commands to the user in a clean formatted way.]\n\n${helpText}`
                }
            };
            console.log(JSON.stringify(output));
            process.exit(0);
        }

        // Handle 'List-Commands' request (full detailed list)
        if (basePrompt === 'list-commands') {
            const detailedCommands = getDetailedCommands(hasRefreshFlag);
            const output = {
                systemMessage: `Success`,
                hookSpecificOutput: {
                    hookEventName: "UserPromptSubmit",
                    additionalContext: `[LIST-COMMANDS: Display the following detailed command list to the user in a clean formatted way.]\n\n${detailedCommands}`
                }
            };
            console.log(JSON.stringify(output));
            process.exit(0);
        }

        // Handle 'work' commands - broad trigger with opportunistic extraction
        // Supports: work #123, work on #123, work issue 45, work all in Ready, etc.
        if (workTrigger) {
            // Try to extract issue number using flexible patterns:
            // 1. Explicit #N reference anywhere: "work on #123", "work #123 now"
            // 2. Number after work [on] [issue]: "work 123", "work on 45", "work issue 789"
            const explicitIssue = prompt.match(/#(\d+)/);
            const implicitIssue = prompt.match(/^work (?:on )?(?:issue )?(\d+)/i);
            const issueNumber = explicitIssue ? explicitIssue[1] : (implicitIssue ? implicitIssue[1] : null);

            // Try to extract batch status: "work all in Ready", "work the issues in backlog".
            // Validated against .gh-pmu.json rather than matched loosely (#2782) — see
            // resolveStatusFilter for why the bare `\bin\s+(\w+)` form routed prose.
            const statusFilter = resolveStatusFilter(prompt);

            // If no issue number and no status, exit silently (let Claude handle naturally)
            if (!issueNumber && !statusFilter) {
                process.exit(0);
            }

            // Single issue work (has issue number)
            if (issueNumber) {

            try {
                // Query issue's Branch field via gh pmu view
                const result = execSync(
                    `gh pmu view ${issueNumber} --json`,
                    { encoding: 'utf-8', timeout: 10000 }
                );

                const issueData = JSON.parse(result);
                const branch = issueData.fieldValues?.Branch;
                if (!branch || branch === '' || branch === 'null') {
                    // No branch assigned - block with actionable message
                    const output = {
                        continue: false,
                        hookSpecificOutput: {
                            permissionDecision: 'deny',
                            message: `Issue #${issueNumber} has no branch assignment.\n\nUse: /assign-branch #${issueNumber} release/vX.Y.Z\n\nOr use: gh pmu move ${issueNumber} --branch "release/vX.Y.Z"`
                        }
                    };
                    console.log(JSON.stringify(output));
                    process.exit(0);
                }

                // Branch assigned - route to /work command
                let contextMessage = `[INVOKE: /work ${issueNumber}]\n`;

                // PRD Tracker Auto-Move (#1193)
                // Check issue body for **PRD Tracker:** #NNN and move to in_progress if needed
                const body = issueData.body || '';
                const prdTrackerMatch = body.match(/\*\*PRD Tracker:\*\*\s*#(\d+)/);
                if (prdTrackerMatch) {
                    const prdNumber = prdTrackerMatch[1];
                    try {
                        const prdResult = execSync(
                            `gh pmu view ${prdNumber} --json=status`,
                            { encoding: 'utf-8', timeout: 10000 }
                        );
                        const prdData = JSON.parse(prdResult);
                        const prdStatus = (prdData.status || '').toLowerCase();
                        if (prdStatus === 'backlog' || prdStatus === 'ready') {
                            execSync(
                                `gh pmu move ${prdNumber} --status in_progress`,
                                { encoding: 'utf-8', timeout: 10000 }
                            );
                            contextMessage += `\nPRD tracker #${prdNumber} moved to In Progress\n`;
                        }
                    } catch (_prdError) {
                        // Fail silently - PRD tracker query is non-blocking
                    }
                }

                // Auto-task: Extract acceptance criteria or sub-issues for task list
                const labels = issueData.labels || [];
                const isEpic = labels.some(l => l === 'epic' || l.name === 'epic');

                if (isEpic) {
                    // Epic: get sub-issues for todo list
                    try {
                        const subResult = execSync(
                            `gh pmu sub list ${issueNumber} --json`,
                            { encoding: 'utf-8', timeout: 10000 }
                        );
                        const subIssues = JSON.parse(subResult);
                        if (subIssues && subIssues.length > 0) {
                            contextMessage += `\n[AUTO-TASK: EPIC]\n`;
                            contextMessage += `Create a task list from these sub-issues:\n`;
                            subIssues.forEach(sub => {
                                contextMessage += `- #${sub.number}: ${sub.title}\n`;
                            });
                        }
                    } catch (_subError) {
                        // Fail silently - sub-issue query is optional
                    }
                } else {
                    // Story/Bug: extract acceptance criteria checkboxes
                    const checkboxes = body.match(/- \[ \] .+/g) || [];
                    if (checkboxes.length > 0) {
                        contextMessage += `\n[AUTO-TASK: ACCEPTANCE CRITERIA]\n`;
                        contextMessage += `Create a task list from these acceptance criteria:\n`;
                        checkboxes.forEach(cb => {
                            // Clean up the checkbox format for task
                            const item = cb.replace(/^- \[ \] /, '').trim();
                            contextMessage += `- ${item}\n`;
                        });
                    }
                }

                const output = {
                    systemMessage: `Success`,
                    hookSpecificOutput: {
                        hookEventName: 'UserPromptSubmit',
                        additionalContext: contextMessage
                    }
                };
                console.log(JSON.stringify(output));
                process.exit(0);

            } catch (_error) {
                // Error checking - route to /work and let command handle (fail-open)
                const output = {
                    systemMessage: `Success`,
                    hookSpecificOutput: {
                        hookEventName: 'UserPromptSubmit',
                        additionalContext: `[INVOKE: /work ${issueNumber}]`
                    }
                };
                console.log(JSON.stringify(output));
                process.exit(0);
            }
            }

            // Batch work (has status but no specific issue number)
            // Route to /work command with the full "all in <status>" argument
            if (statusFilter) {
                let contextMessage = `[INVOKE: /work all in ${statusFilter}]\n`;

                try {
                // Opportunistically query issues for AUTO-TASK
                const result = execSync(
                    `gh pmu list --status ${statusFilter} --json`,
                    { encoding: 'utf-8', timeout: 15000 }
                );

                const data = JSON.parse(result);
                const issues = data.items || [];
                if (issues.length > 0) {
                    contextMessage += `\n[AUTO-TASK: BATCH ISSUES]\n`;
                    contextMessage += `Create a task list with these issues:\n`;
                    issues.forEach(issue => {
                        contextMessage += `- #${issue.number}: ${issue.title}\n`;
                    });
                }

                } catch (_error) {
                    // Fail silently - /work command will query issues itself
                }

                const output = {
                    systemMessage: `Success`,
                    hookSpecificOutput: {
                        hookEventName: 'UserPromptSubmit',
                        additionalContext: contextMessage
                    }
                };
                console.log(JSON.stringify(output));
                process.exit(0);
            }
        }

        // Handle 'done' commands - contextual trigger (#1200, #1218)
        // Only triggers when issues are in in_review status
        // /done only handles in_review→done (not in_progress→in_review, which is /work's job)
        if (doneTrigger) {
            // Extract optional issue numbers: "done #42 #43" or "done 42"
            const issueNumbers = prompt.match(/#?(\d+)/g);
            const args = issueNumbers
                ? issueNumbers.map(n => n.replace('#', '')).slice(0).join(' ')
                : '';

            // If explicit issue numbers given, route directly (no context check needed)
            if (args) {
                const output = {
                    systemMessage: 'Success',
                    hookSpecificOutput: {
                        hookEventName: 'UserPromptSubmit',
                        additionalContext: `[INVOKE: /done ${args}]`
                    }
                };
                console.log(JSON.stringify(output));
                process.exit(0);
            }

            // No arguments - contextual detection: check for in_review issues only
            try {
                const inReviewResult = execSync(
                    'gh pmu list --status in_review',
                    { encoding: 'utf-8', timeout: 10000 }
                );

                const hasReviewIssues =
                    inReviewResult && inReviewResult.trim().length > 0 && !inReviewResult.includes('no items');

                if (hasReviewIssues) {
                    const output = {
                        systemMessage: 'Success',
                        hookSpecificOutput: {
                            hookEventName: 'UserPromptSubmit',
                            additionalContext: '[INVOKE: /done]'
                        }
                    };
                    console.log(JSON.stringify(output));
                    process.exit(0);
                }
                // No in_review issues - fall through (let Claude handle "done" naturally)
            } catch (_error) {
                // gh pmu not available or query failed - fall through silently
            }
            process.exit(0);
        }

        // Handle review commands - route to /review-issue (#1210, #1869)
        if (reviewTrigger) {
            // Extract issue numbers only from #N patterns (not bare numbers)
            // to avoid picking up stray numbers from conversation context
            const issueMatches = prompt.match(/#(\d+)/g) || [];
            const issueArgs = [...new Set(issueMatches.map(n => n.replace('#', '')))].join(' ');
            // Pass flags through (#2515). Before this, everything but #N was
            // discarded, so /review-issue's --with/--mode/--force were
            // unreachable from the phrase path and the narrowing was silent.
            const { flags } = extractFlags(
                prompt,
                getRecognizedFlags('/review-issue'),
                getRestOfLineFlags('/review-issue')
            );
            const reviewArgs = flags ? `${issueArgs} ${flags}` : issueArgs;
            const output = {
                systemMessage: 'Success',
                hookSpecificOutput: {
                    hookEventName: 'UserPromptSubmit',
                    additionalContext: `[INVOKE: /review-issue ${reviewArgs}]`
                }
            };
            console.log(JSON.stringify(output));
            process.exit(0);
        }

        // Handle verbal test-plan approval - advise /review-test-plan (#2815)
        //
        // ADVISORY, not a refusal, and that is a decision rather than a
        // default. The `work #N` deny above refuses an action with exactly one
        // correct remedy. This phrase has two: the user may be approving a plan
        // whose gates were never computed, or narrating an approval right after
        // running /review-test-plan. Denying the second would train dismissal
        // of the hook, so the prompt still reaches the model either way.
        if (testPlanApprovalTrigger) {
            const approvalIssue = (prompt.match(/#(\d+)/) || [])[1];
            const output = {
                systemMessage: 'Success',
                hookSpecificOutput: {
                    hookEventName: 'UserPromptSubmit',
                    additionalContext:
                        `[TEST-PLAN APPROVAL: This reads as approving a test plan in conversation. `
                        + `Approval is recorded by /review-test-plan #${approvalIssue}, not by saying so.]\n\n`
                        + `Its Step 5a computes the gate rollup and marks a gate checkable only when every `
                        + `backing criterion passed — a warn, fail or skip all block it, because a skipped `
                        + `criterion produced no evidence. Each blocked gate is presented with its risk record `
                        + `for an explicit accept-or-not decision.\n\n`
                        + `Step 5a then writes the confirmed check-offs to BOTH surfaces: the issue's `
                        + `## Review Checklist and the test plan document's ## Approval Checklist. `
                        + `Approving in conversation writes neither, so both stay unchecked with nothing `
                        + `reporting the discrepancy.\n\n`
                        + `If /review-test-plan #${approvalIssue} has already been run, say so and continue.`
                }
            };
            console.log(JSON.stringify(output));
            process.exit(0);
        }

        // Handle workflow triggers - route to specific commands
        if (triggerMatch) {
            const triggerType = triggerMatch[1].toLowerCase();
            const title = prompt.slice(triggerMatch[0].length).trim();

            // Map trigger prefixes to slash commands
            const commandMap = {
                'bug': '/bug',
                'enhancement': '/enhancement',
                'proposal': '/proposal',
                'idea': '/proposal'  // alias
            };

            const command = commandMap[triggerType];
            // Strip flags from the title centrally rather than leaving each
            // command spec to sanitize its own (#2515). For a trailing flag the
            // emitted string is unchanged — only the title/flag boundary moves,
            // so no "--" token can become part of an issue's identity.
            const { head, flags } = extractFlags(
                title,
                getRecognizedFlags(command),
                getRestOfLineFlags(command)
            );
            const triggerArgs = flags ? `${head} ${flags}`.trim() : head;
            const output = {
                systemMessage: `Success`,
                hookSpecificOutput: {
                    hookEventName: "UserPromptSubmit",
                    additionalContext: `[INVOKE: ${command} ${triggerArgs}]`
                }
            };
            console.log(JSON.stringify(output));
        }

        // Handle analysis requests - inject STOP reminder
        // Prevents "evaluate #123" from drifting into implementation
        if (analysisMatch) {
            const output = {
                systemMessage: `Success`,
                hookSpecificOutput: {
                    hookEventName: "UserPromptSubmit",
                    additionalContext: "[ANALYSIS MODE: Report findings and STOP. Do NOT implement, fix, or run commands with side effects until explicit 'work' instruction.]"
                }
            };
            console.log(JSON.stringify(output));
        }

        process.exit(0);
    } catch (_e) {
        // Intentionally ignored — fail open. Recorded, not raised (#2917).
        heartbeat.fail(_e);
        process.exit(0);
    }
});

/**
 * Read the recognized flags for a command from the externalized allowlist.
 *
 * Adding a flag to a command is a data edit, not a hook edit. A missing or
 * unreadable file degrades safely: no flag is "recognized", so none claims a
 * value, but flag-shaped tokens are still extracted and passed through.
 *
 * @param {string} command - Slash command including leading slash (e.g. '/review-issue')
 * @returns {string[]} Recognized flags, or [] when undeclared or unreadable
 */
function getRecognizedFlags(command) {
    return readAllowlistEntries(command).map(flagNameOf).filter(Boolean);
}

/**
 * The board's status aliases, from `.gh-pmu.json` `fields.status.values` (#2782).
 *
 * Returns the KEYS (`ready`, `in_review`, `parking_lot`, …), which are the
 * forms `gh pmu list --status` and `/work all in <status>` both take.
 *
 * An unreadable or absent file returns `[]`, which makes every capture in
 * `resolveStatusFilter` a miss and emits nothing. That is the safe direction:
 * `/work` requires `.gh-pmu.json` as a prerequisite, so a batch invocation
 * could not have succeeded without it anyway, and the alternative — a
 * hardcoded fallback vocabulary — reintroduces exactly the drift that reading
 * config avoids.
 *
 * @returns {string[]}
 */
function readConfiguredStatuses() {
    try {
        const configPath = path.join(process.cwd(), '.gh-pmu.json');
        const values = JSON.parse(fs.readFileSync(configPath, 'utf8'))?.fields?.status?.values;
        return values && typeof values === 'object' ? Object.keys(values) : [];
    } catch (_e) {
        return [];
    }
}

/**
 * The batch status filter for a `work …` prompt, or null (#2782).
 *
 * THE WORD "in" IS AN ENGLISH PREPOSITION, WHICH IS THE WHOLE PROBLEM.
 *
 * This previously read `prompt.match(/\bin\s+(\w+[-\w]*)/i)` and took the next
 * word as a board status, so `work on it in parallel` produced the filter
 * "parallel", bypassed the caller's `!issueNumber && !statusFilter` guard, and
 * emitted a batch invocation against a status that does not exist. Both
 * issue-number extractors beside it were already anchored, so the ambiguity
 * was understood at the time — this extractor just never got the same care.
 *
 * The constraint is VALIDATION rather than anchoring on lead-in phrasing
 * (`work all`, `work the issues`). Anchoring is a smaller change and leaves
 * `work all in parallel` producing a bogus filter; validating against config
 * is self-maintaining, since a status added to `.gh-pmu.json` is honoured with
 * no code change here.
 *
 * NORMALIZATION IS WHAT MAKES VALIDATION VIABLE, not a refinement of it.
 * Three of the seven configured keys are multi-word — `in_progress`,
 * `in_review`, `parking_lot` — while a capture is a single token. Validating
 * without normalizing would reject `work all in review` and `work the issues
 * in progress`, trading a false positive for a false negative on the two
 * phrasings most likely to be typed. So each match yields three candidates:
 * the captured word, the two captured words joined, and the word prefixed by
 * the preposition itself — which is how `in review` reaches `in_review`.
 *
 * Candidate order is significant: the bare word is tried first, so `work all
 * in ready now` resolves to `ready` rather than looking for `ready_now`.
 *
 * @param {string} prompt
 * @returns {string|null} A configured status alias, or null to fall through
 *                        to the caller's silent-exit guard.
 */
function resolveStatusFilter(prompt) {
    const statuses = new Set(readConfiguredStatuses());
    if (statuses.size === 0) return null;

    // TOKENIZED RATHER THAN MATCHED WITH ONE REGEX, deliberately.
    //
    // The natural pattern — `\bin\s+([A-Za-z][-\w]*)(?:\s+([A-Za-z][-\w]*))?`
    // — nests repetition inside an optional group and trips
    // `security/detect-unsafe-regex`. Bounding the quantifiers does not help;
    // the rule counts nesting, not width. Splitting on a single non-word class
    // has no nesting at all, so it is linear by construction rather than by
    // argument, and reads more plainly besides.
    const words = String(prompt).toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean);

    // Every occurrence, not just the first: a genuine batch phrasing may sit
    // behind ordinary prose ("work through the rest of the issues in ready").
    // Scanning stays safe because only a configured alias is ever returned.
    for (let i = 0; i < words.length - 1; i++) {
        if (words[i] !== 'in') continue;
        const first = words[i + 1];
        const second = i + 2 < words.length ? words[i + 2] : null;
        const candidates = [first];
        if (second) candidates.push(`${first}_${second}`);
        candidates.push(`in_${first}`);
        const hit = candidates.find((c) => statuses.has(c));
        if (hit) return hit;
    }
    return null;
}

/**
 * Raw allowlist entries for a command, in either declared shape (#2770).
 *
 * @param {string} command - Slash command including leading slash
 * @returns {Array<string|{flag: string, attach?: string}>}
 */
function readAllowlistEntries(command) {
    try {
        const raw = fs.readFileSync(FLAG_ALLOWLIST_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const flags = parsed?.commands?.[command];
        return Array.isArray(flags) ? flags : [];
    } catch (_e) {
        return [];
    }
}

/**
 * The flag name for either declared shape.
 *
 * THE MIGRATION HAZARD THIS EXISTS FOR (#2770). Before the union, this function
 * body was `Array.isArray(flags) ? flags : []` and the caller compared with
 * `recognized.includes(name)`. An entry rewritten as objects still satisfies
 * `Array.isArray`, so it returned the OBJECTS, none of which equal a flag
 * string — silently disabling every flag for that command. No error, no
 * warning: values simply stop binding and fall back into the issue title. The
 * normalisation here is what keeps the shapes interchangeable.
 *
 * @param {string|{flag: string}} entry
 * @returns {string|null}
 */
function flagNameOf(entry) {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry.flag === 'string') return entry.flag;
    return null;
}

/**
 * Flags this command declares as consuming the remainder of the line (#2770).
 *
 * Separate from `getRecognizedFlags` rather than folded into it: that function's
 * `string[]` return is compared with `includes` at both call sites, and widening
 * it would have made every caller a migration site. Two narrow readers, each
 * with one job.
 *
 * @param {string} command - Slash command including leading slash
 * @returns {string[]} Flag names declared `attach: "rest-of-line"`
 */
function getRestOfLineFlags(command) {
    return readAllowlistEntries(command)
        .filter((e) => e && typeof e === 'object' && e.attach === 'rest-of-line')
        .map(flagNameOf)
        .filter(Boolean);
}

/**
 * Split prompt text into non-flag text and the flag tokens to pass through.
 *
 * Extraction is governed by token shape (FLAG_TOKEN), so a flag-shaped token is
 * never silently discarded — recognized or not. The allowlist governs only
 * value attachment: `--with security` collapses to one flag with its value when
 * `--with` is recognized for that command; when it is not, `security` is
 * ordinary text and returns to the head rather than being swallowed.
 *
 * A flag declared `attach: "rest-of-line"` claims every remaining token instead
 * of one (#2770), which is what lets a flag take prose rather than a single
 * value. **It stops at the next flag-shaped token**, deliberately: extraction is
 * by shape, and `02-github-workflow.md` guarantees no flag-shaped token is ever
 * silently discarded. Swallowing `--assignee` as prose would break that
 * guarantee one level down — which is the same defect, at the value layer,
 * that rest-of-line exists to fix.
 *
 * @param {string} text - Prompt remainder to split
 * @param {string[]} recognized - Flags this command declares
 * @param {string[]} [restOfLine] - Subset of `recognized` that claims the remainder
 * @returns {{head: string, flags: string}} Non-flag text and space-joined flag tokens
 */
function extractFlags(text, recognized, restOfLine = []) {
    const head = [];
    const flags = [];
    let awaitingValueFor = null;
    let consumingRest = false;

    for (const token of text.split(/\s+/).filter(Boolean)) {
        if (FLAG_TOKEN.test(token)) {
            // A following flag terminates a rest-of-line value rather than being
            // absorbed into it.
            consumingRest = false;
            flags.push(token);
            // "--flag=value" carries its own value; only the bare form can
            // claim the next token, and only when the command declares it.
            const name = token.split('=')[0];
            const bareAndRecognized = !token.includes('=') && recognized.includes(name);
            consumingRest = bareAndRecognized && restOfLine.includes(name);
            awaitingValueFor = bareAndRecognized ? name : null;
            continue;
        }
        if (consumingRest) {
            flags.push(token);
            awaitingValueFor = null;
            continue;
        }
        if (awaitingValueFor) {
            flags.push(token);
            awaitingValueFor = null;
            continue;
        }
        head.push(token);
    }

    return { head: head.join(' '), flags: flags.join(' ') };
}

/**
 * Detect active IDPF framework (single source of truth)
 * @returns {string|null} Framework name or null
 */
function detectFramework() {
    const cwd = process.cwd();

    // Check framework-config.json first (user projects - most specific)
    try {
        const configPath = path.join(cwd, 'framework-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const framework = config.processFramework || config.projectType?.processFramework || config.framework;
            if (framework) return normalizeFramework(framework);
        }
    } catch (_e) {
        // Intentionally ignored
    }

    // Check for IDPF directories (framework dev or direct usage)
    const frameworks = ['IDPF-Agile', 'IDPF-Vibe'];
    for (const fw of frameworks) {
        if (fs.existsSync(path.join(cwd, fw))) {
            return fw;
        }
    }

    return null;
}

/**
 * Normalize framework name to standard format
 */
function normalizeFramework(name) {
    const lower = name.toLowerCase();
    if (lower === 'agile' || lower === 'idpf-agile') return 'IDPF-Agile';
    if (lower.startsWith('vibe') || lower === 'idpf-vibe') return 'IDPF-Vibe';
    return name;
}

/**
 * Try to load from cache, regenerate if stale or missing
 * @param {string} key - Cache key to retrieve
 * @param {boolean} forceRefresh - If true, skip cache and force regeneration
 */
function getFromCache(key, forceRefresh = false) {
    // Skip cache entirely if refresh requested
    if (forceRefresh) {
        return null;
    }

    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));

            // Check if cache is from today (daily expiration)
            if (cache.timestamp) {
                const cacheDate = new Date(cache.timestamp).toDateString();
                const today = new Date().toDateString();
                if (cacheDate !== today) {
                    return null; // Cache expired, force regeneration
                }
            }

            // Trust cached framework when cache is fresh (no detectFramework() call)
            // Framework changes are rare within a session
            if (cache[key]) {
                return cache[key];
            }
        }
    } catch (_e) {
        // Intentionally ignored
    }
    return null;
}

/**
 * Save to cache
 */
function saveToCache(key, value) {
    try {
        let cache = {};
        try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { /* ENOENT or parse error — start fresh */ }
        cache.framework = detectFramework();
        cache[key] = value;
        cache.timestamp = Date.now();
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch { /* write failure — silently ignored */ }
}

/**
 * Generate help text for all available commands
 * @param {boolean} forceRefresh - If true, bypass cache and regenerate
 */
function generateCommandsHelp(forceRefresh = false) {
    // Try cache first (unless refresh requested)
    const cached = getFromCache('commandsHelp', forceRefresh);
    if (cached) return cached;

    let help = `📋 **Available Commands**

**Workflow Triggers** (prefix your message):
- \`bug:\` - Report a bug → creates issue, wait for 'work' to implement fix
- \`enhancement:\` - Request enhancement → creates issue, wait for 'work' to implement
- \`idea:\` - Alias for proposal: → creates proposal document + issue
- \`proposal:\` - Formal proposal → creates proposal document + issue

**Issue Management**:
- \`work #N\` or \`work <issue>\` - Start working on issue (moves to In Progress)
- \`done\` - Complete current issue (moves to Done, closes issue)
`;

    // Get slash commands
    const slashCommands = getSlashCommands();
    if (slashCommands.length > 0) {
        help += `\n**Slash Commands**:\n`;
        for (const cmd of slashCommands) {
            help += `- \`/${cmd.name}\` - ${cmd.description}\n`;
        }
    }

    // Show active framework info
    const framework = detectFramework();
    if (framework) {
        help += `\n**Active Framework:** ${framework}\n`;
        help += `Type \`list-commands\` for the detailed command reference.\n`;
    }

    // Cache the result
    saveToCache('commandsHelp', help);

    return help;
}

/**
 * Get detailed commands (used by list-commands)
 * @param {boolean} forceRefresh - If true, bypass cache and regenerate
 */
function getDetailedCommands(forceRefresh = false) {
    // Try cache first (unless refresh requested)
    const cached = getFromCache('detailedCommands', forceRefresh);
    if (cached) return cached;

    const framework = detectFramework();
    let result = '';

    if (framework) {
        result = getFrameworkDetailedCommands(framework);
    } else {
        // No framework detected — show workflow triggers + dynamic slash commands
        result = `## Available Triggers & Slash Commands

### Workflow Triggers (prefix your message)

| Trigger | Description |
|---------|-------------|
| \`bug: <title>\` | Create a bug issue |
| \`enhancement: <title>\` | Create an enhancement issue |
| \`proposal: <title>\` | Create a proposal document + tracking issue |
| \`idea: <title>\` | Alias for proposal: |
| \`work #N\` | Start working on an issue |
| \`work all in <status>\` | Batch work on issues by status |
| \`done [#N]\` | Complete issue (in_review → done) |
| \`review #N\` | Route to /review-issue |
| \`commands\` | Show available triggers and slash commands |
| \`list-commands\` | Show detailed command list |

### Slash Commands
`;
        const slashCommands = getSlashCommands();
        if (slashCommands.length > 0) {
            result += `\n| Command | Description |\n|---------|-------------|\n`;
            for (const cmd of slashCommands) {
                result += `| \`/${cmd.name}\` | ${cmd.description} |\n`;
            }
        } else {
            result += `\nNo slash commands found in .claude/commands/\n`;
        }

        result += '\n' + getFrameworkSelectionHelp();
    }

    // Cache the result
    saveToCache('detailedCommands', result);

    return result;
}

/**
 * Read slash commands from .claude/commands/ directory
 */
function getSlashCommands() {
    const commands = [];
    const commandsDir = path.join(process.cwd(), '.claude', 'commands');

    try {
        if (!fs.existsSync(commandsDir)) return commands;

        const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const filePath = path.join(commandsDir, file);
            // Read only first 500 bytes for frontmatter (optimization)
            const fd = fs.openSync(filePath, 'r');
            const buffer = Buffer.alloc(500);
            fs.readSync(fd, buffer, 0, 500, 0);
            fs.closeSync(fd);
            const content = buffer.toString('utf8');

            const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
            if (frontmatterMatch) {
                const descMatch = frontmatterMatch[1].match(/description:\s*(.+)/);
                if (descMatch) {
                    commands.push({
                        name: file.replace('.md', ''),
                        description: descMatch[1].trim()
                    });
                }
            }
        }
    } catch (_e) {
        // Intentionally ignored
    }

    return commands;
}

/**
 * Get framework-specific detailed commands
 */
function getFrameworkDetailedCommands(framework) {
    switch (framework) {
        case 'IDPF-Agile': return getAgileDetailedCommands();
        default: return getFrameworkSelectionHelp();
    }
}

function getAgileDetailedCommands() {
    let result = `## IDPF-Agile — Workflow Triggers & Slash Commands

### Workflow Triggers (prefix your message)

| Trigger | Description |
|---------|-------------|
| \`bug: <title>\` | Create a bug issue |
| \`enhancement: <title>\` | Create an enhancement issue |
| \`proposal: <title>\` | Create a proposal document + tracking issue |
| \`idea: <title>\` | Alias for proposal: |
| \`work #N\` | Start working on an issue (validates branch, extracts auto-TASK) |
| \`work all in <status>\` | Batch work on issues by status |
| \`done [#N]\` | Complete issue (in_review → done) |
| \`review #N\` | Route to /review-issue |
| \`commands\` | Show available triggers and slash commands |
| \`list-commands\` | Show detailed command list |

### Slash Commands
`;
    const slashCommands = getSlashCommands();
    if (slashCommands.length > 0) {
        result += `\n| Command | Description |\n|---------|-------------|\n`;
        for (const cmd of slashCommands) {
            result += `| \`/${cmd.name}\` | ${cmd.description} |\n`;
        }
    } else {
        result += `\nNo slash commands found in .claude/commands/\n`;
    }

    result += `
### TDD Methodology

IDPF-Agile uses TDD RED-GREEN-REFACTOR cycles. Workflow checkpoint is story completion (In Review → Done).`;

    return result;
}

function getFrameworkSelectionHelp() {
    return `## No Active Framework Detected

To see framework-specific commands, either:

1. **Set up a project** with \`framework-config.json\`:
   \`\`\`json
   { "framework": "IDPF-Agile" }
   \`\`\`

2. **Available frameworks:**
   - \`IDPF-Agile\` - Story-based development with TDD
   - \`IDPF-Vibe\` - Exploratory development

3. **Quick start:** Type \`commands\` to see workflow triggers and slash commands.`;
}
