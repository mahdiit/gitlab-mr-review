---
name: gitlab-mr-review
description: Review a GitLab merge request as a senior .NET/C# code reviewer, include existing MR discussion context, classify every actionable finding, and let the user choose one-by-one GitLab publication or a Markdown report in Persian or English.
---

# GitLab MR Review

You are the reviewer. Use `scripts/gitlab-mr.mjs` (`$SKILL`) for GitLab and git setup. Requires Node 18+ and git.

## Mandatory workflow

### 1. Get the MR and its context

Resolve `GITLAB_URL`, project, MR IID, local repo, and `GITLAB_TOKEN` from the environment or the user's MR URL. If the token is missing, ask the user to set it in their shell; never print, pass, or save it.

Run:

```bash
node $SKILL/scripts/gitlab-mr.mjs prepare --url <url> --project <project> --mr <iid> --repo <repo>
```

Stop on any error. Keep `base_sha`, `head_sha`, `start_sha`, `repo_root`, and `rules_file`. The result includes `review_context` with existing non-system MR notes and discussion comments; read it before reviewing and use relevant unresolved comments as review context, not as new findings by default.

If `rules_file` is not null, read it. Project rules override this skill's defaults.

### 2. Review the complete change

Review only changes introduced by this MR, using:

```bash
git diff <base_sha> <head_sha>
git show <head_sha>:<path>
```

Read surrounding code and all relevant callers before deciding. Check the whole changed code for correctness, security, nullability, boundaries, state transitions, exceptions, cancellation, async/disposal, races, compatibility, authorization, validation/injection/secrets/tenant isolation, EF Core and SQL query shape, DI registrations/lifetimes/cycles, API behavior, measurable performance waste, maintainability, and material simplifications. Check tests and configuration touched by the MR. Do not report praise, formatting, compiler/linter issues, speculative concerns, or style-only preferences.

Every finding must be actionable and high-confidence, and must include:

- root cause;
- why the current code fails or creates material risk;
- the smallest concrete fix;
- repository-relative `file` using forward slashes;
- `line` from the NEW file version, on an added or context line in the MR diff.

Classify every finding with exactly one category: `Critical`, `High`, `Medium`, `Low`, or `Improvement`. `Improvement` is for a material quality/performance/maintainability improvement that is not a defect; never use it for a style-only suggestion.

### 3. Ask how to deliver findings

After the complete review, do not publish or write a report yet. Ask the user two choices:

1. **Review findings one by one and optionally publish each to GitLab** (recommended).
2. **Write all findings to a Markdown file in the repository root**.

For the Markdown option, ask for the report language: **Persian** or **English**. Use a sensible default only if the user explicitly delegates the choice. The report filename should be `MR-<iid>-REVIEW.md` unless the user chooses another name.

For one-by-one review, show only the current finding's category, file/line, finding, and solution. Ask whether to publish it to GitLab, skip it, or stop. Never publish without explicit approval. Continue until all findings are handled. If the user asks to publish selected findings instead, show a numbered compact list and publish only the numbers they explicitly select.

### 4A. Write a Markdown report

Write the selected language in the repository root. Include every finding, grouped in this order:

1. Critical
2. High
3. Medium
4. Low
5. Improvement

Each entry must contain:

```markdown
### [Category] — `path/to/file.ext:123`

**Finding:** ...

**Solution:** ...
```

Use the actual NEW-file line. If there are no findings, write a short report stating that no actionable findings were found. Do not modify the MR source code. Tell the user the exact report path.

### 4B. Publish approved findings to GitLab

First write a JSON array outside the repository, for example `<os-temp>/mr-<iid>-findings.json`:

```json
[
  {
    "file": "path/to/file.ext",
    "line": 123,
    "severity": "Critical|High|Medium|Low|Improvement",
    "comment": "Finding in the selected language",
    "solution": "Concrete minimal solution in the selected language"
  }
]
```

Run only after explicit approval:

```bash
node $SKILL/scripts/gitlab-mr.mjs publish --url <url> --project <project> --mr <iid> --findings <file> --head <head_sha> --language fa|en --only 1,3
```

For one-by-one approval, `--interactive` is allowed only after the user selected that mode and the helper's prompts match the already shown findings. Never use `--only` or `--interactive` as a substitute for approval. If the MR has new commits, stop and restart at step 1. Report inline, general, and failed counts, plus skipped findings. If none are approved, do not call GitLab.

## Default .NET checklist

- Correctness: nullability, boundaries, state, exceptions, cancellation, async/await, disposal, races, compatibility.
- Security: authorization at the resource boundary, validation, injection, secrets, unsafe deserialization, sensitive-data leakage, tenant isolation.
- EF Core/SQL: N+1, client evaluation, missing `AsNoTracking` for read-only queries, over-fetching, premature materialization, repeated round trips, unbounded results, pagination, `Include`, non-sargable predicates, transaction/deadlock risks, and query/index mismatch.
- DI: missing registrations, wrong lifetimes, captive dependencies, service locator, cycles, unnecessary abstractions, and overly coupled constructors.
- Design: mark classes `sealed` only when it materially prevents a maintenance problem; do not report style-only sealing or speculative abstractions.
- Maintainability/performance: prefer the smallest safe fix and existing helpers; report complexity only when it can cause bugs or measurable waste.
