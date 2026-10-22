import test from 'node:test';
import assert from 'node:assert/strict';

import { eventsQuery, handleGetSakamichiEvents } from './sakamichi-events.ts';

const now = new Date('2026-10-22T12:00:00Z');
const row = {
  id: 'n_107229:2026-10-20', date: '2026-10-20', title: 'リアルミート＆グリート', kind: 'ミート＆グリート', category: 'attend',
  shows: [{ label: '', start: '18:30' }], members: [{ id: '55395', name: '中西 アルノ' }], wholeGroup: false,
  sourceUrl: 'https://www.nogizaka46.com/s/n46/media/detail/107229', venue: { id: 71, name: 'TACHIKAWA STAGE GARDEN', prefecture: '東京都' },
  attendees: 12,
};
function env(respond = () => Response.json({ ok: true, data: { events: [row] } })) {
  const calls = [];
  return { calls, EVENTS_READ_TOKEN: 'read-token', SAKA46LOG: { fetch: async (url, init) => { calls.push({ url, auth: new Headers(init?.headers).get('Authorization') }); return respond(); } } };
}
const get = (q, e, at = now) => handleGetSakamichiEvents(new Request(`https://api.46log.com/api/miguri/sakamichi-events?${q}`), e, at);

test('query: known groups from their first official year to next year only', () => {
  const q = s => eventsQuery(new URL(`https://x/?${s}`), now);
  assert.deepEqual(q('grp=nogizaka&year=2011'), { grp: 'nogizaka', year: 2011 });
  assert.deepEqual(q('grp=hinatazaka&year=2027'), { grp: 'hinatazaka', year: 2027 });
  for (const bad of ['grp=hinatazaka&year=2018', 'grp=sakurazaka&year=2019', 'grp=nogizaka&year=2028', 'grp=keyakizaka&year=2026',
    'grp=__proto__&year=2026', 'grp=toString&year=2026', 'grp=nogizaka&year=2026.5', 'grp=nogizaka', 'year=2026']) assert.equal(q(bad), null, bad);
});

test('reads one group-year through the binding with the read token; only public fields, never 坂ログ attendee counts', async () => {
  const e = env(), res = await get('grp=nogizaka&year=2026', e);
  assert.equal(res.status, 200);
  assert.deepEqual(e.calls, [{ url: 'https://saka46log.com/internal/events?grp=nogizaka&year=2026', auth: 'Bearer read-token' }]);
  const { data } = await res.json(), [ev] = data.events;
  assert.deepEqual([data.grp, data.year, data.events.length], ['nogizaka', 2026, 1]);
  assert.equal('attendees' in ev, false);
  assert.deepEqual(ev.venue, row.venue);
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=600');
  assert.equal((await get('grp=nogizaka&year=2016', env())).headers.get('Cache-Control'), 'public, max-age=86400');   // a past year
  const empty = env(() => Response.json({ ok: true, data: { events: [] } }));
  assert.equal((await get('grp=nogizaka&year=2016', empty)).headers.get('Cache-Control'), 'public, max-age=60');   // not backfilled yet
});

test('bad query 400 (no upstream call), unconfigured 503, upstream failure 502', async () => {
  const e = env();
  assert.equal((await get('grp=nogizaka&year=2010', e)).status, 400);
  assert.equal(e.calls.length, 0);
  assert.equal((await get('grp=nogizaka&year=2026', { SAKA46LOG: e.SAKA46LOG })).status, 503);
  assert.equal((await get('grp=nogizaka&year=2026', env(() => new Response('no', { status: 401 })))).status, 502);
});
