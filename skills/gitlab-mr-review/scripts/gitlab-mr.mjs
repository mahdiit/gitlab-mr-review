#!/usr/bin/env node
// GitLab MR helper for the gitlab-mr-review skill. Node 18+, no dependencies.
//   prepare  --project <path|id> --mr <iid> [--repo <dir>] [--url <gitlab>]
//   publish  --project <path|id> --mr <iid> --findings <file.json> --head <sha> [--url <gitlab>] [--language fa|en]
//   selftest
// Token is read from GITLAB_TOKEN only (never pass it on the command line).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import assert from 'node:assert/strict';

const die = (msg) => { console.error(`ERROR: ${msg}`); process.exit(1); };

// Unified diff -> Map(newLine -> oldLine | null). null = added line, number = context line.
// Only lines present in the map can carry an inline GitLab comment on the new side.
export function diffLineMap(diff) {
  const map = new Map();
  let o = 0, n = 0, oLeft = 0, nLeft = 0, inHunk = false;
  for (const raw of (diff || '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('diff --git')) { inHunk = false; continue; }
    const h = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (h) {
      o = +h[1]; n = +h[3];
      oLeft = h[2] === undefined ? 1 : +h[2]; // omitted count means 1
      nLeft = h[4] === undefined ? 1 : +h[4];
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith('\\')) continue; // "\ No newline at end of file"
    if (line.startsWith('+')) { map.set(n++, null); nLeft--; }
    else if (line.startsWith('-')) { o++; oLeft--; }
    else { map.set(n++, o++); oLeft--; nLeft--; }
    if (oLeft <= 0 && nLeft <= 0) inHunk = false; // ignore trailing junk after the hunk
  }
  return map;
}

export function resolvePath(p, known) {
  if (!p) return null;
  p = p.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (known.includes(p)) return p;
  const lp = p.toLowerCase();
  return known.find((k) => k.toLowerCase() === lp)
    ?? known.find((k) => k.toLowerCase().endsWith(`/${lp}`) || lp.endsWith(`/${k.toLowerCase()}`))
    ?? null;
}

export function parseFindings(text) {
  let t = (text || '').trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const s = t.indexOf('['), e = t.lastIndexOf(']');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  if (!t) return [];
  return [].concat(JSON.parse(t) ?? []).filter((f) => f && f.file);
}

const BADGE = { Critical: '🔴 Critical', High: '🟠 High', Medium: '🟡 Medium', Low: '🔵 Low', Improvement: '🔧 Improvement' };

function findingBody(f, language = 'fa') {
  const lines = [`**${BADGE[f.severity] ?? '⚪ Info'}**`, ''];
  const labels = language === 'en'
    ? { finding: 'Finding', solution: 'Suggested solution', empty: '_No description_' }
    : { finding: 'یافته', solution: 'راه‌حل', empty: '_بدون توضیح_' };
  if (f.comment) lines.push(`**${labels.finding}:**`, String(f.comment));
  if (f.solution) lines.push('', `**${labels.solution}:**`, String(f.solution));
  if (!f.comment && !f.solution) lines.push(labels.empty);
  return lines.join('\n');
}

function selftest() {
  const diff = 'diff --git a/x b/x\n@@ -1,3 +1,4 @@\n a\n-b\n+B\n+C\n c\n\\ No newline at end of file\n';
  assert.deepEqual([...diffLineMap(diff)], [[1, 1], [2, null], [3, null], [4, 3]]);
  assert.deepEqual([...diffLineMap('@@ -0,0 +1 @@\n+only\n')], [[1, null]]);
  const known = ['src/Api/Order.cs', 'web/app.ts'];
  assert.equal(resolvePath('.\\src\\api\\order.cs', known), 'src/Api/Order.cs');
  assert.equal(resolvePath('app.ts', known), 'web/app.ts');
  assert.equal(resolvePath('nope.ts', known), null);
  assert.equal(parseFindings('```json\n[{"file":"a","line":1}]\n```').length, 1);
  assert.deepEqual(parseFindings('[]'), []);
  console.log('selftest ok');
}

// ---------------------------------------------------------------------------
const { positionals: [cmd], values: opt } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: process.env.GITLAB_URL },
    project: { type: 'string' },
    mr: { type: 'string' },
    repo: { type: 'string', default: '.' },
    findings: { type: 'string' },
    head: { type: 'string' },
    only: { type: 'string' },
    language: { type: 'string', default: 'fa' },
    interactive: { type: 'boolean', default: false },
  },
});

