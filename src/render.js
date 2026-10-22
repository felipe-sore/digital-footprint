'use strict';

const { escapeHtml, noDashes, safeUrl } = require('./text');
const { strings, labelFor } = require('./i18n');
const DEFAULT_THEME = require('../config/theme.json');

// One self-contained HTML file. Nothing in it runs: no scripts at all, a
// Content-Security-Policy that blocks them anyway, every piece of text escaped,
// and only http/https links (opened with noopener). A website that puts
// "<script>" in its title cannot put a script in the client's report.

const NUMBERED = ['site', 'seo', 'social', 'paid', 'content', 'reputation', 'technical', 'branding'];
const T = (v) => escapeHtml(noDashes(v));

function link(url, text) {
  const href = safeUrl(url);
  return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${T(text)}</a>` : T(text);
}

function number(v, locale, digits = 1) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
}

function compact(v, locale) {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

function formatValue(item, t, locale) {
  if (item.type === 'not_identified') return '<span class="ni">N/I</span>';
  const v = item.value;
  let out;
  switch (item.unit) {
    case 'bool': out = T(v ? t.yes : t.no); break;
    case 'count': out = T(compact(v, locale)); break;
    case 'usd': out = T(`US$ ${compact(v, locale)}`); break;
    case '%': out = T(`${number(v, locale)}%`); break;
    case 'ms': out = T(`${number(v / 1000, locale, 2)} s`); break;
    case 'rating': out = T(`${number(v, locale)}/${item.scale}`); break;
    case 'list': out = Array.isArray(v) && v.length ? v.map(T).join(' <span class="sep">·</span> ') : T(t.notOnHome); break;
    case 'url': out = link(v, String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')); break;
    default: out = String(v ?? '').trim() ? T(v) : T(t.notOnHome);
  }
  const numeric = ['count', 'usd', '%', 'ms', 'rating'].includes(item.unit);
  return (item.type === 'estimate' || item.type === 'provider_estimate') && numeric ? `~${out}` : out;
}

function meta(item, t, locale) {
  const parts = [];
  if (item.type === 'provider_estimate') parts.push(T(`${item.provider}, ${item.period}, ${item.market}`));
  if (item.type === 'estimate') parts.push(T(`${t.est} ${item.basis}`));
  if (item.type === 'not_identified') parts.push(T(item.note || t.checkManually));
  if (item.unit === 'rating') {
    if (item.reviews !== undefined) parts.push(T(`${compact(item.reviews, locale)} ${t.reviews}`));
    if (item.responseRate !== undefined && item.responseRate !== null) parts.push(T(`${number(item.responseRate, locale)}% ${t.answered}`));
  }
  if ((item.type === 'fact' || item.type === 'provided') && !item.auto && item.source) {
    parts.push(item.source.url ? link(item.source.url, item.source.name || item.source.url) : T(item.source.name));
  }
  if (item.note && item.type !== 'not_identified') parts.push(T(item.note));
  return parts.join(' · ');
}

function itemsTable(items, t, lang, locale) {
  if (!items.length) return '';
  const rows = items.map((i) => `<tr class="t-${i.type}"><td>${T(labelFor(i, lang))}</td><td class="v">${formatValue(i, t, locale)}</td><td class="meta">${meta(i, t, locale)}</td></tr>`);
  return `<table class="items">${rows.join('')}</table>`;
}

function diag(block, t) {
  if (!block) return '';
  const rows = ['diagnosis', 'evidence', 'opportunity', 'risk']
    .filter((k) => block[k])
    .map((k) => `<div class="diag-row d-${k}"><div class="dl">${T(t.diag[k])}</div><div>${T(block[k])}</div></div>`);
  return rows.length ? `<div class="diag">${rows.join('')}</div>` : '';
}

function badge(level, t) {
  return `<span class="badge lvl-${level}">${T(t.levels[level])}</span>`;
}

function section(key, n, t, lang, locale, { items, research, score }) {
  const own = items.filter((i) => i.section === key);
  const level = key === 'branding' ? 'not_scored' : (score.axes[key] || {}).level || 'not_identified';
  const critical = research.critical && research.critical[key]
    ? `<span class="badge lvl-critical">${T(t.critical)}</span>` : '';
  let extra = '';
  if (key === 'reputation' && (research.complaints || []).length) {
    extra = `<h3>${T(t.complaints)}</h3><div class="complaints">${research.complaints.map((c) => `<div class="complaint">${link(c.url, c.title)}<span>${T(c.source || '')}</span></div>`).join('')}</div>`;
  }
  return `<section id="s-${key}"><div class="sh"><span class="num">${String(n).padStart(2, '0')}</span><h2>${T(t.sections[key])}</h2>${badge(level, t)}${critical}</div>
${itemsTable(own, t, lang, locale)}${diag((research.findings || {})[key], t)}${extra}</section>`;
}

function trafficSection(items, t, lang, locale) {
  const own = items.filter((i) => i.section === 'traffic');
  if (!own.length) return '';
  const channels = own.filter((i) => i.unit === '%' && i.type !== 'not_identified');
  const others = own.filter((i) => !channels.includes(i));
  const bars = channels.map((c) => `<div class="ch"><div class="chl">${T(labelFor(c, lang))}</div><div class="bar"><span style="width:${Math.max(0, Math.min(100, Number(c.value) || 0))}%"></span></div><div class="chv">${formatValue(c, t, locale)}</div></div>`);
  const source = channels[0] ? `<p class="meta">${meta(channels[0], t, locale)}</p>` : '';
  return `<section id="s-traffic"><div class="sh"><span class="num">··</span><h2>${T(t.sections.traffic)}</h2></div>${itemsTable(others, t, lang, locale)}${bars.length ? `<div class="channels">${bars.join('')}</div>${source}` : ''}</section>`;
}

function stat(label, item, t, locale) {
  return `<div class="stat"><div class="sl">${T(label)}</div><div class="sv">${item ? formatValue(item, t, locale) : '<span class="ni">N/I</span>'}</div><div class="ss">${item ? meta(item, t, locale) : ''}</div></div>`;
}

function css(theme) {
  const vars = Object.entries(theme).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `--${k}:${String(v).replace(/[;{}<>]/g, '')}`).join(';');
  return `:root{${vars}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent);text-decoration:none;border-bottom:1px solid rgba(255,255,255,.15)}a:hover{border-color:var(--accent)}
