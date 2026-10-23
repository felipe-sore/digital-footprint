'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extract, isChallenge } = require('../src/site');
const { robotsAllows, sitemapsFrom } = require('../src/robots');
const { fixture } = require('./helpers');

test('homepage: title, description, headings, calls to action, forms, viewport, structured data', () => {
  const s = extract(fixture('home.html'), 'https://contoso.example/');
  assert.equal(s.title, 'Contoso Logistics | Freight software for mid-size carriers');
  assert.equal(s.description, 'Plan loads, track trucks and bill customers in one place.');
  assert.equal(s.lang, 'en');
  assert.deepEqual(s.h1, ['Freight software that carriers actually use']);
  assert.deepEqual(s.ctas.map((c) => c.text).sort(), ['Book a demo', 'Contact us', 'Get started', 'WhatsApp']);
  assert.equal(s.ctas.find((c) => c.text === 'Contact us').url, null, 'a javascript: link is never kept');
  assert.equal(s.forms, 1);
  assert.equal(s.viewport, true);
  assert.deepEqual(s.structuredData.sort(), ['Organization', 'WebSite']);
  assert.equal(s.blogLink, true);
  assert.equal(s.jsRendered, false);
});

test('homepage: social links and tags found in the HTML', () => {
  const s = extract(fixture('home.html'), 'https://contoso.example/');
  assert.deepEqual(Object.keys(s.socials).sort(), ['instagram', 'linkedin', 'whatsapp']);
  assert.equal(s.tags.ga4, true);
  assert.equal(s.tags.gtm, true);
  assert.equal(s.tags.metaPixel, true);
  assert.equal(s.tags.linkedinInsight, false);
  assert.equal(s.tags.googleAds, false);
});

test('a page built by JavaScript is flagged', () => {
  assert.equal(extract(fixture('spa.html'), 'https://initech.example/').jsRendered, true);
});

test('anti-bot pages are recognized', () => {
  assert.equal(isChallenge(200, '<html><head><title>Just a moment...</title>'), true);
  assert.equal(isChallenge(403, ''), true);
  assert.equal(isChallenge(200, '<script src="https://cdnjs.cloudflare.com/x.js"></script>'), false);
});

test('robots.txt: our group, then *, longest rule wins, Allow wins ties, wildcards', () => {
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', 'digital-footprint'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /admin', 'digital-footprint'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\n\nUser-agent: digital-footprint\nAllow: /', 'digital-footprint'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\nAllow: /$', 'digital-footprint'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*', 'digital-footprint'), false);
  assert.equal(robotsAllows('', 'digital-footprint'), true);
  assert.equal(robotsAllows('User-agent:\nDisallow: /\n\nUser-agent: *\nAllow: /', 'digital-footprint'), true, 'an empty user-agent names nobody');
  assert.deepEqual(sitemapsFrom('User-agent: *\nSitemap: https://contoso.example/sitemap_index.xml'), ['https://contoso.example/sitemap_index.xml']);
});

test('share buttons are not the company\'s profile', () => {
  const html = '<a href="https://www.linkedin.com/shareArticle?url=x">Share</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a><a href="https://twitter.com/intent/tweet?text=x">Tweet</a><a href="https://www.linkedin.com/company/acme">LinkedIn</a>';
  const s = extract(html, 'https://acme.example/');
  assert.deepEqual(s.socials, { linkedin: 'https://www.linkedin.com/company/acme' });
});
