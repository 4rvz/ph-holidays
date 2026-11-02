import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

// Every data/<year>.json, oldest first.
export function loadYears() {
  return readdirSync(DATA_DIR)
    .filter((f) => /^\d{4}\.json$/.test(f))
    .sort()
    .map((file) => ({
      file,
      year: Number(file.slice(0, 4)),
      doc: JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')),
    }));
}

// The layout data files are kept in: one holiday per line, so a new holiday is a one-line diff.
export function formatYear(doc) {
  const lines = doc.holidays.map((h) => `    ${oneLine(h)}`).join(',\n');
  const holidays = doc.holidays.length ? `[\n${lines}\n  ]` : '[]';
  return `{\n  "year": ${doc.year},\n  "country": ${JSON.stringify(doc.country)},\n  "holidays": ${holidays}\n}\n`;
}

function oneLine(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${oneLine(x)}`).join(', ')} }`;
}
