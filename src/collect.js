'use strict';

const { safeGet, ROBOTS_TOKEN } = require('./fetch');
const { robotsAllows, sitemapsFrom } = require('./robots');
const { extract, isChallenge } = require('./site');

// "https://www.Acme.com/about" -> "acme.com" (the company's identity; the
// www host is still tried when the bare one does not answer).
function normalizeDomain(input) {
  const s = String(input || '').trim();
  if (!s) throw new Error('give a domain, e.g. acme.com');
  const host = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase();
  return host.replace(/^www\./, '');
}

// robots.txt for one host: { found: true, text } | { found: false } on a 404,
// which is the server saying there is none | { found: null } when it could not be read.
async function readRobots(host, get) {
  try {
    const r = await get(`https://${host}/robots.txt`);
    if (r.status === 200 && !/<html/i.test(r.body)) return { found: true, text: r.body };
    if (r.status === 404 || r.status === 410) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

// Start on http to learn whether the site moves visitors to https.
async function readHome(host, get) {
  try {
    const page = await get(`http://${host}/`);
    return { page, httpToHttps: page.url.startsWith('https:') };
  } catch {
    try {
      return { page: await get(`https://${host}/`), httpToHttps: null };
    } catch (err) {
      return { error: err.message };
    }
  }
}

// A sitemap is "found" only when one is read. Not finding it at the usual
// addresses is not proof there is none, so that stays unknown.
async function readSitemap(origin, robotsText, get) {
  const candidates = [...new Set([...sitemapsFrom(robotsText), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])];
  for (const url of candidates) {
    try {
      const s = await get(url);
      if (s.status === 200 && /<(urlset|sitemapindex)\b/i.test(s.body)) {
        return { found: true, entries: (s.body.match(/<loc>/gi) || []).length, index: /<sitemapindex\b/i.test(s.body), url: s.url };
      }
    } catch { /* try the next address */ }
  }
  return { found: null, tried: candidates.length };
}

// Reads robots.txt, the homepage and the sitemap. Everything public, read-only.
// Returns the "site" block of evidence.json.
async function collectSite(domain, http = {}) {
  const get = (url) => safeGet(url, http);
  let lastError = null;
  for (const host of [domain, `www.${domain}`]) {
    const robots = await readRobots(host, get);
    if (robots.found && !robotsAllows(robots.text, ROBOTS_TOKEN, '/')) {
      return { status: 'disallowed_by_robots', host, robots: { found: true } };
    }
    const home = await readHome(host, get);
    if (home.error) { lastError = home.error; continue; }
    const { page, httpToHttps } = home;
    const site = {
      status: 'ok', host, robots: { found: robots.found },
      httpStatus: page.status, finalUrl: page.url, https: page.url.startsWith('https:'), httpToHttps,
      responseMs: page.ms, bytes: page.bytes, truncated: page.truncated,
    };
    if (isChallenge(page.status, page.body)) return { ...site, status: 'blocked' };
    if (page.status >= 400) return { ...site, status: 'error' };
    Object.assign(site, extract(page.body, page.url));
    site.sitemap = await readSitemap(new URL(page.url).origin, robots.text, get);
    return site;
  }
  return { status: 'unreachable', error: lastError, robots: { found: null } };
}

async function collect(input, { name, http = {}, now = new Date() } = {}) {
  const domain = normalizeDomain(input);
  return {
    schema: 1,
    company: { name: name || domain, domain },
    collectedAt: now.toISOString(),
    site: await collectSite(domain, http),
    providers: [],
  };
}

module.exports = { collect, collectSite, normalizeDomain };
