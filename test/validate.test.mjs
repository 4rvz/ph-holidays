import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateYear } from '../scripts/lib.mjs';

const URL_1006 = 'https://lawphil.net/executive/proc/proc2025/proc_1006_2025.html';
const holiday = (over = {}) => ({
  date: '2026-01-01',
  name: "New Year's Day",
  type: 'regular',
  proclamation: { number: 1006, series: 2025, url: URL_1006 },
  ...over,
});
const year = (holidays) => ({ year: 2026, country: 'PH', holidays });

test('accepts a valid year', () => {
  assert.deepEqual(validateYear(year([holiday()]), 2026), []);
});

test('rejects a year that does not match the file name', () => {
  assert.match(validateYear({ ...year([holiday()]), year: 2025 }, 2026)[0], /year must be 2026/);
});

test('rejects impossible dates and dates outside the year', () => {
  assert.equal(validateYear(year([holiday({ date: '2026-02-30' })]), 2026).length, 1);
  assert.equal(validateYear(year([holiday({ date: '2027-01-01' })]), 2026).length, 1);
});

test('rejects duplicate and unsorted dates', () => {
  const dup = validateYear(year([holiday(), holiday()]), 2026);
  assert.ok(dup.some((e) => /listed twice/.test(e)));
  const unsorted = validateYear(year([holiday({ date: '2026-05-01' }), holiday({ date: '2026-04-09' })]), 2026);
  assert.ok(unsorted.some((e) => /out of order/.test(e)));
});

test('rejects unknown types, like a generic "Public"', () => {
  assert.match(validateYear(year([holiday({ type: 'Public' })]), 2026)[0], /type must be one of/);
});

test('rejects proclamation links that are not on a trusted source', () => {
  const bad = holiday({ proclamation: { number: 1006, series: 2025, url: 'https://example.com/p.html' } });
  assert.match(validateYear(year([bad]), 2026)[0], /proclamation.url/);
});

test('rejects unknown fields so typos do not slip through', () => {
  assert.match(validateYear(year([holiday({ tpye: 'regular' })]), 2026)[0], /unknown field "tpye"/);
});

test('rejects the placeholder name the watcher uses when it cannot read one', () => {
  assert.match(validateYear(year([holiday({ name: 'TODO: name this holiday' })]), 2026)[0], /placeholder/);
});
