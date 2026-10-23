'use strict';

const cheerio = require('cheerio');

// What a prospect sees on the homepage, read from the HTML the server sends.
// No browser runs here: a page built by JavaScript is flagged, and whatever
// could not be read is reported as not identified, never as missing.

// Anti-bot challenge pages, not the company's site.
const CHALLENGE = ['<title>just a moment', '<title>attention required', 'cf-chl-', 'cf-browser-verification', '<title>access denied', 'verify you are human'];

// Calls to action in English, Portuguese and Spanish.
const CTA = /\b(contact|contact us|talk to|book a|book|schedule|get started|start free|free trial|try (it )?free|request|get a quote|quote|demo|sign up|subscribe|whatsapp|fale|contato|agende|agendar|orçamento|orcamento|solicite|teste grátis|teste gratis|comece|cadastre|hable|contacto|solicitar|prueba gratis)\b/i;

const SOCIAL_HOSTS = [
  ['linkedin', /(^|\.)linkedin\.com$/],
  ['instagram', /(^|\.)instagram\.com$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/],
  ['facebook', /(^|\.)facebook\.com$/],
  ['x', /(^|\.)(x\.com|twitter\.com)$/],
  ['tiktok', /(^|\.)tiktok\.com$/],
  ['whatsapp', /(^|\.)(wa\.me|api\.whatsapp\.com)$/],
];

const SHARE_PATH = /\/(sharer|share|sharing|intent|shareArticle|dialog\/(share|feed))(\.php)?(\/|$)/i;

// Tags found in the HTML. A tag manager can load others later, so a tag that
// is not here is "not identified", not "absent".
const TAGS = {
  ga4: /googletagmanager\.com\/gtag\/js\?id=G-|gtag\(\s*['"]config['"]\s*,\s*['"]G-/,
  gtm: /googletagmanager\.com\/gtm\.js|['"]GTM-[A-Z0-9]{4,}['"]/,
  googleAds: /['"]AW-\d{6,}['"]|googleadservices\.com\/pagead\/conversion/,
  metaPixel: /connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(\s*['"]init['"]/,
  linkedinInsight: /snap\.licdn\.com\/li\.lms-analytics|_linkedin_partner_id/,
  tiktokPixel: /analytics\.tiktok\.com\/i18n\/pixel/,
  hubspot: /js\.hs-scripts\.com|js\.hsforms\.net|js\.hs-analytics\.net/,
  rdstation: /d335luupugsy2\.cloudfront\.net|rdstation\.com\.br\/(?:js|forms)/,
  hotjar: /static\.hotjar\.com|script\.hotjar\.com/,
};

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function isChallenge(status, html) {
  const head = String(html || '').slice(0, 20000).toLowerCase();
  return status === 403 || CHALLENGE.some((s) => head.includes(s));
}

function absolute(href, base) {
  try {
    const u = new URL(href, base);
    return ['http:', 'https:'].includes(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

function jsonLdTypes($) {
  const types = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const t of [].concat(node['@type'] || [])) types.add(String(t));
    if (node['@graph']) walk(node['@graph']);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try { walk(JSON.parse($(el).text())); } catch { /* invalid JSON-LD is ignored */ }
  });
  return [...types];
}

function extract(html, baseUrl) {
  const $ = cheerio.load(String(html || ''));
  const raw = String(html || '');

  const socials = {};
  const ctas = [];
  let blogLink = false;
  $('a[href], button').each((_, el) => {
    const node = $(el);
    const text = clean(node.text()).slice(0, 80);
    const url = node.is('a') ? absolute(node.attr('href'), baseUrl) : null;
    if (url) {
      const host = url.hostname.toLowerCase();
      // "Share on LinkedIn" buttons point at the network, not at the company's profile.
      const isShare = SHARE_PATH.test(url.pathname);
      for (const [name, re] of SOCIAL_HOSTS) if (re.test(host) && !socials[name] && !isShare) socials[name] = url.toString();
      if (/\/blog(\/|$)/i.test(url.pathname) || /^blog$/i.test(text)) blogLink = true;
    }
    if (text && CTA.test(text) && !ctas.some((c) => c.text.toLowerCase() === text.toLowerCase()) && ctas.length < 10) {
      ctas.push({ text, url: url ? url.toString() : null });
    }
  });

  const tags = Object.fromEntries(Object.entries(TAGS).map(([k, re]) => [k, re.test(raw)]));

  // A page whose body is almost empty but loads scripts is rendered in the browser.
  const bodyText = clean($('body').clone().find('script,style,noscript').remove().end().text());
  const jsRendered = bodyText.length < 200 && $('script[src]').length > 0;

  return {
    title: clean($('title').first().text()) || null,
    description: clean($('meta[name="description" i]').attr('content')) || null,
    lang: $('html').attr('lang') || null,
    h1: $('h1').map((_, el) => clean($(el).text())).get().filter(Boolean).slice(0, 5),
    h2: $('h2').map((_, el) => clean($(el).text())).get().filter(Boolean).slice(0, 10),
    ctas,
    forms: $('form').length,
    viewport: $('meta[name="viewport" i]').length > 0,
    structuredData: jsonLdTypes($),
    socials,
    tags,
    blogLink,
    jsRendered,
  };
}

module.exports = { extract, isChallenge, TAGS };
