---
name: digital-footprint
description: Audit a company's public digital presence (website, SEO, social, paid media, content, reputation, technical, branding) and write a client-ready HTML report. The agent researches; the CLI reads the site, calls the paid tools you name, enforces the evidence rules and scores maturity. Use when asked to audit, diagnose or research a company's digital presence, footprint or online maturity.
---

# Digital Footprint

You research a company's public digital presence and produce a report a client
will read. The report is only as good as what it can defend, so the code, not
you, decides what is allowed to be claimed. Your job is to find evidence and
describe it honestly.

## 1. Brief

You need the company name and its domain. If only the name is given, ask for
the domain before anything else. Ask which market (us, br, uk, pt, de, es) and
whether to use paid providers. Never assume paid access.

## 2. Collect (the CLI)

```bash
node bin/digital-footprint.js collect <domain> --name "<Company>" --market us
```

This reads robots.txt, the homepage and the sitemap, and writes
`footprint-<domain>/evidence.json` plus an empty `research.json`.

Paid providers are opt-in. Always show the cost first and get a yes:

```bash
node bin/digital-footprint.js collect <domain> --providers semrush,similarweb --dry-run
node bin/digital-footprint.js collect <domain> --providers semrush,similarweb --market us
```

## 3. Research (you)

Search the public web for what the CLI cannot read, and add each finding to
`research.json` as an item. Sources: LinkedIn, Instagram, YouTube (from search
results, never by logging in or scraping), the Meta Ad Library, review sites
(Google reviews, G2, Trustpilot, Glassdoor; ReclameAqui in Brazil), press.

Every item has an `id`, a `section` (site, seo, social, paid, content,
reputation, technical, branding, traffic), a `label`, a `value`, a `unit`
(count, %, usd, ms, bool, text, list, url, rating) and a `type`:

| type | when | needs |
|---|---|---|
| `fact` | you opened the page and read it | `source.url` |
| `provided` | the user gave it (a legible export, a client number) | `source.name` |
| `estimate` | you calculated it, or read it off a poor screenshot | `basis`; never a percentage |
| `provider_estimate` | a paid tool's number the user pasted | `provider`, `period` (YYYY-MM), `market` |
| `not_identified` | the source was blocked or nothing was found | `value: null`, a `note` |

Review scores are `unit: "rating"` with `platform`, `scale`, `reviews` and, when
known, `responseRate` (0-100).

Then write `findings` per section (`diagnosis`, `evidence`, `opportunity`,
`risk`), `overview` and `conclusion` paragraphs. Consultative and plain. No long
dashes.

## 4. Check and render

```bash
node bin/digital-footprint.js check footprint-<domain>
node bin/digital-footprint.js render footprint-<domain> --lang en   # or pt-BR
```

If `check` fails, fix the wording or the item and run it again. Do not work
around a rule: each one exists because a report once said something it could
not defend.

## Rules the code enforces

- A blocked source is "not identified", never zero. If the Ad Library asks for
  a login, the paid section cannot say "no ads".
- A tag missing from the HTML is not identified: tag managers load tags later.
- A number from an illegible screenshot is an estimate. Estimated percentages
  are not allowed: say dominant, minor or not identified.
- Paid tools model traffic; their numbers always carry the tool, month and market.
- "Critical" needs facts. Reputation is critical only below 4 of 10 or with no
  complaint answered. A 6 of 10 company that answers 95% is "attention".
- A percentage in your prose needs percentage data in that section.

## Never

- Log in, bypass a CAPTCHA or scrape a social network.
- Invent a number, or turn "not found" into "does not exist".
- Store personal data beyond a public business role.