if (cmd === 'selftest') { selftest(); process.exit(0); }
if (cmd !== 'prepare' && cmd !== 'publish') die('usage: gitlab-mr.mjs prepare|publish|selftest [options]');

const token = process.env.GITLAB_TOKEN;
if (!token) die('GITLAB_TOKEN environment variable is not set.');
if (!opt.url) die('GitLab URL missing: pass --url or set GITLAB_URL.');
if (!opt.project) die('--project is required.');
if (!/^\d+$/.test(opt.mr ?? '')) die('--mr must be the numeric merge request IID.');
if (opt.language !== 'fa' && opt.language !== 'en') die('--language must be fa or en.');

const mrPath = `${opt.url.replace(/\/+$/, '')}/api/v4/projects/${encodeURIComponent(opt.project)}/merge_requests/${opt.mr}`;

async function gl(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'PRIVATE-TOKEN': token, ...(body && { 'Content-Type': 'application/json; charset=utf-8' }) },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const mr = await gl('GET', mrPath).catch((e) => die(e.message));
const { base_sha, head_sha, start_sha } = mr.diff_refs ?? {};
if (!base_sha || !head_sha || !start_sha) die('Merge request diff references are missing. The MR may have no changes yet.');

if (cmd === 'prepare') {
  if (!existsSync(opt.repo)) die(`Repository path does not exist: ${opt.repo}`);
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
  let root;
  try { root = git(opt.repo, 'rev-parse', '--show-toplevel'); } catch { die(`Invalid Git repository: ${opt.repo}`); }
  if (git(root, 'status', '--porcelain')) die('Working tree is not clean. Commit or stash changes first.');
  // refs/merge-requests/<iid>/head also works for MRs opened from a fork.
  try {
    git(root, 'fetch', 'origin',
      `+refs/heads/${mr.target_branch}:refs/remotes/origin/${mr.target_branch}`,
      `+refs/merge-requests/${opt.mr}/head:refs/remotes/origin/mr-${opt.mr}`);
  } catch { die('git fetch failed.'); }
  for (const sha of [base_sha, head_sha]) {
    try { git(root, 'cat-file', '-e', `${sha}^{commit}`); } catch { die(`Commit ${sha} is not available locally after fetch.`); }
  }
  const rules = join(root, 'agent.md');
  const [notes, discussions] = await Promise.all([
    gl('GET', `${mrPath}/notes?per_page=100`).catch(() => []),
    gl('GET', `${mrPath}/discussions?per_page=100`).catch(() => []),
  ]);
  const review_context = {
    notes: (notes ?? []).filter((n) => !n.system).map(({ id, author, body, created_at }) => ({ id, author: author?.username, body, created_at })),
    discussions: (discussions ?? []).map((d) => ({
      id: d.id,
      notes: (d.notes ?? []).filter((n) => !n.system).map(({ id, author, body, created_at, resolved }) => ({ id, author: author?.username, body, created_at, resolved })),
    })),
  };
  console.log(JSON.stringify({
    title: mr.title, web_url: mr.web_url,
    source_branch: mr.source_branch, target_branch: mr.target_branch,
    base_sha, head_sha, start_sha, repo_root: root,
    rules_file: existsSync(rules) ? rules : null,
    review_context,
    diff_command: `git diff ${base_sha} ${head_sha}`,
    show_command: `git show ${head_sha}:<path>`,
  }, null, 2));
  process.exit(0);
}

// ---- publish ---------------------------------------------------------------
if (!opt.findings) die('--findings is required.');
if (!opt.head) die('--head is required (head_sha printed by prepare).');
if (opt.head !== head_sha) die(`MR has new commits since the review (head is now ${head_sha}). Re-run the review.`);

