import test from 'node:test';
import assert from 'node:assert/strict';
import { groupStationsByRegion, REGION_ORDER } from './radiko-stations.ts';

const station = (id, region) => ({ id, name: id, region, streaming: false, hls_url: null });

test('keeps all nine catalogue regions in presentation order', () => {
  const rows = REGION_ORDER.toReversed().map((region, i) => station(String(i), region));
  const groups = groupStationsByRegion(rows);
  assert.deepEqual(groups.map(([region]) => region), REGION_ORDER);
  assert.equal(groups.flatMap(([, list]) => list).length, rows.length);
});

test('keeps existing 14-station responses compatible without inventing new buttons', () => {
  const rows = [
    ...['FMT', 'TBS', 'LFR', 'QRR', 'FMJ', 'BAYFM78', 'INT', 'JOAK'].map(id => station(id, '関東')),
    station('FM-FUJI', '山梨'), station('ABC', '関西'), station('MBS', '関西'),
    station('AIR-G', '北海道'), station('CBC', '東海'), station('TOKAIRADIO', '東海'),
  ];
  assert.equal(rows.length, 14);
  const groups = groupStationsByRegion(rows);
  assert.deepEqual(groups.map(([region]) => region), ['関東', '山梨', '関西', '東海', '北海道']);
  assert.equal(groups.flatMap(([, list]) => list).length, rows.length);
});

test('future regions and missing labels are shown rather than silently dropped', () => {
  const rows = [station('A', '沖縄'), station('B', '九州'), station('C', '東北'), station('D', ''), station('E', '沖縄'), station('F', '__proto__')];
  const groups = groupStationsByRegion(rows);
  assert.deepEqual(groups.map(([region]) => region), ['九州', '沖縄', '東北', 'その他', '__proto__']);
  assert.deepEqual(groups[1][1].map(row => row.id), ['A', 'E']);
  assert.equal(groups.flatMap(([, list]) => list).length, rows.length);
});

test('preserves station identity, HLS paths and live state; no input mutations', () => {
  const row = Object.freeze({ ...station('ZIP-FM', '東海'), streaming: true, hls_url: '/hls/live_ZIP-FM/index.m3u8' });
  const rows = Object.freeze([row]);
  assert.equal(groupStationsByRegion(rows)[0][1][0], row);
  assert.deepEqual(groupStationsByRegion([]), []);
});
