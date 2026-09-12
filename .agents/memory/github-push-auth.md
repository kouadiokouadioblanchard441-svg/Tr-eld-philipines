---
name: GitHub push authentication
description: The configured Git remote may retain an invalid HTTPS credential even after the GitHub integration is attached.
---

When GitHub reports an invalid username or token, inspect the remote and authenticated API separately. A repository can be empty while the local Replit tracking ref shows many commits ahead; attaching the GitHub integration does not necessarily refresh the Git CLI credential helper.

**Why:** The local Git push was rejected by an old HTTPS credential, while the authorized GitHub connection could access the repository. The repository was empty and had to be initialized before Git objects could be created through the GitHub API.

**How to apply:** Never request or print a token. Use the GitHub integration for secure API access, verify the repository state, and treat direct API publication as a fallback when CLI authentication is invalid. Refresh local Git authentication separately before relying on future panel pushes.

When local and remote repositories were initialized independently, a normal merge can refuse unrelated histories and a push can fail while unpacking missing objects. After confirming the remote content is safe to replace, publish a clean tracked-file snapshot with a protected force update, then align the local branch to the new remote commit.

**Why:** The project history contained a separate GitHub initialization and an incomplete local object relationship, so ordinary push and merge paths could not produce a valid pack.

**How to apply:** Use this only after explicit confirmation for replacing the remote history; prefer `--force-with-lease` over an unconditional force-push and verify the local and remote commits match afterward.