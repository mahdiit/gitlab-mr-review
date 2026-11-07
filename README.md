# gitlab-mr-review skill

Agent-agnostic GitLab MR reviewer (Claude Code, Codex, Cursor, Gemini CLI, …).

```bash
npx skills add <git-url-of-this-repo>          # or a local path: npx skills add ./review-agent
export GITLAB_TOKEN=glpat-...                  # PowerShell: $env:GITLAB_TOKEN = "glpat-..."
export GITLAB_URL=https://gitlab.company.com
```

Then ask your agent: "review GitLab MR !123 in group/project".

Flow: load MR → load existing non-system notes/discussions → check repo & fetch → review the complete MR diff with default .NET/EF/SQL/DI checks (honouring repo `agent.md`) → classify findings as Critical/High/Medium/Low/Improvement → choose one-by-one GitLab publication or a root Markdown report → choose Persian or English → publish/write only after explicit user approval.

Publishing options:
- `--interactive`: prompt for publish/skip/quit immediately before each finding after the user chooses one-by-one GitLab review.
- `--only 1,3`: publish only the selected 1-based finding numbers after explicit user approval.
- `--language fa|en`: use Persian or English labels in GitLab comments (default: `fa`).

Needs Node 18+ and git. Check: `node skills/gitlab-mr-review/scripts/gitlab-mr.mjs selftest`.
