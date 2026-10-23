'use strict';

const { allItems, SECTIONS, TYPES } = require('./items');
const { safeUrl } = require('./text');
const PLATFORMS = require('../config/platforms.json');
const RUBRIC = require('../config/rubric.json');

// The report goes to the client, so nothing that cannot be defended goes out.
// These rules used to live in a prompt; here they block the build:
//   - a blocked or missing source is "not identified", never zero or absent;
//   - an estimate shows its basis, and a poor screenshot is an estimate, not a fact;
//   - a percentage read off a poor screenshot is not allowed at all;
//   - a paid tool's number names the tool, the month and the market;
//   - "critical" needs the facts that support it (a review score below 4 of 10,
//     or no complaint answered), so a 6/10 company that answers 95% is not critical;
//   - the agent's prose cannot claim absence in a section where a source was not
//     identified, and the overview and conclusion cannot claim it while any source was not;
//   - research.json has the shape the report needs, checked first, so a malformed
//     file is refused by "check" instead of crashing "render".

// Words that claim something is absent, in English, Portuguese and Spanish.
const ABSENCE = /\b(zero|none|no (ads|advertising|paid media|campaigns?|presence|pixel|tracking|activity)|not (running|advertising|present|active)|does(?: not|n't) (run|advertise|have|use)|absent|inexistentes?|nenhuma?|sem (anúncios|anuncios|mídia paga|midia paga|presença|presenca|pixel|campanhas?)|não (anuncia|roda|possui|tem|investe|usa)|ausente|ausência|ninguna?|no tiene)\b/i;
const PERCENT = /\d\s?%/;
const UNITS = ['count', '%', 'usd', 'ms', 'bool', 'text', 'list', 'url', 'rating'];
const ID = /^[a-z0-9][a-z0-9_.-]*$/i;

const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const VALUE_OK = {
  count: isNum, '%': isNum, usd: isNum, ms: isNum, rating: isNum,
  bool: (v) => typeof v === 'boolean',
  text: isStr, url: isStr,
  list: (v) => Array.isArray(v) && v.every(isStr),
};

// The shape of research.json, before any rule runs.
function checkShape(research, errors) {
  const bad = (where, what) => errors.push({ code: 'E_SCHEMA', message: `${where}: ${what}` });
  if (!isObj(research)) { bad('research.json', 'must be an object'); return; }
  const lists = { items: (v) => isObj(v), complaints: (v) => isObj(v), overview: isStr, conclusion: isStr };
  for (const [key, ok] of Object.entries(lists)) {
    if (research[key] === undefined) continue;
    if (!Array.isArray(research[key])) bad(key, 'must be a list');
    else research[key].forEach((v, i) => { if (!ok(v)) bad(`${key}[${i}]`, key === 'items' || key === 'complaints' ? 'must be an object' : 'must be text'); });
  }
  for (const key of ['company', 'findings', 'critical']) {
    if (research[key] !== undefined && !isObj(research[key])) bad(key, 'must be an object');
  }
  if (isObj(research.findings)) {
    for (const [section, block] of Object.entries(research.findings)) {
      if (!isObj(block)) { bad(`findings.${section}`, 'must be an object'); continue; }
      for (const [k, v] of Object.entries(block)) if (!isStr(v)) bad(`findings.${section}.${k}`, 'must be text');
    }
  }
  if (isObj(research.critical)) {
    for (const [section, claim] of Object.entries(research.critical)) {
      if (!isObj(claim) || (claim.because !== undefined && !(Array.isArray(claim.because) && claim.because.every(isStr)))) {
        bad(`critical.${section}`, 'must be { "because": ["item id", ...], "reason": "..." }');
      }
    }
  }
  (Array.isArray(research.items) ? research.items : []).forEach((item, i) => {
    if (!isObj(item)) return;
    const where = `items[${i}]`;
    if (!isStr(item.id) || !ID.test(item.id)) bad(where, 'needs an "id" made of letters, digits, dots, dashes or underscores');
    if (!UNITS.includes(item.unit)) bad(where, `"unit" must be one of ${UNITS.join(', ')}`);
    else if (item.type !== 'not_identified' && !VALUE_OK[item.unit](item.value)) bad(where, `value ${JSON.stringify(item.value)} does not fit unit "${item.unit}"`);
    if (item.source !== undefined && !isObj(item.source)) bad(where, '"source" must be { "name", "url" }');
  });
}

function rating10(item) {
  const scale = Number(item.scale);
  return scale > 0 ? (Number(item.value) / scale) * 10 : NaN;
}

function checkItem(item, errors) {
  const where = `item "${item.id}"`;
  if (!SECTIONS.includes(item.section)) errors.push({ code: 'E_SECTION', message: `${where}: unknown section "${item.section}"` });
  if (!TYPES.includes(item.type)) {
    errors.push({ code: 'E_TYPE', message: `${where}: unknown type "${item.type}" (use ${TYPES.join(', ')})` });
    return;
  }
  if (item.source && item.source.url && !safeUrl(item.source.url)) errors.push({ code: 'E_SOURCE_URL', message: `${where}: source URL must be http or https` });

  switch (item.type) {
    case 'not_identified':
      if (item.value !== null && item.value !== undefined) errors.push({ code: 'E_NI_VALUE', message: `${where}: not identified items carry no value (got ${JSON.stringify(item.value)}); never write zero for a blocked source` });
      break;
    case 'fact':
      if (!item.auto && !(item.source && safeUrl(item.source.url))) errors.push({ code: 'E_FACT_SOURCE', message: `${where}: a fact needs the URL it was read from` });
      break;
    case 'provided':
      if (!(item.source && item.source.name)) errors.push({ code: 'E_PROVIDED_SOURCE', message: `${where}: name where the number came from (e.g. "Semrush export")` });
      if (item.legible === false) errors.push({ code: 'E_ILLEGIBLE', message: `${where}: a value read from an illegible screenshot is an estimate, not provided data` });
      break;
    case 'estimate':
      if (!item.basis) errors.push({ code: 'E_ESTIMATE_BASIS', message: `${where}: an estimate needs its basis (how it was calculated or read)` });
      if (item.unit === '%') errors.push({ code: 'E_ESTIMATE_PERCENT', message: `${where}: no estimated percentages; use dominant / minor / not identified` });
      break;
    case 'provider_estimate':
      if (!item.provider || !item.market || !/^\d{4}-\d{2}$/.test(String(item.period || ''))) {
        errors.push({ code: 'E_PROVIDER_META', message: `${where}: a provider number needs provider, period (YYYY-MM) and market` });
      }
      break;
    default:
  }

  if (item.unit === 'rating' && item.type !== 'not_identified') {
    const platform = PLATFORMS[item.platform];
    if (!platform) errors.push({ code: 'E_RATING', message: `${where}: unknown platform "${item.platform}" (see config/platforms.json)` });
    else if (Number(item.scale) !== platform.scale) errors.push({ code: 'E_RATING', message: `${where}: ${platform.name} rates on a scale of ${platform.scale}` });
    else if (!(Number(item.value) >= 0 && Number(item.value) <= platform.scale)) errors.push({ code: 'E_RATING', message: `${where}: rating ${item.value} is outside 0-${platform.scale}` });
    if (item.responseRate !== undefined && item.responseRate !== null && !(item.responseRate >= 0 && item.responseRate <= 100)) {
      errors.push({ code: 'E_RATING', message: `${where}: responseRate is a percentage (0-100)` });
    }
  }
}

function checkFindings(research, items, errors) {
  // The overview and the conclusion speak for the whole report.
  const missingAll = items.filter((i) => i.type === 'not_identified');
  const percentAll = items.some((i) => i.unit === '%' && ['fact', 'provided', 'provider_estimate'].includes(i.type));
  for (const part of ['overview', 'conclusion']) {
    const text = (research[part] || []).join(' ');
    const match = text.match(ABSENCE);
    if (missingAll.length && match) {
      errors.push({ code: 'E_ABSENCE', message: `${part} says "${match[0]}", but ${missingAll.length} source(s) were not identified (${missingAll.slice(0, 5).map((i) => i.id).join(', ')}${missingAll.length > 5 ? ', ...' : ''}). Write "not identified" instead.` });
    }
    if (PERCENT.test(text) && !percentAll) errors.push({ code: 'E_PERCENT_TEXT', message: `${part} quotes a percentage, but no item holds percentage data` });
  }
  for (const [section, block] of Object.entries(research.findings || {})) {
    if (!SECTIONS.includes(section)) {
      errors.push({ code: 'E_SECTION', message: `findings: unknown section "${section}"` });
      continue;
    }
    const text = Object.values(block || {}).join(' ');
    const inSection = items.filter((i) => i.section === section);
    const missing = inSection.filter((i) => i.type === 'not_identified');
    const match = text.match(ABSENCE);
    if (missing.length && match) {
      errors.push({
        code: 'E_ABSENCE',
        message: `findings.${section} says "${match[0]}", but ${missing.map((i) => i.id).join(', ')} ${missing.length > 1 ? 'were' : 'was'} not identified. Write "not identified, check manually" instead.`,
      });
    }
    const hasPercentData = inSection.some((i) => i.unit === '%' && ['fact', 'provided', 'provider_estimate'].includes(i.type));
    if (PERCENT.test(text) && !hasPercentData) {
      errors.push({ code: 'E_PERCENT_TEXT', message: `findings.${section} quotes a percentage, but no item in this section holds that data` });
    }
  }
}

function checkCritical(research, items, errors) {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const [section, claim] of Object.entries(research.critical || {})) {
    const where = `critical.${section}`;
    const cited = (claim && claim.because) || [];
    if (!SECTIONS.includes(section)) { errors.push({ code: 'E_CRITICAL', message: `${where}: unknown section` }); continue; }
    if (!cited.length) { errors.push({ code: 'E_CRITICAL', message: `${where}: name the items that prove it ("because": [...])` }); continue; }
    const found = cited.map((id) => byId.get(id));
    cited.forEach((id, k) => { if (!found[k]) errors.push({ code: 'E_CRITICAL', message: `${where}: cites "${id}", which does not exist` }); });
    const weak = found.filter((i) => i && !['fact', 'provided'].includes(i.type));
    if (weak.length) errors.push({ code: 'E_CRITICAL', message: `${where}: critical needs facts, not ${weak.map((i) => `${i.id} (${i.type})`).join(', ')}` });
    if (section === 'reputation') {
      const t = RUBRIC.critical;
      const proves = found.some((i) => i && i.unit === 'rating' && (rating10(i) < t.ratingBelow10 || (i.responseRate !== undefined && i.responseRate !== null && i.responseRate <= t.responseRateAtMost)));
      if (!proves) {
        errors.push({ code: 'E_CRITICAL', message: `${where}: reputation is critical only with a score below ${t.ratingBelow10}/10 or no complaint answered; a low score with a high answer rate is "attention"` });
      }
    }
  }
}

function validate(evidence, research = {}) {
  const errors = [];
  checkShape(research, errors);
  if (errors.length) return { ok: false, errors, items: [] };
  const items = allItems(evidence, research);
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) errors.push({ code: 'E_DUPLICATE', message: `item "${item.id}" appears twice` });
    seen.add(item.id);
    checkItem(item, errors);
  }
  for (const c of research.complaints || []) {
    if (!safeUrl(c.url)) errors.push({ code: 'E_LINK', message: `complaint "${c.title}": link to the complaint itself (http or https)` });
  }
  checkFindings(research, items, errors);
  checkCritical(research, items, errors);
  return { ok: errors.length === 0, errors, items };
}

module.exports = { validate, rating10, ABSENCE };
