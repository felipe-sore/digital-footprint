'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { render } = require('../src/render');
const { validate } = require('../src/validate');
const { score } = require('../src/score');
const { example } = require('./helpers');

const NOW = new Date('2026-10-22T12:00:00Z');

function build({ evidence = example('evidence.json'), research = example('research.json'), lang = 'en' } = {}) {
  const v = validate(evidence, research);
  assert.deepEqual(v.errors, []);
  return render({ evidence, research, items: v.items, score: score(v.items), lang, now: NOW });
}

test('the report runs nothing: no script, a blocking CSP, no external resources', () => {
  const html = build();
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
  assert.doesNotMatch(html, /<link |src="http/);
});

test('text from a website is escaped, and javascript: links never become links', () => {
  const evidence = example('evidence.json');
  evidence.site.title = '<script>alert("pwned")</script> Fabrikam';
  evidence.site.ctas.push({ text: '<img src=x onerror=alert(1)>', url: null });
  const research = example('research.json');
  research.overview.push('<b onclick="x()">bold</b>');
  research.complaints.push({ title: 'Click me', url: 'https://trustpilot.example/reviews/1003', source: '<i>x</i>' });
  const html = build({ evidence, research });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(&quot;pwned&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<b onclick/);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('every kind of number reads as what it is', () => {
  const html = build();
  assert.match(html, /~3\.9K/, 'a provider number starts with ~');
  assert.match(html, /Semrush, 2026-10, US/);
  assert.match(html, /Similarweb, 2026-09, US/);
  assert.match(html, /est\. 18 posts visible/);
  assert.match(html, /<span class="ni">N\/I<\/span>/);
  assert.match(html, /the Ad Library asked for a login; check manually/);
  assert.match(html, /64% answered/);
});

test('no long dashes in the report, even when the research has them', () => {
  const research = example('research.json');
  research.conclusion.push('Strong base — weak proof.');
  const html = build({ research });
  assert.doesNotMatch(html, /—|–/);
  assert.match(html, /Strong base, weak proof\./);
});

test('Portuguese report', () => {
  const html = build({ lang: 'pt-BR' });
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /Visão geral/);
  assert.match(html, /Maturidade digital/);
  assert.match(html, /Tráfego orgânico por mês/);
});

test('a JavaScript page or a blocked site is said up front', () => {
  const ev = example('evidence.json');
  ev.site = { status: 'blocked', finalUrl: 'https://www.fabrikam.example/' };
  const research = example('research.json');
  research.findings = {};
  assert.match(build({ evidence: ev, research }), /The homepage was not read: blocked/);
});

test('CLI: check refuses a broken research.json and writes nothing; render writes the report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'footprint-cli-'));
  fs.copyFileSync(path.join(__dirname, '..', 'examples', 'evidence.json'), path.join(dir, 'evidence.json'));
  const research = example('research.json');
  research.findings.paid.diagnosis = 'They run zero ads.';
  fs.writeFileSync(path.join(dir, 'research.json'), JSON.stringify(research));
  const bin = path.join(__dirname, '..', 'bin', 'digital-footprint.js');
  const bad = spawnSync(process.execPath, [bin, 'render', dir], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /E_ABSENCE/);
  assert.equal(fs.existsSync(path.join(dir, 'report.html')), false);

  fs.copyFileSync(path.join(__dirname, '..', 'examples', 'research.json'), path.join(dir, 'research.json'));
  const good = spawnSync(process.execPath, [bin, 'render', dir, '--lang', 'pt-BR'], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'report.html'), 'utf8'), /Fabrikam Analytics/);
});

test('CLI: a dry run names the cost and calls nothing', () => {
  const bin = path.join(__dirname, '..', 'bin', 'digital-footprint.js');
  const r = spawnSync(process.execPath, [bin, 'collect', 'contoso.example', '--providers', 'semrush,dataforseo', '--dry-run'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(r.status, 1, 'missing keys: the real run would stop');
  assert.match(r.stderr, /would stop: Semrush needs SEMRUSH_API_KEY/);
  assert.match(r.stderr, /Semrush: 1 request\(s\), 10 API units; missing SEMRUSH_API_KEY/);
  assert.match(r.stderr, /DataForSEO: 1 request\(s\)/);
});

test('notes written by the code are translated in the Portuguese report', () => {
  const html = build({ lang: 'pt-BR' });
  assert.match(html, /não está no HTML da página/);
  assert.doesNotMatch(html, /not in the page HTML/);
});

test('the report date is the collection date, so rebuilding it changes nothing', () => {
  const a = build();
  const v = validate(example('evidence.json'), example('research.json'));
  const b = render({ evidence: example('evidence.json'), research: example('research.json'), items: v.items, score: score(v.items), now: new Date('2030-01-01T00:00:00Z') });
  assert.equal(a, b);
  assert.match(a, /Data collected 2026-10-22/);
});