.wrap{max-width:980px;margin:0 auto;padding:0 16px}
header.hero{padding:64px 0 40px;background:radial-gradient(ellipse 60% 60% at 15% 40%,rgba(94,234,212,.08),transparent 70%),radial-gradient(ellipse 60% 60% at 85% 50%,rgba(165,180,252,.08),transparent 70%)}
.tag{text-transform:uppercase;letter-spacing:.14em;font-size:12px;color:var(--accent);font-weight:600}
h1{font-size:40px;line-height:1.15;margin:10px 0}h1 b{color:var(--accent)}
.sub{color:var(--muted)}.metaRow{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:16px;color:var(--dim);font-size:13px}
nav{position:sticky;top:0;z-index:2;background:rgba(18,20,23,.85);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
nav .wrap{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 16px;padding:10px 16px;font-size:13px}nav a{color:var(--muted);border:0}nav a:hover{color:var(--accent)}
section{padding:36px 0;border-bottom:1px solid var(--border)}
.sh{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:16px}.sh h2{margin:0;font-size:22px}
.num{background:var(--accent);color:#0b0d10;font-weight:700;border-radius:6px;padding:2px 8px;font-size:13px}
.badge{font-size:12px;border-radius:999px;padding:2px 10px;border:1px solid var(--border)}
.lvl-initial,.lvl-critical{background:rgba(248,113,113,.12);color:var(--red)}.lvl-intermediate{background:rgba(251,146,60,.12);color:var(--orange)}
.lvl-advanced{background:rgba(74,222,128,.12);color:var(--green)}.lvl-not_identified,.lvl-not_scored{color:var(--muted)}
table.items{width:100%;border-collapse:collapse;background:var(--card);border-radius:10px;overflow:hidden}
table.items td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:top}table.items td.v{font-weight:600;white-space:normal}
td.meta,p.meta,.ss{color:var(--dim);font-size:12.5px}.ni{color:var(--orange);font-weight:600}.sep{color:var(--dim)}
.diag{margin-top:14px;display:grid;gap:8px}.diag-row{background:var(--card2);border-left:3px solid var(--dim);border-radius:6px;padding:10px 14px}
.dl{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:2px}
.d-diagnosis{border-color:var(--accent2)}.d-opportunity{border-color:var(--green)}.d-risk{border-color:var(--red)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:18px 0}
.stat{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px}.sl{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.sv{font-size:24px;font-weight:700}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 18px}.card p:first-child{margin-top:0}.card p:last-child{margin-bottom:0}
.notice{background:rgba(251,146,60,.1);border:1px solid rgba(251,146,60,.3);border-radius:10px;padding:12px 16px;margin-bottom:14px}
.complaints{display:grid;gap:8px}.complaint{background:rgba(248,113,113,.08);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.complaint span{color:var(--dim);font-size:12.5px}
.channels{display:grid;gap:8px;margin-top:12px}.ch{display:grid;grid-template-columns:140px 1fr 70px;gap:10px;align-items:center}.bar{height:8px;background:var(--card2);border-radius:99px;overflow:hidden}.bar span{display:block;height:100%;background:var(--accent)}.chv{text-align:right;font-weight:600}
.maturity td.lvl{text-align:right}.legend{font-size:12.5px;color:var(--muted);margin-top:12px}
footer{padding:28px 0 48px;color:var(--dim);font-size:12.5px}footer b{color:var(--text)}
@media (max-width:640px){h1{font-size:30px}.ch{grid-template-columns:90px 1fr 56px}table.items td{display:block;border:0;padding:4px 12px}table.items tr{display:block;border-bottom:1px solid var(--border);padding:6px 0}}`;
}

function render({ evidence, research = {}, items, score, lang = 'en', theme = DEFAULT_THEME, now = new Date() }) {
  const t = strings(lang);
  const locale = lang === 'pt-BR' ? 'pt-BR' : 'en-US';
  const company = { ...evidence.company, ...(research.company || {}), domain: evidence.company.domain };
  const first = (prefix) => items.find((i) => (i.id === prefix || i.id.startsWith(`${prefix}.`)) && i.type !== 'not_identified');
  const ctx = { items, research, score };

  const metaRow = [company.segment, company.location, company.founded, company.team, now.toISOString().slice(0, 10)].filter(Boolean).map((m) => `<span>${T(m)}</span>`).join('');
  const navKeys = ['overview', ...NUMBERED, ...(items.some((i) => i.section === 'traffic') ? ['traffic'] : []), 'maturity', 'conclusion'];
  const site = evidence.site || {};
  const notice = site.status && site.status !== 'ok'
    ? `<div class="notice">${T(`${t.siteNotRead}: ${site.status.replace(/_/g, ' ')}`)}</div>`
    : site.jsRendered ? `<div class="notice">${T(t.jsPage)}</div>` : '';

  const overview = `<section id="s-overview"><div class="sh"><span class="num">00</span><h2>${T(t.sections.overview)}</h2></div>${notice}
<div class="stats">${stat(t.overall, null, t, locale).replace('<span class="ni">N/I</span>', badge(score.overall.level, t))}${stat(labelFor({ id: 'traffic.total_visits' }, lang), first('traffic.total_visits'), t, locale)}${stat(labelFor({ id: 'seo.organic_traffic' }, lang), first('seo.organic_traffic'), t, locale)}${(() => { const r = items.find((i) => i.unit === 'rating' && i.type !== 'not_identified'); return r ? stat(labelFor(r, lang), r, t, locale) : ''; })()}</div>
${(research.overview || []).length ? `<div class="card">${research.overview.map((p) => `<p>${T(p)}</p>`).join('')}</div>` : ''}
<p class="legend">${T(t.legend)}</p></section>`;

  const numbered = NUMBERED.map((key, k) => section(key, k + 1, t, lang, locale, ctx)).join('\n');

  const maturityRows = [...Object.entries(score.axes).map(([axis, a]) => `<tr><td>${T(t.sections[axis])}</td><td class="meta">${T(t.passFail(a.pass, a.fail, a.unknown))}</td><td class="lvl">${badge(a.level, t)}</td></tr>`),
    `<tr><td>${T(t.sections.branding)}</td><td class="meta"></td><td class="lvl">${badge('not_scored', t)}</td></tr>`];
  const maturity = `<section id="s-maturity"><div class="sh"><span class="num">09</span><h2>${T(t.sections.maturity)}</h2>${badge(score.overall.level, t)}</div><table class="items maturity">${maturityRows.join('')}</table></section>`;

  const conclusion = `<section id="s-conclusion"><div class="sh"><span class="num">10</span><h2>${T(t.sections.conclusion)}</h2></div>${(research.conclusion || []).length ? `<div class="card">${research.conclusion.map((p) => `<p>${T(p)}</p>`).join('')}</div>` : ''}</section>`;

  const sources = [...new Map(items.filter((i) => i.source && i.source.name).map((i) => [i.source.name, i.source])).values()];
  const footer = `<footer><div class="wrap"><b>Digital Footprint</b>: ${T(company.name)} · ${T(t.sources)}: ${sources.map((s) => (s.url && !/^Website$/.test(s.name) ? link(s.url, s.name) : T(s.name))).join(', ')} · ${T(t.generated)} ${T(now.toISOString().slice(0, 10))}</div></footer>`;

  return `<!doctype html>
<html lang="${lang === 'pt-BR' ? 'pt-BR' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${T(`Digital Footprint: ${company.name}`)}</title>
<style>${css(theme)}</style>
</head>
<body>
<header class="hero"><div class="wrap"><div class="tag">${T(t.tagline)}</div><h1>Digital Footprint: <b>${T(company.name)}</b></h1><div class="sub">${link(`https://${company.domain}/`, company.domain)}</div><div class="metaRow">${metaRow}</div></div></header>
<nav><div class="wrap">${navKeys.map((k) => `<a href="#s-${k}">${T(t.sections[k])}</a>`).join('')}</div></nav>
<main class="wrap">
${overview}
${numbered}
${trafficSection(items, t, lang, locale)}
${maturity}
${conclusion}
</main>
${footer}
</body>
</html>
`;
}

module.exports = { render, formatValue };
