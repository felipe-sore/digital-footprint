'use strict';

const RUBRIC = require('../config/rubric.json');
const { rating10 } = require('./validate');

// Digital maturity, computed from the items with the rubric in config/rubric.json.
// The model never grades. Not identified items are left out of the count, so a
// blocked source lowers confidence, not the score; but an axis where less than
// minCoverage of the signals are known gets no level ("not enough data"), so two
// known signals out of six never read as "advanced". Branding is read by people
// and is not scored.

// pass | fail | unknown for one item.
function verdict(item, rubric = RUBRIC) {
  if (item.type === 'not_identified' || item.value === null || item.value === undefined) return 'unknown';
  const v = item.value;
  switch (item.unit) {
    case 'bool': return v ? 'pass' : 'fail';
    case 'count': case 'usd': return Number(v) > 0 ? 'pass' : 'fail';
    case 'ms': return Number(v) <= rubric.fastResponseMs ? 'pass' : 'fail';
    case 'rating': return rating10(item) >= rubric.goodRating10 ? 'pass' : 'fail';
    case 'list': return Array.isArray(v) && v.length ? 'pass' : 'fail';
    case 'text': case 'url': return String(v).trim() ? 'pass' : 'fail';
    default: return 'unknown';
  }
}

const matches = (id, key) => id === key || id.startsWith(`${key}.`);

function levelOf(ratio, rubric = RUBRIC) {
  if (ratio === null) return 'not_identified';
  if (ratio === undefined) return 'insufficient';
  if (ratio >= rubric.levels.advanced) return 'advanced';
  if (ratio >= rubric.levels.intermediate) return 'intermediate';
  return 'initial';
}

function score(items, rubric = RUBRIC) {
  const axes = {};
  for (const [axis, keys] of Object.entries(rubric.axes)) {
    let pass = 0;
    let fail = 0;
    let unknown = 0;
    // "prefix.*": every matching item is a signal of its own (one per review platform).
    const signals = keys.flatMap((key) => (key.endsWith('.*')
      ? items.filter((i) => i.id.startsWith(key.slice(0, -1))).map((i) => [verdict(i, rubric)])
      : [items.filter((i) => matches(i.id, key)).map((i) => verdict(i, rubric))]));
    for (const verdicts of signals) {
      if (!verdicts.length) continue;
      // Several providers for one number: any pass is a pass.
      if (verdicts.includes('pass')) pass++;
      else if (verdicts.includes('fail')) fail++;
      else unknown++;
    }
    const known = pass + fail;
    const coverage = known + unknown ? known / (known + unknown) : 0;
    let ratio = known ? pass / known : null;
    if (ratio !== null && coverage < (rubric.minCoverage ?? 0)) ratio = undefined;
    axes[axis] = { pass, fail, unknown, coverage, ratio: ratio ?? null, level: levelOf(ratio, rubric) };
  }
  const scored = Object.values(axes).filter((a) => a.ratio !== null);
  const overallRatio = scored.length ? scored.reduce((s, a) => s + a.ratio, 0) / scored.length : null;
  return { axes, overall: { ratio: overallRatio, level: levelOf(overallRatio, rubric) } };
}

module.exports = { score, verdict, levelOf };
