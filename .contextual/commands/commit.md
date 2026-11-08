---
config:
  MAIN_BRANCH: main
---
# Goal

Create a git commit with a conventional commit message based on current changes.

# User Input

```text
${ARGUMENTS}
```

Parse `${ARGUMENTS}`:
- Tokens that are existing file/dir paths → `${STAGE_PATHS}`
- Remaining free text → `${COMMIT_MESSAGE}` (user-provided message)
- Empty → auto-generate message; stage tracked changes only

# Steps

## 1. Check Git Status

1. Run: `git status --porcelain` → `${CHANGED_FILES}`
2. If no changes → notify user and exit
3. If any path matches secret patterns (`.env`, `*.pem`, `credentials.json`, `*secret*`, `*credential*`) → WARN and exclude unless user explicitly listed it in `${STAGE_PATHS}`

## 2. Generate Commit Message

**If `${COMMIT_MESSAGE}` was provided:** use it (add conventional `type:` prefix only if missing)

**If no message provided:**
1. Analyze staged/unstaged diffs (not just names) to pick type:
   - `feat` → New feature
   - `fix` → Bug fix
   - `docs` → Documentation only
   - `refactor` → Code restructuring
   - `test` → Test changes
   - `chore` → Maintenance/tooling
2. Description: present tense, lowercase start, specific but brief
3. Format: `${TYPE}: ${DESCRIPTION}`

**Examples:**
- `feat: add merge command with prerequisites check`
- `docs: update README with installation instructions`
- `fix: correct function name in validation`

## 3. Stage and Commit

1. Stage:
   - If `${STAGE_PATHS}` set → `git add ${STAGE_PATHS}`
   - Else → stage modified/deleted tracked files from status (do **not** `git add .`; do not auto-add unrelated untracked files)
2. `git commit -m "${COMMIT_MESSAGE}"`
3. If hooks fail → show output, stop; never use `--no-verify` unless user explicitly asks

# Output

- Branch, commit hash, message
- Files staged/committed
- Hook failure details if any

# Next Steps

1. Push changes: `git push`
2. Use `/merge` to merge to ${MAIN_BRANCH}

# Guidelines

- Omit scope unless changes are focused in one directory
- Keep descriptions concise and action-oriented
- Never commit secrets; never skip hooks by default
