# ph-holidays

Philippine **national** holidays as plain JSON, one file per year, served by GitHub Pages.
Every holiday links to the proclamation it comes from, so you can check it yourself.

Local holidays (a single city, municipality or province) are not included.

## Use it

```
GET https://<github-user>.github.io/ph-holidays/2026.json
GET https://<github-user>.github.io/ph-holidays/index.json   # years available
```

For the current year, request `<year>.json` with the year in Philippine time:

```js
const year = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date());
const { holidays } = await fetch(`https://<github-user>.github.io/ph-holidays/${year}.json`).then((r) => r.json());
const regular = holidays.filter((h) => h.type === 'regular');
```

A year that hasn't been published yet returns 404.

## Format

```json
{
  "year": 2026,
  "country": "PH",
  "holidays": [
    {
      "date": "2026-03-20",
      "name": "Eid'l Fitr",
      "type": "regular",
      "proclamation": {
        "number": 1189,
        "series": 2026,
        "url": "https://lawphil.net/executive/proc/proc2026/proc_1189_2026.html"
      }
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `date` | `YYYY-MM-DD` |
| `name` | Name as written in the proclamation |
| `type` | `regular`, `special_non_working` or `special_working` |
| `proclamation` | Proclamation number, series (year it was issued) and a link to the full text |

Holidays are sorted by date. Each date appears once.

## Where the data comes from

Each year's list comes from the President's annual proclamation, issued the year before
(2026: Proclamation No. 1006, s. 2025). The Eid'l Fitr and Eid'l Adha dates come in separate
proclamations a few days before each one, so they get added to the year file during the year.

## Keeping it current

`.github/workflows/watch.yml` runs every day at 06:17 Manila time (or by hand from the Actions tab).
It reads LawPhil's proclamation index for this year and last year (two requests) and keeps only
**nationwide** holiday proclamations ("Throughout the Country"). It never merges anything.

The Official Gazette is the original source, but it blocks GitHub's servers, so the watcher uses
[LawPhil](https://lawphil.net/executive/proc/proc2026/proc2026.html), which lists every proclamation
with its full title the same day or soon after.

| What it finds | What it does |
|---|---|
| A single nationwide day it can read (date, type, name) | Opens a pull request adding one line to `data/<year>.json` |
| The annual list for a new year | Opens a pull request with an empty `data/<year>.json` to fill in from the proclamation |
| Nationwide but unreadable, an amendment to the annual list, or a date already listed | Opens an issue for you to check |
| Local proclamations, other proclamations, anything already in the data, past years | Nothing |

It won't open the same pull request or issue twice, even after you close one. To see what it would do
without changing anything: `node scripts/watch.mjs --dry-run`.

One-time setup on GitHub:

1. Settings → Actions → General → Workflow permissions: enable **Allow GitHub Actions to create and
   approve pull requests**.
2. Optional but recommended: pull requests opened with the built-in token don't run the checks on
   themselves (a GitHub rule). Add a fine-grained personal access token for this repo (Contents,
   Pull requests and Issues: read and write) as the secret `WATCH_TOKEN`, and checks will run on them.
   Without it, the pull request body still reports whether the checks passed.

If LawPhil can't be reached, the workflow run fails (shown in red, and GitHub emails you) rather
than silently missing proclamations.

## Contributing

Edit `data/<year>.json`, then run:

```sh
npm test           # checks every data file, the pinned 2026 dates and the watcher
npm run validate   # readable list of problems in the data
npm run build      # writes the site to public/
```

The proclamation link must be on `lawphil.net` or `www.officialgazette.gov.ph`.
Pull requests run the same checks. Merging to `main` publishes the site.

## License

MIT
