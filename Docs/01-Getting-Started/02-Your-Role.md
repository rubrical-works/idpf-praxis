# Your Role in IDPF

**Date:** 2026-02-10
**Topic:** What you do, what the AI does, and why the distinction matters

---

## You Don't Write Code

This is the most important thing to understand about IDPF: **you are not the one writing code.** The AI assistant writes the code, the tests, the commits. It reads files, generates implementations, runs TDD cycles, and pushes changes to Git.

Your job is everything else.

You are the person who decides *what* gets built, *why* it matters, *whether* it's good enough, and *when* it ships. That's not a small job. It's the job that determines whether the project succeeds or produces technically correct software that solves the wrong problem.

---

## The Hats You Wear

Working with IDPF, you'll move between several roles throughout a session. None of them require writing code. All of them require judgment.

### Product Visioner

You define the charter. You answer: what is this project? What problem does it solve? What's in scope and what isn't? The AI can't answer these questions — it doesn't know your users, your market, or your constraints. The charter is yours.

**Where this happens:** `/charter`, project inception, scope decisions

### Requirements Author

You write proposals that describe what you want built. You review PRDs to make sure the requirements are complete. You define acceptance criteria — the specific, testable conditions that determine whether a story is done. The AI helps structure these, but the substance comes from you.

**Where this happens:** `/proposal`, `/create-prd`, acceptance criteria in stories

### Decision Maker

The framework presents you with choices and asks for approval at every significant transition. Should this proposal become a PRD? Is this test plan thorough enough? Does this story's implementation match what you intended? The AI will not proceed past these checkpoints without your explicit go-ahead.

**Where this happens:** STOP boundaries, review approvals, `/done` confirmations

### Quality Gate Operator

After the AI completes work on a story, it stops and waits for you. Your job is to review the output — does it meet the acceptance criteria? Did it change things it shouldn't have? Does the result make sense for your project? You are the quality gate between "the AI says it's done" and "it's actually done."

**Where this happens:** `/work` → `in_review` → `/done` transitions

### Process Conductor

You sequence the work. Which stories get worked first? When is a branch ready for release? Should this bug be a quick fix or does it need a proposal? The framework provides the tools; you decide the order and the pace.

**Where this happens:** `/assign-branch`, `/work #N` sequencing, `/prepare-release` timing

### Domain Expert

You know things the AI doesn't: your business rules, your users' expectations, your regulatory environment, your competitive landscape. When the AI asks clarifying questions during a PRD or proposes an implementation approach, your domain knowledge shapes the answer.

**Where this happens:** Charter questions, PRD clarifications, review evaluations

---

## What the AI Does

For clarity, here's the division of labor across the workflow:

| Stage | You | The AI |
|---|---|---|
| **Charter** | Answer vision and scope questions | Generate charter documents from your answers |
| **Proposal** | Describe what you want | Structure it into a formal proposal document |
| **Review** | Evaluate subjective criteria (feasibility, priority) | Auto-evaluate objective criteria (completeness, format) |
| **PRD** | Answer clarifying questions, approve requirements | Generate user stories, acceptance criteria, test plans |
| **Backlog** | Confirm epic/story structure | Create GitHub issues with full detail |
| **Work** | Wait (the AI is implementing) | Write tests, write code, run TDD cycles, commit |
| **Done** | Review output, approve completion | Move status, push changes |
| **Release** | Approve version, merge PR | Analyze commits, update changelog, tag, publish |

Notice the pattern: **you decide, the AI executes.** During the `/work` phase, the AI is heads-down writing and testing code — and you're free. You could be defining the next proposal in another Claude session, reviewing a PRD for a different feature, or doing non-development work entirely. Your role in *this* session resumes when the AI stops and presents the result for review.

---

## Technical Expertise Is a Spectrum, Not a Gate

You don't need to be a developer to use IDPF. But technical knowledge makes you better at every role above. Think of it as a quality multiplier:

### Navigator

**Profile:** Non-technical founder, product manager, domain expert, or business owner

**What you can do effectively:**
- Define the charter (vision, scope, problem statement)
- Write proposals describing what you want
- Create and prioritize issues
- Review acceptance criteria (do these capture what I actually need?)
- Approve `/done` based on acceptance criteria checkboxes
- Manage branches and releases through commands

