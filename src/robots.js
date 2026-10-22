'use strict';

// robots.txt, read the way crawlers do: the group for our user agent if there
// is one, otherwise "*"; the longest matching rule wins, Allow wins a tie.
// Only the homepage is fetched, so the question is "may we read /?".

// "*" matches anything, a trailing "$" anchors the end; everything else is literal.
function ruleMatches(rulePath, path) {
  const anchored = rulePath.endsWith('$');
  const body = (anchored ? rulePath.slice(0, -1) : rulePath)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
}

function parseGroups(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current && (key === 'allow' || key === 'disallow')) current.rules.push({ allow: key === 'allow', path: value });
  }
  return groups;
}

function robotsAllows(text, agent, path = '/') {
  const groups = parseGroups(text);
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)));
  const applicable = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const g of applicable) {
    for (const r of g.rules) {
      if (!r.path || !ruleMatches(r.path, path)) continue;
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
  }
  return best ? best.allow : true;
}

function sitemapsFrom(text) {
  return [...String(text || '').matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
}

module.exports = { robotsAllows, sitemapsFrom };
