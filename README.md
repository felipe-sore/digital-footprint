# Digital Footprint

![tests](https://github.com/felipe-sore/digital-footprint/actions/workflows/test.yml/badge.svg)

A [Claude Code](https://docs.claude.com/en/docs/claude-code) skill plus a Node.js CLI that audits a company's public digital presence (website, SEO, social, paid media, content, reputation, technical, branding) and writes a report you can send to the client.

**The agent researches. The code decides what the report is allowed to claim.**

## Why it is built this way

This started as a prompt I used to research B2B companies before sales conversations and to diagnose clients. The reports went to the companies themselves, and the mistakes that hurt were never formatting. They were claims that could not be defended:

- "No paid media" when the Meta Ad Library had simply asked for a login.
- An exact visit count read off a small Similarweb screenshot.
- A channel split in percentages that nobody could actually read.
- "Critical reputation" for a company scoring 6/10 that answered 95% of its complaints.
- "No pixel" when a tag manager loads the pixel after the page.

A prompt can ask a model not to do these things. This project makes the report fail to build instead.

| Rule | Where it lives | Test |
|---|---|---|
| A blocked or missing source is *not identified*, never zero, and the prose of that section cannot claim absence ("no ads", "zero", "não anuncia") | `src/validate.js` | `tests/validate.test.js` |
| A tag missing from the HTML is not identified, since tag managers load tags later; on a page built by JavaScript, whatever was not rendered is not identified | `src/items.js` | `tests/collect.test.js` |
| An estimate shows its basis; a number from an illegible screenshot cannot be "provided"; estimated percentages are refused | `src/validate.js` | `tests/validate.test.js` |
| A paid tool's number always names the tool, the month and the market, and is shown as `~` | `src/items.js`, `src/render.js` | `tests/providers.test.js`, `tests/render.test.js` |
| "Critical" must cite facts; reputation is critical only below 4/10 or with no complaint answered | `src/validate.js`, `config/rubric.json` | `tests/validate.test.js` |
| A percentage in the prose needs percentage data in that section | `src/validate.js` | `tests/validate.test.js` |
| Maturity is computed from the evidence with a rubric in config, not written by the model; unknowns lower confidence, not the score | `src/score.js`, `config/rubric.json` | `tests/score.test.js` |

## How it works

```
collect (CLI)                      research (agent)              check + render (CLI)
robots.txt, homepage, sitemap  ->  LinkedIn, Ad Library,     ->  evidence rules, maturity score,
paid providers you name            review sites, press           self-contained HTML (en, pt-BR)
        evidence.json                  research.json                   report.html
```

Every piece of data is an item with a type: `fact` (read directly, with its URL), `provided` (from the user), `estimate` (with its basis), `provider_estimate` (a paid tool's model, with tool, month and market) or `not_identified` (no value, never zero). See [`SKILL.md`](SKILL.md) for the agent's side.

## Try it

```bash
git clone https://github.com/felipe-sore/digital-footprint.git
cd digital-footprint && npm install
node bin/digital-footprint.js render examples        # fictional company, no network
```

[`examples/`](examples) holds the evidence, the research and the reports (English and Portuguese) for Fabrikam Analytics, a made-up company. Every name, number and link there is fictional. Both reports use the same English research, so in the Portuguese one the labels and notes the code writes are translated and the agent's text is not; in real use the agent writes in the report's language.

On a real company:

```bash
node bin/digital-footprint.js collect contoso.com --name "Contoso" --market us
# the agent fills footprint-contoso.com/research.json
node bin/digital-footprint.js render footprint-contoso.com --lang en
```

## Traffic and SEO providers (optional, paid)

The site reading needs no key. Traffic and SEO numbers come from providers you pay for, through your own keys in environment variables. Nothing is called unless you name the provider.

| provider | what it adds | access | variables |
|---|---|---|---|
| [Semrush](https://developer.semrush.com/api/v3/seo/overview-reports) `domain_rank` | organic and paid keywords, traffic and cost | Business plan plus API units (10 per call) | `SEMRUSH_API_KEY` |
| [Similarweb](https://developers.similarweb.com/reference/traffic-sources-overview) traffic sources | visits per channel, organic and paid | paid API, sold through Similarweb | `SIMILARWEB_API_KEY` |
| [DataForSEO](https://docs.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live/) domain rank overview | organic and paid traffic estimates and keyword counts | pay as you go | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` |

```bash
node bin/digital-footprint.js collect contoso.com --providers semrush,similarweb --dry-run   # cost, no calls
node bin/digital-footprint.js collect contoso.com --providers semrush,similarweb --market us
```

- **Dry run first:** `--dry-run` lists every request and its cost and calls nothing.
- **A hard cap:** a run refuses to make more than `--max-requests` paid calls (default 5).
- **Cache:** results are cached per provider, domain, market and month, so rebuilding a report does not pay twice. The cache never holds a key, and no error message ever echoes a URL that carries one.

## Safety

The CLI fetches URLs taken from lists other people paste, and the report goes to a client, so:

- **Only public hosts.** http and https only; `localhost`, private ranges, link-local and cloud metadata addresses are refused, again on every redirect; redirects, time and body size are capped.
- **robots.txt is respected.** If it asks crawlers to stay off the homepage, the site is not read and the report says so.
- **The report runs nothing.** No scripts, a Content-Security-Policy that blocks them anyway, every piece of text escaped, and only http/https links (opened with `noopener`). A website with `<script>` in its title cannot put a script in the report.
- **No logins, no CAPTCHA bypass, no scraping of social networks.** Social and review data comes from what the agent finds through search, with its URL.

## Configuration

| file | what it controls |
|---|---|
| `config/rubric.json` | which items count for each maturity axis, level thresholds, response time, good rating, the "critical" thresholds |
| `config/platforms.json` | review platforms and their scale (ReclameAqui is the Brazil module: 0-10 plus the share of complaints answered) |
| `config/markets.json` | market codes for each provider |
| `config/theme.json` | report colors |

## Tests

```bash
npm test
```

No test touches the network: fetches, DNS and the providers are stubbed. Node 20, 22 and 24 in GitHub Actions on every push, which also builds the example reports.

## Responsible use

Use public information about companies, keep lookups proportional, respect each site's terms and robots.txt, and do not store personal data beyond a public business role. Paid provider data is a model of reality; treat it as such in front of the client.

## About

Built by [Felipe Sore](https://linkedin.com/in/felipesore) with Claude Code, from the research agent I used before B2B sales conversations.

## License

MIT. See [LICENSE](LICENSE).
