'use strict';

const fs = require('fs');
const path = require('path');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const example = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', name), 'utf8'));

// DNS stub: every name is public unless listed.
function lookupStub(map = {}) {
  return async (host) => [{ address: map[host] || '93.184.216.34', family: 4 }];
}

// fetch stub from a { url: Response | () => Response } table; records calls.
function fetchStub(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const r = routes[url];
    if (!r) return new Response('not found', { status: 404 });
    return typeof r === 'function' ? r(url, init) : r.clone();
  };
  return { calls, fetchImpl };
}

const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } });
const redirect = (to, status = 301) => new Response(null, { status, headers: { location: to } });

module.exports = { fixture, example, lookupStub, fetchStub, html, redirect };
