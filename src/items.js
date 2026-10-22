'use strict';

const { slug } = require('./text');
const { strings } = require('./i18n');

// Everything in the report is an item: one number or fact, its section, and
// how much it can be trusted.
//
//   fact               read directly (the site, a public page the agent opened)
//   provided           given by the user (a legible export, a number from the client)
//   estimate           derived or read from a poor screenshot: needs its basis
//   provider_estimate  a paid tool's model (Semrush, Similarweb, DataForSEO):
//                      needs provider, period and market
//   not_identified     the source was blocked or the data was not found: no value,
//                      and never reported as zero or absent

const SECTIONS = ['site', 'seo', 'social', 'paid', 'content', 'reputation', 'technical', 'branding', 'traffic'];
const TYPES = ['fact', 'provided', 'estimate', 'provider_estimate', 'not_identified'];
const AD_TAGS = ['googleAds', 'metaPixel', 'linkedinInsight', 'tiktokPixel'];
const MEASUREMENT_TAGS = ['ga4', 'gtm', 'hubspot', 'rdstation', 'hotjar'];
const MAIN_SOCIALS = ['linkedin', 'instagram', 'youtube'];

// Notes are stored in English for evidence.json, with a key the report translates.
const EN = strings('en').notes;
const noted = (key, args = {}) => ({ note: EN[key](args), noteKey: key, noteArgs: args });

function siteItems(evidence) {
  const s = evidence.site || {};
  const source = { name: 'Website', url: s.finalUrl || `https://${evidence.company.domain}/` };
  const items = [];
  const fact = (id, section, value, unit, extra = {}) => items.push({ id, section, value, unit, type: 'fact', source, auto: true, ...extra });
  const notIdentified = (id, section, unit, key, args) => items.push({ id, section, value: null, unit, type: 'not_identified', ...noted(key, args), source, auto: true });

  if (s.status !== 'ok') {
    const [key, args] = {
      disallowed_by_robots: ['robots_disallow'],
      blocked: ['blocked'],
      unreachable: ['unreachable', { error: s.error || '' }],
      error: ['http_error', { status: s.httpStatus }],
    }[s.status] || ['not_read'];
    for (const [id, section, unit] of [['site.title', 'site', 'text'], ['site.ctas', 'site', 'list'], ['technical.https', 'technical', 'bool'], ['technical.viewport', 'technical', 'bool'], ['content.blog_link', 'content', 'bool']]) {
      notIdentified(id, section, unit, key, args);
    }
    for (const tag of AD_TAGS) notIdentified(`paid.tag.${tag}`, 'paid', 'bool', key, args);
    return items;
  }

  // On a JavaScript page, something missing from the HTML may simply not be rendered yet.
  const absent = (id, section, unit, emptyValue) => (s.jsRendered ? notIdentified(id, section, unit, 'js_page') : fact(id, section, emptyValue, unit));
  const textOrAbsent = (id, section, value) => (value ? fact(id, section, value, 'text') : absent(id, section, 'text', ''));
  const listOrAbsent = (id, section, list) => (list && list.length ? fact(id, section, list, 'list') : absent(id, section, 'list', []));

  textOrAbsent('site.title', 'site', s.title);
  textOrAbsent('site.description', 'site', s.description);
  listOrAbsent('site.h1', 'site', s.h1);
  listOrAbsent('site.ctas', 'site', (s.ctas || []).map((c) => c.text));
  if (s.forms) fact('site.forms', 'site', s.forms, 'count'); else absent('site.forms', 'site', 'count', 0);
  listOrAbsent('site.structured_data', 'site', s.structuredData);
  if (s.jsRendered) fact('technical.js_rendered', 'technical', true, 'bool', noted('js_page'));

  fact('technical.https', 'technical', Boolean(s.https), 'bool');
  if (s.httpToHttps === null || s.httpToHttps === undefined) notIdentified('technical.http_to_https', 'technical', 'bool', 'http_no_answer');
  else fact('technical.http_to_https', 'technical', s.httpToHttps, 'bool');
  fact('technical.viewport', 'technical', Boolean(s.viewport), 'bool');
  fact('technical.response_ms', 'technical', s.responseMs, 'ms');
  fact('technical.robots', 'technical', Boolean(s.robots && s.robots.found), 'bool');
  const sm = s.sitemap || {};
  if (sm.found === null || sm.found === undefined) notIdentified('technical.sitemap', 'technical', 'bool', 'sitemap_unread');
  else fact('technical.sitemap', 'technical', sm.found, 'bool');
  if (sm.found) fact(sm.index ? 'seo.sitemap_files' : 'seo.sitemap_entries', 'seo', sm.entries, 'count');

  const tags = s.tags || {};
  for (const t of MEASUREMENT_TAGS) {
    if (tags[t]) fact(`technical.tag.${t}`, 'technical', true, 'bool'); else notIdentified(`technical.tag.${t}`, 'technical', 'bool', 'not_in_html');
  }
  for (const t of AD_TAGS) {
    if (tags[t]) fact(`paid.tag.${t}`, 'paid', true, 'bool'); else notIdentified(`paid.tag.${t}`, 'paid', 'bool', 'not_in_html');
  }

  const socials = s.socials || {};
  for (const [name, url] of Object.entries(socials)) fact(`social.${name}.link`, 'social', url, 'url');
  for (const name of MAIN_SOCIALS) {
    if (!socials[name]) notIdentified(`social.${name}.link`, 'social', 'url', 'no_link_home');
  }

  if (s.blogLink) fact('content.blog_link', 'content', true, 'bool'); else absent('content.blog_link', 'content', 'bool', false);
  return items;
}

