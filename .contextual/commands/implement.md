---
config:
  SPECS_DIR: specs
---

# Goal

Implement tasks from spec (spec-driven) OR execute a single task (task mode).

# Instructions

Replace `${VARIABLE}` placeholders with resolved values as you go. Config frontmatter supplies globals (e.g. `${SPECS_DIR}`).

# User Input

```text
${ARGUMENTS}
```

# Routing

1. Get branch: `git branch --show-current` → `${CURRENT_BRANCH}` (stop if `main`)
2. Set `${FEATURE_DIR}` = `${SPECS_DIR}/${CURRENT_BRANCH}`, `${FEATURE_PLAN}` = `${FEATURE_DIR}/plan.md`
3. Replace all env variables with actual values.
4. If plan doesn't exist → error, warn the user to run `/plan` first
5. Read `${FEATURE_PLAN}` to see what tasks exist
6. Route based on user input (prefer SPEC-DRIVEN when ambiguous):
   - Empty → **SPEC-DRIVEN** (next phase with uncompleted tasks; a phase is a `##` heading under Tasks)
   - Exact or clear match to an existing phase/section title, task number, or task text → **SPEC-DRIVEN**
   - Otherwise (new instruction with no matching phase/task) → **TASK**

# Mode: TASK

**When:** User input is a new instruction (not referencing existing spec tasks)

1. Analyze task based on user input.
2. Break down into subtasks and execute them systematically.
3. Validate implementation and handle errors
4. Track in `${FEATURE_PLAN}`:
   - Read `${FEATURE_PLAN}`
   - Create "# Additional Tasks" section if needed
   - Add `- [x] ${ARGUMENTS}` and save

# Mode: SPEC-DRIVEN

**When:** User input references existing phase/task/section OR is empty

1. **Find linked files**: Scan `${FEATURE_PLAN}` for links, follow recursively (depth: 3)

   - Patterns: `[text](path)`, `@file`, `./path`, `[[link]]`, `$VAR`
   - Types: .md, .txt, .json, .yaml, .js, .ts, .py, .sh
   - Skip: External URLs, binaries

2. **Extract tasks** from all files:

   - Uncompleted: `- [ ]`, `* [ ]`, `+ [ ]`
   - Ignore completed: `- [x]`, `* [x]`, `+ [x]`
   - Markers: `[HIGH]`, `[MEDIUM]`, `[LOW]`, `[CRITICAL]`, `TODO:`, `FIXME:`

3. **Filter tasks** (if user input provided):

   - Phase/section name → tasks in that section
   - Task number → specific task
   - Keywords → matching descriptions
   - None → next phase of uncompleted tasks

4. **Execute**:
   - Organize by priority markers then dependencies
   - Implement tasks, mark `- [x]` in ALL files containing the task after each
   - **Critical failure** (halt): build/typecheck broken, data loss risk, security regression, or blocked dependency
   - **Non-critical** (document and continue): style nits, optional polish, skipped nice-to-haves

# Output

- Mode used (TASK or SPEC-DRIVEN)
- Tasks completed / remaining (with file paths)
- Files changed
- Blockers or non-critical issues
- Suggested commit message: `"feat: implement ${CURRENT_BRANCH}"`

# ⚠️ FINAL CHECKPOINT

**Before finishing:**

- [ ] Completed tasks marked `- [x]` in `${FEATURE_PLAN}` and any linked task files
- [ ] Summary lists what was implemented and what remains

# Next Steps

1. Review implementation results
2. Review changes in `${FEATURE_PLAN}`
3. Use `/plan` to continue updating the plan
4. Use `/commit` to commit changes
