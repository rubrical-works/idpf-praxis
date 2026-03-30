# IDPF Suitability Assessment: Solo Developer

**Date:** 2026-02-09
**Overall Suitability:** High (~80-90% framework utilization, scaling with project complexity)

---

## Summary

The solo practitioner working with an AI assistant is IDPF's primary design target. Every feature — the charter, STOP boundaries, review gates, TDD enforcement — was built for the human+AI pair where one person makes all the decisions and the AI does the heavy lifting. That person doesn't need to be a developer. They need to be a clear thinker who can define what to build, evaluate whether it was built correctly, and decide when to ship.

Technical expertise raises the ceiling — you'll catch more AI mistakes, make better architectural choices, and produce higher-quality software. But the floor is functional without it. See `../01-Getting-Started/01-Your-Role.md` for a full breakdown of the roles you'll fill.

The question isn't whether IDPF fits solo work; it's which parts of the pipeline to use for which kinds of work.

---

## The "Is This Overkill?" Question

It looks heavy. Charter, proposal, review, PRD, backlog, branch, assign, work, done, release — that's ten steps from idea to shipped code. For a solo developer who just wants to build something, this feels like enterprise ceremony.

The honest answer: **you won't use all ten steps for every piece of work.** IDPF is a toolkit, not a conveyor belt. The framework provides two paths that a solo developer will use constantly, and one path they'll use occasionally:

### The Fast Path (Most Daily Work)

```
/bug Fix the login timeout           ← Create issue, STOP
/work #42                            ← TDD implementation
/done #42                            ← Commit, close
```

Three commands. No proposal, no PRD, no backlog. This is how you handle bugs, small enhancements, and well-understood work. The overhead is: writing a clear issue title and letting the TDD cycle run.

### The Planning Path (Features and Larger Work)

```
/proposal Add dark mode support      ← Capture idea
/create-prd #10                      ← Generate requirements
/create-backlog #15                  ← Create epics + stories
/work #20                            ← TDD per story
/done #20                            ← Complete per story
```

Five commands for the planning phase, then the same work/done cycle per story. This is for features that are complex enough that jumping straight to code would produce the wrong thing. The proposal and PRD force you to think before building — which, when you're the only human reviewing the AI's output, is exactly when thinking matters most.

### The Bottom-Up Path (Exploration)

```
/add-story Experiment with WebSocket connections
/work #30
/done #30
/add-story Handle reconnection logic     ← scope emerges
/work #31
/done #31
```

No proposal, no PRD. Stories created one at a time as understanding develops. Epics form organically when related stories accumulate. This is the path for exploratory work where requirements are unclear until you start building.

---

## Why Solo Developers Need the Friction More, Not Less

The counterintuitive insight: the STOP boundaries and review gates are *more* important for solo developers than for teams.

On a team, code gets reviewed by humans who catch mistakes. On a solo project with an AI assistant, there is no second pair of human eyes. The AI will confidently implement the wrong thing and report success. Without a STOP boundary after `/work`, the assistant will keep going — committing, pushing, and closing issues — and you'll discover the problem much later.

The charter, the review commands, and the acceptance criteria are the solo developer's substitute for a team. They're not overhead; they're the quality mechanism that replaces the code review you don't have.

---

## Domain Specialist Coverage

Solo practitioners typically wear multiple hats — product visioner, requirements author, quality reviewer, process conductor (see `../01-Getting-Started/01-Your-Role.md`). The 22 domain specialists help the AI switch context to match what you're working on:

| Solo Dev Activity | Specialist | Switch With |
|---|---|---|
| Building the frontend | Frontend-Specialist | `/change-domain-expert` |
| Writing API routes | Backend-Specialist or API-Integration-Specialist | `/change-domain-expert` |
| Setting up the database | Database-Engineer | `/change-domain-expert` |
| Configuring deployment | DevOps-Engineer | `/change-domain-expert` |
| Checking accessibility | Accessibility-Specialist | `/change-domain-expert` |
| Performance tuning | Performance-Engineer | `/change-domain-expert` |

The Full-Stack-Developer specialist is a reasonable default for solo work — it covers all tiers without deep specialization. Switch to a focused specialist when you're doing deep work in one area.

---

## Skill Applicability

18 of 38 skills (~47%) are directly useful for solo development:

| Skill | Solo Dev Relevance |
|---|---|
| **TDD suite** (5 skills) | Core workflow — the AI writes tests you'd otherwise skip |
| **error-handling-patterns** | Catch-all for the patterns a solo dev forgets under time pressure |
| **codebase-analysis / anti-pattern-analysis** | No code reviewer? These are your static analysis |
| **postgresql-integration / sqlite-integration** | Data layer setup |
| **migration-patterns** | Schema evolution without a DBA |
| **api-versioning** | Critical if you're building APIs others consume |
| **ci-cd-pipeline-design** | Deployment automation — high leverage for solo devs |
| **playwright-setup** | E2E testing setup — the tests you'd skip without enforcement |
| **property-based-testing / mutation-testing** | Advanced testing for complex logic |
| **bdd-writing** | Integration test patterns |
| **flask-setup / sinatra-setup** | Quick scaffolding for new projects |
| **common-errors / beginner-testing** | Useful if you're learning a new stack |

