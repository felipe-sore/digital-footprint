'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { safeGet, assertPublicHost, isPrivateAddress } = require('../src/fetch');
const { lookupStub, fetchStub, html, redirect } = require('./helpers');

test('private, loopback, link-local and metadata addresses are private', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '64:ff9b::a9fe:a9fe', '2002:a9fe:a9fe::1', '::127.0.0.1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('host names that are not public are refused before any request', async () => {
  const lookup = lookupStub({ 'evil.example': '10.0.0.5' });
  for (const host of ['localhost', 'intranet', 'printer.local', 'db.internal', 'evil.example', '127.0.0.1', '[::1]']) {
    await assert.rejects(assertPublicHost(host, lookup), /refused/, host);
  }
  await assert.doesNotReject(assertPublicHost('contoso.example', lookup));
});

test('a redirect to the cloud metadata address is refused', async () => {
  const { fetchImpl, calls } = fetchStub({ 'https://contoso.example/': redirect('http://169.254.169.254/latest/meta-data/') });
  await assert.rejects(safeGet('https://contoso.example/', { fetchImpl, lookup: lookupStub() }), /refused/);
  assert.equal(calls.length, 1);
});

test('only http and https are fetched', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://contoso.example/']) {
    await assert.rejects(safeGet(url, { fetchImpl: fetchStub({}).fetchImpl, lookup: lookupStub() }), /refused/, url);
  }
});

test('redirects are followed hop by hop, with a cap', async () => {
  const { fetchImpl } = fetchStub({
    'http://contoso.example/': redirect('https://contoso.example/'),
    'https://contoso.example/': redirect('/home', 302),
    'https://contoso.example/home': html('<title>ok</title>'),
  });
  const r = await safeGet('http://contoso.example/', { fetchImpl, lookup: lookupStub() });
  assert.equal(r.url, 'https://contoso.example/home');
  assert.deepEqual(r.redirects, ['http://contoso.example/', 'https://contoso.example/']);
  assert.match(r.body, /ok/);
  const loop = fetchStub({ 'https://loop.example/': redirect('https://loop.example/') });
  await assert.rejects(safeGet('https://loop.example/', { fetchImpl: loop.fetchImpl, lookup: lookupStub(), maxRedirects: 3 }), /more than 3 redirects/);
});

test('the body is capped', async () => {
  const { fetchImpl } = fetchStub({ 'https://big.example/': html('x'.repeat(5000)) });
  const r = await safeGet('https://big.example/', { fetchImpl, lookup: lookupStub(), maxBytes: 1000 });
  assert.equal(r.body.length, 1000);
  assert.equal(r.truncated, true);
});

test('the page is decoded with its charset, so a Latin-1 site keeps its accents', async () => {
  const body = Buffer.from('<title>Orçamento grátis</title>', 'latin1');
  const { fetchImpl } = fetchStub({ 'https://latin.example/': new Response(body, { headers: { 'content-type': 'text/html; charset=ISO-8859-1' } }) });
  const r = await safeGet('https://latin.example/', { fetchImpl, lookup: lookupStub() });
  assert.match(r.body, /Orçamento grátis/);
  const meta = Buffer.from('<meta charset="windows-1252"><title>Ação</title>', 'latin1');
  const m = fetchStub({ 'https://meta.example/': new Response(meta) });
  assert.match((await safeGet('https://meta.example/', { fetchImpl: m.fetchImpl, lookup: lookupStub() })).body, /Ação/);
});
