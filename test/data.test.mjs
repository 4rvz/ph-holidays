import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, formatYear, loadYears } from '../scripts/data.mjs';
import { validateYear } from '../scripts/lib.mjs';

test('every data file is valid', () => {
  for (const { file, year, doc } of loadYears()) {
    assert.deepEqual(validateYear(doc, year), [], `data/${file}`);
  }
});

// Payroll depends on regular holidays being exactly right, so pin them. A new regular holiday
// must be added here too, on purpose. Source: Proc. 1006 s. 2025, plus Proc. 1189 and 1264 s. 2026.
test('2026 regular holidays match the proclamations', () => {
  const doc = loadYears().find((y) => y.year === 2026).doc;
  const regular = doc.holidays.filter((h) => h.type === 'regular').map((h) => h.date);
  assert.deepEqual(regular, [
    '2026-01-01', '2026-03-20', '2026-04-02', '2026-04-03', '2026-04-09', '2026-05-01',
    '2026-05-27', '2026-06-12', '2026-08-31', '2026-11-30', '2026-12-25', '2026-12-30',
  ]);
});

// Special days can be added during the year, so only check that none of these went missing.
test('2026 still has the special days from Proc. 1006 s. 2025', () => {
  const doc = loadYears().find((y) => y.year === 2026).doc;
  const typeOf = new Map(doc.holidays.map((h) => [h.date, h.type]));
  const expected = {
    special_non_working: ['2026-02-17', '2026-04-04', '2026-08-21', '2026-11-01', '2026-11-02', '2026-12-08', '2026-12-24', '2026-12-31'],
    special_working: ['2026-02-25'],
  };
  for (const [type, dates] of Object.entries(expected)) {
    for (const date of dates) assert.equal(typeOf.get(date), type, date);
  }
});

test('data files use the one-holiday-per-line layout', () => {
  for (const { file, doc } of loadYears()) {
    assert.equal(readFileSync(join(DATA_DIR, file), 'utf8'), formatYear(doc), `data/${file}: rewrite it with formatYear`);
  }
});
