---
name: GitHub push authentication
description: The configured Git remote may retain an invalid HTTPS credential even after the GitHub integration is attached.
---

When GitHub reports an invalid username or token, inspect the remote and authenticated API separately. A repository can be empty while the local Replit tracking ref shows many commits ahead; attaching the GitHub integration does not necessarily refresh the Git CLI credential helper.

**Why:** The local Git push was rejected by an old HTTPS credential, while the authorized GitHub connection could access the repository. The repository was empty and had to be initialized before Git objects could be created through the GitHub API.

**How to apply:** Never request or print a token. Use the GitHub integration for secure API access, verify the repository state, and treat direct API publication as a fallback when CLI authentication is invalid. Refresh local Git authentication separately before relying on future panel pushes.