'use strict';

const dns = require('dns').promises;
const net = require('net');

// Fetching a company's website from a list someone pasted in is fetching an
// untrusted URL. This module only reaches public hosts:
//   - http and https only;
//   - the host must resolve to public addresses (no localhost, private ranges,
//     link-local or cloud metadata), checked again on every redirect;
//   - capped redirects, time and body size.
// Known limit: the address is checked before the request, so a DNS answer that
// changes between the check and the connection is not caught. For a CLI that
// reads homepages this is acceptable; a server should pin the resolved address.

const USER_AGENT = 'digital-footprint/1.0 (+https://github.com/felipe-sore/digital-footprint)';
const ROBOTS_TOKEN = 'digital-footprint';

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    if (x.startsWith('::ffff:')) return isPrivateAddress(x.slice(7));
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff');
  }
  return true;
}

async function assertPublicHost(hostname, lookup = dns.lookup) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error(`refused: ${host} is not a public address`);
    return;
  }
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`refused: ${host} is not a public host name`);
  }
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`refused: ${host} resolves to a private address`);
  }
}

async function readCapped(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text();
    return { text: text.slice(0, maxBytes), bytes: Buffer.byteLength(text), truncated: text.length > maxBytes };
  }
  const reader = res.body.getReader();
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > maxBytes) {
      chunks.push(value.subarray(0, value.length - (bytes - maxBytes)));
      truncated = true;
      // Ask the stream to stop, but do not wait: a cancel can stay pending forever.
      reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8'), bytes, truncated };
}

/**
 * GET a public URL. Redirects are followed by hand so each hop is checked.
 * Returns { status, url, redirects, body, bytes, truncated, ms }.
 */
async function safeGet(url, {
  lookup = dns.lookup, fetchImpl = (...a) => fetch(...a),
  timeoutMs = 10000, maxBytes = 2_000_000, maxRedirects = 5, userAgent = USER_AGENT,
} = {}) {
  let current = new URL(url);
  const redirects = [];
  const started = Date.now();
  for (let hop = 0; ; hop++) {
    if (!['http:', 'https:'].includes(current.protocol)) throw new Error(`refused: ${current.protocol} URLs are not fetched`);
    await assertPublicHost(current.hostname, lookup);
    const res = await fetchImpl(current.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`redirect without a location from ${current.host}`);
      if (hop >= maxRedirects) throw new Error(`more than ${maxRedirects} redirects`);
      redirects.push(current.toString());
      current = new URL(location, current);
      continue;
    }
    const body = await readCapped(res, maxBytes);
    return { status: res.status, url: current.toString(), redirects, body: body.text, bytes: body.bytes, truncated: body.truncated, ms: Date.now() - started };
  }
}

module.exports = { safeGet, assertPublicHost, isPrivateAddress, USER_AGENT, ROBOTS_TOKEN };
