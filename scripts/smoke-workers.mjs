#!/usr/bin/env node

const BASES = [
  'https://api.46log.com',
  'https://api.sakamichi-tools.cn',
];

const checks = [
  {
    name: 'auth/me unauth',
    path: '/api/auth/me',
    expect: 401,
  },
  {
    name: 'community works',
    path: '/api/community/works?limit=1',
    expect: 200,
  },
  {
    name: 'repo stats',
    path: '/api/repo/stats',
    expect: 200,
  },
  {
    name: 'report no auth',
    path: '/api/report',
    expect: 401,
    init: { method: 'POST' },
  },
  {
    name: 'discord status no auth',
    path: '/api/user/discord/status',
    expect: 401,
  },
  {
    name: 'discord sync no auth',
    path: '/api/user/discord/sync',
    expect: 401,
    init: { method: 'POST' },
  },
  {
    name: 'miguri events',
    path: '/api/miguri/events',
    expect: 200,
  },
  {
    name: 'miguri sync no secret',
    path: '/api/manage/miguri/sync-from-source',
    expect: 403,
    init: { method: 'POST' },
  },
];

let failed = 0;

for (const base of BASES) {
  console.log(`\n=== ${base} ===`);
  for (const check of checks) {
    const url = `${base}${check.path}`;
    try {
      const res = await fetch(url, check.init);
      const ok = res.status === check.expect;
      console.log(`${ok ? 'OK ' : 'ERR'} ${check.name}: ${res.status} expected ${check.expect}`);
      if (!ok) failed += 1;
    } catch (err) {
      failed += 1;
      console.log(`ERR ${check.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} smoke check(s) failed`);
  process.exit(1);
}

console.log('\nAll worker smoke checks passed');
