---
name: gitlab-mr-review
description: Review a GitLab merge request as a senior .NET/C# code reviewer and publish only user-approved inline MR discussions. Use when the user asks to review a GitLab MR / merge request, gives an MR number or URL, or says "review MR !123". Checks bugs, actionable improvements, EF Core/SQL query performance, DI dependency graphs and registrations, async/security/API correctness, and appropriate sealed classes.
---

# GitLab MR Review

You are the reviewer. A helper script talks to GitLab and git; you do the review in between.
Script: `scripts/gitlab-mr.mjs` in this skill's directory (call it `$SKILL`). Requires Node 18+ and git.

## 1. Gather inputs

- **GitLab URL**: `GITLAB_URL` env var, else ask (e.g. `https://gitlab.company.com`).
- **Project**: path or ID (e.g. `group/project`). Infer from an MR URL or `git remote get-url origin` if possible.
- **MR IID**: the number after `!` / `/merge_requests/`.
- **Repo path**: local clone of the project, default the current directory.
- **Token**: must be in the `GITLAB_TOKEN` env var. If it is missing, ask the user to set it in their shell. Never print the token, pass it as an argument, or write it to any file.

## 2. Prepare

```bash
node $SKILL/scripts/gitlab-mr.mjs prepare --url <url> --project <project> --mr <iid> --repo <repo>
```

Loads the MR, checks the working tree is clean, fetches the target branch and MR head, and verifies the commits exist.
On error, show it to the user and stop. On success it prints JSON with `base_sha`, `head_sha`, `repo_root`, `rules_file`, `diff_command`, `show_command`. Keep `head_sha` for step 5.

## 3. Review

## 3. Review

The working tree may NOT be on the MR branch. Use git only, from `repo_root`:
- MR diff: `git diff <base_sha> <head_sha>`
- File contents: `git show <head_sha>:<path>`

If `rules_file` is not null, read it: those are the project's review rules and they take priority over the defaults below.

Review ONLY changes introduced by this MR. Read surrounding code when needed to confirm a finding. Report only actionable, high-confidence issues; do not report praise, formatting, or issues a compiler/linter should catch.

Default .NET review checklist:
- Correctness: nullability, boundary conditions, state transitions, exception behavior, cancellation, async/await misuse, disposal, race conditions, and API/backward compatibility.
- Security: authorization at the resource boundary, validation, injection, secrets, unsafe deserialization, sensitive data leakage, and tenant isolation.
- EF Core/SQL: N+1 queries, accidental client evaluation, missing `AsNoTracking` on read-only queries, loading whole entities when projection is enough, premature `ToList`, repeated round trips, unbounded result sets, missing pagination, incorrect `Include`, non-sargable predicates, transaction/deadlock risks, and queries that cannot use an index. Prefer one simple, parameterized, set-based query when semantics allow it; do not suggest speculative indexes without evidence from the query shape.
- DI/dependency graph: missing registrations, wrong lifetime (especially singleton → scoped), captive dependencies, service-locator usage, circular dependencies, unnecessary abstractions, and constructors with too many unrelated dependencies. Check that new services are registered in the composition root and that the graph can be built.
- Design: classes that are not intended for inheritance should be `sealed`; avoid adding interfaces/factories without a real second implementation or test seam. Treat this as an improvement only when it prevents a real maintenance or correctness problem, not as a style-only comment.
- Maintainability/performance: prefer the smallest safe fix, reuse existing helpers, and flag complexity only when it can cause bugs or measurable waste.

For every finding, include the root cause, why the current code fails, and a concrete minimal fix. Suggestions are allowed when they materially improve correctness, performance, security, or maintainability; clearly label lower-severity improvements so they do not masquerade as bugs.

## 4. Write findings

Write a JSON array to a temp file **outside the repo** (e.g. `<os-temp>/mr-<iid>-findings.json`):

```json
[
  {
    "file": "path/to/file.ext",
    "line": 123,
    "severity": "Critical|High|Medium|Low",
    "comment": "توضیح مشکل (یافته) به زبان فارسی",
    "solution": "راه‌حل پیشنهادی برای رفع مشکل به زبان فارسی"
  }
]
```

Rules:
- `file`: repository-relative path with forward slashes, exactly as in the diff.
- `line`: line number in the NEW version of the file (`git show <head_sha>:<path>`), and it MUST be an added or context line in the MR diff. Never invent line numbers.
- `comment` and `solution`: written entirely in **Persian (Farsi)**. `comment` explains the finding precisely; `solution` gives a concrete, actionable fix (code is allowed).
- No issues → `[]`.

## 5. Confirm, then publish selectively

Do not dump every finding and ask for one blanket approval. Let the user control publication:

1. Number findings internally in the order written.
2. Offer two choices: **review one-by-one** (recommended) or **select finding numbers** (for example `1,3`).
3. For one-by-one approval, show only the current finding's severity, file/line, Persian comment, and solution; ask whether to publish it, skip it, or stop. Do not publish until the user explicitly approves that finding.
4. For selective approval, show the numbered compact list, ask for the numbers, and publish only those selected.
5. If the user chooses one-by-one, run:

```bash
node $SKILL/scripts/gitlab-mr.mjs publish --url <url> --project <project> --mr <iid> --findings <file> --head <head_sha> --interactive
```

For a preselected set, run:

```bash
node $SKILL/scripts/gitlab-mr.mjs publish --url <url> --project <project> --mr <iid> --findings <file> --head <head_sha> --only 1,3
```

Never use `--interactive` or `--only` as a substitute for user approval. If the user approves none, do not call GitLab. The publisher posts each selected finding as an inline discussion, falls back to a general MR note when the line is not in the diff, and posts a summary only for selected findings. If it says the MR has new commits, stop and re-run from step 2.

Report final counts (inline / general / failed) and list skipped findings locally; do not post skipped findings.
