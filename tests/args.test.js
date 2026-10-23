'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs } = require('../src/args');

const BIN = path.join(__dirname, '..', 'bin', 'digital-footprint.js');
const run = (args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } });

test('flags that guard money cannot be mistyped into silence', () => {
  assert.throws(() => parseArgs(['collect', 'acme.com', '--dryrun']), /unknown option --dryrun/);
  assert.throws(() => parseArgs(['collect', 'acme.com', '--max-requests', '--dry-run']), /--max-requests needs a value/);
  assert.throws(() => parseArgs(['collect', 'acme.com', '--max-requests', 'five']), /whole number/);
  assert.throws(() => parseArgs(['collect', 'acme.com', '--dry-run=yes']), /takes no value/);
});

test('--key=value works like --key value', () => {
  const o = parseArgs(['collect', 'acme.com', '--market=br', '--max-requests=1', '--dry-run']);
  assert.deepEqual([o.market, o.maxRequests, o.dryRun], ['br', 1, true]);
});

test('an unknown command fails instead of looking like a passed check', () => {
  const r = run(['chek', 'footprint-acme.com']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown command "chek"/);
  assert.equal(run(['--help']).status, 0);
});

test('a bad market or a missing key stops the run before the site is read', () => {
  const r = run(['collect', 'acme.example', '--providers', 'semrush', '--market', 'mx', '--out', path.join(require('os').tmpdir(), 'df-never')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown market "mx"/);
  assert.doesNotMatch(r.stderr, /site:/, 'nothing was fetched');
  const keys = run(['collect', 'acme.example', '--providers', 'semrush', '--out', path.join(require('os').tmpdir(), 'df-never')]);
  assert.equal(keys.status, 1);
  assert.match(keys.stderr, /Semrush needs SEMRUSH_API_KEY/);
  assert.doesNotMatch(keys.stderr, /site:/);
});

test('the dry run reports what the real run would refuse', () => {
  const r = run(['collect', 'acme.example', '--providers', 'semrush,similarweb,dataforseo', '--max-requests', '2', '--dry-run']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /would stop: .*above the limit of 2/);
  const constructor = run(['collect', 'acme.example', '--providers', 'semrush', '--market', 'constructor', '--dry-run']);
  assert.match(constructor.stderr, /unknown market "constructor"/);
});
