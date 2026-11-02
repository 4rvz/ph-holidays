import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadYears } from './data.mjs';
import { validateYear } from './lib.mjs';

const OUT = fileURLToPath(new URL('../public/', import.meta.url));

const years = loadYears();
for (const { file, year, doc } of years) {
  if (validateYear(doc, year).length) {
    console.error(`data/${file} is invalid; run "npm run validate" for details`);
    process.exit(1);
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const { year, doc } of years) {
  writeFileSync(join(OUT, `${year}.json`), JSON.stringify(doc, null, 2) + '\n');
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ country: 'PH', years: years.map((y) => y.year) }, null, 2) + '\n');
writeFileSync(join(OUT, '.nojekyll'), '');
writeFileSync(join(OUT, 'index.html'), indexPage(years.map((y) => y.year)));

console.log(`Built ${years.length} year file(s) into public/`);

function indexPage(list) {
  const links = list.map((y) => `<li><a href="${y}.json">${y}.json</a></li>`).join('\n      ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PH Holidays</title>
  </head>
  <body>
    <h1>Philippine national holidays</h1>
    <p>One JSON file per year. Every holiday links to the proclamation it comes from.</p>
    <ul>
      ${links}
      <li><a href="index.json">index.json</a> (list of available years)</li>
    </ul>
  </body>
</html>
`;
}
