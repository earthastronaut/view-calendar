---
name: tighten
description: Use when asked to shorten or tighten code or code docs, or when /tighten is invoked.
---
# Goal

Shorten code or code documentation without changing behavior.

# User Input

```text
${ARGUMENTS}
```

Parse `${ARGUMENTS}`:
- A percent like `20%` / `40%` → shorten target (default **30–50%** if omitted)
- Existing file path(s) → edit those files in place
- Otherwise treat remaining text as the snippet to tighten
- If empty: tighten the user's last pasted/named snippet, or ask if unclear

# Steps

1. Identify source (paste, paths, or last reply). Ask if unclear.
2. Shorten toward the target. Keep every behavior, signature, type, edge case, error path, and name callers depend on, plus any caveat that would change what the reader or caller does.
3. Keep the original's format and voice. Source stays source in the same language; a docstring stays a docstring; project docs still sound like the project.
4. Cut preamble, repetition, filler, hedges, comments that restate the code, and closing summaries. Lead with the main point. Add nothing new — no behavior changes, no drive-by refactors or renames.
5. If the text is already tight, say so instead of forcing cuts.

# Output

- Paste/snippet mode: return **only** the revised text
- File mode: apply the edit in place
- Add one line after only if you dropped something the reader might miss

# Next Steps

1. Review the tightened result
2. Use `/commit` if file edits should be committed

## Example

Before:
```ts
/**
 * This helper is responsible for taking the user ID that was passed in
 * and then looking up the corresponding user record in the database.
 * If it can't find one, it will throw an error so the caller knows.
 */
async function getUserById(userId: string) {
  const user = await db.users.findUnique({ where: { id: userId } });
  if (user === null || user === undefined) {
    throw new Error("User not found");
  }
  return user;
}
```

After:
```ts
/** Look up user by ID; throw if missing. */
async function getUserById(userId: string) {
  const user = await db.users.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  return user;
}
```
