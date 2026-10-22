'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const semrush = require('../src/providers/semrush');
const similarweb = require('../src/providers/similarweb');
const dataforseo = require('../src/providers/dataforseo');
const { runProviders, exitCodeFor, PROVIDERS } = require('../src/providers');
const { validate } = require('../src/validate');
const { score } = require('../src/score');
const { render } = require('../src/render');
const { example } = require('./helpers');
const { providerItems } = require('../src/items');

const NOW = new Date('2026-10-22T12:00:00Z');
const ENV = { SEMRUSH_API_KEY: 'sk-test-semrush', SIMILARWEB_API_KEY: 'sw-test-key', DATAFORSEO_LOGIN: 'me@example.com', DATAFORSEO_PASSWORD: 'pw' };

// Response bodies copied from each provider's documentation.
const SEMRUSH_DOC = 'Domain;Rank;Organic Keywords;Organic Traffic;Organic Cost;Adwords Keywords;Adwords Traffic;Adwords Cost\nseobook.com;24041;5249;37332;143496;0;0;0\n';
const SIMILARWEB_DOC = {
  meta: { request: { granularity: 'Monthly', domain: 'cnn.com', country: 'us' }, status: 'Success', last_updated: '2023-05-31' },
  visits: {
    'cnn.com': [
      { source_type: 'Search', visits: [{ date: '2023-01-01', organic: 47006758.058137886, paid: 8351.290702430571 }] },
      { source_type: 'Direct', visits: [{ date: '2023-01-01', organic: 103288653.30495915, paid: 0 }] },
    ],
  },
};
const DATAFORSEO_DOC = {
  status_code: 20000, status_message: 'Ok.', cost: 0.0101,
  tasks: [{
    status_code: 20000, status_message: 'Ok.', cost: 0.0101,
    result: [{ items: [{ metrics: {
      organic: { etv: 3055.741419672966, count: 1788, estimated_paid_traffic_cost: 15078.99657046888 },
      paid: { etv: 32.17799982428551, count: 11, estimated_paid_traffic_cost: 275.8384747505188 },
    } }] }],
  }],
};

const recorder = (responder) => {
  const calls = [];
  return { calls, fetchImpl: async (url, init = {}) => { calls.push({ url, init }); return responder(url, init); } };
};

test('Semrush: the documented domain_rank response', () => {
  assert.deepEqual(semrush.parse(SEMRUSH_DOC), {
    rank: 24041, organicKeywords: 5249, organicTraffic: 37332, organicCostUsd: 143496, paidKeywords: 0, paidTraffic: 0, paidCostUsd: 0,
  });
  assert.throws(() => semrush.parse('ERROR 120 :: WRONG KEY - ID PAIR'), /Semrush: ERROR 120/);
});

test('Semrush: request shape, "nothing found" is no data, the key never shows in an error', async () => {
  const ok = recorder(() => new Response(SEMRUSH_DOC));
  await semrush.fetch('contoso.example', { semrush: 'br' }, { env: ENV, fetchImpl: ok.fetchImpl });
  const u = new URL(ok.calls[0].url);
  assert.equal(u.searchParams.get('type'), 'domain_rank');
  assert.equal(u.searchParams.get('database'), 'br');
  assert.equal(u.searchParams.get('domain'), 'contoso.example');

  const none = recorder(() => new Response('ERROR 50 :: NOTHING FOUND'));
  assert.equal((await semrush.fetch('contoso.example', { semrush: 'us' }, { env: ENV, fetchImpl: none.fetchImpl })).metrics, null);

  const down = recorder(() => new Response('oops', { status: 500 }));
  const err = await semrush.fetch('contoso.example', { semrush: 'us' }, { env: ENV, fetchImpl: down.fetchImpl }).catch((e) => e);
  assert.match(err.message, /HTTP 500/);
  assert.doesNotMatch(err.message, /sk-test-semrush/);
});

test('Similarweb: channels from the documented response; total is their sum', async () => {
  const m = similarweb.parse(SIMILARWEB_DOC, '2023-01');
  assert.equal(Math.round(m.totalVisits), Math.round(47006758.058137886 + 8351.290702430571 + 103288653.30495915));
  assert.equal(Math.round(m.paidSearchVisits), 8351);
  assert.equal(Math.round(m.channels.reduce((s, c) => s + c.share, 0)), 100);

  const r = recorder(() => new Response(JSON.stringify(SIMILARWEB_DOC)));
  await similarweb.fetch('contoso.example', { similarweb: 'gb' }, { env: ENV, fetchImpl: r.fetchImpl, now: NOW });
  const u = new URL(r.calls[0].url);
  assert.equal(u.pathname, '/v1/website/contoso.example/traffic-sources/overview-share');
  assert.equal(u.searchParams.get('country'), 'gb');
  assert.equal(u.searchParams.get('start_date'), '2026-09');
  assert.equal(u.searchParams.get('end_date'), '2026-09');
  const missing = recorder(() => new Response('{}', { status: 404 }));
  assert.equal((await similarweb.fetch('contoso.example', { similarweb: 'us' }, { env: ENV, fetchImpl: missing.fetchImpl, now: NOW })).metrics, null);
});