const METRIC_ITEMS = {
  organicTraffic: ['seo', 'seo.organic_traffic', 'count'],
  organicKeywords: ['seo', 'seo.organic_keywords', 'count'],
  organicSearchVisits: ['seo', 'seo.organic_search_visits', 'count'],
  paidTraffic: ['paid', 'paid.paid_traffic', 'count'],
  paidKeywords: ['paid', 'paid.paid_keywords', 'count'],
  paidCostUsd: ['paid', 'paid.paid_cost_usd', 'usd'],
  paidSearchVisits: ['paid', 'paid.paid_search_visits', 'count'],
  totalVisits: ['traffic', 'traffic.total_visits', 'count'],
};

function providerItems(records = []) {
  const items = [];
  for (const r of records) {
    const base = { type: 'provider_estimate', provider: r.label, period: r.period, market: String(r.market).toUpperCase(), source: { name: r.label }, auto: true };
    if (!r.metrics) {
      // Mark every metric this provider would have filled, in its own section, so the
      // absence rule and the maturity coverage see that the data is missing.
      const n = noted(r.failed ? 'provider_failed' : 'provider_no_data', { provider: r.label, reason: r.note || '' });
      const keys = (r.fills || []).filter((k) => METRIC_ITEMS[k]);
      if (!keys.length) items.push({ id: `traffic.no_data.${r.provider}`, section: 'traffic', value: null, unit: 'count', type: 'not_identified', ...n, source: { name: r.label }, auto: true });
      for (const key of keys) {
        const [section, id, unit] = METRIC_ITEMS[key];
        items.push({ id: `${id}.${r.provider}`, section, value: null, unit, type: 'not_identified', ...n, source: { name: r.label }, auto: true });
      }
      continue;
    }
    for (const [key, [section, id, unit]] of Object.entries(METRIC_ITEMS)) {
      const v = r.metrics[key];
      if (v === null || v === undefined) continue;
      items.push({ ...base, id: `${id}.${r.provider}`, section, value: v, unit });
    }
    for (const c of r.metrics.channels || []) {
      items.push({ ...base, id: `traffic.channel.${slug(c.channel)}.${r.provider}`, section: 'traffic', label: c.channel, value: Math.round(c.share * 10) / 10, unit: '%' });
    }
  }
  return items;
}

// "auto" marks items the code made itself; research.json cannot claim it.
function allItems(evidence, research = {}) {
  const researched = (research.items || []).map(({ auto, ...item }) => item);
  return [...siteItems(evidence), ...providerItems(evidence.providers), ...researched];
}

module.exports = { siteItems, providerItems, allItems, SECTIONS, TYPES, AD_TAGS, MEASUREMENT_TAGS };
