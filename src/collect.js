'use strict';

const { safeGet, ROBOTS_TOKEN } = require('./fetch');
const { robotsAllows, sitemapsFrom } = require('./robots');
const { extract, isChallenge } = require('./site');

// "https://www.Acme.com/about" -> "acme.com"
function normalizeDomain(input) {
  const s = String(input || '').trim();
  if (!s) throw new Error('give a domain, e.g. acme.com');
  const host = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase();
  return host.replace(/^www\./, '');
}

// Reads robots.txt, the homepage and the sitemap. Everything public, read-only,
// one request each. Returns the "site" block of evidence.json.
async function collectSite(domain, http = {}) {
  const get = (url) => safeGet(url, http);
  const site = { status: 'ok' };

  let robots = null;
  try {
    const r = await get(`https://${domain}/robots.txt`);
    if (r.status === 200 && !/<html/i.test(r.body)) robots = r.body;
  } catch { /* no robots.txt is common */ }
  site.robots = { found: robots !== null };
  if (robots && !robotsAllows(robots, ROBOTS_TOKEN, '/')) {
    return { ...site, status: 'disallowed_by_robots' };
  }

  // Start on http to learn whether the site moves visitors to https.
  let page;
  let httpToHttps = null;
  try {
    page = await get(`http://${domain}/`);
    httpToHttps = page.url.startsWith('https:');
  } catch {
    try {
      page = await get(`https://${domain}/`);
    } catch (err) {
      return { ...site, status: 'unreachable', error: err.message };
    }
  }
  Object.assign(site, {
    httpStatus: page.status, finalUrl: page.url, https: page.url.startsWith('https:'), httpToHttps,
    responseMs: page.ms, bytes: page.bytes, truncated: page.truncated,
  });
  if (isChallenge(page.status, page.body)) return { ...site, status: 'blocked' };
  if (page.status >= 400) return { ...site, status: 'error' };
  Object.assign(site, extract(page.body, page.url));

  const sitemapUrl = sitemapsFrom(robots)[0] || `https://${domain}/sitemap.xml`;
  try {
    const s = await get(sitemapUrl);
    site.sitemap = s.status === 200 && /<(urlset|sitemapindex)\b/i.test(s.body)
      ? { found: true, entries: (s.body.match(/<loc>/gi) || []).length, index: /<sitemapindex\b/i.test(s.body), url: s.url }
      : { found: false };
  } catch {
    site.sitemap = { found: null };
  }
  return site;
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