test('DataForSEO: the documented response, Basic auth, one task, errors surface', async () => {
  const { metrics, costUsd } = dataforseo.parse(DATAFORSEO_DOC);
  assert.equal(metrics.organicKeywords, 1788);
  assert.equal(Math.round(metrics.paidCostUsd), 276);
  assert.equal(costUsd, 0.0101);
  assert.throws(() => dataforseo.parse({ status_code: 40100, status_message: 'You are not authorized' }), /40100/);
  assert.throws(() => dataforseo.parse({ status_code: 20000, tasks: [{ status_code: 40501, status_message: 'Invalid Field' }] }), /40501/);

  const r = recorder(() => new Response(JSON.stringify(DATAFORSEO_DOC)));
  await dataforseo.fetch('contoso.example', { dataforseo: { location_code: 2076, language_code: 'pt' } }, { env: ENV, fetchImpl: r.fetchImpl });
  assert.equal(r.calls[0].init.method, 'POST');
  assert.equal(r.calls[0].init.headers.Authorization, `Basic ${Buffer.from('me@example.com:pw').toString('base64')}`);
  assert.deepEqual(JSON.parse(r.calls[0].init.body), [{ target: 'contoso.example', location_code: 2076, language_code: 'pt' }]);
});

test('providers: a dry run calls nothing; missing keys and the request cap stop the run', async () => {
  const r = recorder(() => { throw new Error('should not be called'); });
  const dry = await runProviders('contoso.example', 'us', ['semrush', 'similarweb'], { env: {}, fetchImpl: r.fetchImpl, dryRun: true });
  assert.equal(dry.plan.length, 2);
  assert.deepEqual(dry.plan[0].missing, ['SEMRUSH_API_KEY']);
  assert.equal(r.calls.length, 0);
  await assert.rejects(runProviders('contoso.example', 'us', ['semrush'], { env: {}, fetchImpl: r.fetchImpl }), /Semrush needs SEMRUSH_API_KEY/);
  await assert.rejects(runProviders('contoso.example', 'us', ['semrush', 'similarweb', 'dataforseo'], { env: ENV, fetchImpl: r.fetchImpl, maxRequests: 2 }), /above the limit of 2/);
  await assert.rejects(runProviders('contoso.example', 'mars', ['semrush'], { env: ENV }), /unknown market/);
  await assert.rejects(runProviders('contoso.example', 'us', ['ahrefs'], { env: ENV }), /unknown provider/);
  assert.equal(r.calls.length, 0);
});

test('providers: a second run in the same month reads the cache, which holds no key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'footprint-'));
  const r = recorder(() => new Response(SEMRUSH_DOC));
  const first = await runProviders('contoso.example', 'us', ['semrush'], { env: ENV, fetchImpl: r.fetchImpl, cacheDir: dir, now: NOW });
  const second = await runProviders('contoso.example', 'us', ['semrush'], { env: ENV, fetchImpl: r.fetchImpl, cacheDir: dir, now: NOW });
  assert.equal(r.calls.length, 1);
  assert.equal(second.records[0].cached, true);
  assert.deepEqual(second.records[0].metrics, first.records[0].metrics);
  for (const f of fs.readdirSync(dir)) assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /sk-test-semrush/);
});

test('provider numbers become provider estimates with tool, month and market', () => {
  const items = providerItems([{ provider: 'semrush', label: 'Semrush', market: 'us', period: '2026-10', metrics: semrush.parse(SEMRUSH_DOC) }]);
  const traffic = items.find((i) => i.id === 'seo.organic_traffic.semrush');
  assert.deepEqual([traffic.type, traffic.provider, traffic.period, traffic.market, traffic.value], ['provider_estimate', 'Semrush', '2026-10', 'US', 37332]);
  const none = providerItems([{ provider: 'similarweb', label: 'Similarweb', market: 'us', period: '2026-09', metrics: null, note: 'no data' }]);
  assert.equal(none[0].type, 'not_identified');
});

