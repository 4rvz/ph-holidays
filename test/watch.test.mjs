import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAME_PLACEHOLDER, classify, decodeLawphil, insertHoliday, knownFrom, parseLawphilIndex, proclamationId, titleCase } from '../scripts/watch-lib.mjs';

// Real rows from https://lawphil.net/executive/proc/proc2026/proc2026.html, kept in the page's windows-1252 encoding.
const index = decodeLawphil(readFileSync(new URL('./fixtures/lawphil-proc2026.html', import.meta.url)));
// A frozen copy of data/2026.json, so these tests don't change as real holidays are added.
const seed = JSON.parse(readFileSync(new URL('./fixtures/2026-seed.json', import.meta.url), 'utf8'));
const known = () => knownFrom([{ year: 2026, doc: seed }], 2026);
const item = (title, text, link = 'https://lawphil.net/executive/proc/proc2026/proc_1500_2026.html') => ({ title, text, link, pubDate: '' });

test('reads numbers, links and titles from the real LawPhil index', () => {
  const items = parseLawphilIndex(index);
  assert.equal(items.length, 7);
  const eid = items.find((it) => it.title === 'Proclamation No. 1264, s. 2026');
  assert.equal(eid.link, 'https://lawphil.net/executive/proc/proc2026/proc_1264_2026.html');
  // The curly apostrophe in the windows-1252 page comes out as a plain one.
  assert.equal(eid.text, "Declaring Wednesday, 27 May 2026, a Regular Holiday Throughout the Country, in Observance of the Eid'l Adha (Feast of Sacrifice)");
  // The President's name LawPhil appends to some titles is dropped.
  assert.equal(items.find((it) => it.title.startsWith('Proclamation No. 1265,')).text, 'Amending Proclamtion No. 47 (s. 2001)');
});

test('on the real index: Eid proclamations already in data are skipped, local ones are skipped, the 2027 list is found', () => {
  const results = parseLawphilIndex(index).map((it) => classify(it, known()));
  const actionable = results.filter((r) => r.kind !== 'skip');
  assert.equal(actionable.length, 1);
  assert.equal(actionable[0].kind, 'annual');
  assert.equal(actionable[0].year, 2027);
  assert.deepEqual(actionable[0].id, { number: 1427, series: 2026 });
});

test('reads proclamation numbers with or without the comma', () => {
  assert.deepEqual(proclamationId('Proclamation No. 1427 s. 2026'), { number: 1427, series: 2026 });
  assert.deepEqual(proclamationId('Proclamation No. 1264, s. 2026'), { number: 1264, series: 2026 });
  assert.equal(proclamationId('Republic Act No. 12301'), null);
});

test('a new nationwide regular holiday becomes a ready-to-insert entry', () => {
  const r = classify(item('Proclamation No. 1500, s. 2026',
    'DECLARING MONDAY, 7 DECEMBER 2026, A REGULAR HOLIDAY THROUGHOUT THE COUNTRY IN OBSERVANCE OF THE FEAST OF SOMETHING (TEST)'), known());
  assert.equal(r.kind, 'holiday');
  assert.equal(r.year, 2026);
  assert.deepEqual(r.holiday, {
    date: '2026-12-07',
    name: 'Feast of Something',
    type: 'regular',
    proclamation: { number: 1500, series: 2026, url: 'https://lawphil.net/executive/proc/proc2026/proc_1500_2026.html' },
  });
});

test('reads special non-working and special working days, and month-first dates', () => {
  const nonWorking = classify(item('Proclamation No. 1501, s. 2026',
    'DECLARING DECEMBER 28, 2026 AS A SPECIAL (NON-WORKING) DAY THROUGHOUT THE COUNTRY'), known());
  assert.equal(nonWorking.holiday.date, '2026-12-28');
  assert.equal(nonWorking.holiday.type, 'special_non_working');
  assert.equal(nonWorking.holiday.name, NAME_PLACEHOLDER);

  const working = classify(item('Proclamation No. 1502, s. 2026',
    'DECLARING 29 DECEMBER 2026 A SPECIAL WORKING DAY THROUGHOUT THE COUNTRY'), known());
  assert.equal(working.holiday.type, 'special_working');
});

