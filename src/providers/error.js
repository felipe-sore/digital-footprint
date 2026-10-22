'use strict';

// An expected provider failure: an HTTP error, a provider error code, a network
// failure or a non-JSON answer. runProviders turns these into "not identified";
// anything else is a bug in this code and is allowed to fail loudly.
// Messages are built here, never copied from the request, so they cannot carry a key.
class ProviderError extends Error {
  constructor(label, reason, extra = {}) {
    super(`${label}: ${reason}`);
    this.name = 'ProviderError';
    this.label = label;
    this.reason = reason;
    Object.assign(this, extra);
  }
}

async function request(label, fn) {
  try {
    return await fn();
  } catch (err) {
    throw new ProviderError(label, `request did not complete (${err && err.name === 'TimeoutError' ? 'timeout' : 'network error'})`);
  }
}

async function readJson(label, res) {
  try {
    return await res.json();
  } catch {
    throw new ProviderError(label, `HTTP ${res.status}, the response was not JSON`);
  }
}

module.exports = { ProviderError, request, readJson };
