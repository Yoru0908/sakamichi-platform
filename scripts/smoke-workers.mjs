#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CANONICAL = 'https://api.46log.com';
// PROJECT_DEPLOYMENT_MAP: this domain expired; auth routes were removed on 2026-09-05.
// These public GETs are diagnostics only, never evidence that the current API works.
const LEGACY = 'https://api.sakamichi-tools.cn';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const jsonPost = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
export const checks = [
  { name: 'auth/me unauth', path: '/api/auth/me', expect: 401 },
  { name: 'community works', path: '/api/community/works?limit=1', expect: 200, shape: data => Array.isArray(data.works) },
  { name: 'repo stats', path: '/api/repo/stats', expect: 200, shape: data => ['total', 'creators', 'today'].every(key => Number.isInteger(data[key]) && data[key] >= 0) },
  { name: 'report no auth', path: '/api/report', expect: 401, init: jsonPost },
  { name: 'discord status no auth', path: '/api/user/discord/status', expect: 401 },
  { name: 'discord sync no auth', path: '/api/user/discord/sync', expect: 401, init: jsonPost },
  { name: 'miguri events', path: '/api/miguri/events', expect: 200, shape: data => Array.isArray(data.events) && data.authenticated === false },
  { name: 'miguri sync no secret', path: '/api/manage/miguri/sync-from-source', expect: 403, init: jsonPost },
];

/** Status alone cannot distinguish an API response from a parked-domain HTML 200 or a challenge. */
export async function inspectResponse(response, check) {
  const type = response.headers.get('Content-Type') || '', issues = [];
  if (response.status !== check.expect) issues.push(`status ${response.status}, expected ${check.expect}`);
  if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(type)) issues.push(`not JSON (${type || 'missing Content-Type'})`);
  if (response.headers.get('cf-mitigated') === 'challenge') issues.push('Cloudflare challenge; API result not verified');
  let body;
  try { body = await response.json(); } catch { issues.push('invalid JSON body'); }
  if (body !== undefined) {
    if (!object(body) || body.success !== (check.expect < 400)) issues.push('invalid success envelope');
    else if (check.expect < 400 && (!object(body.data) || (check.shape && !check.shape(body.data)))) issues.push('invalid data shape');
    else if (check.expect >= 400 && typeof body.error !== 'string') issues.push('missing error code');
  }
  return { ok: issues.length === 0, issues, type };
}

export async function runSmoke() {
  let failed = 0;
  console.log(`Canonical API: ${CANONICAL}`);
  for (const check of checks) {
    const url = CANONICAL + check.path;
    try {
      const res = await fetch(url, { ...check.init, signal: AbortSignal.timeout(15000), redirect: 'manual' });
      const verdict = await inspectResponse(res, check);
      if (!verdict.ok) failed++;
      console.log(`${verdict.ok ? 'OK ' : 'ERR'} ${check.name}: ${res.status}; ${verdict.type}${verdict.ok ? '; valid JSON shape' : `; ${verdict.issues.join('; ')}`}; ${url}`);
    } catch (err) {
      failed++;
      console.log(`ERR ${check.name}: ${err.message}${err.cause?.code ? ` (${err.cause.code})` : ''}; ${url}`);
    }
  }
  console.log(`\nLegacy diagnostics: ${LEGACY} — retired/expired domain, excluded from canonical checks; redirects are not followed.`);
  let legacyMismatch = 0;
  for (const check of checks.filter(item => ['auth/me unauth', 'community works', 'miguri events'].includes(item.name))) {
    const url = LEGACY + check.path;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'manual' });
      const verdict = await inspectResponse(res, check);
      if (!verdict.ok) legacyMismatch++;
      console.log(`LEGACY ${res.status}; ${verdict.type || 'no Content-Type'}; server=${res.headers.get('server') || 'unknown'}; redirect=${res.headers.get('location') || 'none'}; ${verdict.ok ? 'matches old JSON contract; ownership/handoff unverified' : verdict.issues.join('; ')}; ${url}`);
    } catch (err) {
      legacyMismatch++;
      console.log(`LEGACY network error: ${err.message}${err.cause?.code ? ` (${err.cause.code})` : ''}; ${url}`);
    }
  }
  console.log(`\nCanonical: ${checks.length - failed}/${checks.length} checks passed. Legacy: ${legacyMismatch}/3 old API contracts unavailable or mismatched (diagnostic only).`);
  return failed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = (await runSmoke()) ? 1 : 0;
}
