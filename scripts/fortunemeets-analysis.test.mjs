import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFortuneMeetsConfig } from './fortunemeets-analysis.mjs';

const sampleConfig = {
  eventId: 'sakurazaka46_15th',
  artistName: '櫻坂46',
  applications: [
    {
      awards: [
        {
          id: 2,
          name: '購入者応募抽選企画！15th Double A-side Single『A / B』発売記念リアルミート＆グリート（個別トーク会）',
          applyTable: [
            {
              id: '0628_meetgreet_1',
              date: '2026年6月28日(日)＠幕張メッセ',
              part: '第１部',
              members: ['遠藤 光莉', '山下瞳月'],
              closedMembers: ['山下瞳月'],
            },
            {
              id: '0628_meetgreet_2',
              date: '2026年6月28日(日)＠幕張メッセ',
              part: '第２部',
              members: ['遠藤 光莉', '山下瞳月'],
              closedMembers: [],
            },
          ],
        },
        {
          id: 3,
          name: '購入者応募抽選企画！15th Double A-side Single『A / B』発売記念オンラインミート＆グリート（個別トーク会）',
          applyTable: [
            {
              id: '0712_meetgreet_1',
              date: '2026年7月12日(日)',
              part: '第１部',
              members: ['遠藤光莉・松本和子', '山下瞳月'],
              closedMembers: ['遠藤光莉・松本和子'],
            },
          ],
        },
      ],
    },
  ],
};

test('analyzeFortuneMeetsConfig separates real and online awards', () => {
  const analysis = analyzeFortuneMeetsConfig(sampleConfig, { artist: 'sakurazaka46', event: '15th' }, { now: '2026-06-17T00:00:00.000Z' });
  assert.equal(analysis.eventId, 'sakurazaka46_15th');
  assert.equal(analysis.group, 'sakurazaka');
  assert.deepEqual(analysis.awards.map((award) => award.mode), ['real', 'online']);
});

test('real meet analysis keeps zero-closed members', () => {
  const analysis = analyzeFortuneMeetsConfig(sampleConfig, { artist: 'sakurazaka46', event: '15th' });
  const real = analysis.awards.find((award) => award.mode === 'real');
  assert.ok(real);
  assert.equal(real.closedCells, 1);
  assert.equal(real.totalCells, 4);
  assert.deepEqual(real.memberClosedTotals, {
    '遠藤光莉': 0,
    '山下瞳月': 1,
  });
  assert.equal(real.memberSummaries.find((member) => member.name === '遠藤光莉')?.totalCount, 2);
});

test('online meet analysis preserves combo member names', () => {
  const analysis = analyzeFortuneMeetsConfig(sampleConfig, { artist: 'sakurazaka46', event: '15th' });
  const online = analysis.awards.find((award) => award.mode === 'online');
  assert.ok(online);
  assert.ok(online.members.includes('遠藤光莉・松本和子'));
  assert.equal(online.closedCells, 1);
  assert.equal(online.totalCells, 2);
});
