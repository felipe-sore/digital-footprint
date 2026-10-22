'use strict';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Everything that reaches the report comes from a website or a search result:
// it is always escaped, never trusted as HTML.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// The report never uses long dashes.
function noDashes(value) {
  return String(value ?? '').replace(/\s*[—–]\s*/g, ', ');
}

// Only http and https links are ever written into the report.
function safeUrl(value) {
  try {
    const u = new URL(String(value));
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

function slug(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { escapeHtml, noDashes, safeUrl, slug };
