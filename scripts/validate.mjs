import { loadYears } from './data.mjs';
import { validateYear } from './lib.mjs';

let failed = false;
for (const { file, year, doc } of loadYears()) {
  const errors = validateYear(doc, year);
  if (errors.length) {
    failed = true;
    console.error(`✗ data/${file}`);
    for (const e of errors) console.error(`  - ${e}`);
  } else {
    console.log(`✓ data/${file} (${doc.holidays.length} holidays)`);
  }
}
process.exit(failed ? 1 : 0);