test('local proclamations are skipped', () => {
  const r = classify(item('Proclamation No. 1503, s. 2026',
    'DECLARING MONDAY, 7 DECEMBER 2026, A SPECIAL (NON-WORKING) DAY IN THE CITY OF ILOILO'), known());
  assert.equal(r.kind, 'skip');
});

test('nationwide but unreadable goes to review instead of guessing', () => {
  const r = classify(item('Proclamation No. 1504, s. 2026',
    'DECLARING THE FIRST MONDAY OF DECEMBER A HOLIDAY THROUGHOUT THE COUNTRY'), known());
  assert.equal(r.kind, 'review');
});

test('a date that is already a holiday goes to review', () => {
  const r = classify(item('Proclamation No. 1505, s. 2026',
    'DECLARING FRIDAY, 25 DECEMBER 2026, A SPECIAL (NON-WORKING) DAY THROUGHOUT THE COUNTRY'), known());
  assert.equal(r.kind, 'review');
  assert.match(r.reason, /Christmas Day/);
});

test('an amendment to the annual list goes to review', () => {
  const r = classify(item('Proclamation No. 1506, s. 2026',
    'AMENDING PROCLAMATION NO. 1006, S. 2025, MOVING THE OBSERVANCE OF NATIONAL HEROES DAY'), known());
  assert.equal(r.kind, 'review');
});

test('a holiday in a year with no data file yet goes to review', () => {
  const r = classify(item('Proclamation No. 1507, s. 2026',
    'DECLARING 10 MARCH 2027 A REGULAR HOLIDAY THROUGHOUT THE COUNTRY IN OBSERVANCE OF EID\'L FITR'), known());
  assert.equal(r.kind, 'review');
  assert.match(r.reason, /2027\.json/);
});

test('past years we do not keep are skipped', () => {
  const r = classify(item('Proclamation No. 900, s. 2025',
    'DECLARING 31 MARCH 2025 A REGULAR HOLIDAY THROUGHOUT THE COUNTRY IN OBSERVANCE OF EID\'L FITR'), known());
  assert.equal(r.kind, 'skip');
});

test('inserting keeps holidays sorted', () => {
  const doc = { year: 2026, country: 'PH', holidays: [{ date: '2026-01-01' }, { date: '2026-12-25' }] };
  assert.deepEqual(insertHoliday(doc, { date: '2026-06-01' }).holidays.map((h) => h.date), ['2026-01-01', '2026-06-01', '2026-12-25']);
});

test('title-cases names from the excerpt', () => {
  assert.equal(titleCase("EID'L ADHA"), "Eid'l Adha");
  assert.equal(titleCase('ARAW NG KAGITINGAN'), 'Araw ng Kagitingan');
});

test('reads the real 2026 Eid titles exactly as the data has them', () => {
  // Pretend the Eid days are not in the data yet.
  const withoutEid = { ...seed, holidays: seed.holidays.filter((h) => !h.name.startsWith('Eid')) };
  const k = knownFrom([{ year: 2026, doc: withoutEid }], 2026);
  const found = parseLawphilIndex(index).map((it) => classify(it, k)).filter((r) => r.kind === 'holiday').map((r) => r.holiday);
  // Same date, name, type and link as data/2026.json.
  const inData = seed.holidays.filter((h) => h.name.startsWith('Eid'));
  assert.deepEqual(found.sort((a, b) => a.date.localeCompare(b.date)), inData);
  assert.deepEqual(found.map(({ date, name, type }) => ({ date, name, type })), [
    { date: '2026-03-20', name: "Eid'l Fitr", type: 'regular' },
    { date: '2026-05-27', name: "Eid'l Adha", type: 'regular' },
  ]);
});