**Where you'll rely on trust:** When the AI produces code and says the tests pass, you take that at face value. You judge the *what* (does this feature do what I asked?) rather than the *how* (is the implementation sound?).

### Evaluator

**Profile:** Technical literacy — can read code, understands architecture concepts, has built software before

**What you gain beyond Navigator:**
- Read diffs to verify the AI changed what it should have
- Catch when the AI's implementation is technically correct but architecturally wrong
- Evaluate test quality (are these testing the right things?)
- Spot over-engineering or under-engineering
- Make informed decisions when the AI presents technical trade-offs

### Architect

**Profile:** Deep technical expertise — experienced developer or technical lead

**What you gain beyond Evaluator:**
- Guide implementation approach before `/work` begins ("use a strategy pattern here, not a switch statement")
- Customize commands and extension points
- Assess performance, security, and scalability implications
- Know when to override the AI's approach with a better one
- Contribute code directly when the AI's output needs specific expertise

### All Three Levels Work

The framework doesn't check your credentials. A Navigator using IDPF produces a working, tested, version-controlled project. An Architect using IDPF produces the same — but with more informed quality gate decisions along the way. The ceiling is higher with expertise, but the floor is functional without it.

---

## A Day in the Life

Here's what a typical IDPF session looks like from your perspective. Notice how little of it involves code:

```
Morning — Think
──────────────────
You review yesterday's open issues.
"This bug report is vague. Let me clarify the acceptance criteria."
→ /review-issue #40

You have an idea for a new feature.
→ /proposal Add recurring transaction support

Midday — Direct
──────────────────
You're ready to work on the CSV import story.
→ /work #35

The AI runs for several minutes. You see it writing tests,
implementing code, refactoring. You wait. It stops.

"Story #35 is in review. All acceptance criteria met."

You scan the summary. The criteria checkboxes are checked.
→ /done #35

You start the next story.
→ /work #36

Afternoon — Ship
──────────────────
Three stories done. Time to release.
→ /prepare-release

The AI analyzes commits, proposes version 1.2.0.
"Does this version number look right?" — You confirm.
It creates the PR, you approve the merge, it tags and publishes.
```

Your contribution was: reviewing, clarifying, deciding, approving, and sequencing. The AI's contribution was: implementing, testing, committing, and deploying. Both are essential.

---

## Common Misconceptions

**"I need to understand TDD to use IDPF."**
No. The AI performs TDD autonomously. You need to understand acceptance criteria — the plain-language conditions that define "done." TDD is the method the AI uses to get there.

**"I need to read every line of code the AI writes."**
Not required, but more review means higher quality. At minimum, check that the acceptance criteria are met and the AI didn't change files it shouldn't have. At maximum, read every diff. Your comfort level determines where you land on that spectrum.

**"I need to know Git to use IDPF."**
The slash commands abstract Git operations. You type `/create-branch`, not `git checkout -b`. You type `/done`, not `git commit && git push`. Understanding Git helps you recover from problems faster (see `05-When-Things-Go-Wrong.md`), but it's not required for normal operation.

**"This is for developers who want structure."**
It can be. But it's equally for non-developers who want to build software with an AI assistant and need a process that prevents the AI from going off the rails. The structure isn't developer ceremony — it's the guardrails that make AI-assisted development reliable.

---

## Tip: When the AI Stacks Questions

Sometimes the AI will ask you several questions at once — a numbered list, or multiple questions buried in a paragraph. This can be overwhelming, and answering out of order can confuse the conversation.

If that happens, just say: **"ask questions one at a time"**

The AI will re-ask the first question, wait for your answer, then move to the next. This is especially useful during `/charter`, `/proposal`, `/create-prd`, and other commands where the AI is gathering requirements from you.

---

## What to Read Next

| If You Want To... | Read |
|---|---|
| Install dependencies on Windows | `00-Installation.md` |
| Install and run your first issue | `01-Quick-Start.md` |
| Understand every stage of the workflow | `03-Workflow-Guide.md` |
| Choose how much planning to do | `04-Planning-Approaches.md` |
| Know what to do when something breaks | `05-When-Things-Go-Wrong.md` |

---

**End of Your Role in IDPF**
