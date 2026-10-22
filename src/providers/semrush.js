'use strict';

// Semrush Standard API, "Domain overview (one database)": type=domain_rank.
// Needs a Semrush Business subscription plus API units bought separately.
// Docs: https://developer.semrush.com/api/v3/seo/overview-reports
// Response: semicolon-separated text, a header line and one data line, e.g.
//   Domain;Rank;Organic Keywords;Organic Traffic;Organic Cost;Adwords Keywords;Adwords Traffic;Adwords Cost
//   seobook.com;24041;5249;37332;143496;0;0;0
// 10 API units per line.

const { ProviderError, request } = require('./error');

const COLUMNS = 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac';

function parse(text) {
  const lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines[0] && /^ERROR\b/i.test(lines[0])) {
    throw new ProviderError('Semrush', lines[0].trim(), { notFound: /NOTHING FOUND/i.test(lines[0]) });
  }
  if (lines.length < 2) return null;
  const header = lines[0].split(';').map((h) => h.trim());
  const values = lines[1].split(';');
  const row = Object.fromEntries(header.map((h, i) => [h, values[i]]));
  const num = (k) => (row[k] === undefined || row[k] === '' ? null : Number(row[k]));
  return {
    rank: num('Rank'),
    organicKeywords: num('Organic Keywords'),
    organicTraffic: num('Organic Traffic'),
    organicCostUsd: num('Organic Cost'),
    paidKeywords: num('Adwords Keywords'),
    paidTraffic: num('Adwords Traffic'),
    paidCostUsd: num('Adwords Cost'),
  };
}

module.exports = {
  name: 'semrush',
  label: 'Semrush',
  env: ['SEMRUSH_API_KEY'],
  fills: ['organicTraffic', 'organicKeywords', 'paidTraffic', 'paidKeywords', 'paidCostUsd'],
  plan: () => ({ requests: 1, cost: '10 API units' }),
  async fetch(domain, market, { env, fetchImpl }) {
    const url = new URL('https://api.semrush.com/');
    url.search = new URLSearchParams({ type: 'domain_rank', key: env.SEMRUSH_API_KEY, export_columns: COLUMNS, domain, database: market.semrush }).toString();
    // Never echo the URL or the fetch error: the URL carries the key.
    const res = await request('Semrush', () => fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) }));
    if (!res.ok) throw new ProviderError('Semrush', `HTTP ${res.status}`);
    const text = await res.text();
    let metrics;
    try {
      metrics = parse(text);
    } catch (err) {
      if (err.notFound) return { metrics: null, note: 'no data in this database' };
      throw err;
    }
    return { metrics, note: metrics ? null : 'no data in this database' };
  },
  parse,
};
