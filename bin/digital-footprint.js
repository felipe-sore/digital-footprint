#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { collect, normalizeDomain } = require('../src/collect');
const { runProviders, preflight, exitCodeFor } = require('../src/providers');
const { parseArgs } = require('../src/args');
const { validate } = require('../src/validate');
const { score } = require('../src/score');
const { render } = require('../src/render');

const HELP = `Usage:
  digital-footprint collect <domain> [options]   read the public site (and providers you name) into evidence.json
  digital-footprint check <dir>                  validate research.json against the evidence rules
  digital-footprint render <dir> [--lang en|pt-BR]   validate, score and write report.html

Collect options:
  --name <text>              company name (default: the domain)
  --out <dir>                output folder (default: footprint-<domain>)
  --market <code>            us, br, uk, pt, de or es (default us)
  --providers <list>         semrush,similarweb,dataforseo (paid; nothing is called unless named)
  --dry-run                  show the provider requests and their cost, call nothing
  --max-requests <n>         refuse to make more paid requests than this (default 5)
  --no-site                  skip reading the website (providers only)

Environment (only for the providers you name): SEMRUSH_API_KEY, SIMILARWEB_API_KEY,
DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.
`;

const RESEARCH_TEMPLATE = {
  company: { segment: '', location: '', founded: '', team: '' },
  overview: [],
  items: [],
  complaints: [],
  findings: {},
  critical: {},
  conclusion: [],
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
const log = (m) => process.stderr.write(`${m}\n`);

async function runCollect(o) {
  const domain = normalizeDomain(o._[1]);
  const names = o.providers ? String(o.providers).split(',').map((s) => s.trim()).filter(Boolean) : [];
  const market = o.market || 'us';
  const maxRequests = o.maxRequests ?? 5;
  // Market, keys and the request cap are checked before anything is fetched,
  // and the dry run reports exactly what the real run would refuse.
  const pre = preflight(names, market, { maxRequests });
  if (o.dryRun) {
    if (!pre.steps.length) log('No providers named: nothing would be paid for. The site read is free.');
    for (const s of pre.steps) log(`${s.label}: ${s.requests} request(s), ${s.cost}${s.missing.length ? `; missing ${s.missing.join(', ')}` : ''}`);
    for (const p of pre.problems) log(`would stop: ${p}`);
    if (pre.problems.length) process.exitCode = 1;
    return;
  }
  if (pre.problems.length) throw new Error(pre.problems.join('; '));
  const out = o.out || `footprint-${domain}`;
  fs.mkdirSync(out, { recursive: true });
  const evidence = o.noSite
    ? { schema: 1, company: { name: o.name || domain, domain }, collectedAt: new Date().toISOString(), site: { status: 'skipped' }, providers: [] }
    : await collect(domain, { name: o.name });
  if (!o.noSite) log(`site: ${evidence.site.status}`);
  if (names.length) {
    const { records } = await runProviders(domain, market, names, { cacheDir: path.join(out, 'cache'), maxRequests, log });
    evidence.providers = records;
  }
  writeJson(path.join(out, 'evidence.json'), evidence);
  const researchFile = path.join(out, 'research.json');
  if (!fs.existsSync(researchFile)) writeJson(researchFile, RESEARCH_TEMPLATE);
  process.stdout.write(`${path.join(out, 'evidence.json')}\n${researchFile}\n`);
  const failed = evidence.providers.filter((r) => r.failed);
  if (failed.length) {
    log(`${failed.map((r) => r.label).join(', ')} failed: evidence.json was written without that data (it reads "not identified"). Fix the cause and run again.`);
    process.exitCode = exitCodeFor(evidence.providers);
  }
}

function load(dir) {
  const evidence = readJson(path.join(dir, 'evidence.json'));
  const researchFile = path.join(dir, 'research.json');
  const research = fs.existsSync(researchFile) ? readJson(researchFile) : {};
  return { evidence, research };
}

function check(dir) {
  const { evidence, research } = load(dir);
  const result = validate(evidence, research);
  for (const e of result.errors) log(`${e.code}  ${e.message}`);
  return { evidence, research, ...result };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const cmd = o._[0];
  if (o.help) { process.stdout.write(HELP); return; }
  // A mistyped command must not look like a passed check.
  if (!['collect', 'check', 'render'].includes(cmd)) {
    process.stderr.write(cmd ? `unknown command "${cmd}"\n\n${HELP}` : HELP);
    process.exit(1);
  }
  if (cmd === 'collect') return runCollect(o);
  const dir = o._[1];
  if (!dir) throw new Error(`${cmd} needs the folder that holds evidence.json`);
  const r = check(dir);
  if (!r.ok) {
    log(`\n${r.errors.length} problem(s). Nothing was written: fix research.json and run again.`);
    process.exitCode = 1;
    return;
  }
  if (cmd === 'check') { log('ok: every item follows the evidence rules'); return; }
  const html = render({ evidence: r.evidence, research: r.research, items: r.items, score: score(r.items), lang: o.lang || 'en' });
  const file = path.join(dir, 'report.html');
  fs.writeFileSync(file, html);
  process.stdout.write(`${file}\n`);
}

main().catch((err) => { log(`Error: ${err.message}`); process.exit(1); });
