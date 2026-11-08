---
config:
  MAIN_BRANCH: main
  SPECS_DIR: specs
  MERGE_TEMPLATE: |
    Merge {FEATURE_BRANCH}: {DESCRIPTION}
    - {commit_hash}: one line per commit included.
    ...
    spec: {FEATURE_PLAN}
---
# Goal

Analyze the current feature branch and spec to generate a summary commit message, then perform a squash merge to main branch.

# User Input

```text
${ARGUMENTS}
```

Optional: override or seed `${DESCRIPTION}` for the merge message.

# Steps

## 1. Check Prerequisites

1. Set `${MAIN_BRANCH}` and `${SPECS_DIR}` from config
2. Execute prerequisites

   - `git branch --show-current` => `${FEATURE_BRANCH}`
   - `git diff-index --quiet HEAD -- ; echo $?` => `${UNCOMMITTED_CHANGES}`
   - `git ls-files --others --exclude-standard` => `${UNTRACKED_FILES}`
   - `git diff --name-only ${MAIN_BRANCH}...${FEATURE_BRANCH}` => `${CHANGED_FILES}`
   - `git log ${MAIN_BRANCH}..${FEATURE_BRANCH} --oneline` => `${COMMIT_LOG}`
   - `git rev-list ${FEATURE_BRANCH}..${MAIN_BRANCH} --count` => `${MAIN_AHEAD_COUNT}`

3. Set `${FEATURE_PLAN}` = `${SPECS_DIR}/${FEATURE_BRANCH}/plan.md`
4. `${FEATURE_BRANCH}` == `${MAIN_BRANCH}` → STOP, tell user to switch to a feature branch first
5. If `${MAIN_AHEAD_COUNT}` > 0 → STOP, tell user that `${MAIN_BRANCH}` has new commits and to rebase or merge `${MAIN_BRANCH}` into `${FEATURE_BRANCH}` first
6. If `${UNCOMMITTED_CHANGES}` != 0 → STOP, tell user to commit first
7. If `${FEATURE_PLAN}` does not exist → STOP, tell user to run `/plan` first (or create the spec)
8. If `${UNTRACKED_FILES}` is not empty → WARN user but continue
9. If `${CHANGED_FILES}` is empty → STOP, tell user to add some changes first

## 2. Analyze & Generate Message

1. Review `${COMMIT_LOG}`, `${FEATURE_PLAN}`, and `${ARGUMENTS}` to generate `${DESCRIPTION}` (prefer `${ARGUMENTS}` when provided)
2. Set `${COMMIT_MESSAGE}` using `${MERGE_TEMPLATE}`. Replace:
   - `{FEATURE_BRANCH}` → `${FEATURE_BRANCH}`
   - `{DESCRIPTION}` → `${DESCRIPTION}`
   - `{FEATURE_PLAN}` → `${FEATURE_PLAN}`
   - Each `- {commit_hash}: ...` line → one line per entry in `${COMMIT_LOG}` (`hash` + subject); drop the `...` placeholder

## 3. Squash Merge

1. `git checkout ${MAIN_BRANCH}` → STOP if error
2. `git merge --squash ${FEATURE_BRANCH}` → STOP if error, resolve manually by user
3. `git commit -m "${COMMIT_MESSAGE}"` → STOP if error
4. Verify: `git status` clean and current branch is `${MAIN_BRANCH}`

# Output

- Feature branch merged, now on `${MAIN_BRANCH}`
- New commit hash and full merge message
- Files changed count / notable paths
- Reminder that `${FEATURE_BRANCH}` was left intact

# ⚠️ FINAL CHECKPOINT

**Before finishing:**

- [ ] Prerequisites passed (not on main, main not ahead, clean worktree, plan exists)
- [ ] Squash merge committed on `${MAIN_BRANCH}`
- [ ] Did not push unless user asked

# Next Steps

1. Review the merge results
2. Verify the commit message is appropriate
3. Clean up feature branch if desired (manual cleanup)
4. Push to remote if desired

# Guidelines

**Prerequisites:**
- Must be run from feature branch (not `${MAIN_BRANCH}`)
- `${FEATURE_PLAN}` must exist
- No uncommitted changes allowed

**Merge Behavior:**
- Squash merge combines all commits into one
- Feature branch left intact for manual cleanup
- No automatic task validation (merges regardless of completion status)

**Error Handling:**
- Abort on conflicts and show detailed error messages
- Stop on any git operation failures
