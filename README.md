# gitlab-mr-review skill

Agent-agnostic GitLab MR reviewer (Claude Code, Codex, Cursor, Gemini CLI, …).

```bash
npx skills add <git-url-of-this-repo>          # or a local path: npx skills add ./review-agent
export GITLAB_TOKEN=glpat-...                  # PowerShell: $env:GITLAB_TOKEN = "glpat-..."
export GITLAB_URL=https://gitlab.company.com
```

Then ask your agent: "review GitLab MR !123 in group/project".

Flow: load MR → check repo & fetch → review only the MR diff with default .NET/EF/SQL/DI checks (honouring repo `agent.md`) → Persian findings → approve each finding one-by-one or select finding numbers → post only approved inline discussions, with fallback notes + selected-only summary.

Publishing options:
- `--interactive`: prompt for publish/skip/quit immediately before each finding.
- `--only 1,3`: publish only the selected 1-based finding numbers after user approval.

Needs Node 18+ and git. Check: `node skills/gitlab-mr-review/scripts/gitlab-mr.mjs selftest`.