Skills with lower solo relevance: `electron-development` (niche).

---

## Cost Considerations

IDPF is token-intensive. A single `/work` cycle on a non-trivial story involves:
- Reading the command spec (~500 tokens)
- Generating the todo list (~200 tokens)
- Loading the TDD methodology (~400 tokens)
- Multiple RED-GREEN-REFACTOR cycles (variable, often 2000+ tokens per cycle)
- Acceptance criteria verification (~300 tokens)

A productive session might work through 3-5 stories, consuming significant token volume. **A Claude subscription (Max or Pro) is the practical approach.** API-based usage works but costs add up quickly for the sustained, multi-cycle interactions that IDPF workflows produce.

Budget roughly: one IDPF session ≈ one extended conversation. If you're doing daily development with IDPF, a subscription pays for itself immediately compared to per-token API pricing.

---

## Workflow — The Solo Cadence

A typical solo development day with IDPF:

```
Morning: Plan
─────────────
/review-issue #40 #41 #42           ← Review queued issues
/resolve-review #40                 ← Fix any review findings

Midday: Build
─────────────
/work #40                            ← TDD implementation
/done #40                            ← Commit + close
/work #41                            ← Next story
/done #41

Afternoon: Ship
───────────────
/work #42
/done #42
/prepare-release                     ← Version, merge, tag
```

The reviews in the morning catch quality issues before you start building. The work/done cycle in the middle is heads-down implementation. The release at the end is automated. This cadence scales from one issue to twenty — the commands are the same regardless of volume.

---

## Testing Coverage

Solo developers are notorious for skipping tests. IDPF's TDD enforcement is arguably the highest-value feature for solo work:

| Test Type | IDPF Support | Solo Dev Impact |
|---|---|---|
| Unit tests | TDD red/green/refactor (mandatory) | Tests that would otherwise be skipped |
| Integration tests | BDD-writing skill | Cross-component verification |
| E2E tests | playwright-setup + playwright-check | Full user journey testing |
| Property-based | property-based-testing skill | Edge case discovery |
| Mutation testing | mutation-testing skill | Test suite quality verification |

The TDD cycle is not optional in IDPF-Agile. This is a feature, not a bug. The assistant writes the tests autonomously — you don't need to understand testing methodology to benefit from it. The tests catch the bugs that would otherwise ship without a dedicated QA process.

---

## Framework Comparison

| Framework | Solo Dev Fit | Notes |
|---|---|---|
| **IDPF-Agile** | Best fit | TDD, structured stories, clear done criteria |
| **IDPF-Vibe** | Strong for new projects | Start exploring, transition to Agile when the project matures |

For solo developers starting a new project with unclear requirements, the IDPF-Vibe → IDPF-Agile transition path is ideal. Vibe for the first few sessions while you figure out what you're building, then Evolution Point to capture what exists, then Agile for production-quality development going forward.

---

## Gaps and Workarounds

| Gap | Impact | Workaround |
|---|---|---|
| No "lightweight mode" toggle | Low — fast path covers this | Use `/bug` and `/enhancement` for small work, skip proposal/PRD |
| Review commands ask subjective questions | Low-Medium — slower for solo | Answer honestly; the questions catch real issues |
| No built-in time tracking | Low | Track via commit timestamps and issue close dates |
| Branch management overhead for tiny projects | Low | Use a single `feature/` branch for all work in early stages |
| Charter feels heavy for weekend projects | Medium | Use extraction mode on existing code; 2-3 minutes once |

---

## Concrete Example Workflow

A solo developer building a personal finance tracker (React + Express + SQLite):

1. **`/charter`** — Define vision, tech stack (React, Express, SQLite), scope (web only, no mobile)
2. **`/enhancement Add transaction import from CSV`** — Quick issue for a focused feature
3. **`/create-branch feature/csv-import`**
4. **`/assign-branch #1`**
5. **`/work #1`** — TDD: parse CSV, validate rows, insert to DB, display results
6. **`/done #1`** — Commit, push, close
7. **`/prepare-release`** — Tag v0.1.0

Total commands: 7. Total ceremony: one charter (once) and one issue before building. The rest is implementation.

---

## Conclusion

Solo work is IDPF's sweet spot. The framework replaces the team you don't have — reviews substitute for code review, TDD substitutes for QA, STOP boundaries substitute for the colleague who asks "are you sure?" Whether you're a seasoned developer or a non-technical founder with a clear vision, IDPF gives you a structured process for turning ideas into working, tested, version-controlled software.

The overhead is real but adjustable: use the fast path for small work, the planning path for complex features, and the bottom-up path for exploration. Technical expertise is a quality multiplier at every stage, but the framework is functional across the full spectrum of user backgrounds. Expected framework utilization: ~80-90%, with the lower bound reflecting weekend hobby projects and the upper bound reflecting serious solo products.

---

**End of Assessment**
