export const TYPES = ['regular', 'special_non_working', 'special_working'];

const SOURCE_HOSTS = ['lawphil.net', 'www.officialgazette.gov.ph'];
const HOLIDAY_KEYS = ['date', 'name', 'type', 'proclamation'];
const PROCLAMATION_KEYS = ['number', 'series', 'url'];

// Returns a list of problems; an empty list means the year file is valid.
export function validateYear(doc, expectedYear) {
  const errors = [];
  if (!isObject(doc)) return ['file must be a JSON object'];

  if (doc.year !== expectedYear) errors.push(`year must be ${expectedYear}, got ${JSON.stringify(doc.year)}`);
  if (doc.country !== 'PH') errors.push('country must be "PH"');
  if (!Array.isArray(doc.holidays) || doc.holidays.length === 0) {
    errors.push('holidays must be a non-empty array');
    return errors;
  }

  const seen = new Set();
  let previous = '';
  doc.holidays.forEach((h, i) => {
    const at = `holidays[${i}]`;
    if (!isObject(h)) return errors.push(`${at} must be an object`);
    errors.push(...unknownKeys(h, HOLIDAY_KEYS, at));

    if (!isRealDate(h.date) || !h.date.startsWith(`${expectedYear}-`)) {
      errors.push(`${at}.date must be a real YYYY-MM-DD date in ${expectedYear}, got ${JSON.stringify(h.date)}`);
    } else {
      if (seen.has(h.date)) errors.push(`${at}.date ${h.date} is listed twice`);
      if (h.date < previous) errors.push(`${at}.date ${h.date} is out of order (holidays must be sorted by date)`);
      seen.add(h.date);
      previous = h.date;
    }

    if (typeof h.name !== 'string' || h.name.trim() === '') errors.push(`${at}.name must be a non-empty string`);
    else if (/^TODO\b/i.test(h.name)) errors.push(`${at}.name is still a placeholder: ${JSON.stringify(h.name)}`);
    if (!TYPES.includes(h.type)) errors.push(`${at}.type must be one of ${TYPES.join(', ')}, got ${JSON.stringify(h.type)}`);

    const p = h.proclamation;
    if (!isObject(p)) return errors.push(`${at}.proclamation must be an object`);
    errors.push(...unknownKeys(p, PROCLAMATION_KEYS, `${at}.proclamation`));
    if (!Number.isInteger(p.number) || p.number <= 0) errors.push(`${at}.proclamation.number must be a positive integer`);
    // A year's list is proclaimed the year before; Eid dates are proclaimed in the same year.
    if (p.series !== expectedYear && p.series !== expectedYear - 1) {
      errors.push(`${at}.proclamation.series must be ${expectedYear - 1} or ${expectedYear}, got ${JSON.stringify(p.series)}`);
    }
    if (!isSourceUrl(p.url)) errors.push(`${at}.proclamation.url must be an https link on ${SOURCE_HOSTS.join(' or ')}`);
  });

  return errors;
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function unknownKeys(obj, allowed, at) {
  return Object.keys(obj).filter((k) => !allowed.includes(k)).map((k) => `${at} has unknown field "${k}"`);
}

function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isSourceUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && SOURCE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}
