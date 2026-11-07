
PowerShell, current session only:
$env:GITLAB_TOKEN = "glpat-xxxxxxxxxxxxxxxxxxxx"
$env:GITLAB_URL   = "https://git.mofid.dev"
claude

PowerShell, saved for all future shells (open a new terminal afterwards):
setx GITLAB_TOKEN "glpat-xxxxxxxxxxxxxxxxxxxx"
setx GITLAB_URL   "https://git.mofid.dev"

Git Bash / Linux / macOS:
export GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
export GITLAB_URL=https://git.mofid.dev
claude

Install the skill and check it works:
npx skills add D:\Users\ma.yousefi\Downloads\review-agent
node D:\Users\ma.yousefi\Downloads\review-agent\skills\gitlab-mr-review\scripts\gitlab-mr.mjs selftest

Then, inside your local clone of the project, ask the agent:
review GitLab MR !123 in group/project
or paste the MR link:
/gitlab-mr-review https://git.mofid.dev/group/project/-/merge_requests/123