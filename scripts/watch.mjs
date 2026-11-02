// Daily check of the Official Gazette for new nationwide holiday proclamations.
// Opens a pull request for each one (or an issue when it can't be read safely). Never merges.
//
//   node scripts/watch.mjs --dry-run                      # fetch and report, change nothing
//   node scripts/watch.mjs --feed-file feed.xml --dry-run # use a saved feed instead of fetching
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, formatYear, loadYears } from './data.mjs';
import { NAME_PLACEHOLDER, classify, insertHoliday, knownFrom, parseFeed } from './watch-lib.mjs';

// Two searches, a few seconds apart. The Gazette blocks IPs after ~25 requests in a row.
const FEEDS = [
  'https://www.officialgazette.gov.ph/feed/?s=holiday',
  'https://www.officialgazette.gov.ph/feed/?s=%22throughout+the+country%22',
];
const USER_AGENT = 'ph-holidays-watcher (+https://github.com/)';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const feedFiles = args.flatMap((a, i) => (a === '--feed-file' ? [args[i + 1]] : []));

const xmls = feedFiles.length ? feedFiles.map((f) => readFileSync(f, 'utf8')) : await fetchFeeds();
const items = dedupe(xmls.flatMap(parseFeed));
const known = knownFrom(loadYears(), manilaYear());
const results = items.map((item) => ({ ...classify(item, known), item }));

for (const r of results) {
  const what = r.kind === 'skip' ? `skip (${r.reason})` : r.kind === 'review' ? `review: ${r.reason}` : r.kind;
  console.log(`${r.item.title} → ${what}`);
}
const actionable = results.filter((r) => r.kind !== 'skip');
console.log(`\n${items.length} feed item(s), ${actionable.length} need attention.`);

if (dryRun || actionable.length === 0) process.exit(0);

for (const r of actionable) {
  if (r.kind === 'review') openIssue(r);
  else openPullRequest(r);
}

async function fetchFeeds() {
  const out = [];
  for (const [i, url] of FEEDS.entries()) {
    if (i > 0) await new Promise((done) => setTimeout(done, 5000));
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('xml')) throw new Error(`${url} returned ${res.status} ${type}; the Gazette may be blocking this runner`);
    out.push(await res.text());
  }
  return out;
}

function openPullRequest(r) {
  const { number, series } = r.id;
  const branch = `watch/proc-${number}-s${series}`;
  if (prExists(branch)) return console.log(`PR for ${branch} already exists (open or closed), skipping`);

  git('switch', '-C', branch, 'origin/main');
  const file = join(DATA_DIR, `${r.year}.json`);
  let title;
  let body;
  if (r.kind === 'annual') {
    writeJson(file, { year: r.year, country: 'PH', holidays: [] });
    title = `Add ${r.year} holidays from Proclamation No. ${number} s. ${series}`;
    body = annualBody(r);
  } else {
    writeJson(file, insertHoliday(JSON.parse(readFileSync(file, 'utf8')), r.holiday));
    const h = r.holiday;
    const label = h.name === NAME_PLACEHOLDER ? `${h.type} day` : h.name;
    title = `Add ${label} (${h.date}, ${h.type}) from Proclamation No. ${number} s. ${series}`;
    body = holidayBody(r, runTests());
  }

  git('add', file);
  git('commit', '-m', title);
  git('push', '-u', 'origin', branch);
  gh('pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body', body);
  git('switch', 'main');
  console.log(`Opened PR: ${title}`);
}

function openIssue(r) {
  const { number, series } = r.id;
  const title = `Check Proclamation No. ${number} s. ${series}`;
  const existing = JSON.parse(gh('issue', 'list', '--state', 'all', '--search', `"${title}" in:title`, '--json', 'number'));
  if (existing.length) return console.log(`Issue "${title}" already exists, skipping`);
  gh('issue', 'create', '--title', title, '--body', [
    `The daily Gazette check found a nationwide proclamation it could not add on its own: **${r.reason}**.`,
    '',
    `> ${r.item.text}`,
    '',
    `- Gazette: ${r.item.link}`,
    `- LawPhil (may not be up yet): ${lawphil(number, series)}`,
    '',
    'If it changes the holidays, edit the right `data/<year>.json` by hand and open a pull request.',
  ].join('\n'));
  console.log(`Opened issue: ${title}`);
}

function holidayBody(r, tests) {
  const h = r.holiday;
  const needsName = h.name === NAME_PLACEHOLDER;
  return [
    `Found by the daily Gazette check. **Check this against the proclamation before merging.**`,
    '',
    '| date | name | type |',
    '|---|---|---|',
    `| ${h.date} | ${h.name} | \`${h.type}\` |`,
    '',
    'Gazette excerpt:',
    `> ${r.item.text}`,
    '',
    `- Gazette: ${r.item.link}`,
    `- LawPhil (may not be up yet): ${lawphil(r.id.number, r.id.series)}`,
    '',
    '- [ ] Date, type and name match the proclamation',
    ...(needsName ? ['- [ ] **Replace the placeholder name** (the excerpt did not say what the day is for; checks fail until you do)'] : []),
    ...(h.type === 'regular' ? [`- [ ] **Regular holiday:** add ${h.date} to the pinned list in \`test/data.test.mjs\` (checks fail until you do)`] : []),
    '- [ ] Optional: switch the link to LawPhil once it is up',
    '',
    `Checks on this branch: ${tests.ok ? 'passed ✅' : 'failed ❌'}`,
    ...(tests.ok ? [] : ['```', tests.output.slice(-3000), '```']),
  ].join('\n');
}

function annualBody(r) {
  return [
    `Found by the daily Gazette check: the annual holiday list for **${r.year}**.`,
    '',
    `> ${r.item.text}`,
    '',
    `- Gazette: ${r.item.link}`,
    `- LawPhil (may not be up yet): ${lawphil(r.id.number, r.id.series)}`,
    '',
    `The feed only shows an excerpt, so \`data/${r.year}.json\` was created **empty**. Checks fail until it is filled in.`,
    '',
    `- [ ] Add every day from the proclamation, each linked to it`,
    `- [ ] Add pinned dates for ${r.year} to \`test/data.test.mjs\`, like the 2026 ones`,
    `- [ ] Eid'l Fitr and Eid'l Adha come later in separate proclamations; leave them out for now`,
  ].join('\n');
}

function runTests() {
  const res = spawnSync('npm', ['test'], { encoding: 'utf8' });
  return { ok: res.status === 0, output: `${res.stdout}\n${res.stderr}` };
}

function prExists(branch) {
  return JSON.parse(gh('pr', 'list', '--state', 'all', '--head', branch, '--json', 'number')).length > 0;
}

function lawphil(number, series) {
  return `https://lawphil.net/executive/proc/proc${series}/proc_${number}_${series}.html`;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((it) => !seen.has(it.link) && seen.add(it.link));
}

function manilaYear() {
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()));
}

function writeJson(file, doc) {
  writeFileSync(file, formatYear(doc));
}

function git(...a) {
  return execFileSync('git', a, { encoding: 'utf8' });
}

function gh(...a) {
  return execFileSync('gh', a, { encoding: 'utf8' });
}
