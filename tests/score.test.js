'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { score, verdict } = require('../src/score');
const { validate } = require('../src/validate');
const { example } = require('./helpers');

const RUBRIC = {
  levels: { intermediate: 0.4, advanced: 0.75 }, fastResponseMs: 2500, goodRating10: 7,
  axes: { technical: ['technical.https', 'technical.viewport', 'technical.response_ms', 'technical.sitemap'] },
};
const item = (id, value, unit, type = 'fact') => ({ id, value, unit, type });

test('verdicts by unit', () => {
  assert.equal(verdict(item('a', true, 'bool'), RUBRIC), 'pass');
  assert.equal(verdict(item('a', 3100, 'ms'), RUBRIC), 'fail');
  assert.equal(verdict({ id: 'r', value: 4.2, scale: 5, unit: 'rating', type: 'fact' }, RUBRIC), 'pass');
  assert.equal(verdict({ id: 'r', value: 6.1, scale: 10, unit: 'rating', type: 'fact' }, RUBRIC), 'fail');
  assert.equal(verdict(item('a', null, 'bool', 'not_identified'), RUBRIC), 'unknown');
});

test('not identified items are left out: they lower confidence, not the score', () => {
  const s = score([item('technical.https', true, 'bool'), item('technical.viewport', true, 'bool'), item('technical.sitemap', null, 'bool', 'not_identified')], RUBRIC);
  assert.deepEqual([s.axes.technical.pass, s.axes.technical.fail, s.axes.technical.unknown, s.axes.technical.level], [2, 0, 1, 'advanced']);
});

test('an axis with nothing known is not identified, never "initial"', () => {
  const s = score([item('technical.https', null, 'bool', 'not_identified')], RUBRIC);
  assert.equal(s.axes.technical.level, 'not_identified');
  assert.equal(s.overall.level, 'not_identified');
});

test('one passing provider is enough for a signal', () => {
  const s = score([item('technical.https.a', false, 'bool'), item('technical.https.b', true, 'bool')], RUBRIC);
  assert.equal(s.axes.technical.pass, 1);
});

test('review platforms are separate signals: a strong G2 does not hide a weak Trustpilot', () => {
  const rubric = { ...RUBRIC, axes: { reputation: ['reputation.*'] } };
  const s = score([
    { id: 'reputation.g2', value: 4.4, scale: 5, unit: 'rating', type: 'fact' },
    { id: 'reputation.trustpilot', value: 2.9, scale: 5, unit: 'rating', type: 'fact' },
  ], rubric);
  assert.deepEqual([s.axes.reputation.pass, s.axes.reputation.fail, s.axes.reputation.level], [1, 1, 'intermediate']);
});

test('two known signals out of six is not enough for a level', () => {
  const rubric = { ...RUBRIC, minCoverage: 0.5, axes: { paid: ['a', 'b', 'c', 'd', 'e', 'f'] } };
  const known = [item('a', true, 'bool'), item('b', true, 'bool')];
  const unknown = ['c', 'd', 'e', 'f'].map((id) => item(id, null, 'bool', 'not_identified'));
  const s = score([...known, ...unknown], rubric);
  assert.equal(s.axes.paid.level, 'insufficient');
  assert.equal(s.overall.level, 'not_identified', 'an axis without enough data does not count for the overall');
  const enough = score([...known, item('c', false, 'bool'), ...unknown.slice(1)], rubric);
  assert.equal(enough.axes.paid.level, 'intermediate', 'half the signals known: 2 of 3 passed');
});

test('the example scores with the shipped rubric', () => {
  const { items } = validate(example('evidence.json'), example('research.json'));
  const s = score(items);
  assert.equal(s.axes.technical.level, 'advanced');
  assert.equal(s.axes.reputation.level, 'intermediate', 'G2 4.4/5 passes, Trustpilot 2.9/5 fails');
  assert.equal(s.axes.paid.level, 'insufficient', 'most paid media sources were not identified');
  assert.equal(s.axes.branding, undefined, 'branding is not scored');
});
