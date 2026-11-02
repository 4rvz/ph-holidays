// Pure helpers for the Official Gazette watcher. No network or git here, so it can be tested offline.

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const MONTH = MONTHS.join('|');
const DAY_FIRST = new RegExp(`\\b(\\d{1,2}) (${MONTH}),? (\\d{4})\\b`);
const MONTH_FIRST = new RegExp(`\\b(${MONTH}) (\\d{1,2}),? (\\d{4})\\b`);
const TYPE_PHRASE = /\b(?:AS )?A (REGULAR HOLIDAY|SPECIAL \(?(NON-WORKING|WORKING)\)? (?:DAY|HOLIDAY))\b/;
const SMALL_WORDS = new Set(['of', 'the', 'and', 'ng', 'sa', 'in', 'for']);

export const NAME_PLACEHOLDER = 'TODO: name this holiday';

export function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => {
    const field = (tag) => decode(body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '');
    return { title: field('title'), link: field('link'), pubDate: field('pubDate'), text: field('description') };
  });
}

// "Proclamation No. 1264, s. 2026" → { number: 1264, series: 2026 }
export function proclamationId(title) {
  const m = title.match(/^Proclamation No\.?\s*(\d+),?\s*s\.?\s*(\d{4})/i);
  return m ? { number: Number(m[1]), series: Number(m[2]) } : null;
}

// Decide what one feed item means for the data. `known` describes what is already in data/.
//   skip    – not a nationwide proclamation, already in the data, or for a past year we don't keep
//   holiday – a single nationwide day we could read; `holiday` is ready to insert into `year`
//   annual  – the yearly list for `year`, which has to be filled in by hand
//   review  – nationwide but not something we can safely read; a person has to look
export function classify(item, known) {
  const id = proclamationId(item.title);
  if (!id) return { kind: 'skip', reason: 'not a proclamation' };
  if (known.proclamations.has(`${id.number}/${id.series}`)) return { kind: 'skip', reason: 'already in the data' };

  const text = item.text.toUpperCase().replace(/\s+/g, ' ');
  const base = { id, item };

  const amends = [...text.matchAll(/AMENDING PROCLAMATION NO\.? ?(\d+)/g)].map((m) => Number(m[1]));
  if (amends.some((n) => known.annualNumbers.has(n))) {
    return { ...base, kind: 'review', reason: `amends annual holiday list Proc. No. ${amends.join(', ')}` };
  }

  const annual = text.match(/DECLARING THE REGULAR HOLIDAYS AND SPECIAL .*? FOR THE YEAR (\d{4})/);
  if (annual) {
    const year = Number(annual[1]);
    if (known.years.has(year)) return { kind: 'skip', reason: `data/${year}.json already exists` };
    if (year < known.currentYear) return { kind: 'skip', reason: `past year ${year}` };
    return { ...base, kind: 'annual', year };
  }

  if (!text.includes('THROUGHOUT THE COUNTRY')) return { kind: 'skip', reason: 'local, not nationwide' };

  const date = readDate(text);
  const type = readType(text);
  if (!date || !type) return { ...base, kind: 'review', reason: 'nationwide, but the date or type could not be read from the excerpt' };

  const year = Number(date.slice(0, 4));
  if (year < known.currentYear && !known.years.has(year)) return { kind: 'skip', reason: `past year ${year}` };
  if (!known.years.has(year)) return { ...base, kind: 'review', reason: `data/${year}.json does not exist yet (add the annual list first)` };

  const clash = known.dates.get(date);
  if (clash) return { ...base, kind: 'review', reason: `${date} is already listed as "${clash.name}" (${clash.type})` };

  const url = item.link.startsWith('https://www.officialgazette.gov.ph/') ? item.link : null;
  if (!url) return { ...base, kind: 'review', reason: 'link is not on www.officialgazette.gov.ph' };

  return {
    ...base,
    kind: 'holiday',
    year,
    holiday: { date, name: readName(text), type, proclamation: { number: id.number, series: id.series, url } },
  };
}

export function knownFrom(years, currentYear) {
  const known = { proclamations: new Set(), annualNumbers: new Set(), years: new Set(), dates: new Map(), currentYear };
  for (const { year, doc } of years) {
    known.years.add(year);
    const counts = new Map();
    for (const h of doc.holidays ?? []) {
      const key = `${h.proclamation.number}/${h.proclamation.series}`;
      known.proclamations.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      known.dates.set(h.date, h);
    }
    // The proclamation behind most of a year's days is that year's annual list.
    const [top] = [...counts].sort((a, b) => b[1] - a[1]);
    if (top) known.annualNumbers.add(Number(top[0].split('/')[0]));
  }
  return known;
}

export function insertHoliday(doc, holiday) {
  const holidays = [...doc.holidays, holiday].sort((a, b) => a.date.localeCompare(b.date));
  return { ...doc, holidays };
}

function readDate(text) {
  const declared = text.slice(text.indexOf('DECLARING'));
  let m = declared.match(DAY_FIRST);
  if (m) return iso(m[3], m[2], m[1]);
  m = declared.match(MONTH_FIRST);
  return m ? iso(m[3], m[1], m[2]) : null;
}

function iso(year, monthName, day) {
  const month = MONTHS.indexOf(monthName) + 1;
  const s = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

function readType(text) {
  const m = text.match(TYPE_PHRASE);
  if (!m) return null;
  if (m[1] === 'REGULAR HOLIDAY') return 'regular';
  return m[2] === 'WORKING' ? 'special_working' : 'special_non_working';
}

// "...IN OBSERVANCE OF THE EID'L ADHA (FEAST OF SACRIFICE)" → "Eid'l Adha"
function readName(text) {
  const m = text.match(/IN OBSERVANCE OF (?:THE )?([^(,[]+)/);
  return m ? titleCase(m[1].trim()) : NAME_PLACEHOLDER;
}

export function titleCase(s) {
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function decode(s) {
  return s
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}
