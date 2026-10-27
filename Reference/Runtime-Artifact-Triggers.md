# Runtime Artifact Triggers
**Version:** v0.113.0
**Key Principle:** Offer, don't force: offer to document decisions, plans and procedures as they arise; any can be declined.
On a match, offer once: *"I noticed you [made a decision/etc.]. Would you like me to document this in [artifact location]? (yes/no)"*. Templates: `.claude/scripts/shared/lib/doc-templates.json` `templates`, keyed below — re-read from disk on acceptance.
| Artifact | Triggers | Offer | Template key |
|---|---|---|---|
| `Construction/Design-Decisions/YYYY-MM-DD-[decision-name].md` | technology selection or comparison, "decided to", "going with", "chose", architecture terms, design pattern names, trade-offs | "Would you like me to document this decision in Construction/Design-Decisions/?" | `construction/design-decision` |
| `Construction/Test-Plans/[feature-name]-test-plan.md` | test strategy, "how to test", "test coverage", "test plan", test scenarios, test environment | "Would you like me to capture this test plan in Construction/Test-Plans/?" | `construction/test-plan` |
| `Construction/Tech-Debt/[item-name].md` | "later", "TODO", "FIXME", "hack", "workaround", "technical debt", "refactor later", "not ideal", "temporary", "quick fix" | "Would you like me to track this in Construction/Tech-Debt/?" | `construction/tech-debt` |
| `Transition/Deployment-Guide.md` | `/prepare-release`: missing, or last updated > 30 days ago | "Deployment guide is missing. Create now?" / "Deployment guide may be stale. Review/update?" | `transition/deployment-guide` |
| `Transition/Runbook.md` | operational procedures, "how to handle", "when X happens", incident/alert response, maintenance, a dependency advisory ("npm audit", "CVE", "advisory", "Dependabot") | "Would you like me to add this to Transition/Runbook.md?" | `transition/runbook` |
| `Transition/User-Documentation.md` | user-facing feature complete, UI/UX change, new user workflow, external API change | "Would you like to update Transition/User-Documentation.md?" | `transition/user-documentation` |
**Behavior:** accept "no"; offer a repeatedly declined type less, only when relevant. **After the user accepts:** generate from the template, show the content, ask for edits, save, report "Saved to [path]".
**Prompts:** `AskUserQuestion` renders bold: context as markdown first, one-sentence question ≤200 chars (`{frameworkPath}/Reference/AskUserQuestion-Shape.md` § Templates).
**End of Runtime Artifact Triggers**
