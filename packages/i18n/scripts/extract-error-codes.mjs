#!/usr/bin/env node
// Extracts every Problem Details `code` (and field-level error codes) that appears in error
// responses of the OpenAPI contracts. Usage: node extract-error-codes.mjs <openapi-dir> [--json]
import fs from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
// Status/enum values that are mentioned next to error statuses but are not error codes.
const NOT_CODES = new Set(['PENDING_MEDIA', 'PENDING_VERIFICATION']);
// Codes defined by the protocol docs (idempotencia.md, api-rest-guidelines.md, saga) that clients also receive.
export const PROTOCOL_CODES = [
  'IDEMPOTENCY_KEY_MISSING', 'IDEMPOTENCY_KEY_INVALID', 'IDEMPOTENCY_RESPONSE_UNAVAILABLE', 'TOO_MANY_ATTEMPTS',
  'INSUFFICIENT_FUNDS', 'WALLET_NOT_FOUND', 'TICKET_ISSUE_FAILED', 'TIMEOUT', 'SAGA_ABORTED',
  'REQUIRED', 'INVALID_FORMAT', 'TOO_SHORT', 'OUT_OF_RANGE', 'INVALID_VALUE',
];

function collectCodes(node, out, inFieldErrors = false) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectCodes(n, out, inFieldErrors));
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'code' && typeof v === 'string' && CODE_RE.test(v)) out.add(v);
    else collectCodes(v, out, inFieldErrors || k === 'errors');
  }
}

// Lines of an operation description that mention an HTTP status (`409` `EVENT_FULL`).
function codesFromText(text, errorResponse = false) {
  const out = new Set();
  const items = text.split(/\n\s*\n|\n(?=\s*(?:[-*] |\d+\. ))/).map((i) => i.replace(/\s*\n\s*/g, ' '));
  for (const line of items) {
    if (!errorResponse && !/`[45]\d\d`|\b[45]\d\d\b/.test(line)) continue;
    for (const m of line.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g)) out.add(m[1]);
  }
  return out;
}

export function extractErrorCodes(dir) {
  const codes = new Map();
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.yaml'));
  for (const file of files) {
    const doc = parse(fs.readFileSync(path.join(dir, String(file)), 'utf8'));
    const add = (set) => set.forEach((c) => codes.set(c, [...(codes.get(c) ?? []), String(file)]));
    const scanResponses = (responses, shared = false) => {
      for (const [status, response] of Object.entries(responses ?? {})) {
        if (!shared && !/^[45]\d\d$/.test(status) && status !== 'default') continue;
        const set = new Set();
        collectCodes(response, set);
        add(set);
        if (response && typeof response === 'object' && typeof response.description === 'string') {
          add(codesFromText(response.description, true));
        }
      }
    };
    for (const pathItem of Object.values(doc.paths ?? {})) {
      for (const op of Object.values(pathItem ?? {})) {
        if (!op || typeof op !== 'object' || !op.responses) continue;
        scanResponses(op.responses);
        if (typeof op.description === 'string') add(codesFromText(op.description));
      }
    }
    scanResponses(doc.components?.responses, true);
  }
  for (const c of NOT_CODES) codes.delete(c);
  return codes;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: extract-error-codes.mjs <openapi-dir> [--json]');
    process.exit(2);
  }
  const codes = extractErrorCodes(dir);
  const sorted = [...new Set([...codes.keys(), ...PROTOCOL_CODES])].sort();
  if (process.argv.includes('--json')) console.log(JSON.stringify(sorted, null, 2));
  else for (const c of sorted) console.log(`${c}\t${[...new Set(codes.get(c))].join(',')}`);
}
