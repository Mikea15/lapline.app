// scripts/publish/make-public-snapshot.mjs - builds the public "lapline" repo
// from this private one: the committed tree at HEAD minus everything private,
// as a brand-new repo with one commit and no history (the private history
// contains real recordings, which a public push would expose even after
// deletion). It only creates the folder and the local commit - pushing it to
// GitHub is a separate, manual step.
//
//   node scripts/publish/make-public-snapshot.mjs ../lapline
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? '../lapline');

// Never published: real recordings, internal working notes, design handoffs
// (real routes and Garmin Connect screenshots), local tooling.
const EXCLUDE = [
  /^stub-data\//,
  /^design_handoff_[^/]+\//,
  /^\.claude\//,
  /^reports\//,
  /^bug-list[^/]*\.md$/,
  /^next-steps\.md$/,
  /^plan\.md$/,
  /^launch-tasks\.md$/,
  /^publish\.md$/,
  /^run\.bat$/,
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

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (git('status', '--porcelain', '--untracked-files=no')) {
  console.warn('Note: uncommitted changes are NOT included - the snapshot is built from HEAD.');
}
if (fs.existsSync(out) && fs.readdirSync(out).length > 0) {
  console.error(`${out} already exists and isn't empty - pick a new folder.`);
  process.exit(1);
}

const files = git('ls-tree', '-r', '--name-only', 'HEAD')
  .split('\n')
  .filter((f) => f && !EXCLUDE.some((re) => re.test(f)));

const problems = [];
for (const f of files) {
  const data = execFileSync('git', ['cat-file', 'blob', `HEAD:${f}`], { maxBuffer: 256 * 1024 * 1024 }); // binaries (the tour video) exceed the 1 MB default
  const dest = path.join(out, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
  if (!data.includes(0)) {
    const text = data.toString('utf8');
    for (const re of LEAKS) if (re.test(text)) problems.push(`${f}: matches ${re}`);
  }
}

const gitignore = path.join(out, '.gitignore');
fs.appendFileSync(gitignore, '\n# Private real recordings - never published (see scripts/demo/).\nstub-data/\n');

if (problems.length) {
  console.error('Possible private details found - fix these in the private repo, commit, and re-run:');
  for (const p of problems) console.error('  ' + p);
  fs.rmSync(out, { recursive: true, force: true });
  process.exit(1);
}

const name = git('config', 'user.name');
const email = git('config', 'user.email');
const inOut = (...args) => execFileSync('git', args, { cwd: out, stdio: 'inherit' });
inOut('init', '-q', '-b', 'main');
inOut('add', '-A');
inOut('-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', 'Lapline: initial public release');

console.log(`\nPublic snapshot ready in ${out}: ${files.length} files, one commit, no history.`);
console.log('Nothing has been pushed. To publish it:');
console.log('  1. Create an empty public GitHub repo named "lapline" (no README or licence, so there is nothing to merge).');
console.log(`  2. cd ${out} && git remote add origin https://github.com/<you>/lapline.git && git push -u origin main`);
