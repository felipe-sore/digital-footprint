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

test('the example scores with the shipped rubric', () => {
  const { items } = validate(example('evidence.json'), example('research.json'));
  const s = score(items);
  assert.equal(s.axes.technical.level, 'advanced');
  assert.ok(['initial', 'intermediate', 'advanced'].includes(s.overall.level));
  assert.equal(s.axes.branding, undefined, 'branding is not scored');
});
