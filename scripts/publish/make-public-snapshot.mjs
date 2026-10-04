// scripts/publish/make-public-snapshot.mjs - builds the public "lapline" repo
// from this private one: the committed tree at HEAD minus everything private,
// as a brand-new repo with one commit and no history (the private history
// contains real recordings, which a public push would expose even after
// deletion). It only makes the local commit - pushing it to GitHub is a
// separate, manual step.
//
//   node scripts/publish/make-public-snapshot.mjs ../lapline.app
//     new folder: a fresh repo with one commit (the first release)
//   node scripts/publish/make-public-snapshot.mjs ../lapline.app "Message"
//     existing clone of the public repo: replaces its files with HEAD's
//     filtered tree and commits the difference on top, with that message
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? '../lapline.app');
const message = process.argv[3];

// Never published: real recordings, internal working notes, design handoffs
// (real routes and Garmin Connect screenshots), local tooling.
const EXCLUDE = [
  /^stub-data\//,
  /^design_handoff_[^/]+\//,
  /^\.claude\//,
  /^AGENTS\.md$/,
  /^reports\//,
  /^bug-list[^/]*\.md$/,
  /^next-steps\.md$/,
  /^plan\.md$/,
  /^i18n-plan\.md$/,
  // Working notes at the root (plans, task lists): only the README is public.
  /^(?!README\.md$)[^/]+\.md$/,
  /^launch-tasks\.md$/,
  /^publish\.md$/,
  /^run\.bat$/,
  /^deploy\.bat$/,
  /^scripts\/publish\/leak-patterns\.txt$/
];
// Anything matching these in the output aborts the snapshot. They live in a
// file of their own (never published), since the patterns themselves name
// private places and accounts.
const LEAKS = fs
  .readFileSync(new URL('./leak-patterns.txt', import.meta.url), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => new RegExp(l, 'i'));
// The secret seed the demo/fixture anonymising draws from (scripts/demo/
// anonymise.ts) is git-ignored, so it should never be in HEAD - but if it
// ever is, anywhere, refuse.
for (const seed of [process.env.LAPLINE_ANONYMISE_SEED, fs.existsSync('stub-data/anonymise-seed.txt') ? fs.readFileSync('stub-data/anonymise-seed.txt', 'utf8') : '']) {
  if (seed?.trim()) LEAKS.push(new RegExp(seed.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const inOut = (...args) => execFileSync('git', args, { cwd: out, encoding: 'utf8' }).trim();

if (git('status', '--porcelain', '--untracked-files=no')) {
  console.warn('Note: uncommitted changes are NOT included - the snapshot is built from HEAD.');
}
const update = fs.existsSync(path.join(out, '.git'));
if (update) {
  if (!message) {
    console.error('Updating an existing public repo needs a commit message as the second argument.');
    process.exit(1);
  }
  if (inOut('status', '--porcelain')) {
    console.error(`${out} has uncommitted changes - commit or discard them first.`);
    process.exit(1);
  }
} else if (fs.existsSync(out) && fs.readdirSync(out).length > 0) {
  console.error(`${out} already exists, isn't empty and isn't a git repo - pick a new folder.`);
  process.exit(1);
}

const files = git('ls-tree', '-r', '--name-only', 'HEAD')
  .split('\n')
  .filter((f) => f && !EXCLUDE.some((re) => re.test(f)));

// Read and check everything before touching the output folder, so a leak
// never leaves a half-written repo behind. Paths are checked as well as
// contents: a file's name can leak as much as what's in it.
const blobs = new Map();
const problems = [];
for (const f of files) {
  for (const re of LEAKS) if (re.test(f)) problems.push(`${f}: path matches ${re}`);
  const data = execFileSync('git', ['cat-file', 'blob', `HEAD:${f}`], { maxBuffer: 256 * 1024 * 1024 }); // binaries (the tour video) exceed the 1 MB default
  blobs.set(f, data);
  if (!data.includes(0)) {
    const text = data.toString('utf8');
    for (const re of LEAKS) if (re.test(text)) problems.push(`${f}: contents match ${re}`);
  }
}
if (problems.length) {
  console.error('Possible private details found - fix these in the private repo, commit, and re-run:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

if (update) {
  // Start from an empty tree so files deleted in the private repo go too.
  for (const entry of fs.readdirSync(out)) {
    if (entry !== '.git') fs.rmSync(path.join(out, entry), { recursive: true, force: true });
  }
}
for (const [f, data] of blobs) {
  const dest = path.join(out, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
}
fs.appendFileSync(path.join(out, '.gitignore'), '\n# Private real recordings - never published (see scripts/demo/).\nstub-data/\n');

const name = git('config', 'user.name');
const email = git('config', 'user.email');
if (!update) inOut('init', '-q', '-b', 'main');
inOut('add', '-A');
if (update && !inOut('status', '--porcelain')) {
  console.log(`\nNothing changed - ${out} already matches HEAD.`);
  process.exit(0);
}
inOut('-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', message ?? 'Lapline: initial public release');

console.log(`\n${update ? 'Committed on top of' : 'Public snapshot ready in'} ${out}: ${files.length} files.`);
console.log(inOut('show', '--stat', '--format=%h %s', 'HEAD'));
console.log(`\nNothing has been pushed. Review it, then: cd ${out} && git push`);
