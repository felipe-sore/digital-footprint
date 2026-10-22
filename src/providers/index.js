'use strict';

const fs = require('fs');
const path = require('path');
const MARKETS = require('../../config/markets.json');

// Paid traffic and SEO providers. Each call spends credits, so:
//   - nothing runs unless a provider is named on the command line;
//   - --dry-run prints the plan (requests and cost) and calls nothing;
//   - a run refuses to make more than maxRequests calls;
//   - results are cached per provider, domain, market and month, so building the
//     report again does not pay again. The cache never holds a key.
// Every number they return is the provider's model, not a measurement: each
// record keeps the provider, the period and the market, and the report says so.

const PROVIDERS = Object.fromEntries(['semrush', 'similarweb', 'dataforseo'].map((n) => [n, require(`./${n}`)]));

function resolveMarket(code) {
  const key = String(code || '').toLowerCase();
  if (key.startsWith('_') || !MARKETS[key]) {
    throw new Error(`unknown market "${code}". Use one of: ${Object.keys(MARKETS).filter((k) => !k.startsWith('_')).join(', ')}`);
  }
  return { key, ...MARKETS[key] };
}

function plan(names, { env = process.env } = {}) {
  return names.map((name) => {
    const p = PROVIDERS[name];
    if (!p) throw new Error(`unknown provider "${name}". Use: ${Object.keys(PROVIDERS).join(', ')}`);
    const missing = p.env.filter((k) => !env[k]);
    return { provider: name, label: p.label, ...p.plan(), missing };
  });
}

const monthOf = (d) => d.toISOString().slice(0, 7);

async function runProviders(domain, marketCode, names, {
  env = process.env, fetchImpl = (...a) => fetch(...a), cacheDir = null, maxRequests = 5,
  dryRun = false, now = new Date(), log = () => {},
} = {}) {
  const market = resolveMarket(marketCode);
  const steps = plan(names, { env });
  const total = steps.reduce((s, p) => s + p.requests, 0);
  if (dryRun) return { plan: steps, records: [] };
  const missing = steps.filter((s) => s.missing.length);
  if (missing.length) throw new Error(missing.map((s) => `${s.label} needs ${s.missing.join(' and ')}`).join('; '));
  if (total > maxRequests) throw new Error(`this run would make ${total} paid requests, above the limit of ${maxRequests} (raise --max-requests)`);

  const records = [];
  for (const step of steps) {
    const p = PROVIDERS[step.provider];
    const period = p.period ? p.period(now) : monthOf(now);
    const cacheFile = cacheDir ? path.join(cacheDir, `${p.name}-${domain}-${market.key}-${period}.json`) : null;
    if (cacheFile && fs.existsSync(cacheFile)) {
      records.push({ ...JSON.parse(fs.readFileSync(cacheFile, 'utf8')), cached: true });
      log(`${p.label}: cached (${period})`);
      continue;
    }
    const result = await p.fetch(domain, market, { env, fetchImpl, now });
    const record = {
      provider: p.name, label: p.label, domain, market: market.key, period,
      fetchedAt: now.toISOString(), metrics: result.metrics, note: result.note || null,
      costUsd: result.costUsd ?? null,
    };
    if (cacheFile) {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cacheFile, `${JSON.stringify(record, null, 2)}\n`);
    }
    log(`${p.label}: ${record.metrics ? 'ok' : record.note} (${period})`);
    records.push(record);
  }
  return { plan: steps, records };
}

module.exports = { runProviders, plan, resolveMarket, PROVIDERS, MARKETS };
