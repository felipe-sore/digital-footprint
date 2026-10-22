'use strict';

const fs = require('fs');
const path = require('path');
const MARKETS = require('../../config/markets.json');
const { ProviderError } = require('./error');

// Paid traffic and SEO providers. Each call spends credits, so:
//   - nothing runs unless a provider is named on the command line;
//   - --dry-run prints the plan (requests and cost) and calls nothing;
//   - a run refuses to make more than maxRequests calls;
//   - results are cached per provider, domain, market and month, so building the
//     report again does not pay again. The cache never holds a key;
//   - one provider failing (wrong key, outage, bad answer) does not lose the others
//     or the site reading: the metrics it would have filled become "not identified"
//     with the reason, nothing is cached, and the command exits non-zero. A bug in
//     this code is not a provider failure and still stops the run;
//   - an unreadable cache file or a failed cache write never costs a paid result.
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

// Belt and braces: whatever the reason says, the provider's secrets never leave.
function scrub(text, env, keys) {
  let out = String(text);
  for (const k of keys) if (env[k] && String(env[k]).length >= 4) out = out.split(String(env[k])).join('***');
  return out;
}

function readCache(file, log, label) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    log(`${label}: cache file unreadable, ignoring it`);
    return null;
  }
}

// Exit code for a collect run: 1 when any provider failed, so a script or an
// agent does not take a partial run for a complete one.
const exitCodeFor = (records) => (records.some((r) => r.failed) ? 1 : 0);

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
    const cached = readCache(cacheFile, log, p.label);
    if (cached) {
      records.push({ ...cached, cached: true });
      log(`${p.label}: cached (${period})`);
      continue;
    }
    const base = { provider: p.name, label: p.label, domain, market: market.key, period, fills: p.fills, fetchedAt: now.toISOString() };
    let record;
    try {
      const result = await p.fetch(domain, market, { env, fetchImpl, now });
      record = { ...base, metrics: result.metrics, note: result.note || null, costUsd: result.costUsd ?? null };
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      const reason = scrub(err.reason, env, p.env);
      log(`${p.label}: failed (${reason})`);
      records.push({ ...base, metrics: null, note: reason, failed: true, costUsd: err.costUsd ?? null });
      continue;
    }
    if (cacheFile) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cacheFile, `${JSON.stringify(record, null, 2)}\n`);
      } catch (err) {
        log(`${p.label}: result kept, but the cache could not be written (${err.code || err.message})`);
      }
    }
    log(`${p.label}: ${record.metrics ? 'ok' : record.note} (${period})`);
    records.push(record);
  }
  return { plan: steps, records };
}

module.exports = { runProviders, plan, resolveMarket, exitCodeFor, PROVIDERS, MARKETS };
