'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/validate');
const { example } = require('./helpers');

const evidence = example('evidence.json');
const base = () => JSON.parse(JSON.stringify(example('research.json')));
const codes = (research, ev = evidence) => validate(ev, research).errors.map((e) => e.code);
const withItem = (item) => { const r = base(); r.items.push(item); return r; };

test('the example follows every rule', () => {
  const r = validate(evidence, base());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('a blocked source is never zero', () => {
  assert.ok(codes(withItem({ id: 'paid.ads_library_2', section: 'paid', value: 0, unit: 'count', type: 'not_identified' })).includes('E_NI_VALUE'));
});

test('prose cannot claim absence where a source was not identified', () => {
  const r = base();
  r.findings.paid.diagnosis = 'The company runs no ads at all, zero paid media.';
  assert.ok(codes(r).includes('E_ABSENCE'));
  const pt = base();
  pt.findings.paid.diagnosis = 'A empresa não anuncia no Meta.';
  assert.ok(codes(pt).includes('E_ABSENCE'));
});

test('an estimate needs its basis; estimated percentages are refused', () => {
  assert.ok(codes(withItem({ id: 'content.x', section: 'content', value: 3, unit: 'count', type: 'estimate' })).includes('E_ESTIMATE_BASIS'));
  assert.ok(codes(withItem({ id: 'traffic.organic_share', section: 'traffic', value: 40, unit: '%', type: 'estimate', basis: 'small screenshot' })).includes('E_ESTIMATE_PERCENT'));
});

test('a number read off an illegible screenshot cannot be "provided"', () => {
  assert.ok(codes(withItem({ id: 'traffic.visits_print', section: 'traffic', value: 12000, unit: 'count', type: 'provided', legible: false, source: { name: 'Similarweb screenshot' } })).includes('E_ILLEGIBLE'));
});

test('a provider number names the tool, the month and the market', () => {
  assert.ok(codes(withItem({ id: 'seo.kw', section: 'seo', value: 10, unit: 'count', type: 'provider_estimate', provider: 'Semrush' })).includes('E_PROVIDER_META'));
});

test('a fact needs the URL it was read from; only http and https links', () => {
  assert.ok(codes(withItem({ id: 'social.x.followers', section: 'social', value: 10, unit: 'count', type: 'fact' })).includes('E_FACT_SOURCE'));
  assert.ok(codes(withItem({ id: 'social.x.followers', section: 'social', value: 10, unit: 'count', type: 'fact', source: { name: 'x', url: 'javascript:alert(1)' } })).includes('E_SOURCE_URL'));
  const r = base();
  r.complaints.push({ title: 'x', url: 'data:text/html,hi' });
  assert.ok(codes(r).includes('E_LINK'));
});

test('ratings use the platform scale', () => {
  assert.ok(codes(withItem({ id: 'reputation.google', section: 'reputation', platform: 'google', value: 8, scale: 10, unit: 'rating', type: 'fact', source: { name: 'Google', url: 'https://maps.example/' } })).includes('E_RATING'));
  assert.ok(codes(withItem({ id: 'reputation.x', section: 'reputation', platform: 'yelp', value: 4, scale: 5, unit: 'rating', type: 'fact', source: { name: 'Yelp', url: 'https://yelp.example/' } })).includes('E_RATING'));
});

test('ReclameAqui: 6/10 with 95% answered is attention, not critical; 3/10 is critical', () => {
  const ra = (value, responseRate) => {
    const r = withItem({ id: 'reputation.reclameaqui', section: 'reputation', platform: 'reclameaqui', value, scale: 10, responseRate, unit: 'rating', type: 'fact', source: { name: 'ReclameAqui', url: 'https://reclameaqui.example/empresa/contoso' } });
    r.critical = { reputation: { because: ['reputation.reclameaqui'], reason: 'low score' } };
    return codes(r);
  };
  assert.ok(ra(6.1, 95).includes('E_CRITICAL'));
  assert.deepEqual(ra(3.2, 70), []);
  assert.deepEqual(ra(6.8, 0), [], 'no complaint answered is critical too');
});

test('critical cannot rest on an estimate or on an item that does not exist', () => {
  const r = base();
  r.critical = { content: { because: ['content.posting_frequency'] }, seo: { because: ['seo.nothing'] }, social: {} };
  const errs = validate(evidence, r).errors.filter((e) => e.code === 'E_CRITICAL').map((e) => e.message).join(' | ');
  assert.match(errs, /content.posting_frequency \(estimate\)/);
  assert.match(errs, /seo.nothing/);
  assert.match(errs, /critical.social: name the items/);
});

test('a percentage in the prose needs percentage data in that section', () => {
  const r = base();
  r.findings.reputation.diagnosis = 'Only 40% of complaints were answered.';
  assert.ok(codes(r).includes('E_PERCENT_TEXT'));
  const ok = base();
  ok.findings.traffic = { diagnosis: 'Direct is 43% of visits.' };
  assert.ok(!codes(ok).includes('E_PERCENT_TEXT'), 'Similarweb channel shares back it up');
});

test('ids are unique, sections and types are known', () => {
  const r = withItem({ id: 'social.linkedin.followers', section: 'social', value: 1, unit: 'count', type: 'fact', source: { name: 'x', url: 'https://x.example/' } });
  assert.ok(codes(r).includes('E_DUPLICATE'));
  assert.ok(codes(withItem({ id: 'a', section: 'podcast', value: 1, unit: 'count', type: 'fact', source: { name: 'x', url: 'https://x.example/' } })).includes('E_SECTION'));
  assert.ok(codes(withItem({ id: 'b', section: 'seo', value: 1, unit: 'count', type: 'guess' })).includes('E_TYPE'));
});
