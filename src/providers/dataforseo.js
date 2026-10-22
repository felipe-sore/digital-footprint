'use strict';

// DataForSEO Labs, Google domain rank overview (live): estimated organic and
// paid traffic and the number of ranking keywords. Pay as you go.
// Docs: https://docs.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live/
// POST a one-task array with HTTP Basic auth; success is status_code 20000 at
// the top and in the task. Metrics at tasks[0].result[0].items[0].metrics.{organic,paid}:
//   etv (estimated traffic), count (ranking keywords), estimated_paid_traffic_cost (USD).

const { ProviderError, request, readJson } = require('./error');

const OK = 20000;

function parse(data) {
  // A task can fail after the request was billed: keep the cost on the error.
  const costUsd = (data && ((data.tasks || [])[0] || {}).cost) ?? (data && data.cost) ?? null;
  if (!data || data.status_code !== OK) throw new ProviderError('DataForSEO', data ? `${data.status_code} ${data.status_message}` : 'empty response', { costUsd });
  const task = (data.tasks || [])[0];
  if (!task) throw new ProviderError('DataForSEO', 'no task in the response', { costUsd });
  if (task.status_code !== OK) throw new ProviderError('DataForSEO', `${task.status_code} ${task.status_message}`, { costUsd });
  const item = (((task.result || [])[0] || {}).items || [])[0];
  if (!item || !item.metrics) return { metrics: null, costUsd: task.cost ?? data.cost ?? null };
  const o = item.metrics.organic || {};
  const p = item.metrics.paid || {};
  const n = (v) => (v === undefined || v === null ? null : Number(v));
  return {
    metrics: {
      organicTraffic: n(o.etv),
      organicKeywords: n(o.count),
      organicCostUsd: n(o.estimated_paid_traffic_cost),
      paidTraffic: n(p.etv),
      paidKeywords: n(p.count),
      paidCostUsd: n(p.estimated_paid_traffic_cost),
    },
    costUsd: task.cost ?? data.cost ?? null,
  };
}

module.exports = {
  name: 'dataforseo',
  label: 'DataForSEO',
  env: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'],
  fills: ['organicTraffic', 'organicKeywords', 'paidTraffic', 'paidKeywords', 'paidCostUsd'],
  plan: () => ({ requests: 1, cost: 'billed per request; the API returns the cost in USD' }),
  async fetch(domain, market, { env, fetchImpl }) {
    const auth = Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`).toString('base64');
    const res = await request('DataForSEO', () => fetchImpl('https://api.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ target: domain, ...market.dataforseo }]),
      signal: AbortSignal.timeout(30000),
    }));
    if (!res.ok) throw new ProviderError('DataForSEO', `HTTP ${res.status}`);
    const { metrics, costUsd } = parse(await readJson('DataForSEO', res));
    return { metrics, costUsd, note: metrics ? null : 'no data for this domain and location' };
  },
  parse,
};
