'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { collect, normalizeDomain } = require('../src/collect');
const { siteItems } = require('../src/items');
const { fixture, lookupStub, fetchStub, html, redirect } = require('./helpers');

const http = (routes) => ({ ...fetchStub(routes), lookup: lookupStub() });

test('domains are normalized', () => {
  assert.equal(normalizeDomain('https://www.Contoso.example/about'), 'contoso.example');
  assert.equal(normalizeDomain('contoso.example'), 'contoso.example');
  assert.throws(() => normalizeDomain(''), /give a domain/);
});

test('collect: robots, http to https, homepage and sitemap', async () => {
  const h = http({
    'https://contoso.example/robots.txt': new Response('User-agent: *\nDisallow: /admin\nSitemap: https://contoso.example/sitemap.xml'),
    'http://contoso.example/': redirect('https://contoso.example/'),
    'https://contoso.example/': html(fixture('home.html')),
    'https://contoso.example/sitemap.xml': new Response('<urlset><url><loc>https://contoso.example/</loc></url><url><loc>https://contoso.example/blog/</loc></url></urlset>'),
  });
  const ev = await collect('contoso.example', { name: 'Contoso', http: h, now: new Date('2026-10-22T12:00:00Z') });
  assert.equal(ev.company.name, 'Contoso');
  assert.equal(ev.site.status, 'ok');
  assert.equal(ev.site.httpToHttps, true);
  assert.equal(ev.site.https, true);
  assert.equal(ev.site.title, 'Contoso Logistics | Freight software for mid-size carriers');
  assert.deepEqual(ev.site.sitemap, { found: true, entries: 2, index: false, url: 'https://contoso.example/sitemap.xml' });
  assert.equal(ev.collectedAt, '2026-10-22T12:00:00.000Z');
});

test('collect: a site that asks crawlers to stay out is not read', async () => {
  const h = http({ 'https://private.example/robots.txt': new Response('User-agent: *\nDisallow: /') });
  const ev = await collect('private.example', { http: h });
  assert.equal(ev.site.status, 'disallowed_by_robots');
  assert.equal(h.calls.length, 1, 'only robots.txt was requested');
});

test('collect: an anti-bot page is "blocked", and the report says not identified', async () => {
  const h = http({
    'http://shield.example/': html('<html><head><title>Just a moment...</title></head></html>', 503),
  });
  const ev = await collect('shield.example', { http: h });
  assert.equal(ev.site.status, 'blocked');
  const items = siteItems(ev);
  assert.ok(items.every((i) => i.type === 'not_identified'));
  assert.ok(items.some((i) => i.id === 'paid.tag.metaPixel'));
});

test('items: tags not in the HTML are not identified, never "absent"', async () => {
  const h = http({
    'http://contoso.example/': html(fixture('home.html')),
  });
  const items = siteItems(await collect('contoso.example', { http: h }));
  const get = (id) => items.find((i) => i.id === id);
  assert.equal(get('paid.tag.metaPixel').type, 'fact');
  assert.equal(get('paid.tag.linkedinInsight').type, 'not_identified');
  assert.equal(get('paid.tag.linkedinInsight').value, null);
  assert.equal(get('social.youtube.link').type, 'not_identified');
  assert.equal(get('technical.http_to_https').value, false);
});

test('items: on a JavaScript page, what is missing is not identified', async () => {
  const h = http({ 'http://initech.example/': html(fixture('spa.html')) });
  const items = siteItems(await collect('initech.example', { http: h }));
  const get = (id) => items.find((i) => i.id === id);
  assert.equal(get('technical.js_rendered').value, true);
  assert.equal(get('site.h1').type, 'not_identified');
  assert.equal(get('site.ctas').type, 'not_identified');
  assert.equal(get('site.title').type, 'fact');
});