let findings;
try { findings = parseFindings(readFileSync(opt.findings, 'utf8')); } catch (e) { die(`Invalid findings JSON: ${e.message}`); }
if (!findings.length) { console.log('No findings. Nothing to publish.'); process.exit(0); }

// Selection happens before any GitLab write. --only uses 1-based finding numbers;
// --interactive asks for approval immediately before each individual post.
if (opt.only) {
  const indexes = new Set(opt.only.split(',').map((x) => Number.parseInt(x.trim(), 10)).filter((x) => x > 0));
  findings = findings.filter((_, i) => indexes.has(i + 1));
  if (!findings.length) die('--only did not select any valid finding number.');
}
let promptEach = null;
if (opt.interactive) {
  promptEach = createInterface({ input, output });
  const selected = [];
  for (const [i, f] of findings.entries()) {
    console.log(`\n[${i + 1}/${findings.length}] ${f.severity ?? 'Info'} ${f.file}:${f.line}`);
    console.log(String(f.comment ?? ''));
    const answer = (await promptEach.question('Publish this finding? [y]es/[n]o/[q]uit: ')).trim().toLowerCase();
    if (answer === 'q') break;
    if (answer === 'y' || answer === 'yes') selected.push(f);
  }
  promptEach.close();
  findings = selected;
}
if (!findings.length) { console.log('No findings selected. Nothing to publish.'); process.exit(0); }

const { changes } = await gl('GET', `${mrPath}/changes`).catch((e) => die(e.message));
const files = {}; // new_path -> { old_path, map }
for (const c of changes ?? []) {
  if (!c.new_path) continue;
  const np = c.new_path.replace(/\\/g, '/');
  files[np] = { old_path: (c.old_path || np).replace(/\\/g, '/'), map: diffLineMap(c.diff) };
}
const known = Object.keys(files);

let inline = 0, general = 0, failed = 0;
const unanchored = [];
for (const f of findings) {
  const line = parseInt(f.line, 10) || 0;
  const label = `${f.file}:${line}`;
  const body = findingBody(f, opt.language);
  const path = resolvePath(String(f.file), known);
  // "line" is a NEW-file line; never map it onto the old side (that is unrelated code).
  if (path && files[path].map.has(line)) {
    const oldLine = files[path].map.get(line);
    const position = {
      position_type: 'text', base_sha, head_sha, start_sha,
      old_path: files[path].old_path, new_path: path, new_line: line,
      ...(oldLine !== null && { old_line: oldLine }), // context lines need both sides
    };
    try {
      await gl('POST', `${mrPath}/discussions`, { body, position });
      console.log(`inline   ${label}`);
      inline++;
      continue;
    } catch (e) {
      console.log(`rejected ${label} -> general note (${e.message})`);
    }
  } else {
    console.log(`general  ${label} (not on a changed line)`);
  }
  unanchored.push(label);
  try {
    await gl('POST', `${mrPath}/notes`, { body: `\`${label}\`\n\n${body}` });
    general++;
  } catch (e) {
    failed++;
    console.log(`FAILED   ${label} (${e.message})`);
  }
}

const summary = [
  '## 🤖 بازبینی خودکار کد',
  '',
  `**تعداد کل یافته‌ها:** ${findings.length}`,
  `- کامنت درون‌خطی (روی فایل و خط): **${inline}**`,
  `- کامنت عمومی (خط خارج از تغییرات MR): **${general}**`,
  ...(failed ? [`- ناموفق: **${failed}**`] : []),
  ...(unanchored.length ? ['', '<details><summary>یافته‌های خارج از محدوده دیف</summary>', '',
    ...unanchored.map((u) => `- \`${u}\``), '', '</details>'] : []),
].join('\n');
await gl('POST', `${mrPath}/notes`, { body: summary }).catch((e) => console.log(`Failed to publish summary: ${e.message}`));

console.log(`\nDone. Inline: ${inline}, General: ${general}, Failed: ${failed}`);