test('providers: one failing provider does not lose the others, and its failure is not cached', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'footprint-'));
  const r = recorder((url) => (url.startsWith('https://api.semrush.com/') ? new Response('down', { status: 503 }) : new Response(JSON.stringify(DATAFORSEO_DOC))));
  const { records } = await runProviders('contoso.example', 'us', ['semrush', 'dataforseo'], { env: ENV, fetchImpl: r.fetchImpl, cacheDir: dir, now: NOW });
  assert.equal(records[0].failed, true);
  assert.match(records[0].note, /HTTP 503/);
  assert.equal(records[1].metrics.organicKeywords, 1788);
  assert.deepEqual(fs.readdirSync(dir).map((f) => f.split('-')[0]), ['dataforseo']);
  assert.equal(exitCodeFor(records), 1);
  assert.equal(exitCodeFor(records.slice(1)), 0);
});

test('a failed provider marks the metrics it would have filled, so prose and score see the gap', async () => {
  const r = recorder(() => new Response('denied', { status: 401 }));
  const { records } = await runProviders('fabrikam.example', 'us', ['semrush'], { env: ENV, fetchImpl: r.fetchImpl, now: NOW });
  const evidence = { ...example('evidence.json'), providers: records };
  const items = providerItems(records);
  for (const id of ['seo.organic_keywords.semrush', 'seo.organic_traffic.semrush', 'paid.paid_keywords.semrush']) {
    assert.equal(items.find((i) => i.id === id).type, 'not_identified', id);
  }
  const research = example('research.json');
  research.findings.seo.diagnosis = 'Zero organic keywords.';
  assert.ok(validate(evidence, research).errors.some((e) => e.code === 'E_ABSENCE' && /seo.organic_keywords.semrush/.test(e.message)));
  const s = score(validate(evidence, example('research.json')).items);
  assert.ok(s.axes.seo.unknown >= 2, 'the missing Semrush numbers count as unknown');
  const html = render({ evidence, research: example('research.json'), items: validate(evidence, example('research.json')).items, score: s, lang: 'pt-BR' });
  assert.match(html, /Semrush: a consulta falhou \(HTTP 401\)/);
  assert.doesNotMatch(html, /Semrush: Semrush/);
});

test('a bug in our own code is not reported as a provider failure', async () => {
  const original = PROVIDERS.semrush.fetch;
  PROVIDERS.semrush.fetch = async () => { throw new TypeError("Cannot read properties of undefined (reading 'x')"); };
  try {
    await assert.rejects(runProviders('contoso.example', 'us', ['semrush'], { env: ENV, now: NOW }), TypeError);
  } finally {
    PROVIDERS.semrush.fetch = original;
  }
});

test('a network error that quotes the URL never puts the key in the evidence', async () => {
  const r = recorder((url) => { throw new Error(`connect ECONNREFUSED ${url}`); });
  const { records } = await runProviders('contoso.example', 'us', ['semrush', 'similarweb'], { env: ENV, fetchImpl: r.fetchImpl, now: NOW });
  const dump = JSON.stringify(records);
  assert.doesNotMatch(dump, /sk-test-semrush|sw-test-key/);
  assert.equal(records[0].note, 'request did not complete (network error)');
});

test('a non-JSON answer is a provider failure; a billed DataForSEO task error keeps its cost', async () => {
  const html = recorder(() => new Response('<html>maintenance</html>', { status: 200 }));
  const sw = await runProviders('contoso.example', 'us', ['similarweb'], { env: ENV, fetchImpl: html.fetchImpl, now: NOW });
  assert.match(sw.records[0].note, /not JSON/);
  const billed = recorder(() => new Response(JSON.stringify({ status_code: 20000, cost: 0.0101, tasks: [{ status_code: 40501, status_message: 'Invalid Field', cost: 0.0101 }] })));
  const d = await runProviders('contoso.example', 'us', ['dataforseo'], { env: ENV, fetchImpl: billed.fetchImpl, now: NOW });
  assert.equal(d.records[0].failed, true);
  assert.equal(d.records[0].costUsd, 0.0101);
});

test('an unreadable cache file or a failed cache write never loses a paid result', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'footprint-'));
  fs.writeFileSync(path.join(dir, 'semrush-contoso.example-us-2026-10.json'), '{ broken');
  const r = recorder(() => new Response(SEMRUSH_DOC));
  const logs = [];
  const a = await runProviders('contoso.example', 'us', ['semrush'], { env: ENV, fetchImpl: r.fetchImpl, cacheDir: dir, now: NOW, log: (m) => logs.push(m) });
  assert.equal(a.records[0].metrics.organicKeywords, 5249);
  assert.ok(logs.some((m) => /cache file unreadable/.test(m)));
  const file = path.join(dir, 'not-a-dir');
  fs.writeFileSync(file, 'x');
  const b = await runProviders('contoso.example', 'us', ['semrush'], { env: ENV, fetchImpl: r.fetchImpl, cacheDir: path.join(file, 'cache'), now: NOW, log: (m) => logs.push(m) });
  assert.equal(b.records[0].metrics.organicKeywords, 5249);
  assert.ok(logs.some((m) => /cache could not be written/.test(m)));
});
