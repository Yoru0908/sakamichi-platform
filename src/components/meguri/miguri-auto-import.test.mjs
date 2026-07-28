import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIGURI_HANDOFF_PREFIX,
  parseMiguriImportHandoff,
  splitMiguriImportRecords,
} from './miguri-auto-import.ts';

const record = {
  source: 'fortunemusic',
  sourceKey: 'record-1',
  category: '個別ミーグリ',
  member: '山川宇衣',
  date: '2026-09-12',
  slot: 1,
  appliedTickets: 6,
  wonTickets: 6,
  paidTickets: 0,
  eventSlug: '',
  title: '櫻坂46 15th',
  venue: '',
  group: 'sakurazaka',
};

test('parseMiguriImportHandoff accepts only official forTUNE referrers', () => {
  const handoff = `${MIGURI_HANDOFF_PREFIX}${JSON.stringify({
    version: 1,
    source: 'fortunemusic',
    next: 'meets',
    records: [record],
  })}`;

  assert.equal(
    parseMiguriImportHandoff(handoff, 'https://fortunemusic.jp/mypage/apply_list/').records.length,
    1,
  );
  assert.equal(
    parseMiguriImportHandoff(handoff, 'https://ticket.fortunemeets.app/hinatazaka46/').next,
    'meets',
  );
  assert.equal(parseMiguriImportHandoff(handoff, 'https://evil.example/'), null);
  assert.equal(parseMiguriImportHandoff(handoff, ''), null);
});

test('splitMiguriImportRecords keeps API writes within the 500-record limit', () => {
  const records = Array.from({ length: 1001 }, (_, index) => ({
    ...record,
    sourceKey: `record-${index}`,
  }));
  assert.deepEqual(splitMiguriImportRecords(records).map((chunk) => chunk.length), [500, 500, 1]);
});
