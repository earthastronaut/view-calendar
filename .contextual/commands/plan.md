---
config:
  SPECS_DIR: specs
  AGENTS_MD: AGENTS.md
---

# Goal

Route to CREATE, CLARIFY, or PLAN mode based on specification state. Creates/updates **DOCUMENTATION ONLY** — never source code.

# Instructions

Replace `${VARIABLE}` placeholders with resolved values as you go. Config frontmatter supplies globals (e.g. `${SPECS_DIR}`, `${AGENTS_MD}`).

# User Input

```text
${ARGUMENTS}
```

- **CREATE**: seed Problem Statement / Scope / Solution from the request
- **CLARIFY**: answers to open `[NEEDS CLARIFICATION: …]` markers; if empty, ask interactively
- **PLAN**: optional focus for regenerating Tasks; if empty, plan from the full spec

# Routing

1. Get branch: `git branch --show-current` → `${CURRENT_BRANCH}` (stop if `main`; tell user to switch to a feature branch)
2. Set `${FEATURE_DIR}` = `${SPECS_DIR}/${CURRENT_BRANCH}`, `${FEATURE_PLAN}` = `${FEATURE_DIR}/plan.md`
3. Replace all env variables with actual values.
4. Route if:
   - No `plan.md` exists → **CREATE** mode
   - `plan.md` exists with `[NEEDS CLARIFICATION` markers → **CLARIFY** mode
   - `plan.md` exists without those markers → **PLAN** mode

# Mode: CREATE

**When:** `${FEATURE_PLAN}` does not exist

1. Make the directory `${FEATURE_DIR}` if it doesn't exist
2. Create `${FEATURE_PLAN}` from:

```markdown
# Problem Statement

[What problem does this solve and what is the proposed solution? (2-3 sentences. Keep it concise.)]

# Scope

[List requirements, boundaries, and dependencies. Be specific and measurable. Do not include implementation details. Keep it concise.]

# Solution

[Describe the solution. Include reasoning for why this approach was chosen over alternatives. Keep it concise.]

# Tasks

[Plan and list the implementation tasks by phase. Be specific and measurable. DRY. Reference the solution and scope sections.]

## Phase 1: Description

- [ ] task 1
```

3. Read `${AGENTS_MD}` if exists for project context
4. Populate from user input `${ARGUMENTS}`: analyze request, scan project, research if needed.
   - Focus on **WHAT** needs to be specified, not **HOW** to implement
   - "Implement X" means "create specification for X"
   - "Change Y" means "specify requirement for Y"
   - "Fix Z" means "document Z needs fixing in spec"
5. Add `[NEEDS CLARIFICATION: question?]` for ambiguous areas where you need user input.
6. Validate: only `${SPECS_DIR}/${CURRENT_BRANCH}/` files modified.

# Mode: CLARIFY

**When:** `${FEATURE_PLAN}` exists with `[NEEDS CLARIFICATION` markers

1. Read `${FEATURE_PLAN}` and related files, identify all `[NEEDS CLARIFICATION: …]` markers
2. Read `${AGENTS_MD}` if relevant
3. **If user input provided:**
   - Update `${FEATURE_PLAN}` sections (Problem Statement, Scope, Solution, Tasks)
   - Add new `[NEEDS CLARIFICATION: question?]` markers as needed
   - Remove resolved markers
4. **If NO user input:**
   - Present ONE question at a time with options table (A/B/Custom)
   - Wait for answer, update spec, continue (max 7 per session). Do not ask the same question twice.
   - If none found → report complete
5. Validate: only `${SPECS_DIR}/${CURRENT_BRANCH}/` files modified

# Mode: PLAN

**When:** `${FEATURE_PLAN}` exists without `[NEEDS CLARIFICATION` markers

1. Extract requirements/acceptance criteria from `${FEATURE_PLAN}`
2. Review `${FEATURE_DIR}/analyzed.md` if exists (optional prior analysis notes), else scan project code
3. Generate plan: max 10 tasks, organized in phases, use `- [ ]` syntax. DRY. Reference the Solution and Scope sections. Be concise. Keep requirements concrete and measurable. Prioritize by dependencies.
4. Replace the `# Tasks` section in `${FEATURE_PLAN}` with the new plan (preserve Problem Statement, Scope, Solution). Keep already-completed `- [x]` items if they still apply; drop obsolete ones.
5. Validate: only `${SPECS_DIR}/${CURRENT_BRANCH}/` files modified

# Output

- Mode used (CREATE / CLARIFY / PLAN)
- Path to `${FEATURE_PLAN}`
- Open clarification count (if any)
- Brief summary of what changed

# ⚠️ FINAL CHECKPOINT

**Before finishing:**

- [ ] Verify that you modified ONLY `${SPECS_DIR}/${CURRENT_BRANCH}/` files otherwise you did it WRONG. Do not modify any other source files.
- [ ] Verify that you created documentation, NOT implementation.

# Next Steps

- Review the `${FEATURE_PLAN}` file to see the plan.
- Run `/plan [description]` again to continue updating the plan.
- Run `/implement [phase]` to execute the phase in the plan.
