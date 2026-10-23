'use strict';

// Command-line parsing that refuses what it does not understand. Several flags
// guard money (--dry-run, --max-requests, --market), so a typo must stop the
// run instead of being ignored: "--dryrun" would otherwise make the paid calls.

const VALUED = ['name', 'out', 'market', 'providers', 'maxRequests', 'lang'];
const SWITCHES = ['dryRun', 'noSite', 'help'];

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const eq = a.indexOf('=');
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const name = camel(flag.slice(2));
    if (VALUED.includes(name)) {
      const value = eq > 0 ? a.slice(eq + 1) : argv[++i];
      if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`${flag} needs a value`);
      o[name] = value;
    } else if (SWITCHES.includes(name)) {
      if (eq > 0) throw new Error(`${flag} takes no value`);
      o[name] = true;
    } else {
      throw new Error(`unknown option ${flag} (see --help)`);
    }
  }
  if (o.maxRequests !== undefined) {
    if (!/^\d+$/.test(o.maxRequests)) throw new Error('--max-requests must be a whole number');
    o.maxRequests = Number(o.maxRequests);
  }
  return o;
}

module.exports = { parseArgs };
