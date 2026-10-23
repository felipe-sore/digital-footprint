'use strict';

// Similarweb API, traffic sources overview: visits per channel, split organic
// and paid. Summing the channels gives total visits, so one request covers both.
// Paid access only (sold through Similarweb sales); 7 data credits per result.
// Docs: https://developers.similarweb.com/reference/traffic-sources-overview
// Response:
//   { "meta": {...}, "visits": { "cnn.com": [ { "source_type": "Search",
//       "visits": [ { "date": "2023-01-01", "organic": 47006758.05, "paid": 8351.29 } ] } ] } }
// Channel names in the docs' example ("Search", "Direct", "Mail"...) differ a little
// from its prose, so they are kept as returned.

const { ProviderError, request, readJson } = require('./error');

function previousMonth(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

function parse(data, month) {
  const perDomain = data && data.visits ? Object.values(data.visits)[0] : null;
  if (!Array.isArray(perDomain) || !perDomain.length) return null;
  const channels = [];
  let organicSearch = null;
  let paidSearch = null;
  // Only the month asked for: an older point would go out labelled with the wrong month.
  for (const ch of perDomain) {
    const point = (ch.visits || []).find((v) => String(v.date).startsWith(month));
    if (!point) continue;
    const organic = Number(point.organic) || 0;
    const paid = Number(point.paid) || 0;
    channels.push({ channel: String(ch.source_type), visits: organic + paid, organic, paid });
    if (/search/i.test(ch.source_type)) { organicSearch = organic; paidSearch = paid; }
  }
  const total = channels.reduce((s, c) => s + c.visits, 0);
  if (!channels.length || !total) return null; // no data is not zero visits
  return {
    totalVisits: total,
    organicSearchVisits: organicSearch,
    paidSearchVisits: paidSearch,
    channels: channels.map((c) => ({ ...c, share: total ? (c.visits / total) * 100 : 0 })),
  };
}

module.exports = {
  name: 'similarweb',
  label: 'Similarweb',
  env: ['SIMILARWEB_API_KEY'],
  fills: ['totalVisits', 'organicSearchVisits', 'paidSearchVisits'],
  plan: () => ({ requests: 1, cost: '1 hit, 7 data credits per result' }),
  period: (now) => previousMonth(now),
  async fetch(domain, market, { env, fetchImpl, now }) {
    const month = previousMonth(now);
    const url = new URL(`https://api.similarweb.com/v1/website/${encodeURIComponent(domain)}/traffic-sources/overview-share`);
    url.search = new URLSearchParams({
      api_key: env.SIMILARWEB_API_KEY, country: market.similarweb, granularity: 'monthly',
      start_date: month, end_date: month, main_domain_only: 'false', format: 'json',
    }).toString();
    const res = await request('Similarweb', () => fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) }));
    if (res.status === 404) return { metrics: null, note: 'no data for this domain or country' };
    if (!res.ok) throw new ProviderError('Similarweb', `HTTP ${res.status}`);
    const metrics = parse(await readJson('Similarweb', res), month);
    return { metrics, note: metrics ? null : 'no data for this domain or country' };
  },
  parse,
  previousMonth,
};
